import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, LogIn, Info, ShieldAlert } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, navigate]      = useLocation();
  const qc                = useQueryClient();
  const [input, setInput] = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isAdminBlock, setIsAdminBlock] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !password) return;

    setError(null);
    setIsAdminBlock(false);

    /* ── Auto-detect: email → OIDC, username → staff login ── */
    if (trimmed.includes("@")) {
      window.location.href = `${BASE}/api/login`;
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
        if (data.adminPortal) {
          setIsAdminBlock(true);
        } else {
          setError(data.error ?? "بيانات الدخول غير صحيحة");
        }
        return;
      }

      qc.invalidateQueries({ queryKey: ["staff", "me"] });
      navigate(data.redirect ?? "/dashboard");
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

      {/* ── Guidance banner ── */}
      <div className="w-full max-w-sm mb-4 flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
        <Info className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        <p className="text-sm text-green-800 leading-relaxed">
          عزيزي العميل، هذا القسم مخصص لملاك الشاليهات فقط
        </p>
      </div>

      {/* ── Login card ── */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-100 p-7">
        <h2 className="font-bold text-gray-800 text-base mb-1">تسجيل الدخول</h2>
        <p className="text-gray-400 text-xs mb-5">أدخل بريدك الإلكتروني (للملاك) أو اسم المستخدم (للموظفين)</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              البريد الإلكتروني أو اسم المستخدم
            </label>
            <Input
              type="text"
              placeholder="اسم_المستخدم أو example@email.com"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(null); setIsAdminBlock(false); }}
              autoComplete="username"
              dir="ltr"
              className="h-11 text-left placeholder:text-gray-300 border-gray-200 focus:border-green-500"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">كلمة المرور</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); setIsAdminBlock(false); }}
                autoComplete="current-password"
                dir="ltr"
                className="h-11 text-left pr-10 placeholder:text-gray-300 border-gray-200 focus:border-green-500"
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

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {loading ? "جاري الدخول…" : "دخول"}
          </Button>
        </form>
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        <a href={`${BASE}/`} className="text-green-600 hover:text-green-700 transition-colors">
          ← العودة للرئيسية
        </a>
      </p>
    </div>
  );
}
