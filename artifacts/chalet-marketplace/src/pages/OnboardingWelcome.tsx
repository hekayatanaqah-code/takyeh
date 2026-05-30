import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Gift, Building2, Wrench, Layers2, ArrowLeft, CheckCircle2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { type: (p.get("type") ?? "chalet") as "chalet" | "service" };
}

export default function OnboardingWelcome() {
  const [, navigate] = useLocation();
  const { type } = getParams();

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    staleTime: 1000 * 60 * 5,
  });
  const logoUrl = settings.site_logo_url || "";

  const isBoth   = type === "both";
  const isChalet = type === "chalet";

  const addPath  = isBoth ? "/add-chalet" : isChalet ? "/add-chalet" : "/add-service-provider";
  const addLabel = isBoth ? "ابدأ بتجهيز حسابك الآن" : isChalet ? "أضف أول عقارك الآن" : "أضف أول خدمة الآن";
  const TypeIcon = isBoth ? Layers2 : isChalet ? Building2 : Wrench;

  const steps = isBoth
    ? [
        "أضف عقارك الأول — الصور والتفاصيل والموقع",
        "أضف خدماتك — الوصف والصور والأسعار",
        "أدر الحجوزات والطلبات من لوحة تحكم موحّدة",
      ]
    : isChalet
    ? [
        "أضف شاليهك — الصور والتفاصيل والموقع",
        "حدّد الأسعار والمواسم والإتاحة",
        "استقبل الحجوزات مباشرة من لوحة التحكم",
      ]
    : [
        "أضف خدمتك — الوصف والصور والأسعار",
        "حدّد مناطق التغطية وأوقات التوفر",
        "استقبل الطلبات مباشرة من لوحة التحكم",
      ];

  return (
    <div className="min-h-screen bg-[#FBF9F6] flex flex-col items-center justify-center p-4" dir="rtl">

      {/* Logo */}
      <div className="flex flex-col items-center mb-8 select-none">
        <div className="w-20 h-20 flex items-center justify-center mb-3">
          {logoUrl
            ? <img src={logoUrl} alt="شعار تكيّة" className="w-full h-full object-contain" />
            : <span className="text-[#8C6246] text-5xl font-bold">ت</span>
          }
        </div>
        <p className="text-sm text-[#555555] font-semibold">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="h-1.5 flex-1 rounded-full bg-[#8C6246]" />
          ))}
        </div>

        {/* Welcome header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 bg-[#F4EFEA] rounded-2xl flex items-center justify-center mb-4">
            <TypeIcon className="w-8 h-8 text-[#8C6246]" />
          </div>
          <h2 className="text-xl font-bold text-[#2D2D2D] mb-1">أهلاً بك في تكيّة 🎉</h2>
          <p className="text-sm text-[#656565] font-medium">
            حسابك جاهز — ابدأ رحلتك الآن
          </p>
        </div>

        {/* Free trial banner */}
        <div className="bg-gradient-to-l from-[#F4EFEA] to-[#FBF9F6] border border-[#D9C3B0] rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-[#8C6246] rounded-xl flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-[#2D2D2D] text-sm">أول شهر مجاناً</p>
              <p className="text-xs text-[#734f36] font-medium">تبدأ فترتك المجانية فور إطلاق نشاطك واستقبال الحجوزات</p>
            </div>
          </div>
          <p className="text-xs text-[#555555] leading-relaxed font-medium">
            يمكنك إضافة عقارك أو خدمتك الآن والاستمتاع بكامل مزايا المنصة مجاناً طوال الشهر الأول من تفعيل استقبال الحجوزات.
          </p>
        </div>

        {/* Next steps */}
        <div className="bg-[#F8F8F8] rounded-2xl p-4 mb-6">
          <p className="text-xs font-bold text-[#4A4A4A] mb-3">ما الذي سيحدث بعد ذلك؟</p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-xs text-[#555555]">
                <CheckCircle2 className="w-4 h-4 text-[#8C6246] shrink-0" />
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate(addPath)}
          className="w-full bg-[#8C6246] hover:bg-[#734f36] text-white py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
        >
          <span>{addLabel}</span>
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Skip */}
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="w-full text-center text-sm text-[#656565] font-medium hover:text-[#2D2D2D] hover:underline mt-4 transition-colors"
        >
          تخطّ الآن — سأضيف لاحقاً من لوحة التحكم
        </button>
      </div>

      <p className="text-xs text-[#9E9E9E] mt-5">الخطوة ٤ من ٤</p>
    </div>
  );
}
