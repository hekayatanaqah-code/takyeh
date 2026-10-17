import riyalSymbol from "@/assets/saudi-riyal.svg";

interface RiyalIconProps {
  className?: string;
}

/**
 * الشعار الرسمي الجديد للريال السعودي (SAR).
 * يُرسم عبر CSS mask بلون currentColor ليتناسق تلقائياً مع أي سياق نصي/أيقوني.
 */
export function RiyalIcon({ className = "w-5 h-5" }: RiyalIconProps) {
  return (
    <span
      role="img"
      aria-label="ريال سعودي"
      className={`inline-block bg-current shrink-0 ${className}`}
      style={{
        WebkitMaskImage: `url(${riyalSymbol})`,
        maskImage: `url(${riyalSymbol})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}
