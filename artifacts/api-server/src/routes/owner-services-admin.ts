import { insertRecords, updateRecords } from "@workspace/db/mutations";
import { Router } from "express";
import { db, ownerServicesTable } from "@workspace/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { lockOwnerServices, ownerServiceInputSchema, serviceAvailabilityError, writePhotographyGate, validServiceCities } from "../lib/owner-services";
import { photographyReadiness } from "../lib/photography-delivery";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const list = () => db.select().from(ownerServicesTable).where(isNull(ownerServicesTable.deletedAt)).orderBy(asc(ownerServicesTable.sortOrder), asc(ownerServicesTable.id));
router.get("/", async (_req, res) => res.json({ services: await list(), readiness: photographyReadiness() }));
router.param("id", (_req, res, next, id) => /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? next() : res.status(400).json({ error: "معرف الخدمة غير صالح" }));
router.post("/", async (req, res) => {
  const parsed = ownerServiceInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "راجع بيانات البطاقة ورابط الطلب" });
  if (parsed.data.coverageCityIds && !await validServiceCities(parsed.data.coverageCityIds)) return res.status(400).json({ error: "اختر مدناً مفعّلة دون تكرار" });
  const data = { ...parsed.data, actionUrl: parsed.data.kind === "photography" ? null : parsed.data.actionUrl ?? null };
  const error = serviceAvailabilityError(data);
  if (error) return res.status(409).json({ error });
  try {
    const card = await db.transaction(async tx => {
      await lockOwnerServices(tx);
      const current = await tx.select().from(ownerServicesTable).orderBy(asc(ownerServicesTable.sortOrder));
      const sortOrder = Math.max(-1, ...current.filter(c => !c.deletedAt).map(c => c.sortOrder)) + 1;
      if (data.kind === "photography") {
        const existing = current.find(c => c.kind === "photography");
        if (existing && !existing.deletedAt) throw new Error("بطاقة التصوير موجودة بالفعل");
        await writePhotographyGate(tx, data.state === "available");
        if (existing) {
          const [restored] = await updateRecords(tx, ownerServicesTable, { ...data, sortOrder, deletedAt: null, updatedAt: new Date() }, eq(ownerServicesTable.id, existing.id));
          return restored;
        }
      }
      const [created] = await insertRecords(tx, ownerServicesTable, { ...data, sortOrder, key: data.kind === "photography" ? "photography" : `service-${randomUUID()}` });
      return created;
    });
    return res.status(201).json(card);
  } catch (error) { return res.status(409).json({ error: (error as Error).message }); }
});
router.put("/order", async (req, res) => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "ترتيب غير صالح" });
  const ok = await db.transaction(async tx => {
    await lockOwnerServices(tx);
    const current = await tx.select().from(ownerServicesTable).where(isNull(ownerServicesTable.deletedAt));
    const ids = parsed.data.ids;
    if (new Set(ids).size !== ids.length || ids.length !== current.length || current.some(c => !ids.includes(c.id))) return false;
    for (const [sortOrder, id] of ids.entries()) await tx.update(ownerServicesTable).set({ sortOrder, updatedAt: new Date() }).where(eq(ownerServicesTable.id, id));
    return true;
  });
  return ok ? res.json({ services: await list() }) : res.status(409).json({ error: "تغيرت البطاقات؛ حدث القائمة وأعد الترتيب" });
});
router.patch("/:id", async (req, res) => {
  const parsed = ownerServiceInputSchema.omit({ kind: true }).partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "بيانات البطاقة غير صحيحة" });
  if (parsed.data.coverageCityIds && !await validServiceCities(parsed.data.coverageCityIds)) return res.status(400).json({ error: "اختر مدناً مفعّلة دون تكرار" });
  try {
    const card = await db.transaction(async tx => {
      await lockOwnerServices(tx);
      const [current] = await tx.select().from(ownerServicesTable).where(and(eq(ownerServicesTable.id, Number(req.params.id)), isNull(ownerServicesTable.deletedAt)));
      if (!current) return null;
      const data = { ...current, ...parsed.data, ...(current.kind === "photography" ? { actionUrl: null } : {}) };
      const error = serviceAvailabilityError(data);
      if (error) throw new Error(error);
      if (current.kind === "photography") await writePhotographyGate(tx, data.state === "available");
      const [updated] = await updateRecords(tx, ownerServicesTable, { ...parsed.data, ...(current.kind === "photography" ? { actionUrl: null } : {}), updatedAt: new Date() }, eq(ownerServicesTable.id, current.id));
      return updated;
    });
    return card ? res.json(card) : res.status(404).json({ error: "الخدمة غير موجودة" });
  } catch (error) { return res.status(409).json({ error: (error as Error).message }); }
});
router.delete("/:id", async (req, res) => {
  const removed = await db.transaction(async tx => {
    await lockOwnerServices(tx);
    const [card] = await tx.select().from(ownerServicesTable).where(and(eq(ownerServicesTable.id, Number(req.params.id)), isNull(ownerServicesTable.deletedAt)));
    if (!card) return false;
    if (card.kind === "photography") await writePhotographyGate(tx, false);
    await tx.update(ownerServicesTable).set({ state: "hidden", deletedAt: new Date(), updatedAt: new Date() }).where(eq(ownerServicesTable.id, card.id));
    return true;
  });
  return removed ? res.json({ ok: true }) : res.status(404).json({ error: "الخدمة غير موجودة" });
});
export default router;
