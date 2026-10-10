import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db, photographersTable, photographyPackagesTable, photographerSessionsTable, photographyBookingsTable,
  siteSettingsTable, chaletSubmissionsTable, chaletsTable, citiesCatalogTable, districtsCatalogTable, regionsCatalogTable,
} from "@workspace/db";
import { and, eq, inArray, sql, desc, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAuth, getOwnerIds, resolveOwnerApplication } from "./owner";
import { photoHash, publicPhotographer, validPhotographyCoverage, photoOrigin } from "./photography-admin";
import { photographerProfileSchema, photoPhone, photographySlots, photographyQuote } from "../lib/photography-rules";
import { photographyReadiness } from "../lib/photography-delivery";
import { photographyCardEnabled } from "../lib/owner-services";
import { photographyInvoice, reconcilePhotographyBooking, reconcileExpiredPhotographyInvoices } from "../lib/photography-payment";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.param("id", (_req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ error: "معرّف غير صحيح" });
  return next();
});
const COOKIE = "photographer_session";
async function enabled() {
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  return row?.value === "true" && await photographyCardEnabled();
}
const authAttempts = new Map<string, { count: number; until: number }>();
function loginLimit(req: Request, res: Response, next: NextFunction) {
  const key = photoHash(`${req.ip}:${req.body?.whatsapp ?? req.params.token ?? ""}`);
  const now = Date.now();
  if (authAttempts.size > 2000) for (const [k, v] of authAttempts) if (v.until < now) authAttempts.delete(k);
  const record = authAttempts.get(key);
  if (record && record.until > now && record.count >= 10) return res.status(429).json({ error: "محاولات كثيرة؛ أعد المحاولة لاحقاً" });
  authAttempts.set(key, record && record.until > now ? { ...record, count: record.count + 1 } : { count: 1, until: now + 600000 });
  return next();
}
function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
  try { if (origin && new URL(origin).host === host) return next(); } catch { /* invalid */ }
  return res.status(403).json({ error: "طلب غير مسموح من خارج المنصة" });
}
async function photographer(req: Request) {
  const token = req.cookies?.[COOKIE];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [session] = await db.select().from(photographerSessionsTable).where(and(
    eq(photographerSessionsTable.hash, photoHash(token)), gt(photographerSessionsTable.expiresAt, new Date()),
  ));
  if (!session) return null;
  const [row] = await db.select().from(photographersTable).where(eq(photographersTable.id, session.photographerId));
  return row ?? null;
}
async function setSession(req: Request, res: Response, id: number) {
  const token = randomBytes(32).toString("hex");
  await db.insert(photographerSessionsTable).values({
    hash: photoHash(token), photographerId: id, expiresAt: new Date(Date.now() + 14 * 86400000),
  });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: 14 * 86400000, path: "/" });
}
router.get("/status", async (_req, res) => res.json({ enabled: await enabled(), readiness: photographyReadiness() }));
router.get("/invites/:token", async (req, res) => {
  const [row] = await db.select().from(photographersTable).where(and(
    eq(photographersTable.inviteHash, photoHash(req.params.token)), eq(photographersTable.status, "invited"),
    gt(photographersTable.inviteExpiresAt, new Date()),
  ));
  return row ? res.json({ name: row.name, whatsapp: row.whatsapp, expiresAt: row.inviteExpiresAt })
    : res.status(410).json({ error: "رابط الدعوة غير صالح أو منتهي أو مستخدم" });
});
router.post("/invites/:token", sameOrigin, loginLimit, async (req, res) => {
  const profile = photographerProfileSchema.safeParse(req.body);
  const password = z.string().min(10).max(128).safeParse(req.body?.password);
  if (!profile.success || !password.success || !await validPhotographyCoverage(profile.data)) return res.status(400).json({ error: "راجع النطاق والتفرغ وكلمة المرور (١٠ أحرف على الأقل)" });
  const passwordHash = await bcrypt.hash(password.data, 12);
  const [row] = await db.update(photographersTable).set({
    ...profile.data, passwordHash, status: "pending", inviteHash: null, inviteExpiresAt: null,
  }).where(and(eq(photographersTable.inviteHash, photoHash(String(req.params.token))), eq(photographersTable.status, "invited"),
    gt(photographersTable.inviteExpiresAt, new Date()))).returning();
  if (!row) return res.status(410).json({ error: "الدعوة مستخدمة أو منتهية" });
  await setSession(req, res, row.id);
  return res.json({ photographer: publicPhotographer(row) });
});
router.post("/portal/login", sameOrigin, loginLimit, async (req, res) => {
  const parsed = z.object({ whatsapp: z.string().max(25), password: z.string().max(128) }).safeParse(req.body);
  const phone = parsed.success ? photoPhone(parsed.data.whatsapp) : null;
  if (!parsed.success || !phone) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  const [row] = await db.select().from(photographersTable).where(eq(photographersTable.whatsapp, phone));
  if (!row?.passwordHash || !await bcrypt.compare(parsed.data.password, row.passwordHash)) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  await setSession(req, res, row.id);
  return res.json({ photographer: publicPhotographer(row) });
});
router.post("/portal/logout", sameOrigin, async (req, res) => {
  if (req.cookies?.[COOKIE]) await db.delete(photographerSessionsTable).where(eq(photographerSessionsTable.hash, photoHash(req.cookies[COOKIE])));
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});
router.get("/portal", async (req, res) => {
  const row = await photographer(req);
  if (!row) return res.status(401).json({ error: "سجل الدخول إلى بوابة المصور" });
  const bookings = await db.select().from(photographyBookingsTable)
    .where(and(eq(photographyBookingsTable.photographerId, row.id), inArray(photographyBookingsTable.status, ["confirmed", "completed"])))
    .orderBy(desc(photographyBookingsTable.startAt));
  const earnings = bookings.reduce((sum, b) => ({
    totalHalalas: sum.totalHalalas + b.priceHalalas,
    commissionHalalas: sum.commissionHalalas + b.commissionHalalas,
    netHalalas: sum.netHalalas + b.photographerEarningsHalalas,
  }), { totalHalalas: 0, commissionHalalas: 0, netHalalas: 0 });
  return res.json({ photographer: publicPhotographer(row), bookings, earnings });
});
router.patch("/portal", sameOrigin, async (req, res) => {
  const row = await photographer(req);
  if (!row) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const parsed = photographerProfileSchema.safeParse(req.body);
  if (!parsed.success || !await validPhotographyCoverage(parsed.data)) return res.status(400).json({ error: "بيانات النطاق والتفرغ غير صحيحة" });
  const coverageChanged = parsed.data.regionId !== row.regionId || parsed.data.cityId !== row.cityId
    || parsed.data.allDistricts !== row.allDistricts || JSON.stringify([...parsed.data.districtIds].sort()) !== JSON.stringify([...row.districtIds].sort());
  const [updated] = await db.update(photographersTable).set({
    ...parsed.data,
    ...(coverageChanged ? { status: "pending", adminNote: null } : {}),
  }).where(eq(photographersTable.id, row.id)).returning();
  return res.json({ photographer: publicPhotographer(updated) });
});
router.post("/payment-callback/:id", loginLimit, async (req, res) => {
  const invoiceId = z.string().uuid().safeParse(req.body?.id);
  if (!invoiceId.success) return res.status(400).json({ error: "Invalid invoice notification" });
  const [booking] = await db.select().from(photographyBookingsTable).where(and(
    eq(photographyBookingsTable.id, Number(req.params.id)), eq(photographyBookingsTable.invoiceId, invoiceId.data),
  ));
  if (!booking) return res.status(404).json({ error: "Invoice not found" });
  try {
    const result = await reconcilePhotographyBooking(booking.id);
    return res.json({ status: result.booking.status });
  } catch { return res.status(503).json({ error: "Invoice verification temporarily unavailable" }); }
});

