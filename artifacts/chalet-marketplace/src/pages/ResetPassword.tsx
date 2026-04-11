import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, KeyRound, CheckCircle2, XCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ResetPassword() {
  const [, navigate]          = useLocation();
  const searchStr             = useSearch();
  const token                 = new URLSearchParams(searchStr).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);
  const [invalid, setInvalid]   = useState(false);

  useEffect(() => {
    if (!token) setInvalid(true);
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }
    if (password.length < 6)  { setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل"); return; }

    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 410) { setInvalid(true); return; }
        setError(data.error ?? "حدث خطأ أثناء إعادة التعيين");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">الرابط غير صالح</h2>
          <p className="text-gray-500 text-sm mb-6">
            هذا الرابط منتهي الصلاحية أو تم استخدامه مسبقاً. يرجى طلب رابط جديد.
          </p>
          <Button onClick={() => navigate("/forgot-password")} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl">
            طلب رابط جديد
          </Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center px-4" dir="rtl">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">تم تحديث كلمة المرور</h2>
          <p className="text-gray-500 text-sm mb-6">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
          <Button onClick={() => navigate("/login")} className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl">
            تسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 select-none">
          <div className="w-12 h-12 rounded-xl bg-green-600 flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-bold text-gray-900 text-lg">إعادة تعيين كلمة المرور</h1>
          <p className="text-gray-500 text-xs mt-1">أدخل كلمة المرور الجديدة</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">كلمة المرور الجديدة</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  dir="ltr"
                  className="h-11 text-left pr-10 border-gray-200 focus:border-green-500"
                  required
                  autoFocus
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">٦ أحرف على الأقل</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">تأكيد كلمة المرور</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                dir="ltr"
                className="h-11 text-left border-gray-200 focus:border-green-500"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">{error}</div>
            )}

            <Button type="submit" disabled={loading}
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2">
              {loading && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>}
              {loading ? "جاري التحديث…" : "تحديث كلمة المرور"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
