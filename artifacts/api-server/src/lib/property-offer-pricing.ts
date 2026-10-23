import { and, desc, eq, inArray } from "drizzle-orm";
import { db, chaletsTable, chaletSeasonsTable, globalSeasonsTable, chaletGlobalSeasonsTable, propertyOffersTable } from "@workspace/db";

export type PropertyPeriod = "morning" | "evening" | "full_day";
export type DiscountOffer = {
  id: number; nameAr: string; startDate: string; endDate: string;
  weekdays: number[]; discountType: "percent" | "fixed" | "night_price";
  value: string | number; enabled: boolean;
};
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const eastern = (v: number) => new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", maximumFractionDigits: 2 }).format(v);

export function bestPropertyOffer(basePrice: number, date: string, offers: readonly DiscountOffer[]) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let price = money(basePrice);
  let winner: DiscountOffer | null = null;
  for (const offer of [...offers].sort((a, b) => a.id - b.id)) {
    if (!offer.enabled || date < offer.startDate || date > offer.endDate || !offer.weekdays.includes(weekday)) continue;
    const value = Number(offer.value);
    const candidate = money(Math.max(0, offer.discountType === "percent" ? basePrice * (1 - value / 100)
      : offer.discountType === "fixed" ? basePrice - value : value));
    if (candidate < price) { price = candidate; winner = offer; }
  }
  const badge = winner ? winner.discountType === "percent" ? `خصم ${eastern(Number(winner.value))}٪`
    : winner.discountType === "fixed" ? `خصم ${eastern(basePrice - price)} ريال`
    : `سعر خاص — وفر ${eastern(basePrice - price)} ريال` : null;
  return { date, basePrice: money(basePrice), price, offerId: winner?.id ?? null, offerName: winner?.nameAr ?? null, badge };
}

async function loadPricingData(submissionIds: number[]) {
  const [privateSeasons, globalSeasons, associations, offers] = await Promise.all([
    db.select().from(chaletSeasonsTable).where(inArray(chaletSeasonsTable.submissionId, submissionIds)).orderBy(chaletSeasonsTable.startDate, chaletSeasonsTable.id),
    db.select().from(globalSeasonsTable).where(eq(globalSeasonsTable.isActive, true)).orderBy(globalSeasonsTable.startDate, globalSeasonsTable.id),
    db.select().from(chaletGlobalSeasonsTable).where(inArray(chaletGlobalSeasonsTable.submissionId, submissionIds)),
    db.select().from(propertyOffersTable).where(and(inArray(propertyOffersTable.submissionId, submissionIds), eq(propertyOffersTable.enabled, true))).orderBy(desc(propertyOffersTable.id)),
  ]);
  return { privateSeasons, globalSeasons, associations, offers };
}

