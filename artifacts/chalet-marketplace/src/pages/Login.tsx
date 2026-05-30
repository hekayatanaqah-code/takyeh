import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, ShieldAlert, Info } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, navigate]    = useLocation();
  const qc              = useQueryClient();
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    staleTime: 1000 * 60 * 5,
  });
  const logoUrl = settings.site_logo_url || "";
  const [input, setInput]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isAdminBlock, setIsAdminBlock] = useState(false);
  const [rememberMe, setRememberMe]     = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !password) return;

    setError(null);
    setIsAdminBlock(false);
    setLoading(true);
    try {
      const endpoint = trimmed.includes("@") ? "/api/owner-login" : "/api/unified-login";
      const body = trimmed.includes("@")
        ? JSON.stringify({ email: trimmed, password, rememberMe })
        : JSON.stringify({ username: trimmed, password, rememberMe });

      const r = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      const data = await r.json();

      if (!r.ok) {
        if (data.adminPortal) {
          setIsAdminBlock(true);
        } else {
          setError(data.error ?? "بيانات الدخول غير صحيحة");
        }
        return;
      }

      qc.invalidateQueries({ queryKey: ["auth", "user"] });
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
      navigate(data.redirect ?? "/dashboard");
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center p-4" dir="rtl">

      {/* Logo */}
      <a href={`${BASE}/`} className="flex flex-col items-center mb-6 select-none">
        <div className="w-24 h-24 flex items-center justify-center mb-3">
          {logoUrl
            ? <img src={logoUrl} alt="شعار تكيّة" className="w-full h-full object-contain" />
            : <span className="text-[#8C6246] text-5xl font-bold">ت</span>
          }
        </div>
        <p className="text-sm text-[#8C6246] font-medium mt-2">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      </a>

      {/* Guidance banner */}
      <div className="w-full max-w-md bg-[#F4EFEA] border border-[#D9C3B0] text-[#734f36] px-4 py-3 rounded-xl flex items-center gap-3 mb-4 text-sm font-medium">
        <Info className="w-5 h-5 shrink-0 text-[#8C6246]" />
        <span>تنويه: هذا القسم مخصص لشركاء تكية فقط.</span>
      </div>

      {/* Login card */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">
        <h2 className="text-xl font-bold text-[#2D2D2D] mb-1 text-center">تسجيل الدخول</h2>
        <p className="text-sm text-[#656565] font-semibold mb-6 text-center">مرحباً بك مجدداً في منصة تكيّة</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#4A4A4A] mb-2">
              البريد الإلكتروني
            </label>
            <input
              type="text"
              placeholder="أدخل بريدك الإلكتروني"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); setIsAdminBlock(false); }}
              autoComplete="username"
              dir="rtl"
              autoFocus
              required
              className="w-full px-4 py-3 border border-[#E0E0E0] rounded-xl focus:outline-none focus:border-[#8C6246] transition-colors text-right text-sm bg-white placeholder:text-[#C0C0C0]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#4A4A4A] mb-2">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); setIsAdminBlock(false); }}
                autoComplete="current-password"
                dir="rtl"
                required
                className="w-full ps-4 pe-10 py-3 border border-[#E0E0E0] rounded-xl focus:outline-none focus:border-[#8C6246] transition-colors text-right text-sm bg-white placeholder:text-[#C0C0C0]"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-[#B0B0B0] hover:text-[#7A7A7A] transition-colors"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Admin cross-block */}
          {isAdminBlock && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 flex gap-2 items-start">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold mb-0.5">يرجى استخدام بوابة الإدارة المخصصة</p>
                <p className="text-xs text-amber-700">هذا الحساب مخصص للإدارة العامة فقط.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-[#7A7A7A] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#E0E0E0] accent-[#8C6246] cursor-pointer w-3.5 h-3.5"
              />
              <span>تذكرني لـ ٣٠ يوم</span>
            </label>
            <a href={`${BASE}/forgot-password`} className="text-[#8C6246] hover:underline font-medium">
              نسيت كلمة المرور؟
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#8C6246] hover:bg-[#734f36] disabled:opacity-60 text-white py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-sm mt-6"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <>
                <span>دخول</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer links */}
      <div className="flex flex-col items-center gap-2 mt-6 text-sm">
        <p className="text-base text-[#555555] font-medium">
          شريك جديد؟{" "}
          <a href={`${BASE}/register`} className="text-[#8C6246] hover:underline font-bold">انضم إلينا الآن</a>
        </p>
        <a href={`${BASE}/`} className="text-sm text-[#656565] font-medium hover:text-[#2D2D2D] hover:underline transition-colors">العودة لتصفح منصة تكيّة</a>
      </div>

    </div>
  );
}
