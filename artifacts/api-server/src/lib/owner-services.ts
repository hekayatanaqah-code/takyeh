import { db, ownerServicesTable, siteSettingsTable, citiesCatalogTable, regionsCatalogTable } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { photographyReadiness } from "./photography-delivery";

type Store = Pick<typeof db, "select" | "insert" | "update" | "execute">;
export async function validServiceCities(ids: number[]) {
  const cities = await db.select({ id: citiesCatalogTable.id }).from(citiesCatalogTable)
    .innerJoin(regionsCatalogTable, eq(citiesCatalogTable.regionId, regionsCatalogTable.id))
    .where(and(eq(citiesCatalogTable.isActive, true), eq(regionsCatalogTable.isActive, true)));
  return new Set(ids).size === ids.length && ids.every(id => cities.some(c => c.id === id));
}
export const serviceStateSchema = z.enum(["available", "coming_soon", "hidden"]);
export function safeServiceUrl(value: string) {
  if (/^\/(?!\/)/.test(value) && !/[\\\s\x00-\x1f]/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !/[\\\s\x00-\x1f]/.test(value);
  } catch { return false; }
}
export const ownerServiceInputSchema = z.object({
  coverageCityIds: z.array(z.number().int().positive()).max(500).optional(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  icon: z.enum(["camera", "sparkles", "wrench", "shield", "home", "briefcase"]).default("briefcase"),
  kind: z.enum(["photography", "link"]).default("link"),
  state: serviceStateSchema.default("coming_soon"),
  actionUrl: z.string().trim().max(2000).refine(safeServiceUrl, "رابط طلب الخدمة غير صالح").nullable().optional(),
}).strict();
export function serviceAvailabilityError(service: { kind: string; state: string; actionUrl: string | null }) {
  if (service.state !== "available") return null;
  if (service.kind === "link" && (!service.actionUrl || !safeServiceUrl(service.actionUrl))) return "أضف رابط طلب صالحاً قبل إتاحة الخدمة";
  if (service.kind === "photography") {
    const ready = photographyReadiness();
    if (!ready.payment || !ready.whatsapp) return "لا يمكن فتح خدمة التصوير قبل اكتمال إعداد الدفع والإرسال الفعلي عبر واتساب";
  }
  return null;
}
export async function lockOwnerServices(tx: Store) {
  await lockResource(tx, 731221, 0);
  // Lock the existing payment gate first, matching checkout/reservation lock order.
  await tx.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")).for("update");
}
export async function writePhotographyGate(tx: Store, enabled: boolean) {
  await tx.insert(siteSettingsTable).values({ key: "photography_enabled", value: String(enabled) })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: String(enabled), updatedAt: new Date() } });
}
export async function photographyCardEnabled(store: Store = db) {
  const [card] = await store.select().from(ownerServicesTable)
    .where(and(eq(ownerServicesTable.kind, "photography"), isNull(ownerServicesTable.deletedAt)));
  return card?.state === "available";
}
export async function setPhotographyServiceEnabled(enabled: boolean) {
  return db.transaction(async tx => {
    await lockOwnerServices(tx);
    const [card] = await tx.select().from(ownerServicesTable).where(and(eq(ownerServicesTable.kind, "photography"), isNull(ownerServicesTable.deletedAt)));
    if (!card) throw new Error("استعد بطاقة التصوير من خدمات الملاك أولاً");
    const error = serviceAvailabilityError({ ...card, state: enabled ? "available" : "coming_soon" });
    if (error) throw new Error(error);
    await writePhotographyGate(tx, enabled);
    await tx.update(ownerServicesTable).set({ state: enabled ? "available" : card.state === "hidden" ? "hidden" : "coming_soon", updatedAt: new Date() }).where(eq(ownerServicesTable.id, card.id));
  });
}
