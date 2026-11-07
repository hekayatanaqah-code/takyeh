import { Router, type Request } from "express";
import { lockResource } from "@workspace/db/transaction-lock";
import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable, ownerTempSessionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";
import { eq, and, ne, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendAdminNewSubmissionEmail } from "../lib/email";
import { ownerPlanAccess } from "../lib/subscription-access";
import { includeOwnerActivityKind } from "../lib/owner-activity-registration";
import { checkPropertyIdentity } from "../lib/property-identity";
import { normalizeCustomerPhone } from "../lib/customerPhone";
import { hasPropertySocialConflict, socialAccountIdentity } from "../lib/property-social-account";

const whatsappSchema = z.string().regex(/^[0-9٠-٩۰-۹]+$/, "رقم الواتساب يقبل الأرقام فقط")
  .transform(normalizeCustomerPhone).pipe(z.string().regex(/^05\d{8}$/, "رقم واتساب غير صحيح"));

const SubmissionBodyStrict = CreateSubmissionBody.extend({
  nameAr: z.string().trim().min(2, "اسم الشاليه مطلوب (حرفان على الأقل)"),
  region: z.string().trim().min(2, "المنطقة مطلوبة"),
  suggestedCityName: z.string().trim().min(2).optional(),
  location: z.string().trim().min(2, "المدينة مطلوبة"),
  district: z.string().trim().min(1, "الحي مطلوب"),
  descriptionAr: z.string().trim().min(3, "الوصف قصير جداً (٣ أحرف على الأقل)"),
  whatsappNumber: whatsappSchema,
  pricePerNight: z.number().min(0),
  priceMorning: z.number().nullable().optional(),
  priceEvening: z.number().nullable().optional(),
  priceFullDay: z.number().nullable().optional(),
  slotMorning: z.boolean().optional(),
  slotEvening: z.boolean().optional(),
  slotFullDay: z.boolean().optional(),
  priceWeekday: z.number().min(0).nullable().optional(),
  priceWeekend: z.number().min(0).nullable().optional(),
  dailyPrices: z.record(z.string(), z.record(z.string(), z.number())).nullable().optional(),
  seasonalDisclaimer: z.boolean().optional(),
  mapsUrl: z.string().optional().nullable().or(z.literal("")),
  socialLink: z.string().trim().refine(value => !!socialAccountIdentity(value), "أدخل رابط حساب Instagram / Snapchat أو معرف حساب صحيح").optional().nullable(),
  photos: z.array(z.string().trim().min(1).refine(value => value !== "error", "صورة غير صالحة")).min(1, "أضف صورة رئيسية واحدة على الأقل").max(15, "الحد الأقصى للصور هو 15"),
  videoUrl: z.string().optional(),
  logoUrl: z.string().optional().nullable(),
  termsAndConditions: z.string().trim().min(1, "الشروط والأحكام الخاصة مطلوبة"),
  maxGuests: z.number().int().min(1).nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  propertyType: z.string().trim().optional().nullable(),
  suggestedCategoryName: z.string().trim().optional().nullable(),
  sections: z.string().trim().optional().nullable(),
  checkInTime: z.string().optional().nullable(),
  checkOutTime: z.string().optional().nullable(),
  morningCheckIn: z.string().optional().nullable(),
  morningCheckOut: z.string().optional().nullable(),
  eveningCheckIn: z.string().optional().nullable(),
  eveningCheckOut: z.string().optional().nullable(),
  fullDayCheckIn: z.string().optional().nullable(),
  fullDayCheckOut: z.string().optional().nullable(),
});

const router = Router();

async function hasRegistrationSession(req: Request) {
  let authenticated = req.isAuthenticated();
  if (!authenticated && req.cookies?.owner_temp_session) {
    const [session] = await db.select({ id: ownerTempSessionsTable.id })
      .from(ownerTempSessionsTable)
      .where(and(eq(ownerTempSessionsTable.token, req.cookies.owner_temp_session),
        sql`${ownerTempSessionsTable.expiresAt} > now()`)).limit(1);
    authenticated = !!session;
  }
  return authenticated;
}