router.use(requireAuth);
router.use((req, res, next) => req.method === "GET" ? next() : sameOrigin(req, res, next));
async function ownedProperty(req: Request, propertyId: number) {
  const ids = await getOwnerIds(req);
  const [row] = await db.select().from(chaletSubmissionsTable).where(and(
    eq(chaletSubmissionsTable.id, propertyId), inArray(chaletSubmissionsTable.ownerId, ids),
    eq(chaletSubmissionsTable.status, "approved"),
  ));
  if (!row) return null;
  const [mirror] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
    .where(and(eq(chaletsTable.submissionId, row.id), eq(chaletsTable.isActive, true)));
  return mirror ? row : null;
}
async function coveredProperty(row: NonNullable<Awaited<ReturnType<typeof ownedProperty>>>, p: typeof photographersTable.$inferSelect) {
  if (p.status !== "approved" || !p.cityId || !p.regionId) return false;
  const [city] = await db.select().from(citiesCatalogTable).where(eq(citiesCatalogTable.id, p.cityId));
  const [region] = await db.select().from(regionsCatalogTable).where(eq(regionsCatalogTable.id, p.regionId));
  if (!city?.isActive || !region?.isActive || city.name !== row.location || region.name !== row.region) return false;
  if (p.allDistricts) return true;
  const districts = p.districtIds.length ? await db.select().from(districtsCatalogTable)
    .where(and(eq(districtsCatalogTable.cityId, city.id), inArray(districtsCatalogTable.id, p.districtIds))) : [];
  return districts.some(d => d.isActive && d.name === row.district);
}
router.get("/catalog", async (req, res) => {
  if (!await enabled()) return res.json({ enabled: false, readiness: photographyReadiness(), properties: [], packages: [], photographers: [] });
  const ids = await getOwnerIds(req);
  const properties = await db.select({
    id: chaletSubmissionsTable.id, nameAr: chaletSubmissionsTable.nameAr, location: chaletSubmissionsTable.location,
    district: chaletSubmissionsTable.district, whatsappNumber: chaletSubmissionsTable.whatsappNumber,
  }).from(chaletSubmissionsTable).innerJoin(chaletsTable, eq(chaletsTable.submissionId, chaletSubmissionsTable.id))
    .where(and(inArray(chaletSubmissionsTable.ownerId, ids), eq(chaletSubmissionsTable.status, "approved"), eq(chaletsTable.isActive, true)));
  const packages = await db.select().from(photographyPackagesTable).where(eq(photographyPackagesTable.active, true));
  const photographers = await db.select().from(photographersTable).where(eq(photographersTable.status, "approved"));
  return res.json({ enabled: true, readiness: photographyReadiness(), properties, packages: packages.map(p => ({ ...p, platformPercent: Number(p.platformPercent) })),
    photographers: photographers.map(p => {
      const { whatsapp, adminNote, ...safe } = publicPhotographer(p);
      return safe;
    }) });
});
async function blockedBookings(id: number, tx: Pick<typeof db, "select"> = db) {
  return tx.select({ startAt: photographyBookingsTable.startAt, endAt: photographyBookingsTable.endAt })
    .from(photographyBookingsTable).where(and(eq(photographyBookingsTable.photographerId, id), sql`(
      ${photographyBookingsTable.status} IN ('confirmed','completed','payment_review')
      OR (${photographyBookingsTable.status} = 'awaiting_payment'
       AND (${photographyBookingsTable.invoiceId} IS NOT NULL OR ${photographyBookingsTable.expiresAt} > now())))`));
}
router.get("/slots", async (req, res) => {
  if (!await enabled()) return res.status(423).json({ error: "خدمة التصوير والتوثيق مغلقة حالياً" });
  const data = z.object({
    propertyId: z.coerce.number().int().positive(), photographerId: z.coerce.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(req.query);
  if (!data.success) return res.status(400).json({ error: "بيانات الموعد غير صحيحة" });
  const row = await ownedProperty(req, data.data.propertyId);
  const [p] = await db.select().from(photographersTable).where(eq(photographersTable.id, data.data.photographerId));
  if (!row || !p || !await coveredProperty(row, p)) return res.json({ slots: [], timezone: "Asia/Riyadh" });
  await reconcileExpiredPhotographyInvoices(p.id);
  return res.json({ slots: photographySlots(data.data.date, p.sessionMinutes, p.availability, await blockedBookings(p.id)), timezone: "Asia/Riyadh" });
});
router.get("/bookings", async (req, res) => {
  const ids = await getOwnerIds(req);
  const bookings = await db.select().from(photographyBookingsTable).where(inArray(photographyBookingsTable.ownerId, ids)).orderBy(desc(photographyBookingsTable.id));
  res.json({ bookings });
});
router.post("/bookings", async (req, res) => {
  if (!await enabled()) return res.status(423).json({ error: "خدمة التصوير والتوثيق مغلقة حالياً" });
  const parsed = z.object({
    propertyId: z.number().int().positive(), photographerId: z.number().int().positive(),
    packageId: z.number().int().positive(), startAt: z.string().datetime({ offset: true }),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الحجز غير صحيحة" });
  const property = await ownedProperty(req, parsed.data.propertyId);
  if (!property) return res.status(403).json({ error: "العقار ليس مقبولاً ونشطاً ضمن حسابك" });
  const account = await resolveOwnerApplication(req);
  const ownerContact = account ? await db.execute<{ phone: string | null }>(sql`SELECT phone FROM owner_applications WHERE id = ${account.id}`) : null;
  const phone = photoPhone(ownerContact?.rows[0]?.phone || property.whatsappNumber);
  if (!phone) return res.status(400).json({ error: "حدّث رقم واتساب العقار قبل الحجز" });
  try {
    const booking = await db.transaction(async tx => {
      const [setting] = await tx.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")).for("share");
       if (setting?.value !== "true" || !await photographyCardEnabled(tx)) throw new Error("closed");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(731220, ${parsed.data.photographerId})`);
      const [p] = await tx.select().from(photographersTable).where(eq(photographersTable.id, parsed.data.photographerId)).for("share");
      const [pack] = await tx.select().from(photographyPackagesTable).where(and(eq(photographyPackagesTable.id, parsed.data.packageId), eq(photographyPackagesTable.active, true))).for("share");
      if (!p || !pack || !await coveredProperty(property, p)) throw new Error("coverage");
      const startAt = new Date(parsed.data.startAt);
      const date = new Date(+startAt + 3 * 3600000).toISOString().slice(0, 10);
      const slots = photographySlots(date, p.sessionMinutes, p.availability, await blockedBookings(p.id, tx));
      const slot = slots.find(s => s.startAt === startAt.toISOString());
      if (!slot) throw new Error("slot");
      const [row] = await tx.insert(photographyBookingsTable).values({
        ownerId: property.ownerId!, propertyId: property.id, photographerId: p.id, packageId: pack.id,
        propertyName: property.nameAr, photographerName: p.name, packageName: pack.name,
        ownerPhone: phone, photographerPhone: p.whatsapp, startAt, endAt: new Date(slot.endAt),
        expiresAt: new Date(Date.now() + 15 * 60000), ...photographyQuote(pack.priceHalalas, Number(pack.platformPercent)),
      }).returning();
      return row;
    });
    return res.json({ booking });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message === "closed" ? 423 : 409).json({ error: message === "closed"
      ? "خدمة التصوير والتوثيق مغلقة حالياً" : "الموعد غير متاح أو المصور خارج نطاق العقار؛ أعد اختيار الموعد" });
  }
});
async function ownedBooking(req: Request, id: number) {
  const ids = await getOwnerIds(req);
  const [row] = await db.select().from(photographyBookingsTable).where(and(eq(photographyBookingsTable.id, id), inArray(photographyBookingsTable.ownerId, ids)));
  return row;
}
router.post("/bookings/:id/checkout", async (req, res) => {
  if (!await enabled()) return res.status(423).json({ error: "الخدمة مغلقة حالياً" });
  const booking = await ownedBooking(req, Number(req.params.id));
  if (!booking) return res.status(404).json({ error: "الحجز غير موجود" });
  let origin: string;
  try { origin = photoOrigin(req.body?.origin, req); } catch { return res.status(400).json({ error: "رابط المنصة غير صحيح" }); }
  if (!photographyReadiness().payment) return res.status(503).json({ error: "الدفع غير مهيأ حالياً" });
  try {
    const paymentUrl = await db.transaction(async tx => {
      const [setting] = await tx.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")).for("share");
       if (setting?.value !== "true" || !await photographyCardEnabled(tx)) throw new Error("closed");
      const [current] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, booking.id)).for("update");
      if (current.status !== "awaiting_payment" || +current.expiresAt <= Date.now()) throw new Error("expired");
      if (current.paymentUrl) return current.paymentUrl;
      const invoice = await photographyInvoice("", {
        amount: current.priceHalalas, currency: "SAR",
        description: `تصوير وتوثيق ${current.propertyName} — ${current.packageName}`,
        expired_at: current.expiresAt.toISOString(),
        success_url: `${origin}/dashboard?mode=owner-services&ownerService=photography&photographyBooking=${current.id}`,
        back_url: `${origin}/dashboard?mode=owner-services&ownerService=photography&photographyBooking=${current.id}`,
        callback_url: `${origin}/api/photography/payment-callback/${current.id}`,
      });
      const url = new URL(invoice.url);
      if (invoice.amount !== current.priceHalalas || invoice.currency !== "SAR" || !invoice.id
        || url.protocol !== "https:" || !/(^|\.)moyasar\.com$/.test(url.hostname)) throw new Error("provider_response");
      await tx.update(photographyBookingsTable).set({ invoiceId: invoice.id, paymentUrl: invoice.url }).where(eq(photographyBookingsTable.id, current.id));
      return invoice.url;
    });
    return res.json({ paymentUrl });
  } catch (error) {
    const reason = (error as Error).message;
    return res.status(reason === "closed" ? 423 : reason === "expired" ? 409 : 502).json({
      error: reason === "closed" ? "الخدمة مغلقة حالياً" : reason === "expired" ? "انتهى حجز الموعد المؤقت؛ اختر موعداً من جديد" : "تعذّر إنشاء فاتورة الدفع؛ لم يتم تأكيد الحجز",
    });
  }
});
router.post("/bookings/:id/confirm", async (req, res) => {
  const row = await ownedBooking(req, Number(req.params.id));
  if (!row) return res.status(404).json({ error: "الحجز غير موجود" });
  try {
    const result = await reconcilePhotographyBooking(row.id);
    if (!["confirmed", "completed"].includes(result.booking.status)) return res.status(409).json({
      error: result.booking.status === "expired" ? "انتهت الفاتورة دون سداد؛ اختر موعداً جديداً" : "الفاتورة لم تسدد بعد؛ لا يوجد حجز مؤكد",
    });
    return res.json(result);
  }
  catch { return res.status(409).json({ error: "لم يتم التحقق من السداد بعد؛ أعد التحقق دون دفع مرة أخرى" }); }
});
export default router;
