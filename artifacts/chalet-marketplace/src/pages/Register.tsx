import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, ScrollText } from "lucide-react";
import { toAr, fromAr } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const normalizeLocalPhoneInput = (value: string) => {
  const digits = fromAr(value).replace(/\D/g, "");
  if (digits.startsWith("966")) return `0${digits.slice(3).replace(/^0/, "")}`;
  return digits.startsWith("0") ? digits : `0${digits}`;
};

const LICENSE_CLAUSE = "يقر المالك/مزود الخدمة، بأن المنشأة (العقار أو الخدمة) حاصلة على كافة التراخيص اللازمة من الجهات المعنية....";

function prepareTermsForDisplay(terms: string) {
  let normalized = terms.replaceAll("الشاليهات", "العقارات والخدمات");
  normalized = normalized.replace(
    /4\.\s*التراخيص الرسمية:[\s\S]*?(?=\r?\n\s*5\.\s*نظام الاشتراكات:)/,
    `4. التراخيص الرسمية:\n${LICENSE_CLAUSE}\n`
  );
  normalized = normalized.replaceAll("الشاليه", "العقار أو الخدمة");
  return normalized.replace(
    /يقر المالك بأن المنشأة \(العقار أو الخدمة\)[^.]*\./,
    LICENSE_CLAUSE
  );
}