router.post("/check-social-account", async (req, res) => {
  if (!await hasRegistrationSession(req)) return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  const parsed = z.object({
    socialLink: z.string().trim().refine(value => !!socialAccountIdentity(value)),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "أدخل رابط حساب Instagram / Snapchat أو معرف حساب صحيح." });
  const duplicate = await hasPropertySocialConflict(parsed.data.socialLink);
  return res.json({
    available: !duplicate,
    fieldErrors: duplicate ? {
      socialLink: ["حساب التواصل هذا مرتبط بعقار آخر مسجل مسبقاً. يرجى استخدام حساب مختلف."],
    } : {},
  });
});

router.post("/check-identity", async (req, res) => {
  const authenticated = await hasRegistrationSession(req);
  if (!authenticated) return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  const parsed = z.object({
    nameAr: z.string().trim().min(2),
    location: z.string().trim().min(2),
    district: z.string().trim().min(1),
    whatsappNumber: whatsappSchema,
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "تحقق من الاسم والمدينة والحي ورقم الواتساب" });
  const flags = await checkPropertyIdentity(parsed.data);
  const fieldErrors: Record<string, string[]> = {};
  if (flags.nameConflict) fieldErrors.nameAr = ["هذا العقار مسجل مسبقاً بنفس الاسم والمدينة والحي."];
  if (flags.whatsappConflict) fieldErrors.whatsappNumber = ["رقم الواتساب هذا مسجل مسبقاً. يرجى استخدام رقم آخر."];
  return res.json({
    available: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    warning: flags.similarName && !flags.nameConflict
      ? "يوجد عقار بالاسم نفسه في هذه المدينة ولكن في حي مختلف. يمكنك المتابعة، وننصح بإضافة ما يميز عقارك لتسهيل العثور عليه."
      : null,
  });
});

