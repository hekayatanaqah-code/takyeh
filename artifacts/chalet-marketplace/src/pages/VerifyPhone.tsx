import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Phone, RefreshCw, ShieldCheck, ArrowRight, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RESEND_SECONDS = 60;
const IS_DEV = import.meta.env.DEV;

/* ── Arabic-Indic digit helpers ── */
const EN_TO_AR: Record<string, string> = { '0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩' };
const arToEn = (s: string) => s.replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 0x0660));
const DEV_DIGITS = "١٢٣٤٥٦".split("");

function getEmailFromUrl(): string {
  return new URLSearchParams(window.location.search).get("email") ?? "";
}

export default function VerifyPhone() {
  const [, navigate] = useLocation();
  const email = getEmailFromUrl();

  const [digits, setDigits]       = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [verified, setVerified]   = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpSent, setOtpSent]     = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));

  const { data: pageContent } = useQuery<{ site_logo_url?: string }>({
    queryKey: ["page-content"],
    queryFn: () => fetch(`${BASE}/api/page-content`).then(r => r.json()),
  });
  const logoUrl = pageContent?.site_logo_url;

  /* ── Send OTP on mount ── */
  useEffect(() => {
    if (!email) { navigate("/register"); return; }
    sendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendOtp() {
    try {
      const r = await fetch(`${BASE}/api/send-phone-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      if (data.alreadyVerified) {
        window.location.href = `${BASE}/onboarding/type?email=${encodeURIComponent(email)}`;
        return;
      }
      setOtpSent(true);
      setTimeout(() => inputRefs.current[0]?.focus(), 400);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    }
  }

  /* ── Countdown timer ── */
  useEffect(() => {
    if (!otpSent) return;
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, otpSent]);

  /* ── Auto-submit when all 6 digits filled ── */
  useEffect(() => {
    if (!digits.includes("") && !loading && !verified) {
      handleVerify(digits.join(""));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const handleVerify = useCallback(async (otp: string) => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const otpEn = arToEn(otp);
      const r = await fetch(`${BASE}/api/verify-phone-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpEn }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "الرمز غير صحيح");
        setDigits(Array(6).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }
      setVerified(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setDigits(Array(6).fill(""));
    } finally {
      setLoading(false);
    }
  }, [email, loading]);

  function setDigit(idx: number, digit: string) {
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    if (error) setError(null);
    if (digit && idx < 5) inputRefs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      setDigit(idx, EN_TO_AR[e.key] ?? e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[idx]) {
        const next = [...digits]; next[idx] = ""; setDigits(next);
        if (error) setError(null);
      } else if (idx > 0) {
        inputRefs.current[idx - 1]?.focus();
        const next = [...digits]; next[idx - 1] = ""; setDigits(next);
        if (error) setError(null);
      }
    } else if (e.key === "ArrowLeft" && idx < 5) {
      e.preventDefault(); inputRefs.current[idx + 1]?.focus();
    } else if (e.key === "ArrowRight" && idx > 0) {
      e.preventDefault(); inputRefs.current[idx - 1]?.focus();
    }
  }

  function handleDigitChange(idx: number, val: string) {
    const en = arToEn(val).replace(/\D/g, "").slice(-1);
    setDigit(idx, EN_TO_AR[en] ?? "");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = arToEn(e.clipboardData.getData("text")).replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = Array(6).fill("");
    pasted.split("").forEach((d, i) => { next[i] = EN_TO_AR[d] ?? d; });
    setDigits(next);
    setTimeout(() => inputRefs.current[Math.min(pasted.length, 5)]?.focus(), 50);
  }

  async function handleResend() {
    if (!canResend || resending) return;
    setResending(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/resend-phone-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setDigits(Array(6).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError("فشل إعادة الإرسال، حاول مرة أخرى");
    } finally {
      setResending(false);
    }
  }

  /* ── Success Screen ── */
  if (verified) {
    return (
      <div className="min-h-screen bg-[#FBF9F6] flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl shadow-sm p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-[#F5EEE9] flex items-center justify-center mb-5">
            <ShieldCheck className="w-11 h-11 text-[#8C6246]" />
          </div>
          <h2 className="text-xl font-bold text-[#2D2D2D] mb-2">تم التحقق من الجوال ✓</h2>
          <p className="text-[#656565] text-sm leading-relaxed mb-6">
            تم تفعيل رقم جوالك بنجاح.
            <br />
            الآن جاهز لإعداد حسابك على تكيّة!
          </p>
          <div className="w-full bg-[#F5EEE9] border border-[#D9C3B0] rounded-2xl p-4 mb-6 text-right">
            <ol className="space-y-2">
              {[
                { label: "تفعيل البريد الإلكتروني", done: true },
                { label: "تفعيل رقم الجوال عبر الواتساب", done: true },
                { label: "تحديد نوع نشاطك وإعداد حسابك", done: false },
              ].map((step, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 ${step.done ? "bg-[#8C6246] text-white" : "bg-[#D9C3B0] text-[#734f36]"}`}>
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span className={step.done ? "text-[#8C6246] font-medium line-through" : "text-[#555555] font-medium"}>
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={() => { window.location.href = `${BASE}/onboarding/type?email=${encodeURIComponent(email)}`; }}
            className="w-full h-11 bg-[#8C6246] hover:bg-[#7A5538] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            إعداد حسابك الآن
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-10" dir="rtl">

      {/* Logo */}
      <div className="mb-7 select-none flex flex-col items-center gap-1">
        {logoUrl ? (
          <img src={logoUrl} alt="تكيّة" className="h-16 object-contain" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-[#8C6246] flex items-center justify-center text-white text-2xl font-bold">ت</div>
        )}
        <p className="text-sm text-[#8C6246] font-medium">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-5 flex items-center gap-2 px-1">
        {["تسجيل الحساب", "تفعيل البريد", "تفعيل الجوال", "الإعداد"].map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full ${i <= 2 ? "bg-[#8C6246]" : "bg-[#E0D5CB]"}`} />
            <span className={`text-[10px] font-medium ${i === 2 ? "text-[#8C6246]" : i < 2 ? "text-[#B5956F]" : "text-[#BBBBBB]"}`}>{label}</span>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-[#F5EEE9] flex items-center justify-center mb-4">
            <MessageCircle className="w-7 h-7 text-[#8C6246]" />
          </div>
          <h2 className="text-xl font-bold text-[#2D2D2D] mb-1">تفعيل الجوال عبر الواتساب</h2>
          <p className="text-sm text-[#656565] font-semibold mb-1">
            {otpSent
              ? `تم إرسال رمز مكوّن من ٦ أرقام إلى الواتساب على`
              : "جاري إرسال رمز التحقق…"}
          </p>
          {maskedPhone && (
            <p className="text-sm text-[#8C6246] font-bold" dir="ltr">{maskedPhone}</p>
          )}
        </div>

        {/* ── 6 digit inputs ── */}
        <div className="flex items-center justify-center gap-2 mb-5" dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={d}
              disabled={loading || !otpSent}
              data-no-arabic=""
              autoComplete={i === 0 ? "one-time-code" : "off"}
              onPaste={i === 0 ? handlePaste : undefined}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              className={[
                "w-11 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all outline-none",
                "focus:border-[#8C6246] focus:ring-2 focus:ring-[#8C6246]/20",
                loading || !otpSent ? "opacity-50 cursor-not-allowed bg-gray-50" : "bg-white cursor-text",
                d ? "border-[#8C6246] bg-[#FBF9F6] text-[#2D2D2D]" : "border-[#E0E0E0] text-[#2D2D2D]",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Dev hint */}
        {IS_DEV && otpSent && (
          <button
            type="button"
            onClick={() => setDigits(DEV_DIGITS)}
            className="w-full mb-4 py-2 rounded-xl border border-dashed border-[#D9C3B0] bg-[#FBF9F6] text-xs text-[#8C6246] font-medium hover:bg-[#F5EEE9] transition-colors"
          >
            🛠 بيئة تطوير — اضغط لملء الكود التجريبي: ١٢٣٤٥٦
          </button>
        )}

        {/* Progress hint */}
        {digits.filter(d => d !== "").length > 0 && digits.includes("") && (
          <p className="text-center text-xs text-[#555555] mb-3">
            {digits.filter(d => d !== "").length}/٦ أرقام
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 mb-4 text-center">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center text-[#8C6246] text-sm mb-4 flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            جاري التحقق…
          </div>
        )}

        {/* Verify button */}
        {!digits.includes("") && !loading && (
          <button
            onClick={() => handleVerify(digits.join(""))}
            className="w-full h-11 bg-[#8C6246] hover:bg-[#7A5538] text-white font-bold rounded-xl flex items-center justify-center gap-2 mb-4 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            تفعيل رقم الجوال
          </button>
        )}

        {/* Resend */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <p className="text-xs text-[#555555] font-medium">لم تستلم الرمز؟</p>
          {canResend ? (
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex items-center gap-1.5 text-sm text-[#8C6246] hover:text-[#7A5538] font-medium disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
              {resending ? "جاري الإرسال…" : "إعادة إرسال للواتساب"}
            </button>
          ) : (
            <p className="text-xs text-[#555555] font-medium">
              إعادة الإرسال بعد{" "}
              <span className="font-bold text-[#8C6246] tabular-nums">{countdown}</span>
              {" "}ثانية
            </p>
          )}
        </div>

        <p className="text-center text-xs text-[#555555] font-medium mt-5">
          تأكد من أن رقم الجوال المسجّل لديك مفعّل على الواتساب
        </p>

        {/* Back link */}
        <p className="text-center mt-4">
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-[#656565] font-medium hover:text-[#8C6246] transition-colors"
          >
            ← العودة لصفحة الدخول
          </button>
        </p>
      </div>
    </div>
  );
}
