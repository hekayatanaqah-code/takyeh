import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Wrench, Layers2, ChevronLeft, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    email: p.get("email") ?? "",
    phone: p.get("phone") ?? "",
  };
}

type BizType = "chalet" | "service" | "both";

const options: { type: BizType; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    type: "chalet",
    icon: <Building2 className="w-7 h-7" />,
    label: "مالك عقار",
    desc: "أدر حجوزات عقاراتك من لوحة تحكم واحدة",
  },
  {
    type: "service",
    icon: <Wrench className="w-7 h-7" />,
    label: "مزوّد خدمات",
    desc: "قدّم خدماتك المرتبطة بالسياحة والترفيه بمرونة كاملة",
  },
  {
    type: "both",
    icon: <Layers2 className="w-7 h-7" />,
    label: "كلاهما معاً",
    desc: "تملك عقارات وتقدّم خدمات في آنٍ واحد — لوحة تحكم موحّدة",
  },
];

export default function OnboardingType() {
  const [, navigate] = useLocation();
  const { email, phone } = getParams();
  const [selected, setSelected] = useState<BizType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: settings = {} } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    staleTime: 1000 * 60 * 5,
  });
  const logoUrl = settings.site_logo_url || "";

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      if (email || phone) {
        await fetch(`${BASE}/api/onboarding/type`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email || undefined, phone: phone || undefined, businessType: selected }),
        });
      }
      navigate(`/onboarding/welcome?type=${selected}`);
    } catch {
      setError("تعذّر الحفظ، يرجى المحاولة مرة أخرى");
    } finally {
      setSaving(false);
    }
  }

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
        <p className="text-sm text-[#8C6246] font-medium">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#EBEBEB] rounded-3xl p-8 shadow-sm">

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${s <= 3 ? "bg-[#8C6246]" : "bg-[#E8E0D8]"}`}
            />
          ))}
        </div>

        <h2 className="text-xl font-bold text-[#2D2D2D] mb-1 text-center">اختر نوع نشاطك</h2>
        <p className="text-sm text-[#656565] font-medium mb-6 text-center">
          سيتم تخصيص لوحة التحكم بناءً على اختيارك
        </p>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {options.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => setSelected(opt.type)}
              className={[
                "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-right",
                selected === opt.type
                  ? "border-[#8C6246] bg-[#F4EFEA]"
                  : "border-[#E0E0E0] bg-white hover:border-[#C9A882]",
              ].join(" ")}
            >
              <div
                className={[
                  "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  selected === opt.type ? "bg-[#8C6246] text-white" : "bg-[#F4EFEA] text-[#8C6246]",
                ].join(" ")}
              >
                {opt.icon}
              </div>
              <div className="flex-1">
                <p className="font-bold text-[#2D2D2D] text-base">{opt.label}</p>
                <p className="text-xs text-[#757575] mt-0.5 leading-relaxed">{opt.desc}</p>
              </div>
              <div
                className={[
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  selected === opt.type ? "border-[#8C6246]" : "border-[#C0C0C0]",
                ].join(" ")}
              >
                {selected === opt.type && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#8C6246]" />
                )}
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 mb-4 text-center">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleContinue}
          disabled={!selected || saving}
          className="w-full bg-[#8C6246] hover:bg-[#734f36] disabled:opacity-50 text-white py-3.5 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-sm"
        >
          {saving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> جاري الحفظ…</>
          ) : (
            <>
              <span>التالي</span>
              <ChevronLeft className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      {/* Step indicator */}
      <p className="text-xs text-[#9E9E9E] mt-5">الخطوة ٣ من ٤</p>
    </div>
  );
}