export default function Register() {
  const [, navigate] = useLocation();
  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    staleTime: 1000 * 60 * 5,
  });
  const logoUrl = settings.site_logo_url || "";
  const [form, setForm] = useState({
    fullName: "",
    phone: normalizeLocalPhoneInput(new URLSearchParams(window.location.search).get("phone") ?? ""),
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw]               = useState(false);
  const [showCPw, setShowCPw]             = useState(false);
  const [loading, setLoading]             = useState(false);
  const [checking, setChecking]           = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [fieldErrors, setFieldErrors]     = useState<{ email?: string; phone?: string }>({});
  const [platformTerms, setPlatformTerms] = useState<string>("");
  const [showModal, setShowModal]         = useState(false);
  const scrollRef                         = useRef<HTMLDivElement>(null);
  const displayedTerms                   = prepareTermsForDisplay(platformTerms);

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
    if (field === "email" || field === "phone") {
      setFieldErrors((fe) => ({ ...fe, [field]: undefined }));
    }
  }

  function validateForm(): string | null {
    const { fullName, phone, email, password, confirmPassword } = form;
    if (!fullName || !phone || !password)
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

  async function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    const err = validateForm();
    if (err) { setError(err); return; }
    setError(null);
    setFieldErrors({});

    setChecking(true);
    try {
      const r = await fetch(`${BASE}/api/auth/check-exists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() || undefined, phone: form.phone.trim() }),
      });
      const data = await r.json();

      if (r.status === 422 && data.errors) {
        setFieldErrors(data.errors);
        return;
      }
      if (!r.ok) {
        setError(data.error ?? "تعذّر التحقق من البيانات، يرجى المحاولة مرة أخرى");
        return;
      }
    } catch {
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
      return;
    } finally {
      setChecking(false);
    }

    setShowModal(true);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0 }), 50);
  }

  async function handleConfirmedSubmit() {
    setLoading(true);
    const { fullName, phone, email, password } = form;
    try {
      const r = await fetch(`${BASE}/api/register-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, email, password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setShowModal(false);
        setError(data.error ?? "حدث خطأ أثناء التسجيل");
        return;
      }
      setShowModal(false);
      if (data.requiresVerification && email.trim()) {
        navigate(`/verify?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
      } else {
        navigate(`/verify-phone?phone=${encodeURIComponent(phone)}`);
      }
    } catch {
      setShowModal(false);
      setError("تعذّر الاتصال بالخادم. يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-4 py-3 border border-[#E0E0E0] rounded-xl focus:outline-none focus:border-[#8C6246] transition-colors text-sm bg-white placeholder:text-[#C0C0C0]";
  const labelCls = "block text-sm font-semibold text-[#4A4A4A] mb-2";

  return (
    <>
      {/* ── Terms Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          dir="rtl"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl">

            {/* Modal header */}
            <div className="p-6 border-b border-[#EBEBEB] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#F4EFEA] text-[#8C6246] rounded-xl flex items-center justify-center shrink-0">
                  <ScrollText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#2D2D2D]">شروط استخدام المنصة</h3>
                  <p className="text-xs text-[#9E9E9E]">يُرجى القراءة الكاملة قبل الموافقة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="text-[#9E9E9E] hover:text-[#2D2D2D] transition-colors disabled:opacity-40 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Terms content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 text-sm text-[#4A4A4A] leading-relaxed text-right space-y-4">
              {displayedTerms ? (
                <pre className="whitespace-pre-wrap font-sans">{displayedTerms}</pre>
              ) : (
                <>
                  <p className="font-bold text-[#2D2D2D]">اتفاقية تقديم خدمة (شريك نجاح - مالك)</p>
                  <p>١. طبيعة الخدمة: تعد منصة "تكية" منصة وسيطة تقنية فقط، مهمتها عرض تفاصيل العقارات والخدمات وتسويقها، وتحويل العميل الراغب في الحجز مباشرة إلى "واتساب" المالك.</p>
                  <p>٢. مسؤولية البيانات: يقر المالك بأن جميع المعلومات والصور والأسعار المرفوعة على المنصة صحيحة وتخصه هو شخصياً.</p>
                  <p>٣. إخلاء المسؤولية القانونية: منصة "تكية" غير مسؤولة عن أي خلاف مالي أو تعاقدي يقع بين المالك والمستأجر.</p>
                  <p>٤. التراخيص الرسمية: {LICENSE_CLAUSE}</p>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-6 border-t border-[#EBEBEB] bg-[#FBF9F6] rounded-b-3xl shrink-0">
              <p className="text-xs text-[#4A4A4A] font-medium text-center mb-4 leading-relaxed">
                بالنقر على «موافق، إكمال التسجيل» فإنك تُقرّ بأنك قرأت هذه الشروط وتوافق عليها بالكامل
              </p>
              <button
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={loading}
                className="w-full bg-[#8C6246] hover:bg-[#734f36] disabled:opacity-60 text-white py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> جاري الإرسال…</>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    موافق، إكمال التسجيل
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="register-terms-close w-full text-center text-xs text-[#4A4A4A] font-semibold mt-3 disabled:opacity-40"
              >
                إغلاق والعودة لتعديل البيانات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Registration Form ── */}
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center p-4" dir="rtl">

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 flex items-center justify-center mb-3">
            {logoUrl
              ? <img src={logoUrl} alt="شعار تكيّة" className="w-full h-full object-contain" />
              : <span className="text-[#8C6246] text-5xl font-bold">ت</span>
            }
          </div>
          <p className="text-sm text-[#8C6246] font-medium mt-2">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
        </div>

        {/* Card */}
        <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">
          <h2 className="text-xl font-bold text-[#2D2D2D] mb-1 text-center">إنشاء حساب جديد</h2>
          <p className="text-sm text-[#656565] font-medium mb-6 text-center">
            أدخل بياناتك الشخصية، ثم اختر نوع نشاطك وابدأ بإضافة عقارك أو خدمتك
          </p>

          <form onSubmit={handleSubmitClick} className="space-y-4">

            {/* Full Name */}
            <div>
              <label className={labelCls}>الاسم الكامل <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="محمد عبدالله الأحمد"
                value={form.fullName}
                onChange={(e) => update("fullName", e.target.value)}
                className={`${inputCls} text-right`}
                required
                autoFocus
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>رقم الجوال <span className="text-red-500">*</span></label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  dir="ltr"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4B4B4B] font-bold text-sm select-none pointer-events-none"
                >
                  +966
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="٥١٢٣٤٥٦٧٨"
                  value={toAr(form.phone.replace(/^0/, ""))}
                  onChange={(e) => update("phone", normalizeLocalPhoneInput(e.target.value))}
                  dir="ltr"
                  className={`${inputCls} text-left pl-20 ${fieldErrors.phone ? "border-red-400 focus:border-red-400" : ""}`}
                  required
                  aria-label="رقم الجوال بعد رمز الدولة +966"
                />
              </div>
              {fieldErrors.phone && (
                <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>البريد الإلكتروني (اختياري)</label>
              <input
                type="email"
                placeholder="أدخل بريدك الإلكتروني"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                dir="rtl"
                className={`${inputCls} text-right ${fieldErrors.email ? "border-red-400 focus:border-red-400" : ""}`}
              />
              {fieldErrors.email
                ? <p className="text-xs text-red-500 font-medium mt-1">{fieldErrors.email}</p>
                : <p className="text-xs text-[#757575] font-medium mt-1">يُستخدم لتلقي الإشعارات والدخول (اختياري)</p>
              }
            </div>

            {/* Password */}
            <div>
              <label className={labelCls}>كلمة المرور <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  dir="ltr"
                  className={`${inputCls} text-left pl-10`}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0B0B0] hover:text-[#7A7A7A] transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-[#757575] font-medium mt-1">٦ أحرف على الأقل</p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className={labelCls}>تأكيد كلمة المرور <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type={showCPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  dir="ltr"
                  className={`${inputCls} text-left pl-10`}
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCPw((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0B0B0] hover:text-[#7A7A7A] transition-colors"
                >
                  {showCPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Terms notice */}
            <div className="bg-[#F4EFEA] border border-[#D9C3B0] text-[#734f36] p-3 rounded-xl flex items-center gap-3 text-xs font-medium">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0 text-[#8C6246]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>سيُعرض عليك شروط استخدام المنصة للمراجعة والموافقة قبل إتمام الطلب.</span>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={checking}
              className="w-full bg-[#8C6246] hover:bg-[#734f36] disabled:opacity-60 text-white py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {checking ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري التحقق…</>
              ) : (
                <>
                  <span>المتابعة للموافقة على الشروط</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-[#4B4B4B] mt-6">
            لديك حساب بالفعل؟{" "}
            <a href={`${BASE}/login`} className="register-login-link text-[#8C6246] font-bold">
              تسجيل الدخول
            </a>
          </p>
        </div>

        <a href={`${BASE}/`} className="register-return-link text-xs text-[#4B4B4B] mt-5">
          العودة لتصفح منصة تكيّة
        </a>
      </div>
    </>
  );
}