type PricingData = Awaited<ReturnType<typeof loadPricingData>>;
type PricedChalet = typeof chaletsTable.$inferSelect;
function calculatePropertyPrice(chalet: PricedChalet, data: PricingData, date: string, period: PropertyPeriod, durationDays = 1) {
  if (chalet.deletedAt || !chalet.isActive) throw new Error("العقار غير متاح");
  if (!(period === "morning" ? chalet.slotMorning : period === "evening" ? chalet.slotEvening : chalet.slotFullDay)) {
    throw new Error("الفترة غير متاحة لهذا العقار");
  }
  const { privateSeasons, globalSeasons, associations, offers } = data;
  const periodField = period === "morning" ? "priceMorning" : period === "evening" ? "priceEvening" : "priceFullDay";
  const dailyField = period === "full_day" ? "fullDay" : period;
  const dailyBaseField = period === "full_day" ? "fullday" : period;
  const days = [];
  for (let i = 0; i < durationDays; i++) {
    const dayDate = new Date(`${date}T12:00:00Z`);
    dayDate.setUTCDate(dayDate.getUTCDate() + i);
    const day = dayDate.toISOString().slice(0, 10);
    const weekday = dayDate.getUTCDay();
    const dailyBase = chalet.dailyPrices?.[dailyBaseField]?.[String(weekday)]
      ?? chalet.dailyPrices?.[period]?.[String(weekday)];
    let base = dailyBase ?? (chalet[periodField] != null ? Number(chalet[periodField])
      : period === "full_day" ? Number((weekday === 5 || weekday === 6 ? chalet.priceWeekend : chalet.priceWeekday) ?? chalet.pricePerNight) : NaN);
    const seasonPrice = (season: { dailyPrices: unknown; priceMorning: string | null; priceEvening: string | null; priceFullDay: string | null }) => {
      const daily = season.dailyPrices as Record<string, Record<string, number>> | null;
      const special = daily?.[day]?.[dailyField];
      return special ?? (season[periodField] != null ? Number(season[periodField]) : null);
    };
    const custom = privateSeasons.find(s => s.startDate <= day && s.endDate >= day && (!s.period || s.period === period));
    const customPrice = custom ? seasonPrice(custom) : null;
    if (customPrice != null) base = customPrice;
    else {
      for (const global of globalSeasons) {
        if (global.startDate > day || global.endDate < day) continue;
        const registration = associations.find(s => s.globalSeasonId === global.id);
        if (!registration || !registration.enabled) continue;
        const globalPrice = seasonPrice(registration);
        if (globalPrice != null) { base = globalPrice; break; }
      }
    }
    if (!Number.isFinite(base) || base < 0) throw new Error("لا يوجد سعر معتمد للفترة المحددة");
    days.push(bestPropertyOffer(base, day, offers));
  }
  const basePrice = money(days.reduce((sum, day) => sum + day.basePrice, 0));
  const price = money(days.reduce((sum, day) => sum + day.price, 0));
  return { basePrice, price, discountAmount: money(basePrice - price), days };
}

function pricingForProperty(data: PricingData, submissionId: number): PricingData {
  return {
    privateSeasons: data.privateSeasons.filter(row => row.submissionId === submissionId),
    globalSeasons: data.globalSeasons,
    associations: data.associations.filter(row => row.submissionId === submissionId),
    offers: data.offers.filter(row => row.submissionId === submissionId),
  };
}

export async function quotePropertyPrice(submissionId: number, date: string, period: PropertyPeriod, durationDays = 1) {
  const [chalet] = await db.select().from(chaletsTable)
    .where(and(eq(chaletsTable.submissionId, submissionId), eq(chaletsTable.isActive, true))).limit(1);
  if (!chalet || chalet.deletedAt) throw new Error("العقار غير متاح");
  return calculatePropertyPrice(chalet, await loadPricingData([submissionId]), date, period, durationDays);
}

/** Batch-load pricing once, rather than making a request/query set for every search card. */
export async function getPropertySearchPrices(entries: Array<{ chalet: PricedChalet; date: string }>, period?: PropertyPeriod) {
  const prices = new Map<number, { date: string; period: PropertyPeriod; quote: ReturnType<typeof calculatePropertyPrice> }>();
  const ids = [...new Set(entries.flatMap(({ chalet }) => chalet.submissionId == null ? [] : [chalet.submissionId]))];
  if (!ids.length) return prices;
  const data = await loadPricingData(ids);
  for (const { chalet, date } of entries) {
    if (chalet.submissionId == null) continue;
    const scoped = pricingForProperty(data, chalet.submissionId);
    const periods: PropertyPeriod[] = period ? [period] : ["full_day", "morning", "evening"];
    for (const candidate of periods) {
      // Missing/disabled slot prices must not fall back to another period's price.
      if (!(candidate === "morning" ? chalet.slotMorning : candidate === "evening" ? chalet.slotEvening : chalet.slotFullDay)) continue;
      const weekday = String(new Date(`${date}T12:00:00Z`).getUTCDay());
      const dailyKey = candidate === "full_day" ? "fullday" : candidate;
      if (chalet.dailyPrices && chalet.dailyPrices[dailyKey]?.[weekday] == null) continue;
      let quote;
      try { quote = calculatePropertyPrice(chalet, scoped, date, candidate); }
      catch (error) {
        if ((error as Error).message === "لا يوجد سعر معتمد للفترة المحددة") continue;
        throw error;
      }
      if (!prices.has(chalet.id) || quote.price < prices.get(chalet.id)!.quote.price) {
        prices.set(chalet.id, { date, period: candidate, quote });
      }
    }
  }
  return prices;
}
