import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn, Users, Building2, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, navigate]                = useLocation();
  const qc                          = useQueryClient();
  const [input, setInput]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const trimmed = input.trim();
    if (!trimmed || !password) return;

    /* If input looks like an email, owners must use the OIDC button */
    if (trimmed.includes("@")) {
      setError("الملاك يسجّلون دخولهم عبر زر «دخول الملاك» بالأسفل — اسم المستخدم لا يحتوي على @");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/unified-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: trimmed, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "بيانات الدخول غير صحيحة");
        return;
      }

      const roleLabel =
        data.role === "adminStaff" ? "موظف الإدارة العامة" : "موظف";
      setSuccessMsg(`مرحباً! جاري توجيهك كـ${roleLabel}…`);

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
      className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10"
      dir="rtl"
    >
      {/* ── Brand ── */}
      <div className="flex flex-col items-center mb-7 select-none">
        <div className="w-16 h-16 rounded-2xl bg-green-600 shadow-lg shadow-green-200 flex items-center justify-center mb-3">
          <span className="text-white text-2xl font-extrabold">ت</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">تكيّة</h1>
        <p className="text-gray-500 text-sm mt-0.5">منصة إدارة الشاليهات — القصيم</p>
      </div>

      {/* ── Single unified card ── */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 overflow-hidden">

        {/* ── Staff / Admin section (primary) ── */}
        <div className="p-7 pb-5">
          <div className="flex items-center gap-2 mb-0.5">
            <Users className="w-4 h-4 text-green-600" />
            <h2 className="font-bold text-gray-800 text-base">تسجيل الدخول</h2>
          </div>
          <p className="text-gray-400 text-xs mb-5">
            موظفو الشاليهات وموظفو الإدارة يدخلون باسم المستخدم
          </p>

          <form onSubmit={handleLogin} className="space-y-3">
            {/* Combined input */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                البريد الإلكتروني أو اسم المستخدم
              </label>
              <Input
                type="text"
                placeholder="اسم_المستخدم"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoComplete="username"
                dir="ltr"
                className="h-11 text-left placeholder:text-gray-300 border-gray-200 focus:border-green-500 focus:ring-green-200"
                required
              />
              <p className="text-[11px] text-gray-400 mt-1 me-0.5">
                الموظفون يستخدمون اسم المستخدم الذي أنشأه المدير
              </p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">كلمة المرور</label>
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

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
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
        <div className="flex items-center gap-3 px-7 py-1">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[11px] text-gray-300 font-medium tracking-wide">للملاك فقط</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* ── Owner OIDC login (secondary) ── */}
        <div className="px-7 py-5 bg-gray-50/60">
          <a
            href={`${BASE}/api/auth/login`}
            className="flex items-center justify-center gap-2 w-full h-11 bg-white border border-gray-200 hover:border-green-400 hover:bg-green-50 rounded-xl text-sm font-semibold text-gray-600 hover:text-green-700 transition-all shadow-sm"
          >
            <Building2 className="w-4 h-4" />
            <span>دخول الملاك</span>
          </a>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            إذا كنت مالك شاليه مسجّلاً في المنصة
          </p>
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