router.get("/", async (req, res) => {
  /* ── Resolve owner ID (token session or normal session) ── */
  let resolvedOwnerId: string | null = null;

  /* Path 1: Admin impersonation via owner_temp_session cookie */
  const tempToken = req.cookies?.owner_temp_session;
  if (tempToken) {
    const r = await db.execute<{ owner_id: string }>(
      sql`SELECT owner_id FROM owner_temp_sessions
          WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
    );
    const row = ((r as any).rows as Array<{ owner_id: string }>)[0];
    if (row?.owner_id) resolvedOwnerId = row.owner_id;
  }

  /* Path 2: Normal owner session */
  if (!resolvedOwnerId && req.isAuthenticated()) {
    resolvedOwnerId = req.user.id;
  }

  if (!resolvedOwnerId) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }

  /* ── Expand to include "owner_N" aliases ──────────────────
   * Admin-added properties are stored with owner_id = "owner_N"
   * (from owner_applications.id). Replit-OAuth owners need to see
   * these too, so we resolve the alias from their email.
   * EXCEPTION: platform admin in their direct (non-impersonated) Replit
   * session must NOT get email-bridged to any owner's data.            */
  const PLATFORM_ADMIN_IDS_SET = new Set(
    (process.env.PLATFORM_ADMIN_IDS ?? "56719001").split(",").map(s => s.trim()).filter(Boolean)
  );
  const isAdminDirectSession = !tempToken && PLATFORM_ADMIN_IDS_SET.has(String(resolvedOwnerId));

  const ownerIds = new Set<string>([resolvedOwnerId]);
  let businessType: string | null = null;
  if (!isAdminDirectSession) try {
    /* 1. If this IS already an "owner_N" key, also find the Replit user id */
    if (/^owner_\d+$/.test(resolvedOwnerId)) {
      const n = parseInt(resolvedOwnerId.replace("owner_", ""), 10);
      const r = await db.execute(
        sql`SELECT u.id AS user_id, oa.business_type
            FROM owner_applications oa
            LEFT JOIN users u ON LOWER(u.email) = LOWER(oa.email)
            WHERE oa.id = ${n} LIMIT 1`
      );
      const owner = ((r as any).rows as Array<{ user_id: string | null; business_type: string | null }>)[0];
      if (owner?.user_id) ownerIds.add(String(owner.user_id));
      businessType = owner?.business_type ?? null;
    }
    /* 2. Also find the "owner_N" alias for a Replit-ID session */
    else {
      const emailR = await db.execute(
        sql`SELECT email FROM users WHERE id = ${resolvedOwnerId} LIMIT 1`
      );
      const email = ((emailR as any).rows as Array<{ email: string }>)[0]?.email;
      if (email) {
        const appR = await db.execute(
          sql`SELECT id, business_type
              FROM owner_applications
              WHERE LOWER(email) = LOWER(${email})
              LIMIT 1`
        );
        const owner = ((appR as any).rows as Array<{ id: number; business_type: string | null }>)[0];
        if (owner?.id) ownerIds.add(`owner_${owner.id}`);
        businessType = owner?.business_type ?? null;
      }
    }
  } catch { /* non-fatal — fall back to single ID */ }

  /* Service-only accounts have no property submissions. Avoid querying the
     property table entirely and return the endpoint's normal empty shape. */
  if (!isAdminDirectSession && businessType === "service") {
    res.json([]);
    return;
  }

  const allOwnerIds = [...ownerIds];

  const submissions = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(inArray(chaletSubmissionsTable.ownerId, allOwnerIds));

  return res.json(submissions);
});

/* ── GET /submissions/mine — lightweight list for dropdowns ── */
router.get("/mine", async (req, res) => {
  let resolvedOwnerId: string | null = null;

  const tempToken = req.cookies?.owner_temp_session;
  if (tempToken) {
    const r = await db.execute<{ owner_id: string }>(
      sql`SELECT owner_id FROM owner_temp_sessions
          WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
    );
    const row = ((r as any).rows as Array<{ owner_id: string }>)[0];
    if (row?.owner_id) resolvedOwnerId = row.owner_id;
  }

  if (!resolvedOwnerId && req.isAuthenticated()) {
    resolvedOwnerId = req.user.id;
  }

  if (!resolvedOwnerId) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }

  const ownerIds = new Set<string>([resolvedOwnerId]);
  try {
    if (/^owner_\d+$/.test(resolvedOwnerId)) {
      const n = parseInt(resolvedOwnerId.replace("owner_", ""), 10);
      const r = await db.execute(
        sql`SELECT u.id FROM owner_applications oa
            JOIN users u ON LOWER(u.email) = LOWER(oa.email)
            WHERE oa.id = ${n} LIMIT 1`
      );
      const uid = ((r as any).rows as Array<{ id: string }>)[0]?.id;
      if (uid) ownerIds.add(String(uid));
    } else {
      const emailR = await db.execute(
        sql`SELECT email FROM users WHERE id = ${resolvedOwnerId} LIMIT 1`
      );
      const email = ((emailR as any).rows as Array<{ email: string }>)[0]?.email;
      if (email) {
        const appR = await db.execute(
          sql`SELECT id FROM owner_applications WHERE LOWER(email) = LOWER(${email}) LIMIT 1`
        );
        const appId = ((appR as any).rows as Array<{ id: number }>)[0]?.id;
        if (appId) ownerIds.add(`owner_${appId}`);
      }
    }
  } catch { /* non-fatal */ }

  const allOwnerIds = [...ownerIds];

  const submissions = await db
    .select({ id: chaletSubmissionsTable.id, nameAr: chaletSubmissionsTable.nameAr })
    .from(chaletSubmissionsTable)
    .where(inArray(chaletSubmissionsTable.ownerId, allOwnerIds))
    .orderBy(chaletSubmissionsTable.id);

  return res.json(submissions);
});

