import { useState } from "react";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ForgotPasswordProps {
  portalType?: "admin" | "public";
}

export default function ForgotPassword({ portalType = "public" }: ForgotPasswordProps) {
  const isAdmin = portalType === "admin";
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [sent, setSent]             = useState(false);

  const { data: pageContent } = useQuery<{ site_logo_url?: string }>({
    queryKey: ["page-content"],
    queryFn: () => fetch(`${BASE}/api/page-content`).then((r) => r.json()),
    enabled: !isAdmin,
  });
  const logoUrl = pageContent?.site_logo_url;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), portalType }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "حدث خطأ. يرجى المحاولة مرة أخرى"); return; }
      setSent(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  const backHref = isAdmin ? `${BASE}/management/portal` : `${BASE}/login`;

  /* ── Admin portal (unchanged dark theme) ── */
  if (isAdmin) {
    const bgClass = "min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-10";
    if (sent) {
      return (
        <div className={bgClass} dir="rtl">
          <div className="w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center bg-slate-900 border border-slate-800">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-amber-500/10">
              <CheckCircle2 className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-lg font-bold mb-2 text-slate-100">تم الإرسال</h2>
            <p className="text-sm leading-relaxed mb-6 text-slate-400">
              إذا كان البريد الإلكتروني أو اسم المستخدم مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور خلال دقائق.
            </p>
            <a href={backHref} className="flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300">
              <ArrowRight className="w-4 h-4 rotate-180" />
              العودة لصفحة الدخول
            </a>
          </div>
        </div>
      );
    }
    return (
      <div className={bgClass} dir="rtl">
        <div className="flex flex-col items-center mb-7 select-none">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-2 bg-amber-500/10 border border-amber-500/20">
            <Mail className="w-6 h-6 text-amber-400" />
          </div>
          <h1 className="font-bold text-slate-200">نسيت كلمة المرور؟</h1>
          <p className="text-xs mt-1 text-slate-500">أدخل بريدك الإلكتروني أو اسم المستخدم وسنرسل لك رابط إعادة التعيين</p>
        </div>
        <div className="w-full max-w-sm rounded-2xl p-6 bg-slate-900 border border-slate-800 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-400">البريد الإلكتروني أو اسم المستخدم</label>
              <input
                type="text"
                placeholder="username أو email"
                value={identifier}
                onChange={(e) => { setIdentifier(e.target.value); setError(null); }}
                dir="ltr"
                className="w-full h-11 px-4 text-left text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                required
                autoFocus
              />
            </div>
            {error && <div className="rounded-xl text-sm px-4 py-3 bg-red-950/50 border border-red-800/40 text-red-400">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 font-bold rounded-xl gap-2 flex items-center justify-center bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-60"
            >
              {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
              {loading ? "جاري الإرسال…" : "إرسال رابط الاسترداد"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <a href={backHref} className="text-sm flex items-center justify-center gap-1 text-slate-500 hover:text-slate-300">
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              العودة لصفحة الدخول
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* ── Public portal (brand-aligned) ── */
  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-10" dir="rtl">

      {/* Logo */}
      <div className="mb-7 select-none flex flex-col items-center gap-1">
        {logoUrl ? (
          <img src={logoUrl} alt="تكيّة" className="h-16 object-contain" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-[#8C6246] flex items-center justify-center text-white text-2xl font-bold mb-1">ت</div>
        )}
        <p className="text-xs text-[#9E9E9E] font-medium">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">

        {sent ? (
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-14 h-14 rounded-full bg-[#F5EEE9] flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-[#8C6246]" />
            </div>
            <h2 className="text-lg font-bold text-[#2D2D2D] mb-2">تم الإرسال بنجاح</h2>
            <p className="text-sm text-[#656565] leading-relaxed mb-6">
              إذا كان البريد الإلكتروني مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور خلال دقائق.
            </p>
            <a href={backHref} className="flex items-center gap-2 text-sm text-[#656565] font-medium hover:text-[#2D2D2D] hover:underline transition-colors">
              <ArrowRight className="w-4 h-4 rotate-180" />
              العودة لصفحة الدخول
            </a>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#F5EEE9] flex items-center justify-center mb-3">
                <Mail className="w-5 h-5 text-[#8C6246]" />
              </div>
              <h2 className="text-xl font-bold text-[#2D2D2D] mb-1">نسيت كلمة المرور؟</h2>
              <p className="text-sm text-[#656565] font-semibold text-center">أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#4A4A4A] mb-2">البريد الإلكتروني</label>
                <input
                  type="text"
                  placeholder="أدخل بريدك الإلكتروني"
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(null); }}
                  dir="rtl"
                  autoFocus
                  required
                  className="w-full px-4 py-3 border border-[#E0E0E0] rounded-xl focus:outline-none focus:border-[#8C6246] transition-colors text-right text-sm bg-white placeholder:text-[#C0C0C0]"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white bg-[#8C6246] hover:bg-[#7A5538] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                )}
                {loading ? "جاري الإرسال…" : "إرسال رابط الاسترداد"}
              </button>
            </form>

            <div className="mt-5 text-center">
              <a
                href={backHref}
                className="text-sm text-[#656565] font-medium hover:text-[#2D2D2D] hover:underline transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                العودة لصفحة الدخول
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
