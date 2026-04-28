import { Router } from "express";
import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable, ownerTempSessionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";
import { eq, and, ne, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { sendAdminNewSubmissionEmail } from "../lib/email";

const SubmissionBodyStrict = CreateSubmissionBody.extend({
  nameAr: z.string().trim().min(2, "اسم الشاليه مطلوب (حرفان على الأقل)"),
  location: z.string().trim().min(2, "المدينة مطلوبة"),
  district: z.string().trim().optional(),
  descriptionAr: z.string().trim().min(3, "الوصف قصير جداً (٣ أحرف على الأقل)"),
  whatsappNumber: z.string().trim().min(9, "رقم واتساب غير صحيح"),
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
  socialLink: z.string().optional().nullable(),
  photos: z.array(z.string()).max(15, "الحد الأقصى للصور هو 15").optional(),
  videoUrl: z.string().optional(),
  termsAndConditions: z.string().optional().nullable(),
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
   * these too, so we resolve the alias from their email.             */
  const ownerIds = new Set<string>([resolvedOwnerId]);
  try {
    /* 1. If this IS already an "owner_N" key, also find the Replit user id */
    if (/^owner_\d+$/.test(resolvedOwnerId)) {
      const n = parseInt(resolvedOwnerId.replace("owner_", ""), 10);
      const r = await db.execute(
        sql`SELECT u.id FROM owner_applications oa
            JOIN users u ON LOWER(u.email) = LOWER(oa.email)
            WHERE oa.id = ${n} LIMIT 1`
      );
      const uid = ((r as any).rows as Array<{ id: string }>)[0]?.id;
      if (uid) ownerIds.add(String(uid));
    }
    /* 2. Also find the "owner_N" alias for a Replit-ID session */
    else {
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
  } catch { /* non-fatal — fall back to single ID */ }

  const allOwnerIds = [...ownerIds];

  const submissions = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(inArray(chaletSubmissionsTable.ownerId, allOwnerIds));

  return res.json(submissions);
});

router.post("/", async (req, res) => {
  const result = SubmissionBodyStrict.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: result.error.flatten().fieldErrors });
  }

  const data = result.data;
  const ownerId = req.isAuthenticated() ? req.user.id : null;

  /* ── 1. Name + City (+ Category when supplied) ─────────────── */
  const hasCategory = !!(data.propertyType && data.propertyType !== "__other__");

  const subNameWhere: Parameters<typeof and>[0][] = [
    sql`lower(${chaletSubmissionsTable.nameAr}) = lower(${data.nameAr})`,
    sql`lower(${chaletSubmissionsTable.location}) = lower(${data.location})`,
    ne(chaletSubmissionsTable.status, "rejected"),
  ];
  if (hasCategory) {
    subNameWhere.push(sql`lower(coalesce(${chaletSubmissionsTable.propertyType}, '')) = lower(${data.propertyType})`);
  }
  const [dupSubName] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
    .where(and(...subNameWhere)).limit(1);

  const chaletNameWhere: Parameters<typeof and>[0][] = [
    sql`lower(${chaletsTable.nameAr}) = lower(${data.nameAr})`,
    sql`lower(${chaletsTable.location}) = lower(${data.location})`,
  ];
  if (hasCategory) {
    chaletNameWhere.push(
      sql`lower(coalesce(${chaletsTable.category}, coalesce(${chaletsTable.propertyType}, ''))) = lower(${data.propertyType})`
    );
  }
  const [dupChaletName] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
    .where(and(...chaletNameWhere)).limit(1);

  if (dupSubName || dupChaletName) {
    return res.status(409).json({
      error: hasCategory
        ? "عفواً، يوجد شاليه بنفس هذا الاسم في هذه المدينة والفئة."
        : "عذراً، هذا الاسم مستخدم مسبقاً في هذه المدينة. يرجى اختيار اسم مختلف أو إضافة تمييز للحي",
    });
  }

  /* ── 2. WhatsApp number duplicate ──────────────────────────── */
  {
    const [dupSubWa] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(eq(chaletSubmissionsTable.whatsappNumber, data.whatsappNumber), ne(chaletSubmissionsTable.status, "rejected"))).limit(1);
    const [dupChaletWa] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(eq(chaletsTable.whatsappNumber, data.whatsappNumber)).limit(1);
    if (dupSubWa || dupChaletWa) return res.status(409).json({ error: "عفواً، رقم الواتساب هذا مسجل مسبقاً." });
  }

  /* ── 3. Instagram link duplicate ───────────────────────────── */
  if (data.socialLink) {
    const [dupSubSocial] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(sql`lower(${chaletSubmissionsTable.socialLink}) = lower(${data.socialLink})`, ne(chaletSubmissionsTable.status, "rejected"))).limit(1);
    const [dupChaletSocial] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(sql`lower(${chaletsTable.socialLink}) = lower(${data.socialLink})`).limit(1);
    if (dupSubSocial || dupChaletSocial) return res.status(409).json({ error: "عفواً، رابط الإنستقرام هذا مسجل مسبقاً." });
  }

  /* ── 4. Google Maps URL duplicate ──────────────────────────── */
  if (data.mapsUrl) {
    const [dupSubMaps] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(sql`lower(${chaletSubmissionsTable.mapsUrl}) = lower(${data.mapsUrl})`, ne(chaletSubmissionsTable.status, "rejected"))).limit(1);
    const [dupChaletMaps] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(sql`lower(${chaletsTable.mapsUrl}) = lower(${data.mapsUrl})`).limit(1);
    if (dupSubMaps || dupChaletMaps) return res.status(409).json({ error: "عفواً، موقع الشاليه هذا مسجل مسبقاً. يرجى التأكد من الموقع أو التواصل مع الإدارة." });
  }

  const [submission] = await db
    .insert(chaletSubmissionsTable)
    .values({
      ownerId,
      nameAr: data.nameAr,
      whatsappNumber: data.whatsappNumber,
      location: data.location,
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
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: chaletSubmissionsTable.id });

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
    whatsappNumber: z.string().trim().min(9).optional(),
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
    socialLink: z.string().nullable().optional(),
    maxGuests: z.number().int().min(1).nullable().optional(),
    bedrooms: z.number().int().min(0).nullable().optional(),
    termsAndConditions: z.string().nullable().optional(),
    ownerRevisionNote: z.string().nullable().optional(),
    suggestedCategoryName: z.string().nullable().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const d = body.data;

  /* ── Duplicate checks (excluding this submission) ────────── */

  /* 1. WhatsApp number */
  if (d.whatsappNumber) {
    const [dupSubWa] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(eq(chaletSubmissionsTable.whatsappNumber, d.whatsappNumber), ne(chaletSubmissionsTable.status, "rejected"), ne(chaletSubmissionsTable.id, id))).limit(1);
    const [dupChaletWa] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(eq(chaletsTable.whatsappNumber, d.whatsappNumber)).limit(1);
    if (dupSubWa || dupChaletWa) return res.status(409).json({ error: "عفواً، رقم الواتساب هذا مسجل مسبقاً." });
  }

  /* 2. Instagram link */
  if (d.socialLink) {
    const [dupSubSocial] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(sql`lower(${chaletSubmissionsTable.socialLink}) = lower(${d.socialLink})`, ne(chaletSubmissionsTable.status, "rejected"), ne(chaletSubmissionsTable.id, id))).limit(1);
    const [dupChaletSocial] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(sql`lower(${chaletsTable.socialLink}) = lower(${d.socialLink})`).limit(1);
    if (dupSubSocial || dupChaletSocial) return res.status(409).json({ error: "عفواً، رابط الإنستقرام هذا مسجل مسبقاً." });
  }

  /* 3. Google Maps URL */
  if (d.mapsUrl) {
    const [dupSubMaps] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(sql`lower(${chaletSubmissionsTable.mapsUrl}) = lower(${d.mapsUrl})`, ne(chaletSubmissionsTable.status, "rejected"), ne(chaletSubmissionsTable.id, id))).limit(1);
    const [dupChaletMaps] = await db.select({ id: chaletsTable.id }).from(chaletsTable)
      .where(sql`lower(${chaletsTable.mapsUrl}) = lower(${d.mapsUrl})`).limit(1);
    if (dupSubMaps || dupChaletMaps) return res.status(409).json({ error: "عفواً، موقع الشاليه هذا مسجل مسبقاً. يرجى التأكد من الموقع أو التواصل مع الإدارة." });
  }

  /* 4. Name + City (+ Category if being updated) */
  if (d.nameAr || d.location || d.propertyType) {
    const [currentSub] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id)).limit(1);
    if (currentSub) {
      const checkName     = d.nameAr     ?? currentSub.nameAr;
      const checkLocation = d.location   ?? currentSub.location;
      const checkCat      = d.propertyType !== undefined ? d.propertyType : currentSub.propertyType;
      const hasEditCat    = !!(checkCat && checkCat !== "__other__");

      const editSubWhere: Parameters<typeof and>[0][] = [
        sql`lower(${chaletSubmissionsTable.nameAr}) = lower(${checkName})`,
        sql`lower(${chaletSubmissionsTable.location}) = lower(${checkLocation})`,
        ne(chaletSubmissionsTable.status, "rejected"),
        ne(chaletSubmissionsTable.id, id),
      ];
      if (hasEditCat) editSubWhere.push(sql`lower(coalesce(${chaletSubmissionsTable.propertyType}, '')) = lower(${checkCat})`);
      const [dupSN] = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable).where(and(...editSubWhere)).limit(1);

      const editChaletWhere: Parameters<typeof and>[0][] = [
        sql`lower(${chaletsTable.nameAr}) = lower(${checkName})`,
        sql`lower(${chaletsTable.location}) = lower(${checkLocation})`,
      ];
      if (hasEditCat) editChaletWhere.push(sql`lower(coalesce(${chaletsTable.category}, coalesce(${chaletsTable.propertyType}, ''))) = lower(${checkCat})`);
      const [dupCN] = await db.select({ id: chaletsTable.id }).from(chaletsTable).where(and(...editChaletWhere)).limit(1);

      if (dupSN || dupCN) {
        return res.status(409).json({
          error: hasEditCat
            ? "عفواً، يوجد شاليه بنفس هذا الاسم في هذه المدينة والفئة."
            : "عذراً، هذا الاسم مستخدم مسبقاً في هذه المدينة.",
        });
      }
    }
  }

  /* Build the update object — reset to pending but PRESERVE adminNote for admin context */
  const updateSet: Partial<typeof chaletSubmissionsTable.$inferInsert> & { status: "pending" } = {
    status: "pending",
  };
  if (d.nameAr        !== undefined) updateSet.nameAr = d.nameAr;
  if (d.descriptionAr !== undefined) updateSet.descriptionAr = d.descriptionAr;
  if (d.whatsappNumber!== undefined) updateSet.whatsappNumber = d.whatsappNumber;
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

  await db
    .update(chaletSubmissionsTable)
    .set(updateSet as any)
    .where(eq(chaletSubmissionsTable.id, id));

  return res.json({ ok: true, message: "تم إعادة تقديم الطلب للمراجعة" });
});

export default router;
