import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Building2, CheckCircle2, X, ScrollText, Loader2 } from "lucide-react";
import { toAr, fromAr } from "@/lib/utils";

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
  const [platformTerms, setPlatformTerms] = useState<string>("");
  const [showModal, setShowModal]         = useState(false);
  const scrollRef                         = useRef<HTMLDivElement>(null);

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

  function validateForm(): string | null {
    const { fullName, businessName, phone, email, password, confirmPassword } = form;
    if (!fullName || !businessName || !phone || !email || !password)
      return "يرجى تعبئة جميع الحقول المطلوبة";
    if (password !== confirmPassword)
      return "كلمتا المرور غير متطابقتين";
    if (password.length < 6)
      return "كلمة المرور يجب أن تكون ٦ أحرف على الأقل";
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, "")))
      return "رقم الجوال يجب أن يبدأ بـ ٠٥ ويتكون من ١٠ أرقام";
    return null;
  }

  function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    const err = validateForm();
    if (err) { setError(err); return; }
    setError(null);
    setShowModal(true);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0 }), 50);
  }

  async function handleConfirmedSubmit() {
    setLoading(true);
    const { fullName, businessName, businessType, phone, email, password } = form;
    try {
      const r = await fetch(`${BASE}/api/register-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, businessName, businessType, phone, email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setShowModal(false);
        setError(data.error ?? "حدث خطأ أثناء التسجيل");
        return;
      }
      setShowModal(false);
      setSubmitted(true);
    } catch {
      setShowModal(false);
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
    <>
      {/* ══════════════════════════════════════════════
          Full-Screen Terms Modal
          ══════════════════════════════════════════════ */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          dir="rtl"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        >
          <div className="flex flex-col h-full max-w-2xl w-full mx-auto my-0 sm:my-6 sm:rounded-3xl bg-white overflow-hidden shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-green-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
                  <ScrollText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base leading-tight">شروط استخدام المنصة</h3>
                  <p className="text-xs text-gray-500">يُرجى القراءة الكاملة قبل الموافقة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Terms content — scrollable */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-5"
            >
              {platformTerms ? (
                <pre className="text-gray-700 text-sm leading-loose whitespace-pre-wrap font-sans">
                  {platformTerms}
                </pre>
              ) : (
                <p className="text-gray-400 text-sm text-center mt-8">
                  سيتم تحديث شروط الاستخدام قريباً.
                </p>
              )}
            </div>

            {/* Modal footer — sticky at bottom */}
            <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4 space-y-3">
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                بالنقر على «موافق، إكمال التسجيل» فإنك تُقرّ بأنك قرأت هذه الشروط وتوافق عليها بالكامل
              </p>
              <Button
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={loading}
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-base gap-2 disabled:opacity-70"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال…</>
                ) : (
                  <><CheckCircle2 className="w-5 h-5" /> موافق، إكمال التسجيل</>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-1 disabled:opacity-40 transition-colors"
              >
                إغلاق والعودة لتعديل البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          Registration Form
          ══════════════════════════════════════════════ */}
      <div
        className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10"
        dir="rtl"
      >
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

          <form onSubmit={handleSubmitClick} className="space-y-4">
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
                type="text"
                inputMode="numeric"
                placeholder="٠٥١٢٣٤٥٦٧٨"
                value={toAr(form.phone)}
                onChange={(e) => update("phone", fromAr(e.target.value))}
                className="h-11 text-right border-gray-200 focus:border-green-500"
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

            {/* Terms notice */}
            <div className="flex items-start gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <ScrollText className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-600 leading-relaxed">
                سيُعرض عليك شروط استخدام المنصة للمراجعة والموافقة قبل إتمام الطلب.
              </p>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2"
            >
              إرسال طلب التسجيل
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
    </>
  );
}
