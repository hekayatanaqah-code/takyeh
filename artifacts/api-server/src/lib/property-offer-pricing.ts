import { and, desc, eq } from "drizzle-orm";
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

export async function quotePropertyPrice(submissionId: number, date: string, period: PropertyPeriod, durationDays = 1) {
  const [chalet] = await db.select().from(chaletsTable)
    .where(and(eq(chaletsTable.submissionId, submissionId), eq(chaletsTable.isActive, true))).limit(1);
  if (!chalet || chalet.deletedAt) throw new Error("العقار غير متاح");
  if (!(period === "morning" ? chalet.slotMorning : period === "evening" ? chalet.slotEvening : chalet.slotFullDay)) {
    throw new Error("الفترة غير متاحة لهذا العقار");
  }
  const [privateSeasons, globalSeasons, associations, offers] = await Promise.all([
    db.select().from(chaletSeasonsTable).where(eq(chaletSeasonsTable.submissionId, submissionId)).orderBy(chaletSeasonsTable.startDate, chaletSeasonsTable.id),
    db.select().from(globalSeasonsTable).where(eq(globalSeasonsTable.isActive, true)).orderBy(globalSeasonsTable.startDate, globalSeasonsTable.id),
    db.select().from(chaletGlobalSeasonsTable).where(eq(chaletGlobalSeasonsTable.submissionId, submissionId)),
    db.select().from(propertyOffersTable).where(and(eq(propertyOffersTable.submissionId, submissionId), eq(propertyOffersTable.enabled, true))).orderBy(desc(propertyOffersTable.id)),
  ]);
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
