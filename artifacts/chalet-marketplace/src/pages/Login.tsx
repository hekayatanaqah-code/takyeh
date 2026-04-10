import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn, User, ShieldCheck, ChevronLeft } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/unified-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "بيانات الدخول غير صحيحة");
        return;
      }

      /* Show role-specific success message then navigate */
      const roleLabel =
        data.role === "adminStaff" ? "موظف الإدارة العامة" : "موظف";
      setSuccessMsg(`مرحباً! جاري توجيهك كـ${roleLabel}…`);

      /* Invalidate cached auth queries so the destination page re-checks */
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
      qc.invalidateQueries({ queryKey: ["admin-staff", "me"] });

      setTimeout(() => navigate(data.redirect ?? "/dashboard"), 500);
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4"
      dir="rtl"
    >
      {/* ── Brand ── */}
      <div className="flex flex-col items-center mb-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-green-600 shadow-lg shadow-green-200 flex items-center justify-center mb-3">
          <span className="text-white text-2xl font-extrabold">ت</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">تكيّة</h1>
        <p className="text-gray-500 text-sm mt-0.5">منصة إدارة الشاليهات — القصيم</p>
      </div>

      {/* ── Login card ── */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">

        {/* Staff / Admin login */}
        <div className="p-7">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-green-600" />
            <h2 className="font-bold text-gray-800 text-base">دخول الموظفين</h2>
          </div>
          <p className="text-gray-400 text-xs mb-5">
            موظفو شاليهات أو موظفو الإدارة العامة
          </p>

          <form onSubmit={handleLogin} className="space-y-3">
            {/* Username */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">اسم المستخدم</label>
              <Input
                type="text"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                dir="ltr"
                className="h-11 text-left placeholder:text-gray-300 border-gray-200 focus:border-green-500 focus:ring-green-200"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">كلمة المرور</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                  className="h-11 text-left pr-10 placeholder:text-gray-300 border-gray-200 focus:border-green-500 focus:ring-green-200"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error / Success */}
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-2.5">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="rounded-xl bg-green-50 border border-green-100 text-green-700 text-sm px-4 py-2.5">
                {successMsg}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-sm shadow-green-100 gap-2"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? "جاري الدخول…" : "تسجيل الدخول"}
            </Button>
          </form>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-7">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-300 font-medium">أو</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Owner OIDC login */}
        <div className="p-7 pt-5 bg-gray-50/60">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-gray-500" />
            <h3 className="font-semibold text-gray-700 text-sm">دخول الملاك</h3>
          </div>
          <p className="text-gray-400 text-xs mb-4">
            إذا كنت مالك شاليه، سجّل دخولك بحسابك الخاص
          </p>
          <a
            href={`${BASE}/api/auth/login`}
            className="flex items-center justify-center gap-2 w-full h-10 bg-white border border-gray-200 hover:border-green-400 hover:bg-green-50 rounded-xl text-sm font-semibold text-gray-700 hover:text-green-700 transition-all shadow-sm"
          >
            <span>تسجيل الدخول كمالك</span>
            <ChevronLeft className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-6">
        <a href={`${BASE}/`} className="text-green-600 hover:text-green-700 transition-colors">
          ← العودة للرئيسية
        </a>
      </p>
    </div>
  );
}
