import { insertRecords, updateRecords, writeRecords } from "@workspace/db/mutations";
import { isUniqueViolation } from "@workspace/db/database-errors";
import { Router } from "express";
import { lockResource } from "@workspace/db/transaction-lock";
import { db, photographersTable, photographyPackagesTable, photographyBookingsTable, photographyDeliveriesTable, siteSettingsTable, citiesCatalogTable, districtsCatalogTable, photographyContractsTable, photographyTransfersTable, photographyAlertsTable, photographyReceiptsTable, chaletCategoriesTable, serviceCategoriesTable, chaletSubmissionsTable } from "@workspace/db";
import { and, eq, inArray, desc, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { availabilitySchema, coverageSchema, photoPhone } from "../lib/photography-rules";
import { setPhotographyServiceEnabled } from "../lib/owner-services";
import { photographyReadiness, deliverPhotographyMessage } from "../lib/photography-delivery";
import { cleanContractHtml, currentPhotographyContract, photographyBalances } from "../lib/photography-finance";
import { inventoryOwnerNames } from "../lib/inventory-owner-names";
import { recentCancellationCounts, lockPhotographyAllocation } from "../lib/photography-allocation";
import { photographyFinancialAdmin } from "./photography-financial";
import { attachablePhotographyReceipt } from "../lib/photography-receipt-lock";
import { photographyPolicy, qualityEligible, type PhotographyPolicy } from "../lib/photography-allocation-policy";
import { getPhotographyPolicy, photographyPolicySchema } from "../lib/photography-policy-settings";
import { photographyCancellationHistory, retryPhotographyAssignment } from "../lib/photography-operations";

export const photoHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function publicPhotographer(row: typeof photographersTable.$inferSelect, cancellationCount30 = 0, policy: PhotographyPolicy = photographyPolicy) {
  const { passwordHash, inviteHash, inviteExpiresAt, rotationCredit, ratingSum, ...safe } = row;
  return {
    ...safe, averageRating: row.ratingCount ? ratingSum / row.ratingCount : null,
    allocationEligible: qualityEligible(row, policy) && row.approvedPackageIds.length > 0, cancellationCount30,
    priorityReduced: cancellationCount30 >= policy.cancellationThreshold,
    introBookingsRemaining: Math.max(0, policy.introBookings - row.confirmedAssignments),
  };
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
router.use(photographyFinancialAdmin);
router.get("/contract", async (_req, res) => res.json(await currentPhotographyContract() ?? { id: null, html: "", createdAt: null }));
router.post("/contract", async (req, res) => {
  const parsed = z.object({ html: z.string().min(1).max(100000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اكتب بنود العقد (بحد أقصى ١٠٠ ألف حرف)" });
  const html = cleanContractHtml(parsed.data.html);
  if (!html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()) return res.status(400).json({ error: "لا يمكن نشر عقد فارغ" });
  const version = await db.transaction(async tx => {
    await lockResource(tx, 731222, 1);
    const [contract] = await insertRecords(tx, photographyContractsTable, { html });
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
    receiptId: z.number().int().positive(),
    transferredAt: z.string().datetime().refine(value => +new Date(value) <= Date.now(), "لا يمكن تسجيل تحويل مستقبلي"),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "أرفق إيصال التحويل وراجع المبلغ والمرجع والتاريخ (لا يقبل تاريخاً مستقبلياً)" });
  try {
    const result = await db.transaction(async tx => {
      await lockPhotographyAllocation(tx);
      const [photographer] = await tx.select().from(photographersTable).where(eq(photographersTable.id, Number(req.params.id))).for("update");
      if (!photographer) return { error: "المصور غير موجود", status: 404 };
      if (!photographer.iban || !photographer.bankName) return { error: "أكمل بيانات حساب المصور البنكي أولاً", status: 400 };
      const actor = req.adminStaff ? `admin-staff:${req.adminStaff.id}` : req.user!.id;
      const receipt = await attachablePhotographyReceipt(tx, parsed.data.receiptId, actor);
      if (!receipt) return { error: "ارفع إيصالاً صالحاً خاصاً بهذا التحويل من حسابك؛ قد يكون الإيصال غير المستخدم قد انتهى", status: 400 };
      const [duplicate] = await tx.select().from(photographyTransfersTable).where(sql`lower(${photographyTransfersTable.reference}) = lower(${parsed.data.reference})`);
      if (duplicate) return { error: "مرجع التحويل مستخدم سابقاً", status: 409 };
      const balance = await photographyBalances(photographer.id, tx);
      if (parsed.data.amountHalalas > balance.netDueHalalas) return { error: "مبلغ التحويل يتجاوز صافي المستحقات", status: 400 };
      const [transfer] = await insertRecords(tx, photographyTransfersTable, {
        photographerId: photographer.id, ...parsed.data, reference: parsed.data.reference.toUpperCase(),
        recordedBy: actor, transferredAt: new Date(parsed.data.transferredAt),
      });
      return { transfer };
    });
    if ("error" in result) return res.status(result.status!).json({ error: result.error });
    return res.status(201).json(result.transfer);
  } catch (error) {
      if (isUniqueViolation(error)) {
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
  propertyTypes: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  specialties: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  name: z.string().trim().min(2).max(120),
  priceHalalas: z.number().int().min(100).max(10000000),
  platformPercent: z.number().min(0).max(100).multipleOf(0.01), active: z.boolean().default(true),
});
router.get("/", async (_req, res) => {
  const policy = await getPhotographyPolicy();
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  const [packages, photographers, bookings, deliveries, cities, ownerNames, alerts, cancellationHistory, cancellationCounts] = await Promise.all([
    db.select().from(photographyPackagesTable).orderBy(photographyPackagesTable.id),
    db.select().from(photographersTable).orderBy(desc(photographersTable.id)),
    db.select().from(photographyBookingsTable).orderBy(desc(photographyBookingsTable.id)).limit(500),
    db.select().from(photographyDeliveriesTable).orderBy(desc(photographyDeliveriesTable.id)).limit(200),
    db.select({ id: citiesCatalogTable.id, name: citiesCatalogTable.name }).from(citiesCatalogTable),
    inventoryOwnerNames(),
    db.select().from(photographyAlertsTable).where(isNull(photographyAlertsTable.resolvedAt)).orderBy(desc(photographyAlertsTable.createdAt)).limit(200),
    photographyCancellationHistory(), recentCancellationCounts(),
  ]);
  const cityNames = new Map(cities.map(city => [city.id, city.name]));
  res.json({ refundActor: _req.adminStaff ? `staff:${_req.adminStaff.id}` : `user:${_req.user!.id}`, enabled: setting?.value === "true", readiness: photographyReadiness(), packages: packages.map(p => ({ ...p, platformPercent: Number(p.platformPercent) })), photographers: photographers.map(p => ({ ...publicPhotographer(p, cancellationCounts.get(p.id) ?? 0, policy), cityName: p.cityId ? cityNames.get(p.cityId) ?? null : null })), bookings: bookings.map(booking => ({ ...booking, ownerName: ownerNames.get(booking.ownerId) ?? null })), deliveries, alerts, cancellationHistory, policy });
});
router.patch("/policy", async (req, res) => {
  const parsed = photographyPolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "راجع حدود التوزيع والتقييم" });
  await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    await writeRecords(tx, siteSettingsTable, { key: "photography_policy", value: JSON.stringify(parsed.data) }, { conflict: { action: "update", target: siteSettingsTable.key, set: { value: JSON.stringify(parsed.data), updatedAt: new Date() } } });
  });
  return res.json({ policy: parsed.data });
});
router.get("/options", async (_req, res) => {
  const [categories, serviceCategories, usedTypes, packages] = await Promise.all([
    db.select().from(chaletCategoriesTable).where(eq(chaletCategoriesTable.isActive, true)),
    db.select().from(serviceCategoriesTable).where(eq(serviceCategoriesTable.isActive, true)),
    db.selectDistinct({ type: chaletSubmissionsTable.propertyType, category: chaletSubmissionsTable.category }).from(chaletSubmissionsTable),
    db.select().from(photographyPackagesTable),
  ]);
  const propertyNames = [...new Set([...categories.map(c => c.nameAr), ...usedTypes.flatMap(c => [c.type, c.category]).filter((x): x is string => !!x)])];
  return res.json({
    propertyTypes: [...propertyNames.map(name => ({ value: `property:${name}`, label: name })),
      ...serviceCategories.map(c => ({ value: `service:${c.key}`, label: `خدمة: ${c.labelAr}` }))],
    packages: packages.map(p => ({ ...p, platformPercent: Number(p.platformPercent) })),
  });
});
router.post("/alerts/:id/read", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صحيح" });
  const [row] = await updateRecords(db, photographyAlertsTable, { readAt: new Date() }, eq(photographyAlertsTable.id, id));
  return row ? res.json({ success: true }) : res.status(404).json({ error: "التنبيه غير موجود" });
});
router.post("/bookings/:id/reassign", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صحيح" });
  try { return res.json(await retryPhotographyAssignment(id)); }
  catch (error) {
    if ((error as Error).message !== "booking_unavailable") throw error;
    return res.status(409).json({ error: "الحجز ليس ضمن الحجوزات المدفوعة المنتظرة لتأمين بديل" });
  }
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
  const [row] = await insertRecords(db, photographyPackagesTable, { ...parsed.data, platformPercent: String(parsed.data.platformPercent) });
  return res.json({ ...row, platformPercent: Number(row.platformPercent) });
});
router.patch("/packages/:id", async (req, res) => {
  const parsed = packageSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الباقة غير صحيحة" });
  const { platformPercent, ...data } = parsed.data;
  const [row] = await updateRecords(db, photographyPackagesTable, { ...data, ...(platformPercent !== undefined ? { platformPercent: String(platformPercent) } : {}) }, eq(photographyPackagesTable.id, Number(req.params.id)));
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
    ? await updateRecords(db, photographersTable, values, eq(photographersTable.id, existing.id))
    : await insertRecords(db, photographersTable, values);
  const invitePath = `/photographer/invite/${token}`;
  const link = `${origin}${invitePath}`;
  const message = `مرحباً ${photographer.name}، يسعدنا دعوتك للانضمام إلى مصوري تكية لتصوير وتوثيق العقارات. أكمل ملفك وحدد نطاقك ومواعيدك عبر الرابط: ${link}`;
  const [delivery] = await insertRecords(db, photographyDeliveriesTable, {
    dedupeKey: `invite:${photographer.id}:${photoHash(token)}`, photographerId: photographer.id,
    recipient: phone, kind: "invite", parameters: [photographer.name, link],
    status: parsed.data.sendAutomatically ? "pending" : "manual",
  });
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
  const [row] = await updateRecords(db, photographersTable, parsed.data, eq(photographersTable.id, current.id));
  return res.json(publicPhotographer(row));
});
router.patch("/photographers/:id/profile", async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    sessionMinutes: z.number().int().min(30).max(240).optional(),
    availability: availabilitySchema.optional(),
    approvedPackageIds: z.array(z.number().int().positive()).max(200).optional(),
    approvedSpecialties: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  }).strict().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) return res.status(400).json({ error: "راجع بيانات المصور ومدد الجلسة وأوقات التفرغ دون تداخل" });
  if (parsed.data.approvedPackageIds) {
    const ids = [...new Set(parsed.data.approvedPackageIds)];
    const existing = ids.length ? await db.select({ id: photographyPackagesTable.id }).from(photographyPackagesTable).where(inArray(photographyPackagesTable.id, ids)) : [];
    if (existing.length !== ids.length) return res.status(400).json({ error: "إحدى الباقات المعتمدة غير موجودة" });
    parsed.data.approvedPackageIds = ids;
  }
  const [row] = await updateRecords(db, photographersTable, parsed.data, eq(photographersTable.id, Number(req.params.id)));
  return row ? res.json(publicPhotographer(row)) : res.status(404).json({ error: "المصور غير موجود" });
});
export default router;
