import { Router } from "express";
import { db, photographersTable, photographyPackagesTable, photographyBookingsTable, photographyDeliveriesTable, siteSettingsTable, citiesCatalogTable, districtsCatalogTable, photographyContractsTable, photographyTransfersTable } from "@workspace/db";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { availabilitySchema, coverageSchema, photoPhone } from "../lib/photography-rules";
import { setPhotographyServiceEnabled } from "../lib/owner-services";
import { photographyReadiness, deliverPhotographyMessage } from "../lib/photography-delivery";
import { cleanContractHtml, currentPhotographyContract, photographyBalances } from "../lib/photography-finance";

export const photoHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function publicPhotographer(row: typeof photographersTable.$inferSelect) {
  const { passwordHash, inviteHash, inviteExpiresAt, ...safe } = row;
  return safe;
}
export async function validPhotographyCoverage(data: { regionId: number; cityId: number; districtIds: number[]; allDistricts: boolean }) {
  const [city] = await db.select().from(citiesCatalogTable)
    .where(and(eq(citiesCatalogTable.id, data.cityId), eq(citiesCatalogTable.regionId, data.regionId))).limit(1);
  if (!city || !city.isActive) return false;
  if (data.allDistricts) return true;
  if (!data.districtIds.length || new Set(data.districtIds).size !== data.districtIds.length) return false;
  const districts = await db.select().from(districtsCatalogTable)
    .where(and(eq(districtsCatalogTable.cityId, data.cityId), inArray(districtsCatalogTable.id, data.districtIds)));
  return districts.length === data.districtIds.length && districts.every(d => d.isActive);
}
export function photoOrigin(input: string, req: { get(name: string): string | undefined }) {
  const url = new URL(input);
  const origin = req.get("origin");
  // A browser must provide its real Origin; no caller-controlled redirect hosts.
  if (!origin || url.origin !== origin || !["https:", "http:"].includes(url.protocol)
    || url.username || url.password || url.search || url.hash) throw new Error("invalid_origin");
  return input.replace(/\/$/, "");
}
const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get("/contract", async (_req, res) => res.json(await currentPhotographyContract() ?? { id: null, html: "", createdAt: null }));
router.post("/contract", async (req, res) => {
  const parsed = z.object({ html: z.string().min(1).max(100000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اكتب بنود العقد (بحد أقصى ١٠٠ ألف حرف)" });
  const html = cleanContractHtml(parsed.data.html);
  if (!html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()) return res.status(400).json({ error: "لا يمكن نشر عقد فارغ" });
  const version = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731222, 1)`);
    const [contract] = await tx.insert(photographyContractsTable).values({ html }).returning();
    return contract;
  });
  return res.status(201).json(version);
});
router.get("/photographers/:id/transfers", async (req, res) => {
  const [photographer] = await db.select().from(photographersTable).where(eq(photographersTable.id, Number(req.params.id)));
  if (!photographer) return res.status(404).json({ error: "المصور غير موجود" });
  return res.json(await photographyBalances(photographer.id));
});
router.post("/photographers/:id/transfers", async (req, res) => {
  const parsed = z.object({
    amountHalalas: z.number().int().positive().max(2147483647),
    reference: z.string().trim().min(1).max(200),
    transferredAt: z.string().datetime().refine(value => +new Date(value) <= Date.now(), "لا يمكن تسجيل تحويل مستقبلي"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "راجع مبلغ التحويل ومرجعه وتاريخه (لا يقبل تاريخاً مستقبلياً)" });
  try {
    const result = await db.transaction(async tx => {
      const [photographer] = await tx.select().from(photographersTable).where(eq(photographersTable.id, Number(req.params.id))).for("update");
      if (!photographer) return { error: "المصور غير موجود", status: 404 };
      if (!photographer.iban || !photographer.bankName) return { error: "أكمل بيانات حساب المصور البنكي أولاً", status: 400 };
      const balance = await photographyBalances(photographer.id, tx);
      if (parsed.data.amountHalalas > balance.netDueHalalas) return { error: "مبلغ التحويل يتجاوز صافي المستحقات", status: 400 };
      const [transfer] = await tx.insert(photographyTransfersTable).values({
        photographerId: photographer.id, ...parsed.data, transferredAt: new Date(parsed.data.transferredAt),
      }).returning();
      return { transfer };
    });
    if ("error" in result) return res.status(result.status!).json({ error: result.error });
    return res.status(201).json(result.transfer);
  } catch (error) {
    if ((error as { cause?: { code?: string }; code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") {
      return res.status(409).json({ error: "مرجع التحويل مسجل سابقاً؛ لم يُحتسب المبلغ مرة أخرى" });
    }
    throw error;
  }
});
router.param("id", (_req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ error: "معرّف غير صحيح" });
  return next();
});
const packageSchema = z.object({
  name: z.string().trim().min(2).max(120),
  priceHalalas: z.number().int().min(100).max(10000000),
  platformPercent: z.number().min(0).max(100).multipleOf(0.01), active: z.boolean().default(true),
});
router.get("/", async (_req, res) => {
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  const [packages, photographers, bookings, deliveries] = await Promise.all([
    db.select().from(photographyPackagesTable).orderBy(photographyPackagesTable.id),
    db.select().from(photographersTable).orderBy(desc(photographersTable.id)),
    db.select().from(photographyBookingsTable).orderBy(desc(photographyBookingsTable.id)).limit(500),
    db.select().from(photographyDeliveriesTable).orderBy(desc(photographyDeliveriesTable.id)).limit(200),
  ]);
  res.json({ enabled: setting?.value === "true", readiness: photographyReadiness(), packages: packages.map(p => ({ ...p, platformPercent: Number(p.platformPercent) })), photographers: photographers.map(publicPhotographer), bookings, deliveries });
});
router.patch("/settings", async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "حالة الخدمة غير صحيحة" });
  const ready = photographyReadiness();
  if (parsed.data.enabled && (!ready.payment || !ready.whatsapp)) return res.status(409).json({
    error: "لا يمكن فتح الخدمة قبل اكتمال إعداد الدفع والإرسال الفعلي عبر واتساب",
  });
  try { await setPhotographyServiceEnabled(parsed.data.enabled); }
  catch (error) { return res.status(409).json({ error: (error as Error).message }); }
  return res.json({ enabled: parsed.data.enabled, readiness: photographyReadiness() });
});
router.post("/packages", async (req, res) => {
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "راجع اسم الباقة والسعر ونسبة المنصة" });
  const [row] = await db.insert(photographyPackagesTable).values({ ...parsed.data, platformPercent: String(parsed.data.platformPercent) }).returning();
  return res.json({ ...row, platformPercent: Number(row.platformPercent) });
});
router.patch("/packages/:id", async (req, res) => {
  const parsed = packageSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الباقة غير صحيحة" });
  const { platformPercent, ...data } = parsed.data;
  const [row] = await db.update(photographyPackagesTable).set({ ...data, ...(platformPercent !== undefined ? { platformPercent: String(platformPercent) } : {}) })
    .where(eq(photographyPackagesTable.id, Number(req.params.id))).returning();
  return row ? res.json({ ...row, platformPercent: Number(row.platformPercent) }) : res.status(404).json({ error: "الباقة غير موجودة" });
});
router.post("/invites", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120), whatsapp: z.string().max(25),
    origin: z.string().url(), sendAutomatically: z.boolean().default(false),
  }).safeParse(req.body);
  const phone = parsed.success ? photoPhone(parsed.data.whatsapp) : null;
  if (!parsed.success || !phone) return res.status(400).json({ error: "راجع اسم المصور ورقم الواتساب السعودي" });
  let origin: string;
  try { origin = photoOrigin(parsed.data.origin, req); } catch { return res.status(400).json({ error: "رابط المنصة غير صحيح" }); }
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 86400000);
  const [existing] = await db.select().from(photographersTable).where(eq(photographersTable.whatsapp, phone));
  if (existing && existing.status !== "invited") return res.status(409).json({ error: "للمصور حساب بالفعل؛ راجع طلبه أو نطاقه بدلاً من إنشاء حساب ثانٍ" });
  const values = { name: parsed.data.name, whatsapp: phone, inviteHash: photoHash(token), inviteExpiresAt: expiresAt };
  const [photographer] = existing
    ? await db.update(photographersTable).set(values).where(eq(photographersTable.id, existing.id)).returning()
    : await db.insert(photographersTable).values(values).returning();
  const invitePath = `/photographer/invite/${token}`;
  const link = `${origin}${invitePath}`;
  const message = `مرحباً ${photographer.name}، يسعدنا دعوتك للانضمام إلى مصوري تكية لتصوير وتوثيق العقارات. أكمل ملفك وحدد نطاقك ومواعيدك عبر الرابط: ${link}`;
  const [delivery] = await db.insert(photographyDeliveriesTable).values({
    dedupeKey: `invite:${photographer.id}:${photoHash(token)}`, photographerId: photographer.id,
    recipient: phone, kind: "invite", parameters: [photographer.name, link],
    status: parsed.data.sendAutomatically ? "pending" : "manual",
  }).returning();
  const deliveryResult = parsed.data.sendAutomatically ? await deliverPhotographyMessage(delivery.id) : { status: "manual" };
  return res.json({ invitePath, expiresAt, message, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`, delivery: deliveryResult });
});
router.patch("/photographers/:id", async (req, res) => {
  const parsed = z.object({
    status: z.enum(["approved", "rejected", "suspended"]), adminNote: z.string().trim().max(2000).optional(),
    regionId: z.number().int().positive().optional(), cityId: z.number().int().positive().optional(),
    districtIds: z.array(z.number().int().positive()).max(200).optional(), allDistricts: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات المراجعة غير صحيحة" });
  const [current] = await db.select().from(photographersTable).where(eq(photographersTable.id, Number(req.params.id)));
  if (!current || !current.passwordHash) return res.status(409).json({ error: "يجب أن يكمل المصور التسجيل أولاً" });
  const coverage = coverageSchema.safeParse({ ...current, ...parsed.data });
  if (parsed.data.status === "approved" && (!coverage.success || !await validPhotographyCoverage(coverage.data))) return res.status(400).json({ error: "حدد نطاقاً جغرافياً صحيحاً للمصور قبل القبول" });
  if (parsed.data.status !== "approved" && !parsed.data.adminNote) return res.status(400).json({ error: "سبب القرار مطلوب" });
  const [row] = await db.update(photographersTable).set(parsed.data).where(eq(photographersTable.id, current.id)).returning();
  return res.json(publicPhotographer(row));
});
router.patch("/photographers/:id/profile", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    sessionMinutes: z.number().int().min(30).max(240).optional(),
    availability: availabilitySchema.optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "راجع بيانات المصور ومدد الجلسة وأوقات التفرغ دون تداخل" });
  const [row] = await db.update(photographersTable).set(parsed.data).where(eq(photographersTable.id, Number(req.params.id))).returning();
  return row ? res.json(publicPhotographer(row)) : res.status(404).json({ error: "المصور غير موجود" });
});
export default router;
