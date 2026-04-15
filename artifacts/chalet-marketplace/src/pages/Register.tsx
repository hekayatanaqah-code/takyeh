import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Building2, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Register() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    fullName: "",
    businessName: "",
    businessType: "chalet" as "chalet" | "service" | "both",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw]               = useState(false);
  const [showCPw, setShowCPw]             = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [submitted, setSubmitted]         = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsExpanded, setTermsExpanded] = useState(false);
  const [platformTerms, setPlatformTerms] = useState<string>("");

  useEffect(() => {
    fetch(`${BASE}/api/page-content`, { credentials: "include" })
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, string>) => {
        if (data.terms_page_content) setPlatformTerms(data.terms_page_content);
      })
      .catch(() => {});
  }, []);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { fullName, businessName, businessType, phone, email, password, confirmPassword } = form;
    if (!fullName || !businessName || !phone || !email || !password) {
      setError("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل");
      return;
    }
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
      setError("رقم الجوال يجب أن يبدأ بـ ٠٥ ويتكون من ١٠ أرقام");
      return;
    }
    if (!termsAccepted) {
      setError("يجب الموافقة على شروط استخدام المنصة للمتابعة");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/register-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, businessName, businessType, phone, email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error ?? "حدث خطأ أثناء التسجيل");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4"
        dir="rtl"
      >
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">تم استلام طلبك</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            تم استلام طلبك، سيتم مراجعته وتفعيل حسابك قريباً.
            <br />
            سنتواصل معك على البريد الإلكتروني المُدخل.
          </p>
          <Button
            onClick={() => navigate("/login")}
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl"
          >
            العودة لصفحة الدخول
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10"
      dir="rtl"
    >
      {/* ── Brand ── */}
      <div className="flex flex-col items-center mb-6 select-none">
        <div className="w-14 h-14 rounded-2xl bg-green-600 shadow-lg shadow-green-200 flex items-center justify-center mb-3">
          <Building2 className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">تكيّة</h1>
        <p className="text-gray-500 text-sm mt-0.5">انضم إلى شركاء تكيّة وابدأ إدارة أعمالك</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 p-7">
        <h2 className="font-bold text-gray-800 text-base mb-1">إنشاء حساب جديد</h2>
        <p className="text-gray-400 text-xs mb-5">
          سيتم مراجعة طلبك من قِبل الإدارة قبل التفعيل
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              الاسم الكامل <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="محمد عبدالله الأحمد"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              className="h-11 border-gray-200 focus:border-green-500"
              required
              autoFocus
            />
          </div>

          {/* Business Type */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              نوع النشاط <span className="text-red-500">*</span>
            </label>
            <select
              value={form.businessType}
              onChange={(e) => update("businessType", e.target.value as typeof form.businessType)}
              className="w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              required
            >
              <option value="chalet">🏡  مالك شاليه</option>
              <option value="service">🔧  مزود خدمة</option>
              <option value="both">🏡🔧  كلاهما</option>
            </select>
          </div>

          {/* Business Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              اسم النشاط التجاري <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder={form.businessType === "service" ? "شركة الخدمات المتميزة" : "شاليه النخيل"}
              value={form.businessName}
              onChange={(e) => update("businessName", e.target.value)}
              className="h-11 border-gray-200 focus:border-green-500"
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              رقم الجوال <span className="text-red-500">*</span>
            </label>
            <Input
              type="tel"
              placeholder="٠٥١٢٣٤٥٦٧٨"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              dir="ltr"
              className="h-11 text-left border-gray-200 focus:border-green-500"
              required
            />
            <p className="text-xs text-gray-400">مثال: ٠٥١٢٣٤٥٦٧٨</p>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              البريد الإلكتروني <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              placeholder="example@email.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              dir="ltr"
              className="h-11 text-left border-gray-200 focus:border-green-500"
              required
            />
            <p className="text-xs text-gray-400">سيُستخدم للدخول وإعادة تعيين كلمة المرور</p>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              كلمة المرور <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                dir="ltr"
                className="h-11 text-left pr-10 border-gray-200 focus:border-green-500"
                required
                minLength={6}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">٦ أحرف على الأقل</p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">
              تأكيد كلمة المرور <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type={showCPw ? "text" : "password"}
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                dir="ltr"
                className="h-11 text-left pr-10 border-gray-200 focus:border-green-500"
                required
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowCPw((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                {showCPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Platform Terms ── */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setTermsExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <span>شروط استخدام المنصة</span>
              {termsExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {termsExpanded && (
              <div className="px-4 pb-4 max-h-48 overflow-y-auto text-xs text-gray-600 leading-relaxed whitespace-pre-wrap border-t border-gray-200 pt-3">
                {platformTerms || "سيتم تحديث شروط الاستخدام قريباً."}
              </div>
            )}
            <label className="flex items-start gap-3 px-4 py-3 border-t border-gray-200 cursor-pointer hover:bg-green-50 transition-colors">
              <div className="mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-gray-300"
                />
              </div>
              <span className="text-sm text-gray-700 leading-relaxed">
                أوافق على{" "}
                <a href={`${BASE}/terms`} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-medium">
                  شروط استخدام المنصة
                </a>{" "}
                وأقر بصحة البيانات المدخلة <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !termsAccepted}
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2 disabled:opacity-60"
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : null}
            {loading ? "جاري الإرسال…" : "إرسال طلب التسجيل"}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          لديك حساب بالفعل؟{" "}
          <a href={`${BASE}/login`} className="text-green-600 hover:text-green-700 font-medium">
            تسجيل الدخول
          </a>
        </p>
      </div>
    </div>
  );
}
