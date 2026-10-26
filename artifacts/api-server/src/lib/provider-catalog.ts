import type { ProviderCatalogRecord, ProviderOfferRecord } from "@workspace/db";

export function catalogItemJson({ deletedAt: _, ...item }: ProviderCatalogRecord) {
  return { ...item, price: Number(item.price) };
}
export function providerOfferJson(offer: ProviderOfferRecord) {
  return { ...offer, value: Number(offer.value) };
}

/** Saudi calendar day; offers never change stored/manual booking amounts. */
export function currentCatalogDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function publicCatalogItem(item: ProviderCatalogRecord, offers: ProviderOfferRecord[], day: string) {
  const result = { ...catalogItemJson(item), finalPrice: Number(item.price), offerName: null as string | null };
  const baseCents = Math.round(Number(item.price) * 100);
  for (const offer of offers) {
    if (!offer.isActive || offer.startDate > day || offer.endDate < day ||
        (offer.itemId !== null && offer.itemId !== item.id)) continue;
    const discount = offer.discountType === "percentage"
      ? Math.round(baseCents * Number(offer.value) / 100)
      : Math.round(Number(offer.value) * 100);
    const finalPrice = Math.max(0, baseCents - discount) / 100;
    if (finalPrice < result.finalPrice) {
      result.finalPrice = finalPrice;
      result.offerName = offer.name;
    }
  }
  return result;
}
