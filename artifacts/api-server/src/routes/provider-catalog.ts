import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, providerCatalogItemsTable as items, providerOffersTable as offers, serviceProvidersTable as providers } from "@workspace/db";
import { CreateProviderCatalogItemBody, CreateProviderOfferBody } from "@workspace/api-zod";
import { catalogItemJson, currentCatalogDay, providerOfferJson, publicCatalogItem } from "../lib/provider-catalog";

const router = Router();
const idInput = z.coerce.number().int().positive().max(2147483647);
const itemInput = CreateProviderCatalogItemBody.extend({ name: z.string().trim().min(2).max(150) })
  .refine(v => v.price >= 0.01 && Math.abs(v.price * 100 - Math.round(v.price * 100)) < 0.000001, "السعر يدعم منزلتين عشريتين فقط");
const realDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
});
const offerInput = CreateProviderOfferBody.extend({
  name: z.string().trim().min(2).max(150),
  startDate: realDate,
  endDate: realDate,
}).refine(v => v.startDate <= v.endDate, "تاريخ نهاية العرض يسبق البداية")
  .refine(v => v.discountType !== "percentage" || v.value <= 100, "النسبة لا تتجاوز ١٠٠٪")
  .refine(v => v.value >= 0.01 && Math.abs(v.value * 100 - Math.round(v.value * 100)) < 0.000001, "الخصم يدعم منزلتين عشريتين فقط");

// Mounted below /my/approved, before any generic provider routes.
router.use("/:providerId", async (req: any, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  const id = idInput.safeParse(req.params.providerId);
  if (!id.success) return res.status(400).json({ error: "معرّف الخدمة غير صالح" });
  const [provider] = await db.select({ id: providers.id }).from(providers)
    .where(and(eq(providers.id, id.data), eq(providers.ownerId, req.user.id))).limit(1);
  if (!provider) return res.status(404).json({ error: "الخدمة غير موجودة" });
  res.locals.catalogProviderId = provider.id;
  return next();
});

router.get("/:providerId/catalog", async (_req, res) => {
  const rows = await db.select().from(items)
    .where(and(eq(items.providerId, res.locals.catalogProviderId), isNull(items.deletedAt))).orderBy(desc(items.id));
  res.json(rows.map(catalogItemJson));
});
router.post("/:providerId/catalog", async (req, res) => {
  const body = itemInput.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "تحقق من اسم المنتج وقيمته ووحدة التسعير" });
  const [row] = await db.insert(items).values({
    ...body.data, providerId: res.locals.catalogProviderId, price: body.data.price.toFixed(2),
  }).returning();
  return res.status(201).json(catalogItemJson(row));
});
router.patch("/:providerId/catalog/:itemId", async (req, res) => {
  const id = idInput.safeParse(req.params.itemId);
  const body = itemInput.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ error: "بيانات المنتج غير صحيحة" });
  const [row] = await db.update(items).set({ ...body.data, price: body.data.price.toFixed(2) })
    .where(and(eq(items.id, id.data), eq(items.providerId, res.locals.catalogProviderId), isNull(items.deletedAt))).returning();
  if (!row) return res.status(404).json({ error: "المنتج غير موجود" });
  return res.json(catalogItemJson(row));
});
router.delete("/:providerId/catalog/:itemId", async (req, res) => {
  const id = idInput.safeParse(req.params.itemId);
  if (!id.success) return res.status(400).json({ error: "معرّف المنتج غير صالح" });
  const removed = await db.transaction(async tx => {
    const [row] = await tx.update(items).set({ deletedAt: new Date(), isActive: false })
      .where(and(eq(items.id, id.data), eq(items.providerId, res.locals.catalogProviderId), isNull(items.deletedAt))).returning();
    if (!row) return false;
    await tx.update(offers).set({ isActive: false }).where(and(eq(offers.providerId, row.providerId), eq(offers.itemId, row.id)));
    return true;
  });
  if (!removed) return res.status(404).json({ error: "المنتج غير موجود" });
  return res.status(204).end();
});
router.get("/:providerId/offers", async (_req, res) => {
  const rows = await db.select().from(offers).where(eq(offers.providerId, res.locals.catalogProviderId)).orderBy(desc(offers.id));
  res.json(rows.map(providerOfferJson));
});
for (const method of ["post", "patch"] as const) {
  router[method](method === "post" ? "/:providerId/offers" : "/:providerId/offers/:offerId", async (req, res) => {
    const id = method === "patch" ? idInput.safeParse((req.params as Record<string, string>).offerId) : null;
    const body = offerInput.safeParse(req.body);
    if (!body.success || (id && !id.success)) return res.status(400).json({ error: "تحقق من اسم العرض ونوع الخصم وقيمته وتواريخه" });
    const providerId = res.locals.catalogProviderId as number;
    // Serialize item deletion and offer targeting to avoid a live offer for a deleted item.
    const result = await db.transaction(async tx => {
      if (body.data.itemId !== null) {
        const [item] = await tx.select({ id: items.id }).from(items)
          .where(and(eq(items.id, body.data.itemId), eq(items.providerId, providerId), isNull(items.deletedAt)))
          .for("update").limit(1);
        if (!item) return null;
      }
      const values = { ...body.data, providerId, value: body.data.value.toFixed(2) };
      const [row] = method === "post"
        ? await tx.insert(offers).values(values).returning()
        : await tx.update(offers).set(values).where(and(eq(offers.id, id!.data!), eq(offers.providerId, providerId))).returning();
      return row ?? null;
    });
    if (!result) return res.status(404).json({ error: "المنتج أو العرض غير موجود في هذه الخدمة" });
    return res.status(method === "post" ? 201 : 200).json(providerOfferJson(result));
  });
}
router.delete("/:providerId/offers/:offerId", async (req, res) => {
  const id = idInput.safeParse(req.params.offerId);
  if (!id.success) return res.status(400).json({ error: "معرّف العرض غير صالح" });
  const [row] = await db.delete(offers).where(and(eq(offers.id, id.data), eq(offers.providerId, res.locals.catalogProviderId))).returning();
  if (!row) return res.status(404).json({ error: "العرض غير موجود" });
  return res.status(204).end();
});

export async function getPublicCatalog(providerId: number) {
  const [catalog, discounts] = await Promise.all([
    db.select().from(items).where(and(eq(items.providerId, providerId), eq(items.isActive, true), isNull(items.deletedAt))).orderBy(items.id),
    db.select().from(offers).where(and(eq(offers.providerId, providerId), eq(offers.isActive, true))).orderBy(offers.id),
  ]);
  const day = currentCatalogDay();
  return catalog.map(item => publicCatalogItem(item, discounts, day));
}
export default router;
