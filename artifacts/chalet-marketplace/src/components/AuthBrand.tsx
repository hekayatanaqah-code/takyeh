const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AuthBrand({ tagline = true }: { tagline?: boolean }) {
  return (
    <a href={`${BASE}/`} aria-label="تكيّة - الصفحة الرئيسية" className="flex flex-col items-center mb-6 select-none">
      <div className="w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center">
        <img src={`${BASE}/images/splash-logo.webp`} alt="شعار تكيّة" className="w-full h-full object-contain" />
      </div>
      {tagline && (
        <p className="text-sm text-[#8C6246] font-medium mt-2 text-center">منصتك المتكاملة لإدارة الحجوزات والخدمات</p>
      )}
    </a>
  );
}
