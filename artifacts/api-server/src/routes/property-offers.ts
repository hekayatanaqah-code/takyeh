import { deleteRecords, insertRecords, updateRecords } from "@workspace/db/mutations";
import { Router, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, chaletSubmissionsTable, chaletsTable, propertyOffersTable } from "@workspace/db";
import { CreatePropertyOfferBody, UpdatePropertyOfferBody } from "@workspace/api-zod";
import { quotePropertyPrice } from "../lib/property-offer-pricing";

export const offerDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "تاريخ غير صحيح");
const fields = {
  nameAr: z.string().trim().min(1).max(120),
  startDate: offerDate, endDate: offerDate,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length),
  discountType: z.enum(["percent", "fixed", "night_price"]),
  value: z.number().finite().positive().max(99999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001),
};
export const offerInput = CreatePropertyOfferBody.extend(fields).superRefine((value, ctx) => {
  if (value.endDate < value.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "نهاية العرض تسبق بدايته" });
  if (value.discountType === "percent" && value.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "النسبة لا تتجاوز ١٠٠٪" });
});
const patchInput = UpdatePropertyOfferBody.extend({
  ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
}).strict();
export const priceQuery = z.object({
  date: offerDate, period: z.enum(["morning", "evening", "full_day"]),
  durationDays: z.coerce.number().int().min(1).max(60).default(1),
});
const idInput = z.coerce.number().int().positive();
const serializeOffer = (row: typeof propertyOffersTable.$inferSelect) => ({ ...row, value: Number(row.value), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

export function propertyOffersRouter(ownerIds: (req: Request) => Promise<string[]>) {
  const router = Router();
  async function owned(req: Request, submissionId: number) {
    const ids = await ownerIds(req);
    const [sub] = await db.select({ id: chaletSubmissionsTable.id, ownerId: chaletSubmissionsTable.ownerId }).from(chaletSubmissionsTable)
      .where(and(eq(chaletSubmissionsTable.id, submissionId), inArray(chaletSubmissionsTable.ownerId, ids), eq(chaletSubmissionsTable.status, "approved")));
    return sub;
  }
  router.get("/offers", async (req, res) => {
    const id = idInput.safeParse(req.query.submissionId);
    if (!id.success) { res.status(400).json({ error: "اختر العقار" }); return; }
    if (!await owned(req, id.data)) { res.status(403).json({ error: "غير مصرح" }); return; }
    const rows = await db.select().from(propertyOffersTable).where(eq(propertyOffersTable.submissionId, id.data)).orderBy(desc(propertyOffersTable.createdAt), desc(propertyOffersTable.id));
    res.json(rows.map(serializeOffer));
  });
  router.post("/offers", async (req, res) => {
    const parsed = offerInput.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "تحقق من الاسم والتواريخ والأيام وقيمة الخصم", details: parsed.error.flatten() }); return; }
    const sub = await owned(req, parsed.data.submissionId);
    if (!sub?.ownerId) { res.status(403).json({ error: "غير مصرح" }); return; }
    const [row] = await insertRecords(db, propertyOffersTable, { ...parsed.data, ownerId: sub.ownerId, value: parsed.data.value.toFixed(2) });
    res.status(201).json(serializeOffer(row));
  });
  router.patch("/offers/:offerId", async (req, res) => {
    const id = idInput.safeParse(req.params.offerId);
    const patch = patchInput.safeParse(req.body);
    if (!id.success || !patch.success || !Object.keys(req.body).length) { res.status(400).json({ error: "بيانات غير صحيحة" }); return; }
    const ids = await ownerIds(req);
    const [existing] = await db.select().from(propertyOffersTable).where(and(eq(propertyOffersTable.id, id.data), inArray(propertyOffersTable.ownerId, ids)));
    if (!existing || !await owned(req, existing.submissionId)) { res.status(404).json({ error: "العرض غير موجود" }); return; }
    const merged = offerInput.safeParse({ ...existing, value: Number(existing.value), ...patch.data });
    if (!merged.success) { res.status(400).json({ error: "تحقق من تواريخ العرض وقيمة الخصم", details: merged.error.flatten() }); return; }
    const [row] = await updateRecords(db, propertyOffersTable, { ...merged.data, value: merged.data.value.toFixed(2), updatedAt: new Date() }, and(eq(propertyOffersTable.id, id.data), inArray(propertyOffersTable.ownerId, ids)));
    res.json(serializeOffer(row));
  });
  router.delete("/offers/:offerId", async (req, res) => {
    const id = idInput.safeParse(req.params.offerId);
    if (!id.success) { res.status(400).json({ error: "عرض غير صحيح" }); return; }
    const ids = await ownerIds(req);
    const [deleted] = await deleteRecords(db, propertyOffersTable, and(eq(propertyOffersTable.id, id.data), inArray(propertyOffersTable.ownerId, ids)));
    if (!deleted) { res.status(404).json({ error: "العرض غير موجود" }); return; }
    res.sendStatus(204);
  });
  router.get("/price-quote", async (req, res) => {
    const id = idInput.safeParse(req.query.submissionId);
    const query = priceQuery.safeParse(req.query);
    if (!id.success || !query.success) { res.status(400).json({ error: "تحقق من العقار والتاريخ والفترة" }); return; }
    if (!await owned(req, id.data)) { res.status(403).json({ error: "غير مصرح" }); return; }
    try { res.json(await quotePropertyPrice(id.data, query.data.date, query.data.period, query.data.durationDays)); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); }
  });
  return router;
}

export const publicPropertyQuotesRouter = Router();
publicPropertyQuotesRouter.get("/chalets/:chaletId/price-quote", async (req, res) => {
  const id = idInput.safeParse(req.params.chaletId);
  const query = priceQuery.safeParse(req.query);
  if (!id.success || !query.success) { res.status(400).json({ error: "تاريخ أو فترة غير صحيحة" }); return; }
  const [chalet] = await db.select({ submissionId: chaletsTable.submissionId }).from(chaletsTable).where(and(eq(chaletsTable.id, id.data), eq(chaletsTable.isActive, true)));
  if (!chalet?.submissionId) { res.status(404).json({ error: "العقار غير متاح" }); return; }
  try { res.json(await quotePropertyPrice(chalet.submissionId, query.data.date, query.data.period, query.data.durationDays)); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); }
});
