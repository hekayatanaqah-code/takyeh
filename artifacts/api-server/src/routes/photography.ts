import { Router, type Request, type Response, type NextFunction } from "express";
import {
  db, photographersTable, photographyPackagesTable, photographerSessionsTable, photographyBookingsTable,
  siteSettingsTable,
} from "@workspace/db";
import { and, eq, inArray, sql, desc, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, getOwnerIds, resolveOwnerApplication } from "./owner";
import { photoHash, publicPhotographer, validPhotographyCoverage, photoOrigin } from "./photography-admin";
import { photographerProfileSchema, photoPhone, photographySlots, photographyQuote } from "../lib/photography-rules";
import { photographyReadiness } from "../lib/photography-delivery";
import { photographyCardEnabled } from "../lib/owner-services";
import { photographyActivities, ownedPhotographyTarget, coveredPhotographyTarget, photographyReservationSchema, exactlyOnePhotographyTarget } from "../lib/photography-targets";
import { photographyInvoice, reconcilePhotographyBooking, reconcileExpiredPhotographyInvoices } from "../lib/photography-payment";
import { requestProfileImage, completeProfileImage, ownsProfileImage, profileImageUploadSchema, profileImageCompleteSchema } from "../lib/photography-images";
import { getPhotographer as photographer, setPhotographerSession as setSession } from "../lib/photographer-auth";
import { currentPhotographyContract, ibanSchema, bankSchema, photographyBalances } from "../lib/photography-finance";
import photographySupportRouter from "./photography-support";

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
router.get("/contract", async (_req, res) => {
  const contract = await currentPhotographyContract();
  return res.json(contract ?? { id: null, html: "", createdAt: null });
});
router.use("/support-requests", (req, res, next) => req.method === "GET" ? next() : sameOrigin(req, res, next), photographySupportRouter);
router.get("/status", async (_req, res) => res.json({ enabled: await enabled(), readiness: photographyReadiness() }));
async function imageIdentity(req: Request, inviteToken?: string) {
  if (!inviteToken) return photographer(req);
  const [row] = await db.select().from(photographersTable).where(and(
    eq(photographersTable.inviteHash, photoHash(inviteToken)), eq(photographersTable.status, "invited"),
    gt(photographersTable.inviteExpiresAt, new Date()),
  ));
  return row ?? null;
}
router.post("/profile-image/upload-url", sameOrigin, loginLimit, async (req, res) => {
  const parsed = profileImageUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اختر صورة JPG أو PNG أو WebP لا تتجاوز ٥ ميجابايت" });
  const row = await imageIdentity(req, parsed.data.inviteToken);
  if (!row) return res.status(401).json({ error: "سجل الدخول أو استخدم دعوة مصور سارية" });
  try { return res.json(await requestProfileImage(row.id)); }
  catch (err) {
    req.log?.error({ err }, "Photographer image upload URL failed");
    return res.status(503).json({ error: "تعذر بدء رفع الصورة؛ أعد المحاولة لاحقاً" });
  }
});
router.post("/profile-image/complete", sameOrigin, loginLimit, async (req, res) => {
  const parsed = profileImageCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات رفع الصورة غير صحيحة" });
  const row = await imageIdentity(req, parsed.data.inviteToken);
  if (!row) return res.status(401).json({ error: "سجل الدخول أو استخدم دعوة مصور سارية" });
  try { return res.json(await completeProfileImage(row.id, parsed.data.objectPath, parsed.data.uploadProof)); }
  catch (err) {
    req.log?.warn({ err }, "Photographer image completion failed");
    return res.status(400).json({ error: "تعذر اعتماد الصورة؛ اختر صورة JPG أو PNG أو WebP سليمة، بحد أقصى ٥ ميجابايت، وأعد رفعها" });
  }
});
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
  const identity = await imageIdentity(req, String(req.params.token));
  if (!identity) return res.status(410).json({ error: "الدعوة مستخدمة أو منتهية" });
  if (!await ownsProfileImage(identity.id, profile.data.profileImagePath)) return res.status(400).json({ error: "أعد رفع الصورة الشخصية من هذا الحساب" });
  const agreement = z.object({ iban: ibanSchema, bankName: bankSchema, contractAccepted: z.literal(true), contractVersion: z.number().int().positive() }).safeParse(req.body);
  if (!agreement.success) return res.status(400).json({ error: "أدخل بيانات البنك والآيبان السعودي الصحيح ووافق على العقد" });
  const passwordHash = await bcrypt.hash(password.data, 12);
  const row = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731222, 1)`);
    const current = await currentPhotographyContract(tx);
    if (!current || current.id !== agreement.data.contractVersion) return "contract_changed" as const;
    const [saved] = await tx.update(photographersTable).set({
      ...profile.data, iban: agreement.data.iban, bankName: agreement.data.bankName,
      contractVersion: current.id, contractAcceptedAt: new Date(),
      passwordHash, status: "pending", inviteHash: null, inviteExpiresAt: null,
    }).where(and(eq(photographersTable.inviteHash, photoHash(String(req.params.token))), eq(photographersTable.status, "invited"),
      gt(photographersTable.inviteExpiresAt, new Date()))).returning();
    return saved;
  });
  if (row === "contract_changed") return res.status(409).json({ error: "تم تحديث العقد أو لم يُنشر بعد. اقرأ النسخة الحالية ووافق عليها مجدداً" });
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
  const balances = await photographyBalances(row.id);
  return res.json({ photographer: publicPhotographer(row), bookings, earnings: { ...earnings, netDueHalalas: balances.netDueHalalas, transferredHalalas: balances.transferredHalalas } });
});
router.patch("/portal", sameOrigin, async (req, res) => {
  const row = await photographer(req);
  if (!row) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const parsed = photographerProfileSchema.safeParse(req.body);
  if (!parsed.success || !await validPhotographyCoverage(parsed.data)) return res.status(400).json({ error: "بيانات النطاق والتفرغ غير صحيحة" });
  if ((parsed.data.iban !== undefined || parsed.data.bankName !== undefined) &&
    (!(parsed.data.iban ?? row.iban) || !(parsed.data.bankName ?? row.bankName))) {
    return res.status(400).json({ error: "أكمل رقم الآيبان واسم البنك معاً" });
  }
  if (parsed.data.profileImagePath !== row.profileImagePath && !await ownsProfileImage(row.id, parsed.data.profileImagePath)) return res.status(400).json({ error: "أعد رفع الصورة الشخصية من هذا الحساب" });
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
router.get("/catalog", async (req, res) => {
  if (!await enabled()) return res.json({ enabled: false, readiness: photographyReadiness(), properties: [], services: [], packages: [], photographers: [] });
  const ids = await getOwnerIds(req);
  const { properties, services } = await photographyActivities(ids);
  const packages = await db.select().from(photographyPackagesTable).where(eq(photographyPackagesTable.active, true));
  const photographers = await db.select().from(photographersTable).where(eq(photographersTable.status, "approved"));
  return res.json({ enabled: true, readiness: photographyReadiness(), properties, services, packages: packages.map(p => ({ ...p, platformPercent: Number(p.platformPercent) })),
    photographers: photographers.map(p => {
      const { whatsapp, adminNote, iban, bankName, contractVersion, contractAcceptedAt, ...safe } = publicPhotographer(p);
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
    propertyId: z.coerce.number().int().positive().optional(),
    serviceSubmissionId: z.coerce.number().int().positive().optional(),
    photographerId: z.coerce.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).refine(exactlyOnePhotographyTarget).safeParse(req.query);
  if (!data.success) return res.status(400).json({ error: "بيانات الموعد غير صحيحة" });
  const row = await ownedPhotographyTarget(await getOwnerIds(req), data.data);
  const [p] = await db.select().from(photographersTable).where(eq(photographersTable.id, data.data.photographerId));
  if (!row || !p || !await coveredPhotographyTarget(row, p)) return res.json({ slots: [], timezone: "Asia/Riyadh" });
  await reconcileExpiredPhotographyInvoices(p.id);
  return res.json({ slots: photographySlots(data.data.date, p.sessionMinutes, p.availability, await blockedBookings(p.id), new Date(), p.blockedDates), timezone: "Asia/Riyadh" });
});
router.get("/bookings", async (req, res) => {
  const ids = await getOwnerIds(req);
  const bookings = await db.select().from(photographyBookingsTable).where(inArray(photographyBookingsTable.ownerId, ids)).orderBy(desc(photographyBookingsTable.id));
  res.json({ bookings });
});
router.post("/bookings", async (req, res) => {
  if (!await enabled()) return res.status(423).json({ error: "خدمة التصوير والتوثيق مغلقة حالياً" });
  const parsed = photographyReservationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات الحجز غير صحيحة" });
  const ids = await getOwnerIds(req);
  const property = await ownedPhotographyTarget(ids, parsed.data);
  if (!property) return res.status(403).json({ error: "العقار أو الخدمة ليست معتمدة ونشطة ضمن حسابك" });
  const account = await resolveOwnerApplication(req);
  const ownerContact = account ? await db.execute<{ phone: string | null }>(sql`SELECT phone FROM owner_applications WHERE id = ${account.id}`) : null;
  const phone = photoPhone(ownerContact?.rows[0]?.phone || property.whatsappNumber);
  if (!phone) return res.status(400).json({ error: "حدّث رقم واتساب حسابك أو نشاطك قبل الحجز" });
  try {
    const booking = await db.transaction(async tx => {
      const [setting] = await tx.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")).for("share");
       if (setting?.value !== "true" || !await photographyCardEnabled(tx)) throw new Error("closed");
      const target = await ownedPhotographyTarget(ids, parsed.data, tx, true);
      if (!target) throw new Error("coverage");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(731220, ${parsed.data.photographerId})`);
      const [p] = await tx.select().from(photographersTable).where(eq(photographersTable.id, parsed.data.photographerId)).for("share");
      const [pack] = await tx.select().from(photographyPackagesTable).where(and(eq(photographyPackagesTable.id, parsed.data.packageId), eq(photographyPackagesTable.active, true))).for("share");
      if (!p || !pack || !await coveredPhotographyTarget(target, p)) throw new Error("coverage");
      const startAt = new Date(parsed.data.startAt);
      const date = new Date(+startAt + 3 * 3600000).toISOString().slice(0, 10);
      const slots = photographySlots(date, p.sessionMinutes, p.availability, await blockedBookings(p.id, tx), new Date(), p.blockedDates);
      const slot = slots.find(s => s.startAt === startAt.toISOString());
      if (!slot) throw new Error("slot");
      const [row] = await tx.insert(photographyBookingsTable).values({
        ownerId: target.ownerId, propertyId: target.kind === "property" ? target.id : null,
        serviceSubmissionId: target.kind === "service" ? target.id : null, photographerId: p.id, packageId: pack.id,
        propertyName: target.nameAr, photographerName: p.name, packageName: pack.name,
        ownerPhone: phone, photographerPhone: p.whatsapp, startAt, endAt: new Date(slot.endAt),
        expiresAt: new Date(Date.now() + 15 * 60000), ...photographyQuote(pack.priceHalalas, Number(pack.platformPercent)),
      }).returning();
      return row;
    });
    return res.json({ booking });
  } catch (error) {
    const message = (error as Error).message;
    return res.status(message === "closed" ? 423 : 409).json({ error: message === "closed"
      ? "خدمة التصوير والتوثيق مغلقة حالياً" : "الموعد غير متاح أو المصور خارج نطاق نشاطك؛ أعد اختيار الموعد" });
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
