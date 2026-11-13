import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Phone, RefreshCw, ShieldCheck, ArrowRight, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toAr } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RESEND_SECONDS = 60;
const OTP_LENGTH = 4;

/* ── Arabic-Indic digit helpers ── */
const EN_TO_AR: Record<string, string> = { '0':'٠','1':'١','2':'٢','3':'٣','4':'٤','5':'٥','6':'٦','7':'٧','8':'٨','9':'٩' };
const arToEn = (s: string) => s.replace(/[٠-٩]/g, n => String(n.charCodeAt(0) - 0x0660));

function normalizeLocalPhoneInput(value: string): string {
  const digits = arToEn(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("966")) return `0${digits.slice(3).replace(/^0/, "")}`;
  return digits.startsWith("0") ? digits : `0${digits}`;
}

function normalizeSaudiSubscriberInput(value: string): string {
  const digits = arToEn(value).replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("966") ? digits.slice(3) : digits;
  return withoutCountryCode.startsWith("0")
    ? withoutCountryCode.slice(1)
    : withoutCountryCode;
}

function getAccountParams(): { email: string; phone: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    email: params.get("email") ?? "",
    phone: params.get("phone") ?? "",
  };
}

export default function VerifyPhone() {
  const [, navigate] = useLocation();
  const { email, phone } = getAccountParams();
  const [currentPhone, setCurrentPhone] = useState(() => normalizeLocalPhoneInput(phone));
  const accountBody = email ? { email } : { phone: currentPhone };
  const onboardingQuery = email
    ? `email=${encodeURIComponent(email)}`
    : `phone=${encodeURIComponent(currentPhone)}`;

  const [digits, setDigits]       = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [verified, setVerified]   = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [otpSent, setOtpSent]     = useState(false);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [newPhone, setNewPhone] = useState(() => normalizeLocalPhoneInput(phone));
  const [changingPhone, setChangingPhone] = useState(false);
  const [changePhoneError, setChangePhoneError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null));

  const { data: pageContent } = useQuery<{ site_logo_url?: string }>({
    queryKey: ["page-content"],
    queryFn: () => fetch(`${BASE}/api/page-content`).then(r => r.json()),
  });
  const logoUrl = pageContent?.site_logo_url;

  /* ── Send OTP on mount ── */
  useEffect(() => {
    if (!email && !phone) { navigate("/register"); return; }
    sendOtp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendOtp() {
    try {
      const r = await fetch(`${BASE}/api/send-phone-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountBody),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "تعذّر إرسال رمز التحقق، حاول مرة أخرى");
        setCanResend(true);
        return;
      }
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      if (data.alreadyVerified) {
        window.location.href = `${BASE}/onboarding/type?${onboardingQuery}`;
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

  /* ── Auto-submit when all four digits are filled ── */
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
        body: JSON.stringify({ ...accountBody, code: otpEn }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "الرمز غير صحيح");
        setDigits(Array(OTP_LENGTH).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 100);
        return;
      }
      setVerified(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setDigits(Array(OTP_LENGTH).fill(""));
    } finally {
      setLoading(false);
    }
  }, [email, currentPhone, loading]);

  function setDigit(idx: number, digit: string) {
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    if (error) setError(null);
    if (digit && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
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
    } else if (e.key === "ArrowLeft" && idx < OTP_LENGTH - 1) {
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
    const pasted = arToEn(e.clipboardData.getData("text")).replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((d, i) => { next[i] = EN_TO_AR[d] ?? d; });
    setDigits(next);
    setTimeout(() => inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus(), 50);
  }

  async function handleResend() {
    if (!canResend || resending) return;
    setResending(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/api/resend-phone-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountBody),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "فشل إعادة الإرسال، حاول مرة أخرى");
        return;
      }
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      setOtpSent(true);
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError("فشل إعادة الإرسال، حاول مرة أخرى");
    } finally {
      setResending(false);
    }
  }

  function openChangePhoneDialog() {
    setNewPhone(currentPhone.replace(/^0/, ""));
    setChangePhoneError(null);
    setChangePhoneOpen(true);
  }

  async function handleChangePhone() {
    const subscriberPhone = normalizeSaudiSubscriberInput(newPhone);
    if (!/^5\d{8}$/.test(subscriberPhone)) {
      setChangePhoneError("أدخل رقم الجوال بصيغة 5XXXXXXXX بعد بادئة +966");
      return;
    }
    const normalizedPhone = `0${subscriberPhone}`;
    if (normalizedPhone === currentPhone) {
      setChangePhoneError("يرجى إدخال رقم جوال جديد");
      return;
    }

    setChangingPhone(true);
    setChangePhoneError(null);
    try {
      const lookupBody = email ? { email } : { phone: currentPhone };
      const r = await fetch(`${BASE}/api/change-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lookupBody, newPhone: subscriberPhone }),
      });
      const data = await r.json();
      if (!r.ok) {
        setChangePhoneError(data.error ?? "تعذّر تحديث رقم الجوال");
        return;
      }

      setCurrentPhone(normalizedPhone);
      setNewPhone(subscriberPhone);
      const params = new URLSearchParams(window.location.search);
      params.set("phone", normalizedPhone);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}?${params.toString()}${window.location.hash}`,
      );
      if (data.maskedPhone) setMaskedPhone(data.maskedPhone);
      setDigits(Array(OTP_LENGTH).fill(""));
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setOtpSent(true);
      setError(null);
      setChangePhoneOpen(false);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setChangePhoneError("تعذّر الاتصال بالخادم");
    } finally {
      setChangingPhone(false);
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
                ...(email ? [{ label: "تفعيل البريد الإلكتروني", done: true }] : []),
                { label: "تفعيل رقم الجوال عبر الواتساب", done: true },
                { label: "تحديد نوع نشاطك وإعداد حسابك", done: false },
              ].map((step, i) => (
                <li key={i} className="flex items-center gap-3 py-1 text-xs leading-5">
                  <span className={`w-5 h-5 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0 ${step.done ? "bg-[#8C6246] text-white" : "bg-[#D9C3B0] text-[#734f36]"}`}>
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`min-w-0 leading-5 font-medium ${step.done ? "text-[#8C6246]" : "text-[#555555]"}`}
                    style={step.done ? {
                      textDecorationLine: "line-through",
                      textDecorationColor: "#8C6246",
                      textDecorationThickness: "1px",
                    } : undefined}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <button
            onClick={() => { window.location.href = `${BASE}/onboarding/type?${onboardingQuery}`; }}
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
      <Dialog
        open={changePhoneOpen}
        onOpenChange={(open) => {
          if (!changingPhone) {
            setChangePhoneOpen(open);
            if (!open) setChangePhoneError(null);
          }
        }}
      >
        <DialogContent dir="rtl" className="max-w-sm rounded-2xl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-[#2D2D2D]">
              <span className="w-9 h-9 rounded-xl bg-[#F5EEE9] text-[#8C6246] flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4" />
              </span>
              تعديل رقم الجوال
            </DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              أدخل الرقم الجديد، وسيتم إرسال رمز تفعيل جديد إليه.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl bg-[#FBF9F6] border border-[#E8DED5] px-4 py-3">
              <p className="text-xs text-[#777777] mb-1">رقم الجوال الحالي</p>
              <bdo dir="ltr" className="inline-block text-sm text-[#8C6246] font-bold tabular-nums">
                {maskedPhone || "—"}
              </bdo>
            </div>

            <div>
              <label htmlFor="new-phone-number" className="block text-sm font-semibold text-[#4A4A4A] mb-2">
                رقم الجوال الجديد
              </label>
              <div className="flex items-center gap-2" dir="ltr">
                <span className="h-11 px-3 rounded-xl border border-[#E0E0E0] bg-[#FBF9F6] text-[#8C6246] font-bold text-sm flex items-center shrink-0">
                  +966
                </span>
                <input
                  id="new-phone-number"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={toAr(newPhone)}
                  onChange={(e) => {
                    setNewPhone(normalizeSaudiSubscriberInput(e.target.value));
                    setChangePhoneError(null);
                  }}
                  placeholder="512345678"
                  disabled={changingPhone}
                  autoComplete="tel"
                  className="h-11 min-w-0 flex-1 px-3 rounded-xl border border-[#E0E0E0] text-sm text-right text-[#2D2D2D] focus:outline-none focus:border-[#8C6246] transition-colors"
                />
              </div>
            </div>

            {changePhoneError && (
              <p className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs px-3 py-2 text-center">
                {changePhoneError}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row-reverse gap-2 sm:space-x-0">
            <button
              type="button"
              onClick={() => setChangePhoneOpen(false)}
              disabled={changingPhone}
              className="flex-1 h-10 rounded-xl border border-[#D9C3B0] text-[#8C6246] font-semibold text-sm hover:bg-[#FBF9F6] disabled:opacity-50 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleChangePhone}
              disabled={changingPhone}
              className="flex-1 h-10 rounded-xl bg-[#8C6246] text-white font-bold text-sm hover:bg-[#7A5538] disabled:opacity-60 transition-colors"
            >
              {changingPhone ? "جاري الإرسال…" : "تأكيد وإرسال الرمز"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        {(email
          ? ["تسجيل الحساب", "تفعيل البريد", "تفعيل الجوال", "الإعداد"]
          : ["تسجيل الحساب", "تفعيل الجوال", "الإعداد"]
        ).map((label, i, labels) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`h-1.5 w-full rounded-full ${i < labels.length - 1 ? "bg-[#8C6246]" : "bg-[#E0D5CB]"}`} />
            <span className={`text-[10px] font-medium ${i === labels.length - 2 ? "text-[#8C6246]" : i < labels.length - 2 ? "text-[#B5956F]" : "text-[#BBBBBB]"}`}>{label}</span>
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
              ? `تم إرسال رمز مكوّن من ٤ أرقام إلى الواتساب على`
              : error ? "تعذّر إرسال رمز التحقق، يمكنك إعادة المحاولة" : "جاري إرسال رمز التحقق…"}
          </p>
          {maskedPhone && (
            <div className="text-center whitespace-nowrap mt-1" dir="rtl">
              <bdo
                className="verify-phone-number inline-block text-sm text-[#8C6246] font-bold tabular-nums"
                dir="ltr"
                style={{ display: "inline-block" }}
              >
                {maskedPhone}
              </bdo>
              <button
                type="button"
                onClick={openChangePhoneDialog}
                className="inline-block text-xs text-[#8C6246] font-semibold hover:underline underline-offset-2 transition-colors mr-3"
              >
                تعديل الرقم
              </button>
            </div>
          )}
        </div>

        {/* ── Four digit inputs ── */}
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

        {/* Progress hint */}
        {digits.filter(d => d !== "").length > 0 && digits.includes("") && (
          <p className="text-center text-xs text-[#555555] mb-3">
            {digits.filter(d => d !== "").length}/٤ أرقام
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