router.post("/", async (req, res) => {
  const result = SubmissionBodyStrict.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: result.error.flatten().fieldErrors });
  }

  const data = result.data;
  data.whatsappNumber = normalizeCustomerPhone(data.whatsappNumber);

  /* Resolve ownerId: prefer temp-session cookie (owner portal), then authenticated session */
  let ownerId: string | null = req.isAuthenticated() ? req.user.id : null;
  if (!ownerId) {
    const tempToken = (req as any).cookies?.owner_temp_session;
    if (tempToken) {
      const r = await db.execute<{ owner_id: string }>(
        sql`SELECT owner_id FROM owner_temp_sessions
            WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
      );
      const row = ((r as any).rows as Array<{ owner_id: string }>)[0];
      if (row?.owner_id) ownerId = row.owner_id;
    }
  }
  if (!ownerId) {
    return res.status(401).json({ error: "سجّل الدخول لإضافة عقار واستخدام الشهر التجريبي", upgradeRequired: true });
  }

  const ownerAccess = ownerId ? await ownerPlanAccess(ownerId) : null;
  if (ownerAccess) {
    if (!ownerAccess.canSubmitActivities) {
      return res.status(403).json({ error: "انتهى اشتراكك. جدّده لإضافة عقار جديد.", upgradeRequired: true });
    }
    if (ownerAccess.chaletCount >= ownerAccess.chaletLimit) {
      return res.status(403).json({ error: "وصلت إلى الحد الأقصى للعقارات في باقتك. جدّد اشتراكك أو اختر باقة أعلى.", upgradeRequired: true });
    }
  }

  /* ── Full-scan duplicate check — collect ALL conflicts before returning ── */
  const dupFields: string[] = [];
  // Run all checks in parallel
  const [
    identity,
    socialConflict,
  ] = await Promise.all([
    checkPropertyIdentity(data),
    data.socialLink ? hasPropertySocialConflict(data.socialLink) : Promise.resolve(false),
  ]);

  // A shared map pin is valid for complexes and neighboring properties.
  if (identity.whatsappConflict) dupFields.push("رقم الواتساب");
  if (socialConflict) dupFields.push("حساب التواصل");
  if (identity.nameConflict) dupFields.push("الاسم والمدينة والحي");

  if (dupFields.length > 0) {
    let error: string;
    if (dupFields.length === 1) {
      const labels: Record<string, string> = {
        "رقم الواتساب": "عفواً، رقم الواتساب هذا مسجل مسبقاً.",
        "حساب التواصل": "حساب التواصل هذا مرتبط بعقار آخر مسجل مسبقاً.",
        "الاسم والمدينة والفئة": "عفواً، يوجد شاليه بنفس هذا الاسم في هذه المدينة والفئة.",
        "الاسم والمدينة والحي": "هذا العقار مسجل مسبقاً بنفس الاسم والمدينة والحي.",
      };
      error = labels[dupFields[0]] ?? `عفواً، ${dupFields[0]} مسجل مسبقاً.`;
    } else {
      error = `عفواً، البيانات التالية مسجلة مسبقاً: (${dupFields.join("، ")}).`;
    }
    return res.status(409).json({ error, fields: dupFields });
  }

  // Lock the owner's property quota until the submission is committed. Without
  // this second check, two concurrent requests can both consume the last slot.
  const [submission] = await db.transaction(async (tx) => {
    await lockResource(tx, 731205, ownerAccess!.subscription.ownerId);
    const currentAccess = await ownerPlanAccess(ownerId!);
    if (!currentAccess.canSubmitActivities ||
        currentAccess.chaletCount >= currentAccess.chaletLimit) return [null];
    if (ownerId) await includeOwnerActivityKind(tx, ownerId, "chalet");
    return tx.insert(chaletSubmissionsTable)
    .values({
      ownerId,
      nameAr: data.nameAr,
      whatsappNumber: data.whatsappNumber,
      region: data.region,
      location: data.location,
      suggestedCityName: data.suggestedCityName || null,
      district: data.district || null,
      websiteUrl: data.mapsUrl || null,
      mapsUrl: data.mapsUrl || null,
      descriptionAr: data.descriptionAr,
      pricePerNight: String(data.pricePerNight),
      priceMorning: data.priceMorning != null ? String(data.priceMorning) : null,
      priceEvening: data.priceEvening != null ? String(data.priceEvening) : null,
      priceFullDay: data.priceFullDay != null ? String(data.priceFullDay) : null,
      slotMorning: data.slotMorning ?? true,
      slotEvening: data.slotEvening ?? true,
      slotFullDay: data.slotFullDay ?? true,
      priceWeekday: data.priceWeekday != null ? String(data.priceWeekday) : null,
      priceWeekend: data.priceWeekend != null ? String(data.priceWeekend) : null,
      dailyPrices: data.dailyPrices ?? null,
      seasonalDisclaimer: data.seasonalDisclaimer ?? true,
      amenities: data.amenities ?? [],
      photos: data.photos ?? [],
      videoUrl: data.videoUrl || null,
      logoUrl: data.logoUrl || null,
      socialLink: data.socialLink || null,
      termsAndConditions: data.termsAndConditions || null,
      maxGuests: data.maxGuests ?? null,
      bedrooms: data.bedrooms ?? null,
      propertyType: data.propertyType === "__other__" ? null : (data.propertyType || null),
      suggestedCategoryName: data.propertyType === "__other__" ? (data.suggestedCategoryName || null) : null,
      pendingCategoryApproval: data.propertyType === "__other__" && !!data.suggestedCategoryName,
      sections: data.sections || null,
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
      morningCheckIn: data.morningCheckIn || null,
      morningCheckOut: data.morningCheckOut || null,
      eveningCheckIn: data.eveningCheckIn || null,
      eveningCheckOut: data.eveningCheckOut || null,
      fullDayCheckIn: data.fullDayCheckIn || null,
      fullDayCheckOut: data.fullDayCheckOut || null,
      trialEndsAt: ownerAccess?.subscription.plan === "trial" ? ownerAccess.subscription.expiresAt : null,
    })
    .returning({ id: chaletSubmissionsTable.id });
  });
  if (!submission) {
    return res.status(403).json({ error: "تعذر إضافة العقار ضمن السعة الحالية. راجع حدود الباقة وحالة الاشتراك.", upgradeRequired: true });
  }

  sendAdminNewSubmissionEmail({
    nameAr: data.nameAr,
    whatsappNumber: data.whatsappNumber,
    location: data.location,
    pricePerNight: String(data.pricePerNight),
    mapsUrl: data.mapsUrl,
    submissionId: submission.id,
  }).catch(() => {});

  return res.status(201).json({
    id: submission.id,
    message: "تم استلام طلبك، سيتم مراجعته وتفعيله قريباً",
  });
});

/* ── PATCH /:id — owner edits a needs_revision submission and resubmits ── */
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "معرّف غير صالح" });

  /* Resolve owner ID */
  let resolvedOwnerId: string | null = null;
  const tempToken = req.cookies?.owner_temp_session;
  if (tempToken) {
    const r = await db.execute<{ owner_id: string }>(
      sql`SELECT owner_id FROM owner_temp_sessions
          WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
    );
    const row = ((r as any).rows as Array<{ owner_id: string }>)[0];
    if (row?.owner_id) resolvedOwnerId = row.owner_id;
  }
  if (!resolvedOwnerId && req.isAuthenticated()) resolvedOwnerId = req.user.id;
  if (!resolvedOwnerId) return res.status(401).json({ error: "يجب تسجيل الدخول" });

  /* Build set of valid owner IDs */
  const ownerIds = new Set<string>([resolvedOwnerId]);
  try {
    if (/^owner_\d+$/.test(resolvedOwnerId)) {
      const n = parseInt(resolvedOwnerId.replace("owner_", ""), 10);
      const r = await db.execute(
        sql`SELECT u.id FROM owner_applications oa JOIN users u ON LOWER(u.email)=LOWER(oa.email) WHERE oa.id=${n} LIMIT 1`
      );
      const uid = ((r as any).rows as Array<{ id: string }>)[0]?.id;
      if (uid) ownerIds.add(String(uid));
    } else {
      const emailR = await db.execute(sql`SELECT email FROM users WHERE id=${resolvedOwnerId} LIMIT 1`);
      const email = ((emailR as any).rows as Array<{ email: string }>)[0]?.email;
      if (email) {
        const appR = await db.execute(sql`SELECT id FROM owner_applications WHERE LOWER(email)=LOWER(${email}) LIMIT 1`);
        const appId = ((appR as any).rows as Array<{ id: number }>)[0]?.id;
        if (appId) ownerIds.add(`owner_${appId}`);
      }
    }
  } catch { /* non-fatal */ }

  /* Verify ownership + status eligibility */
  const allOwnerIds = [...ownerIds];
  const [sub] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id)).limit(1);
  if (!sub) return res.status(404).json({ error: "الطلب غير موجود" });
  if (!allOwnerIds.includes(sub.ownerId ?? "")) return res.status(403).json({ error: "غير مصرح" });
  if (sub.status !== "needs_revision") return res.status(409).json({ error: "لا يمكن تعديل هذا الطلب في حالته الحالية" });

  const body = z.object({
    nameAr: z.string().trim().min(2).optional(),
    descriptionAr: z.string().trim().min(3).optional(),
    whatsappNumber: whatsappSchema.optional(),
    region: z.string().trim().min(2).optional(),
    suggestedCityName: z.string().trim().min(2).nullable().optional(),
    location: z.string().trim().min(2).optional(),
    district: z.string().trim().nullable().optional(),
    pricePerNight: z.number().min(0).optional(),
    priceMorning: z.number().nullable().optional(),
    priceEvening: z.number().nullable().optional(),
    priceFullDay: z.number().nullable().optional(),
    photos: z.array(z.string()).max(15).optional(),
    amenities: z.array(z.string()).optional(),
    mapsUrl: z.string().nullable().optional(),
    videoUrl: z.string().nullable().optional(),
    socialLink: z.string().trim().refine(value => !value || !!socialAccountIdentity(value)).nullable().optional(),
    maxGuests: z.number().int().min(1).nullable().optional(),
    bedrooms: z.number().int().min(0).nullable().optional(),
    termsAndConditions: z.string().nullable().optional(),
    ownerRevisionNote: z.string().nullable().optional(),
    propertyType: z.string().trim().nullable().optional(),
    suggestedCategoryName: z.string().nullable().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const d = body.data;

  /* ── Full-scan duplicate check — collect ALL conflicts (excluding this submission) ── */
  const patchDupFields: string[] = [];

  // Fetch current submission to resolve effective values for unchanged fields
  const [currentSub] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id)).limit(1);
  const checkWa   = d.whatsappNumber ?? currentSub?.whatsappNumber ?? "";
  const checkSoc  = d.socialLink     !== undefined ? d.socialLink  : currentSub?.socialLink ?? null;
  const checkName = d.nameAr         ?? currentSub?.nameAr         ?? "";
  const checkLoc  = d.location       ?? currentSub?.location       ?? "";
  const checkDistrict = d.district !== undefined ? d.district : currentSub?.district ?? "";

  const patchSubNameWhere: Parameters<typeof and>[0][] = [
    sql`lower(${chaletSubmissionsTable.nameAr}) = lower(${checkName})`,
    sql`lower(${chaletSubmissionsTable.location}) = lower(${checkLoc})`,
    sql`lower(coalesce(${chaletSubmissionsTable.district}, '')) = lower(${checkDistrict ?? ""})`,
    ne(chaletSubmissionsTable.status, "rejected"),
    ne(chaletSubmissionsTable.id, id),
  ];

  const patchChaletNameWhere: Parameters<typeof and>[0][] = [
    sql`lower(${chaletsTable.nameAr}) = lower(${checkName})`,
    sql`lower(${chaletsTable.location}) = lower(${checkLoc})`,
    sql`lower(coalesce(${chaletsTable.district}, '')) = lower(${checkDistrict ?? ""})`,
    sql`${chaletsTable.submissionId} IS DISTINCT FROM ${id}`,
  ];

  const [
    [pDupSubName], [pDupChaletName],
    [pDupSubWa],   [pDupChaletWa],
    patchSocialConflict,
  ] = await Promise.all([
    db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable).where(and(...patchSubNameWhere)).limit(1),
    db.select({ id: chaletsTable.id }).from(chaletsTable).where(and(...patchChaletNameWhere)).limit(1),

    db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(eq(chaletSubmissionsTable.whatsappNumber, checkWa), ne(chaletSubmissionsTable.status, "rejected"), ne(chaletSubmissionsTable.id, id))).limit(1),
    db.select({ id: chaletsTable.id }).from(chaletsTable).where(eq(chaletsTable.whatsappNumber, checkWa)).limit(1),

    checkSoc ? hasPropertySocialConflict(checkSoc, id) : Promise.resolve(false),
  ]);

  if (pDupSubWa  || pDupChaletWa)  patchDupFields.push("رقم الواتساب");
  if (patchSocialConflict) patchDupFields.push("حساب التواصل");
  if (pDupSubName || pDupChaletName) patchDupFields.push("الاسم والمدينة والحي");

  if (patchDupFields.length > 0) {
    let error: string;
    if (patchDupFields.length === 1) {
      const labels: Record<string, string> = {
        "رقم الواتساب": "عفواً، رقم الواتساب هذا مسجل مسبقاً.",
        "حساب التواصل": "حساب التواصل هذا مرتبط بعقار آخر مسجل مسبقاً.",
        "الاسم والمدينة والفئة": "عفواً، يوجد شاليه بنفس هذا الاسم في هذه المدينة والفئة.",
        "الاسم والمدينة والحي": "هذا العقار مسجل مسبقاً بنفس الاسم والمدينة والحي.",
      };
      error = labels[patchDupFields[0]] ?? `عفواً، ${patchDupFields[0]} مسجل مسبقاً.`;
    } else {
      error = `عفواً، البيانات التالية مسجلة مسبقاً: (${patchDupFields.join("، ")}).`;
    }
    return res.status(409).json({ error, fields: patchDupFields });
  }

  /* Build the update object — reset to pending but PRESERVE adminNote for admin context */
  const updateSet: Partial<typeof chaletSubmissionsTable.$inferInsert> & { status: "pending" } = {
    status: "pending",
  };
  if (d.nameAr        !== undefined) updateSet.nameAr = d.nameAr;
  if (d.descriptionAr !== undefined) updateSet.descriptionAr = d.descriptionAr;
  if (d.whatsappNumber!== undefined) updateSet.whatsappNumber = d.whatsappNumber;
  if (d.region        !== undefined) updateSet.region = d.region;
  if (d.suggestedCityName !== undefined) updateSet.suggestedCityName = d.suggestedCityName;
  if (d.location      !== undefined) updateSet.location = d.location;
  if (d.district      !== undefined) updateSet.district = d.district ?? null;
  if (d.pricePerNight !== undefined) updateSet.pricePerNight = String(d.pricePerNight);
  if (d.priceMorning  !== undefined) updateSet.priceMorning = d.priceMorning != null ? String(d.priceMorning) : null;
  if (d.priceEvening  !== undefined) updateSet.priceEvening = d.priceEvening != null ? String(d.priceEvening) : null;
  if (d.priceFullDay  !== undefined) updateSet.priceFullDay = d.priceFullDay != null ? String(d.priceFullDay) : null;
  if (d.photos        !== undefined) updateSet.photos = d.photos ?? [];
  if (d.amenities     !== undefined) updateSet.amenities = d.amenities ?? [];
  if (d.mapsUrl       !== undefined) updateSet.mapsUrl = d.mapsUrl ?? null;
  if (d.videoUrl      !== undefined) updateSet.videoUrl = d.videoUrl ?? null;
  if (d.socialLink    !== undefined) updateSet.socialLink = d.socialLink ?? null;
  if (d.maxGuests     !== undefined) updateSet.maxGuests = d.maxGuests ?? null;
  if (d.bedrooms      !== undefined) updateSet.bedrooms = d.bedrooms ?? null;
  if (d.termsAndConditions !== undefined) updateSet.termsAndConditions = d.termsAndConditions ?? null;
  if (d.ownerRevisionNote !== undefined) updateSet.ownerRevisionNote = d.ownerRevisionNote ?? null;
  if (d.propertyType !== undefined) {
    if (d.propertyType === "__other__") {
      (updateSet as any).propertyType = null;
      if (d.suggestedCategoryName) {
        (updateSet as any).suggestedCategoryName = d.suggestedCategoryName;
        (updateSet as any).pendingCategoryApproval = true;
      }
    } else {
      (updateSet as any).suggestedCategoryName = null;
      (updateSet as any).pendingCategoryApproval = false;
    }
  } else if (d.suggestedCategoryName !== undefined) {
    (updateSet as any).suggestedCategoryName = d.suggestedCategoryName ?? null;
  }

  const saved = await db
    .update(chaletSubmissionsTable)
    .set(updateSet as any)
    .where(and(eq(chaletSubmissionsTable.id, id), eq(chaletSubmissionsTable.status, "needs_revision")))
    .returning({ id: chaletSubmissionsTable.id });
  if (!saved.length) return res.status(409).json({ error: "تغيرت حالة الطلب. لا يمكن إعادة إرسال طلب مرفوض نهائياً." });

  return res.json({ ok: true, message: "تم إعادة تقديم الطلب للمراجعة" });
});

export default router;
