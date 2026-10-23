import type { PropertyPriceQuote } from "@workspace/api-client-react";
import { usePropertyPriceQuote } from "@/hooks/usePropertyPriceQuote";
import riyalSymbol from "@/assets/saudi-riyal.svg";
import { cn } from "@/lib/utils";

export function OfferPrice({ quote, dark = false, variant = "default" }: { quote: PropertyPriceQuote; dark?: boolean; variant?: "default" | "search" }) {
  const search = variant === "search";
  const format = (value: number) => new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", maximumFractionDigits: 2 }).format(value);
  const offer = quote.days.find(day => day.offerId != null);
  return <span className={cn("inline-flex flex-wrap items-center justify-center", search ? "gap-x-4 gap-y-2" : "gap-x-2 gap-y-1")} dir="rtl" data-testid="property-offer-price">
    {quote.discountAmount > 0 && <del className={cn(search ? "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-base font-normal not-italic tabular-nums no-underline" : "text-xs font-normal italic", dark ? "text-stone-300" : "text-slate-600")} aria-label="السعر قبل الخصم">
      <span className={cn(search && "relative inline-block after:pointer-events-none after:absolute after:-left-0.5 after:-right-0.5 after:top-1/2 after:h-px after:-rotate-[14deg] after:bg-current after:opacity-40 after:content-['']")}>{format(quote.basePrice)}</span>
      {search && <img src={riyalSymbol} alt="ريال سعودي" className={cn("h-3.5 w-3.5 shrink-0 object-contain opacity-65", dark && "invert")} />}
    </del>}
    <strong className={cn("inline-flex items-center gap-1", search ? "text-2xl font-black" : "text-base font-extrabold", dark ? "text-amber-300" : "text-emerald-800")}>
      {format(quote.price)}<img src={riyalSymbol} alt="ريال سعودي" className={cn(search ? "h-5 w-5" : "h-4 w-4", "object-contain", dark && "invert")} />
    </strong>
    {quote.discountAmount > 0 && <span className={cn("rounded-full font-bold", search ? "shrink-0 whitespace-nowrap px-3 py-1.5 text-sm leading-5" : "px-2 py-0.5 text-[11px]", dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-950")}>{offer?.badge ?? "عرض خاص"}</span>}
  </span>;
}

export function PropertyPeriodPrice({ chaletId, date, period, fallback, dark = false }: {
  chaletId?: number; date: string; period: string; fallback: string | null; dark?: boolean;
}) {
  const quote = usePropertyPriceQuote(chaletId, date, period);
  if (!date || !chaletId) return <>{fallback}</>;
  if (quote.isError) return <span className="text-xs" role="alert">تعذّر حساب السعر، أعد المحاولة</span>;
  if (!quote.data) return <span className="text-xs">جارٍ حساب السعر…</span>;
  return <OfferPrice quote={quote.data} dark={dark} />;
}
