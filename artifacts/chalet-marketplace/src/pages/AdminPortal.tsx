import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ShieldCheck, KeyRound } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminPortal() {
  const [, navigate]            = useLocation();
  const qc                      = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setError(null);
    setLoading(true);

    try {
      const r = await fetch(`${BASE}/api/admin-portal-login`, {
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

      qc.invalidateQueries({ queryKey: ["admin-staff", "me"] });
      navigate(data.redirect ?? "/admin");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-10"
      dir="rtl"
    >
      {/* ── Brand ── */}
      <div className="flex flex-col items-center mb-8 select-none">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
          <ShieldCheck className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-wide">تكيّة</h1>
        <p className="text-slate-500 text-xs mt-1 tracking-widest uppercase">Admin Portal</p>
      </div>

      {/* ── Login card ── */}
      <div className="w-full max-w-xs bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl shadow-black/40">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <KeyRound className="w-4 h-4 text-amber-400" />
            <h2 className="font-semibold text-slate-200 text-sm tracking-wide">بوابة الإدارة</h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">اسم المستخدم</label>
              <Input
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                autoComplete="username"
                dir="ltr"
                className="h-10 text-left text-slate-100 placeholder:text-slate-600 bg-slate-800 border-slate-700 focus:border-amber-500 focus:ring-amber-500/20"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-400">كلمة المرور</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  autoComplete="current-password"
                  dir="ltr"
                  className="h-10 text-left pr-10 text-slate-100 placeholder:text-slate-600 bg-slate-800 border-slate-700 focus:border-amber-500 focus:ring-amber-500/20"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-950/50 border border-red-800/40 text-red-400 text-xs px-3 py-2.5">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm gap-2 transition-colors"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {loading ? "جاري التحقق…" : "دخول الإدارة"}
            </Button>
          </form>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 px-6">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[10px] text-slate-600 font-medium tracking-widest">OR</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Super Admin OIDC */}
        <div className="px-6 py-5">
          <a
            href={`${BASE}/api/auth/login?returnTo=/admin`}
            className="flex items-center justify-center gap-2 w-full h-10 bg-slate-800 border border-slate-700 hover:border-amber-500/40 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-400 hover:text-amber-300 transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>دخول المشرف العام</span>
          </a>
        </div>
      </div>

      {/* Subtle footer — no public links */}
      <p className="text-center text-[10px] text-slate-700 mt-6 tracking-wider">
        RESTRICTED ACCESS — TAKYA PLATFORM MANAGEMENT
      </p>
    </div>
  );
}
