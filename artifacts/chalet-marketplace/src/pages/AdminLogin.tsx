import { useState } from "react";
import { useLocation } from "wouter";
import { useAdminStaffAuth } from "@/lib/useAdminStaffAuth";
import { toAr } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { login, loginPending, loginError } = useAdminStaffAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await login({ username: username.trim(), password });
      navigate("/admin");
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    }
  }

  const errorMsg = localError ?? (loginError instanceof Error ? loginError.message : null);

  return (
    <div
      className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-4"
      dir="rtl"
    >
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center mb-4 shadow-lg">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">لوحة الإدارة</h1>
        <p className="text-slate-400 text-sm mt-1">منصة تكيّة — بوابة الإدارة العامة</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl">
        <h2 className="text-lg font-bold text-white text-center mb-1">دخول موظفي الإدارة</h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          أدخل بيانات حسابك للوصول إلى لوحة التحكم
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5 text-right">
              اسم المستخدم
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              autoComplete="username"
              required
              className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 text-right focus:border-amber-500 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5 text-right">
              كلمة المرور
            </label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                autoComplete="current-password"
                required
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 text-right pr-10 focus:border-amber-500 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm text-right">
              {errorMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={loginPending}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold h-11 rounded-xl"
          >
            {loginPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 ml-2" />
                تسجيل الدخول
              </>
            )}
          </Button>
        </form>
      </div>

      <p className="text-slate-600 text-xs mt-6 text-center">
        هذه الصفحة مخصصة لموظفي الإدارة العامة فقط.{" "}
        <a href={`${BASE}/admin`} className="text-amber-500 hover:text-amber-400 transition-colors">
          العودة للوحة التحكم
        </a>
      </p>
    </div>
  );
}
