import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import AuthBrand from "@/components/AuthBrand";
import { AUTH_LABELS } from "@/lib/authLabels";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const token = params.get("token") ?? "";
  const isAdmin = params.get("portalType") === "admin";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => { if (!token) setInvalid(true); }, [token]);

  const goLogin = () => { if (isAdmin) window.location.href = `${BASE}/management/portal`; else navigate("/login"); };
  const goForgot = () => navigate(isAdmin ? "/forgot-password/admin" : "/forgot-password");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    if (password.length < 6) { setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل"); return; }
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 410) { setInvalid(true); return; }
        setError(data.error ?? "حدث خطأ أثناء إعادة التعيين");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  const shell = isAdmin
    ? "min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-10"
    : "min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center px-4 py-10";
  const card = isAdmin
    ? "w-full max-w-sm rounded-3xl p-8 bg-slate-900 border border-slate-800 shadow-2xl"
    : "w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm";
  const title = isAdmin ? "text-slate-100" : "text-[#2D2D2D]";
  const sub = isAdmin ? "text-slate-400" : "text-[#656565]";
  const btn = isAdmin
    ? "w-full h-11 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
    : "w-full py-3 rounded-xl font-bold text-white bg-[#8C6246] hover:bg-[#734f36] transition-colors disabled:opacity-60 flex items-center justify-center gap-2";
  const inputCls = isAdmin
    ? "w-full h-11 px-4 text-sm rounded-xl border border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
    : "w-full px-4 py-3 border border-[#E0E0E0] rounded-xl focus:outline-none focus:border-[#8C6246] text-sm bg-white placeholder:text-[#9A9A9A]";
  const label = isAdmin ? "block text-sm font-medium text-slate-400 mb-2" : "block text-sm font-semibold text-[#4A4A4A] mb-2";

  const brand = isAdmin ? null : <AuthBrand />;

  if (invalid || done) {
    const ok = done;
    return (
      <div className={shell} dir="rtl">
        {brand}
        <div className={`${card} flex flex-col items-center text-center`}>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${ok ? (isAdmin ? "bg-amber-500/10" : "bg-[#F5EEE9]") : "bg-red-100"}`}>
            {ok
              ? <CheckCircle2 className={`w-8 h-8 ${isAdmin ? "text-amber-400" : "text-[#8C6246]"}`} />
              : <XCircle className="w-8 h-8 text-red-500" />}
          </div>
          <h2 className={`text-lg font-bold mb-2 ${title}`} role="status">{ok ? "تم تحديث كلمة المرور" : "الرابط غير صالح"}</h2>
          <p className={`text-sm mb-6 ${sub}`}>
            {ok ? "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة." : "هذا الرابط منتهي الصلاحية أو تم استخدامه مسبقاً. يرجى طلب رابط جديد."}
          </p>
          <button onClick={ok ? goLogin : goForgot} className={btn}>{ok ? "تسجيل الدخول" : "طلب رابط جديد"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={shell} dir="rtl">
      {brand}
      <div className={card}>
        <h1 className={`text-xl font-bold mb-1 text-center ${title}`}>إعادة تعيين كلمة المرور</h1>
        <p className={`text-sm mb-6 text-center ${sub}`}>أدخل كلمة المرور الجديدة</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="rp-new" className={label}>كلمة المرور الجديدة</label>
            <div className="relative">
              <input id="rp-new" type={showPw ? "text" : "password"} placeholder={AUTH_LABELS.passwordPlaceholder}
                value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }}
                autoComplete="new-password" dir="rtl" required autoFocus className={`${inputCls} pe-10 text-right`} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? AUTH_LABELS.hidePassword : AUTH_LABELS.showPassword} aria-pressed={showPw}
                className={`absolute end-3 top-1/2 -translate-y-1/2 rounded focus:outline-none focus-visible:ring-2 ${isAdmin ? "text-slate-500 hover:text-slate-300 focus-visible:ring-amber-500" : "text-[#8A8A8A] hover:text-[#5A5A5A] focus-visible:ring-[#8C6246]"}`}>
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-xs mt-1.5 ${isAdmin ? "text-slate-500" : "text-[#656565]"}`}>٦ أحرف على الأقل</p>
          </div>
          <div>
            <label htmlFor="rp-confirm" className={label}>تأكيد كلمة المرور</label>
            <input id="rp-confirm" type={showPw ? "text" : "password"} placeholder={AUTH_LABELS.passwordPlaceholder}
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }}
              autoComplete="new-password" dir="rtl" required className={`${inputCls} text-right`} />
          </div>
          {error && (
            <div role="alert" className={`rounded-xl text-sm px-4 py-3 ${isAdmin ? "bg-red-950/50 border border-red-800/40 text-red-400" : "bg-red-50 border border-red-100 text-red-600"}`}>{error}</div>
          )}
          <button type="submit" disabled={loading} className={btn}>
            {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
            {loading ? "جاري التحديث…" : "تحديث كلمة المرور"}
          </button>
        </form>
      </div>
    </div>
  );
}
