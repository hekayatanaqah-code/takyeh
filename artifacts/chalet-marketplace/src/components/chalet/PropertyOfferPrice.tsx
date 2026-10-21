import type { PropertyPriceQuote } from "@workspace/api-client-react";
import { usePropertyPriceQuote } from "@/hooks/usePropertyPriceQuote";
import riyalSymbol from "@/assets/saudi-riyal.svg";
import { cn } from "@/lib/utils";

export function OfferPrice({ quote, dark = false }: { quote: PropertyPriceQuote; dark?: boolean }) {
  const format = (value: number) => new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", maximumFractionDigits: 2 }).format(value);
  const offer = quote.days.find(day => day.offerId != null);
  return <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1" dir="rtl" data-testid="property-offer-price">
    {quote.discountAmount > 0 && <del className={cn("text-xs font-normal italic", dark ? "text-stone-300" : "text-slate-600")} aria-label="السعر قبل الخصم">{format(quote.basePrice)}</del>}
    <strong className={cn("inline-flex items-center gap-1 text-base font-extrabold", dark ? "text-amber-300" : "text-emerald-800")}>
      {format(quote.price)}<img src={riyalSymbol} alt="ريال سعودي" className={cn("h-4 w-4 object-contain", dark && "invert")} />
    </strong>
    {quote.discountAmount > 0 && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-950")}>{offer?.badge ?? "عرض خاص"}</span>}
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
