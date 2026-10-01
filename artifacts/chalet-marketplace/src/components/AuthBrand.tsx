import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AuthBrand({ tagline = true }: { tagline?: boolean }) {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    staleTime: 1000 * 60 * 5,
  });
  const logoUrl = data?.site_logo_url || "";
  return (
    <a href={`${BASE}/`} aria-label="تكيّة - الصفحة الرئيسية" className="flex flex-col items-center mb-6 select-none">
      <div className="w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center">
        {logoUrl ? (
          <img src={logoUrl} alt="شعار تكيّة" className="w-full h-full object-contain" />
        ) : (
          <span className="text-[#8C6246] text-7xl sm:text-8xl font-bold" aria-hidden="true">ت</span>
        )}
      </div>
      {tagline && (
        <p className="text-sm text-[#8C6246] font-medium mt-2 text-center">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      )}
    </a>
  );
}
