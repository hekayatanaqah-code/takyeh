import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";

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
      if (!r.ok) {
        setError(data.error ?? "حدث خطأ. يرجى المحاولة مرة أخرى");
        return;
      }
      setSent(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  const backHref = isAdmin ? `${BASE}/management/portal` : `${BASE}/login`;
  const bgClass  = isAdmin
    ? "min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-10"
    : "min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10";

  if (sent) {
    return (
      <div className={bgClass} dir="rtl">
        <div className={`w-full max-w-sm rounded-3xl p-8 flex flex-col items-center text-center ${
          isAdmin ? "bg-slate-900 border border-slate-800" : "bg-white shadow-xl border border-gray-100"
        }`}>
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isAdmin ? "bg-amber-500/10" : "bg-green-100"
          }`}>
            <CheckCircle2 className={`w-8 h-8 ${isAdmin ? "text-amber-400" : "text-green-600"}`} />
          </div>
          <h2 className={`text-lg font-bold mb-2 ${isAdmin ? "text-slate-100" : "text-gray-900"}`}>
            تم الإرسال
          </h2>
          <p className={`text-sm leading-relaxed mb-6 ${isAdmin ? "text-slate-400" : "text-gray-500"}`}>
            إذا كان البريد الإلكتروني أو اسم المستخدم مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة تعيين كلمة المرور خلال دقائق.
          </p>
          <a
            href={backHref}
            className={`flex items-center gap-2 text-sm font-medium ${
              isAdmin ? "text-amber-400 hover:text-amber-300" : "text-green-600 hover:text-green-700"
            }`}
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            العودة لصفحة الدخول
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={bgClass} dir="rtl">
      {/* Brand */}
      <div className="flex flex-col items-center mb-7 select-none">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${
          isAdmin ? "bg-amber-500/10 border border-amber-500/20" : "bg-green-600"
        }`}>
          <Mail className={`w-6 h-6 ${isAdmin ? "text-amber-400" : "text-white"}`} />
        </div>
        <h1 className={`font-bold ${isAdmin ? "text-slate-200" : "text-gray-900"}`}>
          نسيت كلمة المرور؟
        </h1>
        <p className={`text-xs mt-1 ${isAdmin ? "text-slate-500" : "text-gray-500"}`}>
          أدخل بريدك الإلكتروني أو اسم المستخدم وسنرسل لك رابط إعادة التعيين
        </p>
      </div>

      <div className={`w-full max-w-sm rounded-2xl p-6 ${
        isAdmin
          ? "bg-slate-900 border border-slate-800 shadow-2xl"
          : "bg-white shadow-xl border border-gray-100"
      }`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className={`block text-sm font-medium ${isAdmin ? "text-slate-400" : "text-gray-700"}`}>
              البريد الإلكتروني أو اسم المستخدم
            </label>
            <Input
              type="text"
              placeholder={isAdmin ? "username أو email" : "example@email.com أو اسم_المستخدم"}
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setError(null); }}
              dir="ltr"
              className={`h-11 text-left ${
                isAdmin
                  ? "text-slate-100 placeholder:text-slate-600 bg-slate-800 border-slate-700 focus:border-amber-500"
                  : "border-gray-200 focus:border-green-500"
              }`}
              required
              autoFocus
            />
          </div>

          {error && (
            <div className={`rounded-xl text-sm px-4 py-3 ${
              isAdmin
                ? "bg-red-950/50 border border-red-800/40 text-red-400"
                : "bg-red-50 border border-red-100 text-red-600"
            }`}>
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className={`w-full h-11 font-bold rounded-xl gap-2 ${
              isAdmin
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            )}
            {loading ? "جاري الإرسال…" : "إرسال رابط الاسترداد"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <a
            href={backHref}
            className={`text-sm flex items-center justify-center gap-1 ${
              isAdmin ? "text-slate-500 hover:text-slate-300" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            العودة لصفحة الدخول
          </a>
        </div>
      </div>
    </div>
  );
}
