import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, Mail, RefreshCw, ArrowRight, ShieldCheck, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toAr } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const RESEND_SECONDS = 60;

function getEmailFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("email") ?? "";
}

export default function Verify() {
  const [, navigate] = useLocation();
  const email = getEmailFromUrl();

  const [code, setCode]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [verified, setVerified]   = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [canResend, setCanResend] = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);

  /* ── Auto-focus the hidden input on mount ── */
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  /* ── Countdown timer ── */
  useEffect(() => {
    if (countdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  /* ── Redirect if no email ── */
  useEffect(() => {
    if (!email) navigate("/register");
  }, [email, navigate]);

  /* ── Auto-submit when all 6 digits are entered ── */
  useEffect(() => {
    if (code.length === 6 && !loading && !verified) {
      handleVerify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleVerify = useCallback(async (otp: string) => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "الرمز غير صحيح");
        setCode("");
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }
      setVerified(true);
      /* Auto-advance to onboarding after a short delay */
      setTimeout(() => {
        window.location.href = `${BASE}/onboarding/type?email=${encodeURIComponent(email)}`;
      }, 2800);
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setCode("");
    } finally {
      setLoading(false);
    }
  }, [email, loading]);

  async function handleResend() {
    if (!canResend || resending) return;
    setResending(true);
    setError(null);
    try {
      await fetch(`${BASE}/api/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setCountdown(RESEND_SECONDS);
      setCanResend(false);
      setCode("");
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      setError("فشل إعادة الإرسال، حاول مرة أخرى");
    } finally {
      setResending(false);
    }
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    if (error) setError(null);
  }

  /* ── Visual digit display (6 boxes built from the single input value) ── */
  const displayDigits = Array(6).fill("").map((_, i) => code[i] ?? "");

  /* ── Success Screen ── */
  if (verified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
            <ShieldCheck className="w-11 h-11 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم التحقق بنجاح ✓</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">
            تم التحقق من بريدك الإلكتروني بنجاح.
            <br className="mb-1" />
            طلبك الآن قيد المراجعة من فريق الإدارة، وستصلك رسالة ترحيب على{" "}
            <span className="text-green-700 font-medium">{email}</span>{" "}
            تتضمن خطوات إعداد نشاطك فور التفعيل.
          </p>

          {/* Onboarding preview */}
          <div className="w-full bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 text-right">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-xs font-semibold text-green-800">ما الذي سيحدث بعد التفعيل؟</p>
            </div>
            <ol className="space-y-1.5">
              {[
                "أضف شاليهك — الصور والتفاصيل والموقع",
                "حدّد الأسعار والمواسم",
                "استقبل الحجوزات مباشرة من لوحة التحكم",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="w-5 h-5 rounded-full bg-green-200 text-green-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <Button
            onClick={() => navigate("/login")}
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            العودة لصفحة الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10" dir="rtl">
      {/* Brand */}
      <div className="flex flex-col items-center mb-7 select-none">
        <div className="w-14 h-14 rounded-2xl bg-green-600 shadow-lg shadow-green-200 flex items-center justify-center mb-3">
          <ShieldCheck className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">تكيّة</h1>
        <p className="text-gray-500 text-sm mt-0.5">التحقق من البريد الإلكتروني</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-7">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mb-4">
            <Mail className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="font-bold text-gray-800 text-base mb-1">أدخل رمز التحقق</h2>
          <p className="text-gray-400 text-xs leading-relaxed">
            أرسلنا رمزاً مكوناً من ٦ أرقام إلى
            <br />
            <span className="text-gray-600 font-medium" dir="ltr">{email}</span>
          </p>
        </div>

        {/* ── 6-box OTP display backed by a single hidden input ── */}
        <div
          className="relative flex items-center justify-center gap-2 mb-5 cursor-text"
          dir="ltr"
          onClick={() => inputRef.current?.focus()}
          role="group"
          aria-label="رمز التحقق"
        >
          {/* Hidden single input — receives ALL keyboard/touch input */}
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={handleCodeChange}
            disabled={loading}
            aria-label="أدخل رمز التحقق المكون من ٦ أرقام"
            className="absolute opacity-0 w-full h-full top-0 left-0 cursor-text z-10"
            style={{ fontSize: "16px" }}
          />

          {/* Visual digit boxes */}
          {displayDigits.map((d, i) => (
            <div
              key={i}
              aria-hidden="true"
              className={[
                "w-11 h-14 flex items-center justify-center text-xl font-bold rounded-xl border-2 transition-all select-none pointer-events-none",
                loading ? "opacity-50" : "",
                d
                  ? "border-green-500 bg-green-50 text-gray-900"
                  : i === code.length && !loading
                    ? "border-green-400 ring-2 ring-green-100 bg-white text-gray-900"
                    : "border-gray-200 bg-gray-50 text-gray-300",
              ].join(" ")}
            >
              {d || (i === code.length && !loading ? "|" : "")}
            </div>
          ))}
        </div>

        {/* OTP progress hint */}
        {code.length > 0 && code.length < 6 && (
          <p className="text-center text-xs text-gray-400 mb-3">
            {toAr(String(code.length))}/٦ أرقام
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 mb-4 text-center">
            {error}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="text-center text-green-600 text-sm mb-4 flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            جاري التحقق…
          </div>
        )}

        {/* Verify button (also auto-submits when all 6 filled) */}
        {code.length === 6 && !loading && (
          <Button
            onClick={() => handleVerify(code)}
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2 mb-4"
          >
            <CheckCircle2 className="w-4 h-4" />
            تحقق وأكمل التسجيل
          </Button>
        )}

        {/* Tap-to-focus hint */}
        {code.length === 0 && !loading && (
          <p className="text-center text-xs text-green-600 mb-3 font-medium animate-pulse">
            اضغط على المربعات وابدأ الكتابة
          </p>
        )}

        {/* Resend */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">لم تستلم الرمز؟</p>
          {canResend ? (
            <button
              onClick={handleResend}
              disabled={resending}
              className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
              {resending ? "جاري الإرسال…" : "إعادة إرسال الرمز"}
            </button>
          ) : (
            <p className="text-xs text-gray-400">
              إعادة الإرسال بعد{" "}
              <span className="font-bold text-green-600 tabular-nums">{toAr(String(countdown))}</span>
              {" "}ثانية
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          إذا لم يصل الرمز، تحقق من صندوق البريد الإلكتروني وفولدر الرسائل غير المرغوب فيها
        </p>
      </div>
    </div>
  );
}
