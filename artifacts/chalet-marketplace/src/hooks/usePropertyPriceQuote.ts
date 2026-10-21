import { useQuery } from "@tanstack/react-query";
import type { PropertyPriceQuote } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export function usePropertyPriceQuote(chaletId: number | undefined, date: string, period: string | null | undefined) {
  const normalizedPeriod = period === "fullday" ? "full_day" : period;
  return useQuery<PropertyPriceQuote>({
    queryKey: ["property-price-quote", chaletId, date, normalizedPeriod],
    enabled: !!chaletId && !!date && !!normalizedPeriod,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ date, period: normalizedPeriod! });
      const res = await fetch(`${BASE}/api/chalets/${chaletId}/price-quote?${params}`, { signal });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "تعذّر حساب السعر");
      return res.json();
    },
    staleTime: 10000, refetchInterval: 30000, refetchOnWindowFocus: true,
    retry: false,
  });
}

export function quotePriceText(quote: PropertyPriceQuote) {
  const format = (value: number) => new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", maximumFractionDigits: 2 }).format(value);
  const final = `${format(quote.price)} ريال سعودي`;
  if (!quote.discountAmount) return final;
  const offer = quote.days.find(day => day.offerId != null);
  return `${final} (${offer?.badge ?? "عرض خاص"}، السعر قبل الخصم ${format(quote.basePrice)} ريال سعودي)`;
}
