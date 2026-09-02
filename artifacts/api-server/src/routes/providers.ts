import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
  serviceBlockedDatesTable,
  serviceSeasonsTable,
  serviceAppointmentsTable,
  serviceInsurancesTable,
  serviceReviewInvitationsTable,
  serviceReviewsTable,
} from "@workspace/db/schema";
import { eq, and, ne, desc, isNull, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

const router = Router();
const ALL_KINGDOM_COVERAGE = "جميع مناطق المملكة";
const canonicalGregorianDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }, "التاريخ غير صالح");
const insuranceAmountInput = z.union([z.string(), z.number()])
  .transform((value) => String(value))
  .optional()
  .nullable();

function normalizeInsuranceConfig(
  requiresInsurance: boolean,
  insuranceAmount: string | null | undefined,
) {
  if (!requiresInsurance) {
    return { requiresInsurance: false, insuranceAmount: null };
  }
  const normalizedAmount = insuranceAmount?.trim() ?? "";
  const amount = Number(normalizedAmount);
  if (!normalizedAmount || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return { requiresInsurance: true, insuranceAmount: amount.toFixed(2) };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  return next();
}

/* ── Public: list approved providers ─────────────── */
router.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const city = typeof req.query.city === "string" ? req.query.city.trim() : undefined;
  const conditions: any[] = [eq(serviceProvidersTable.isActive, true)];
  if (category && category !== "all") {
    conditions.push(eq(serviceProvidersTable.category, category));
  }
  if (city && city !== "all") {
    conditions.push(sql`(
      LOWER(${serviceProvidersTable.city}) = LOWER(${city})
      OR EXISTS (
        SELECT 1
        FROM UNNEST(${serviceProvidersTable.coverageTags}) AS coverage(city_name)
         WHERE LOWER(coverage.city_name) = LOWER(${city})
            OR LOWER(coverage.city_name) = LOWER(${ALL_KINGDOM_COVERAGE})
      )
    )`);
  }
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(and(...conditions))
    .orderBy(sql`RANDOM()`);
  return res.json(rows);
});

/* ── Public: single provider ──────────────────────── */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id));

  if (!provider) return res.status(404).json({ error: "مزود الخدمة غير موجود" });
  return res.json(provider);
});

/* ── Owner: submit new provider application ────────── */
router.post("/submit", requireAuth, async (req: any, res) => {
  // Storage paths are relative (/api/storage/...), not full URLs,
  // so we validate them as non-empty strings — not with .url()
  const schema = z.object({
    businessName: z.string().min(2, "اسم النشاط يجب أن يكون حرفين على الأقل"),
    category: z.string().min(1, "يرجى اختيار فئة الخدمة"),
    city: z.string().min(1, "يرجى اختيار المدينة"),
    descriptionAr: z.string().optional(),
    whatsappNumber: z.string().min(9, "رقم الواتساب يجب أن يكون 9 أرقام على الأقل"),
    logoUrl: z.string().min(1).optional().or(z.literal("")),
    galleryPhotos: z
      .array(z.string().min(1))
      .min(3, "يجب رفع 3 صور على الأقل للمعرض"),
    videoUrl: z.string().min(1).optional().or(z.literal("")),
    yearsOfExperience: z.number().int().min(0).optional(),
    pricingUnit: z.enum(["per_day", "per_hour", "per_request"], {
      errorMap: () => ({ message: "يرجى اختيار وحدة التسعير" }),
    }),
    dailyCapacity: z.number().int().min(1, "يجب أن يكون العدد حجزاً واحداً على الأقل"),
    requiresInsurance: z.boolean().default(false),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).min(1, "يرجى إضافة نطاق الخدمة").default([]),
    customFeatureTags: z.array(z.string()).default([]),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = (msgs as string[])[0] ?? "خطأ في البيانات";
    }
    return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors });
  }

  const data = parsed.data;
  const insuranceConfig = normalizeInsuranceConfig(data.requiresInsurance, data.insuranceAmount);
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: "قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر" },
    });
  }

  /* ── Unique business name per city check ──────────────────── */
  const [dupProvider] = await db
    .select({ id: serviceProviderSubmissionsTable.id })
    .from(serviceProviderSubmissionsTable)
    .where(
      and(
        sql`lower(${serviceProviderSubmissionsTable.businessName}) = lower(${data.businessName})`,
        sql`lower(${serviceProviderSubmissionsTable.city}) = lower(${data.city})`,
        ne(serviceProviderSubmissionsTable.status, "rejected"),
      )
    )
    .limit(1);
  if (dupProvider) {
    return res.status(409).json({
      error: "عذراً، هذا الاسم مستخدم مسبقاً في هذه المدينة. يرجى اختيار اسم مختلف",
    });
  }

  // Clean up empty strings from optional URL fields
  const values = {
    ownerId: req.user.id,
    businessName: data.businessName,
    category: data.category,
    city: data.city,
    descriptionAr: data.descriptionAr ?? null,
    whatsappNumber: data.whatsappNumber,
    logoUrl: data.logoUrl || null,
    galleryPhotos: data.galleryPhotos,
    videoUrl: data.videoUrl || null,
    yearsOfExperience: data.yearsOfExperience ?? null,
    pricingUnit: data.pricingUnit,
    dailyCapacity: data.dailyCapacity,
    ...insuranceConfig,
    coverageTags: data.coverageTags,
    customFeatureTags: data.customFeatureTags,
  };

  const [row] = await db
    .insert(serviceProviderSubmissionsTable)
    .values(values)
    .returning();

  return res.status(201).json(row);
});

/* ── Owner: my submissions ─────────────────────────── */
router.get("/my/submissions", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(and(
      eq(serviceProviderSubmissionsTable.ownerId, req.user.id),
      ne(serviceProviderSubmissionsTable.status, "approved"),
    ))
    .orderBy(serviceProviderSubmissionsTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Owner: one pending submission ─────────────────── */
router.get("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [submission] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);

  if (!submission || submission.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  return res.json(submission);
});

/* ── Owner: update own pending submission ──────────── */
router.patch("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [submission] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);

  if (!submission || submission.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  if (submission.status === "approved") {
    return res.status(400).json({ error: "لا يمكن تعديل طلب معتمد من هنا" });
  }

  const schema = z.object({
    businessName: z.string().min(2, "اسم النشاط يجب أن يكون حرفين على الأقل").optional(),
    category: z.string().min(1, "يرجى اختيار فئة الخدمة").optional(),
    city: z.string().min(1, "يرجى اختيار المدينة").optional(),
    descriptionAr: z.string().optional().nullable(),
    whatsappNumber: z.string().min(9, "رقم الواتساب يجب أن يكون 9 أرقام على الأقل").optional(),
    logoUrl: z.string().optional().nullable(),
    galleryPhotos: z.array(z.string().min(1)).min(3, "يجب رفع 3 صور على الأقل").optional(),
    videoUrl: z.string().optional().nullable(),
    yearsOfExperience: z.number().int().min(0).optional().nullable(),
    pricingUnit: z.enum(["per_day", "per_hour", "per_request"]).optional(),
    dailyCapacity: z.number().int().min(1).optional(),
    requiresInsurance: z.boolean().optional(),
    requiresContract: z.boolean().optional(),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).min(1, "يرجى إضافة نطاق الخدمة").optional(),
    customFeatureTags: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "بيانات غير صحيحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  const insuranceConfig = normalizeInsuranceConfig(
    parsed.data.requiresInsurance ?? submission.requiresInsurance,
    parsed.data.insuranceAmount === undefined ? submission.insuranceAmount : parsed.data.insuranceAmount,
  );
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: ["قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر"] },
    });
  }

  const [updated] = await db
    .update(serviceProviderSubmissionsTable)
    .set({
      ...parsed.data,
      ...insuranceConfig,
      status: "pending",
      adminNote: null,
    })
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .returning();

  return res.json(updated);
});

/* ── Owner: delete own pending submission ─────────── */
router.delete("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [sub] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);
  if (!sub || sub.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  if (sub.status === "approved") {
    return res.status(400).json({ error: "لا يمكن حذف طلب معتمد. تواصل مع الدعم." });
  }
  await db.delete(serviceProviderSubmissionsTable).where(eq(serviceProviderSubmissionsTable.id, id));
  return res.json({ ok: true });
});

/* ── Owner: my approved provider listings ─────────── */
router.get("/my/approved", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.ownerId, req.user.id))
    .orderBy(serviceProvidersTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Owner: toggle active for approved provider ───── */
router.patch("/my/approved/:id/toggle", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id))
    .limit(1);
  if (!provider || provider.ownerId !== req.user.id) {
    return res.status(404).json({ error: "المزود غير موجود" });
  }
  const [updated] = await db
    .update(serviceProvidersTable)
    .set({ isActive: !provider.isActive })
    .where(eq(serviceProvidersTable.id, id))
    .returning();
  return res.json({ isActive: updated.isActive });
});

/* ── Owner: delete approved provider (with upcoming appointments check) ── */
router.delete("/my/approved/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, id)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  // Check for upcoming appointments (future date, not cancelled)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db
    .select({ id: serviceAppointmentsTable.id })
    .from(serviceAppointmentsTable)
    .where(and(
      eq(serviceAppointmentsTable.providerId, id),
      isNull(serviceAppointmentsTable.cancelledAt),
      gte(serviceAppointmentsTable.dateStr, today),
    ))
    .limit(1);

  if (upcoming.length > 0) {
    return res.status(409).json({ error: "لا يمكن الحذف لوجود حجوزات مستقبلية", hasUpcomingBookings: true });
  }

  // Delete the service provider (cascade handles appointments, seasons, insurances, etc.)
  await db.delete(serviceProvidersTable).where(eq(serviceProvidersTable.id, id));
  return res.json({ ok: true });
});

/* ── Public: request new city from admin ──────────── */
router.post("/city-request", requireAuth, async (req: any, res) => {
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";
  if (!city || city.length < 2) {
    return res.status(400).json({ error: "اسم المدينة مطلوب" });
  }
  // Store as an admin site setting so admin can see it
  try {
    const { siteSettingsTable } = await import("@workspace/db/schema");
    const key = `city_request_${Date.now()}`;
    await db.insert(siteSettingsTable).values({ key, value: `${city} (طلب من: ${req.user.id})` });
  } catch {
    // non-critical — just acknowledge
  }
  return res.json({ ok: true, message: `تم إرسال طلب إضافة مدينة "${city}" للإدارة` });
});

/* ── Owner: update approved provider details ────────── */
router.patch("/my/approved/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, id)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    businessName: z.string().min(2).optional(),
    descriptionAr: z.string().optional().nullable(),
    whatsappNumber: z.string().min(9).optional(),
    city: z.string().min(1).optional(),
    logoUrl: z.string().optional().nullable(),
    galleryPhotos: z.array(z.string()).optional(),
    videoUrl: z.string().optional().nullable(),
    yearsOfExperience: z.number().int().min(0).optional().nullable(),
    requiresInsurance: z.boolean().optional(),
    requiresContract: z.boolean().optional(),
    insuranceAmount: insuranceAmountInput,
    coverageTags: z.array(z.string()).optional(),
    customFeatureTags: z.array(z.string()).optional(),
    photoCaptions: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });
  const insuranceConfig = normalizeInsuranceConfig(
    parsed.data.requiresInsurance ?? provider.requiresInsurance,
    parsed.data.insuranceAmount === undefined ? provider.insuranceAmount : parsed.data.insuranceAmount,
  );
  if (!insuranceConfig) {
    return res.status(422).json({
      error: "بيانات التأمين غير صحيحة",
      fieldErrors: { insuranceAmount: ["قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر"] },
    });
  }

  const [updated] = await db.update(serviceProvidersTable).set({
    ...parsed.data,
    ...insuranceConfig,
  }).where(eq(serviceProvidersTable.id, id)).returning();
  return res.json(updated);
});

/* ── Owner: provider-scoped review management ────────── */
router.get("/my/approved/:id/reviews", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select({ id: serviceProvidersTable.id })
    .from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id)))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const rows = await db.select().from(serviceReviewsTable)
    .where(eq(serviceReviewsTable.providerId, providerId))
    .orderBy(desc(serviceReviewsTable.createdAt));
  return res.json(rows);
});

router.post("/my/approved/:id/review-invite", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id)))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const parsed = z.object({ guestName: z.string().trim().max(255).optional().nullable() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });
  const token = randomBytes(5).toString("hex");
  const [invitation] = await db.insert(serviceReviewInvitationsTable).values({
    token,
    providerId,
    guestName: parsed.data.guestName || null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).returning();
  return res.status(201).json({ token: invitation.token, providerName: provider.businessName });
});

router.post("/my/approved/:id/reviews/:reviewId/reply", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const reviewId = Number(req.params.reviewId);
  const parsed = z.object({ reply: z.string().trim().min(1).max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "الرد غير صحيح" });
  const [provider] = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, req.user.id))).limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });
  const [updated] = await db.update(serviceReviewsTable)
    .set({ ownerReply: parsed.data.reply, ownerReplyAt: new Date() })
    .where(and(eq(serviceReviewsTable.id, reviewId), eq(serviceReviewsTable.providerId, providerId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "التقييم غير موجود" });
  return res.json(updated);
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — BLOCKED DATES
   ════════════════════════════════════════════════════════ */

/* GET /my/approved/:id/blocked-dates */
router.get("/my/approved/:id/blocked-dates", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const rows = await db.select().from(serviceBlockedDatesTable)
    .where(and(eq(serviceBlockedDatesTable.providerId, providerId), eq(serviceBlockedDatesTable.ownerId, req.user.id)))
    .orderBy(desc(serviceBlockedDatesTable.dateStr));
  return res.json(rows);
});

/* POST /my/approved/:id/blocked-dates */
router.post("/my/approved/:id/blocked-dates", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({ dateStr: z.string().min(1), reason: z.string().optional().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "تاريخ غير صحيح" });

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${providerId}, hashtext(${parsed.data.dateStr}))`);

    const [activeAppointment] = await tx.select({ id: serviceAppointmentsTable.id })
      .from(serviceAppointmentsTable)
      .where(and(
        eq(serviceAppointmentsTable.providerId, providerId),
        eq(serviceAppointmentsTable.ownerId, req.user.id),
        eq(serviceAppointmentsTable.dateStr, parsed.data.dateStr),
        ne(serviceAppointmentsTable.status, "cancelled"),
      ))
      .limit(1);
    if (activeAppointment) return { activeAppointment: true as const };

    const [existing] = await tx.select().from(serviceBlockedDatesTable)
      .where(and(
        eq(serviceBlockedDatesTable.providerId, providerId),
        eq(serviceBlockedDatesTable.dateStr, parsed.data.dateStr),
      ))
      .limit(1);
    if (existing) return { activeAppointment: false as const, created: false as const, row: existing };

    const [row] = await tx.insert(serviceBlockedDatesTable).values({
      providerId,
      ownerId: req.user.id,
      dateStr: parsed.data.dateStr,
      reason: parsed.data.reason ?? null,
    }).returning();
    return { activeAppointment: false as const, created: true as const, row };
  });

  if (result.activeAppointment) {
    res.status(409).json({
      error: "لا يمكن إغلاق يوم يحتوي على حجوزات نشطة",
      code: "ACTIVE_APPOINTMENTS_ON_DATE",
    });
    return;
  }
  return res.status(result.created ? 201 : 200).json(result.row);
});

/* DELETE /my/approved/:id/blocked-dates/:dateId */
router.delete("/my/approved/:id/blocked-dates/:dateId", requireAuth, async (req: any, res) => {
  const dateId = Number(req.params.dateId);
  const [row] = await db.select().from(serviceBlockedDatesTable).where(eq(serviceBlockedDatesTable.id, dateId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "التاريخ غير موجود" });
  await db.delete(serviceBlockedDatesTable).where(eq(serviceBlockedDatesTable.id, dateId));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — SEASONS
   ════════════════════════════════════════════════════════ */

router.get("/my/approved/:id/seasons", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const rows = await db.select().from(serviceSeasonsTable)
    .where(and(eq(serviceSeasonsTable.providerId, providerId), eq(serviceSeasonsTable.ownerId, req.user.id)))
    .orderBy(desc(serviceSeasonsTable.createdAt));
  return res.json(rows);
});

router.post("/my/approved/:id/seasons", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    name: z.string().min(1),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    priceLabel: z.string().optional().nullable(),
    multiplier: z.string().optional().default("1.00"),
    isActive: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const [row] = await db.insert(serviceSeasonsTable).values({
    providerId, ownerId: req.user.id, ...parsed.data,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/my/approved/:id/seasons/:seasonId", requireAuth, async (req: any, res) => {
  const seasonId = Number(req.params.seasonId);
  const [row] = await db.select().from(serviceSeasonsTable).where(eq(serviceSeasonsTable.id, seasonId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الموسم غير موجود" });

  const schema = z.object({
    name: z.string().min(1).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    priceLabel: z.string().optional().nullable(),
    multiplier: z.string().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const [updated] = await db.update(serviceSeasonsTable).set(parsed.data).where(eq(serviceSeasonsTable.id, seasonId)).returning();
  return res.json(updated);
});

router.delete("/my/approved/:id/seasons/:seasonId", requireAuth, async (req: any, res) => {
  const seasonId = Number(req.params.seasonId);
  const [row] = await db.select().from(serviceSeasonsTable).where(eq(serviceSeasonsTable.id, seasonId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الموسم غير موجود" });
  await db.delete(serviceSeasonsTable).where(eq(serviceSeasonsTable.id, seasonId));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — APPOINTMENTS
   ════════════════════════════════════════════════════════ */

router.get("/my/approved/:id/appointments", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const rows = await db.select().from(serviceAppointmentsTable)
    .where(and(eq(serviceAppointmentsTable.providerId, providerId), eq(serviceAppointmentsTable.ownerId, req.user.id)))
    .orderBy(desc(serviceAppointmentsTable.dateStr));
  return res.json(rows);
});

router.post("/my/approved/:id/appointments", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const [provider] = await db.select().from(serviceProvidersTable).where(eq(serviceProvidersTable.id, providerId)).limit(1);
  if (!provider || provider.ownerId !== req.user.id) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    clientName: z.string().min(1),
    clientPhone: z.string().optional().nullable(),
    serviceAddress: z.string().optional().nullable(),
    clientIdNumber: z.string().optional().nullable(),
    dateStr: canonicalGregorianDate,
    duration: z.string().optional().nullable(),
    durationUnit: z.enum(["hours", "days"]).optional(),
    status: z.enum(["confirmed", "pending", "cancelled"]).default("confirmed"),
    notes: z.string().optional().nullable(),
    amount: z.string().optional().nullable(),
    deposit: z.string().optional().nullable(),
    insuranceAmount: z.string().optional().nullable(),
    source: z.enum(["platform", "whatsapp", "phone", "walk_in", "external"]).default("external"),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).default("cash"),
    paymentReceiptUrl: z.string().optional().nullable(),
    cashDeposited: z.boolean().optional().default(false),
    contractSigned: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const result = await db.transaction(async (tx) => {
    if (parsed.data.status !== "cancelled") {
      // Serialize all capacity-consuming writes for this provider and date.
      await tx.execute(sql`select pg_advisory_xact_lock(${providerId}, hashtext(${parsed.data.dateStr}))`);
      const [blockedDate] = await tx
        .select({ id: serviceBlockedDatesTable.id })
        .from(serviceBlockedDatesTable)
        .where(and(
          eq(serviceBlockedDatesTable.providerId, providerId),
          eq(serviceBlockedDatesTable.dateStr, parsed.data.dateStr),
        ))
        .limit(1);
      if (blockedDate) return { blocked: true as const };

      const [capacityRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(serviceAppointmentsTable)
        .where(and(
          eq(serviceAppointmentsTable.providerId, providerId),
          eq(serviceAppointmentsTable.dateStr, parsed.data.dateStr),
          ne(serviceAppointmentsTable.status, "cancelled"),
        ));
      const dailyCapacity = Math.max(1, provider.dailyCapacity ?? 1);
      if ((capacityRow?.count ?? 0) >= dailyCapacity) return { blocked: false as const, full: true as const, dailyCapacity };
    }

    const [row] = await tx.insert(serviceAppointmentsTable).values({
      providerId,
      ownerId: req.user.id,
      ...parsed.data,
      clientIdNumber: provider.requiresInsurance ? (parsed.data.clientIdNumber || null) : null,
      insuranceAmount: provider.requiresInsurance ? provider.insuranceAmount : null,
    }).returning();
    return { blocked: false as const, full: false as const, row };
  });

  if (result.blocked) {
    return res.status(409).json({
      error: "هذا اليوم مغلق وغير متاح للحجز",
      code: "SERVICE_DATE_BLOCKED",
    });
  }
  if (result.full) {
    return res.status(409).json({
      error: "اكتملت الطاقة الاستيعابية لهذا اليوم",
      code: "DAILY_CAPACITY_REACHED",
      dailyCapacity: result.dailyCapacity,
    });
  }
  const row = result.row;
  return res.status(201).json(row);
});

router.patch("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id || row.providerId !== providerId) return res.status(404).json({ error: "الحجز غير موجود" });
  const [provider] = await db
    .select({
      requiresInsurance: serviceProvidersTable.requiresInsurance,
      dailyCapacity: serviceProvidersTable.dailyCapacity,
    })
    .from(serviceProvidersTable)
    .where(and(
      eq(serviceProvidersTable.id, providerId),
      eq(serviceProvidersTable.ownerId, req.user.id),
    ))
    .limit(1);
  if (!provider) return res.status(404).json({ error: "المزود غير موجود" });

  const schema = z.object({
    clientName: z.string().min(1).optional(),
    clientPhone: z.string().optional().nullable(),
    serviceAddress: z.string().optional().nullable(),
    clientIdNumber: z.string().optional().nullable(),
    dateStr: canonicalGregorianDate.optional(),
    duration: z.string().optional().nullable(),
    durationUnit: z.enum(["hours", "days"]).optional(),
    status: z.enum(["confirmed", "pending", "cancelled"]).optional(),
    notes: z.string().optional().nullable(),
    amount: z.string().optional().nullable(),
    deposit: z.string().optional().nullable(),
    insuranceAmount: z.string().optional().nullable(),
    source: z.enum(["platform", "whatsapp", "phone", "walk_in", "external"]).optional(),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).optional(),
    paymentReceiptUrl: z.string().optional().nullable(),
    cashDeposited: z.boolean().optional(),
    contractSigned: z.boolean().optional(),
    cancelReason: z.string().optional().nullable(),
    cancelRefundAmount: z.string().optional().nullable(),
    editReason: z.string().optional().nullable(),
    insuranceStatus: z.enum(["held", "refunded", "deducted"]).optional(),
    insuranceDeductAmount: z.string().optional().nullable(),
    insuranceDeductNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const targetDate = parsed.data.dateStr ?? row.dateStr;
  const targetStatus = parsed.data.status ?? row.status;
  const updates: Record<string, any> = { ...parsed.data };
  if (!provider.requiresInsurance) updates.clientIdNumber = null;
  if (parsed.data.status === "cancelled" && !row.cancelledAt) {
    updates.cancelledAt = new Date();
  }
  if (parsed.data.status && parsed.data.status !== "cancelled") updates.cancelledAt = null;

  const consumesNewCapacity = targetStatus !== "cancelled" && (targetDate !== row.dateStr || row.status === "cancelled");
  const result = await db.transaction(async (tx) => {
    if (consumesNewCapacity) {
      await tx.execute(sql`select pg_advisory_xact_lock(${providerId}, hashtext(${targetDate}))`);
      const [blockedDate] = await tx
        .select({ id: serviceBlockedDatesTable.id })
        .from(serviceBlockedDatesTable)
        .where(and(
          eq(serviceBlockedDatesTable.providerId, providerId),
          eq(serviceBlockedDatesTable.dateStr, targetDate),
        ))
        .limit(1);
      if (blockedDate) return { blocked: true as const };

      const [capacityRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(serviceAppointmentsTable)
        .where(and(
          eq(serviceAppointmentsTable.providerId, providerId),
          eq(serviceAppointmentsTable.dateStr, targetDate),
          ne(serviceAppointmentsTable.status, "cancelled"),
          ne(serviceAppointmentsTable.id, apptId),
        ));
      const dailyCapacity = Math.max(1, provider.dailyCapacity ?? 1);
      if ((capacityRow?.count ?? 0) >= dailyCapacity) return { blocked: false as const, full: true as const, dailyCapacity };
    }

    const [updated] = await tx
      .update(serviceAppointmentsTable)
      .set(updates)
      .where(and(
        eq(serviceAppointmentsTable.id, apptId),
        eq(serviceAppointmentsTable.providerId, providerId),
        eq(serviceAppointmentsTable.ownerId, req.user.id),
      ))
      .returning();
    return { blocked: false as const, full: false as const, missingProvider: false as const, updated };
  });

  if ("missingProvider" in result && result.missingProvider) return res.status(404).json({ error: "المزود غير موجود" });
  if ("blocked" in result && result.blocked) {
    return res.status(409).json({
      error: "هذا اليوم مغلق وغير متاح للحجز",
      code: "SERVICE_DATE_BLOCKED",
    });
  }
  if ("full" in result && result.full) {
    return res.status(409).json({
      error: "اكتملت الطاقة الاستيعابية لهذا اليوم",
      code: "DAILY_CAPACITY_REACHED",
      dailyCapacity: result.dailyCapacity,
    });
  }
  const updated = result.updated;
  return res.json(updated);
});

router.delete("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const providerId = Number(req.params.id);
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id || row.providerId !== providerId) return res.status(404).json({ error: "الحجز غير موجود" });
  await db.delete(serviceAppointmentsTable).where(and(
    eq(serviceAppointmentsTable.id, apptId),
    eq(serviceAppointmentsTable.providerId, providerId),
    eq(serviceAppointmentsTable.ownerId, req.user.id),
  ));
  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════
   SERVICE ERP — INSURANCES (owner-wide)
   ════════════════════════════════════════════════════════ */

router.get("/my/insurances", requireAuth, async (req: any, res) => {
  const rows = await db.select().from(serviceInsurancesTable)
    .where(eq(serviceInsurancesTable.ownerId, req.user.id))
    .orderBy(desc(serviceInsurancesTable.createdAt));
  return res.json(rows);
});

router.post("/my/insurances", requireAuth, async (req: any, res) => {
  const schema = z.object({
    policyName: z.string().min(1),
    insurerName: z.string().optional().nullable(),
    amount: z.string().default("0"),
    renewalDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    providerId: z.number().int().optional().nullable(),
    refundAmount: z.string().optional().nullable(),
    refundNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const [row] = await db.insert(serviceInsurancesTable).values({
    ownerId: req.user.id, ...parsed.data,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/my/insurances/:insId", requireAuth, async (req: any, res) => {
  const insId = Number(req.params.insId);
  const [row] = await db.select().from(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "السياسة غير موجودة" });

  const schema = z.object({
    policyName: z.string().min(1).optional(),
    insurerName: z.string().optional().nullable(),
    amount: z.string().optional(),
    renewalDate: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    providerId: z.number().int().optional().nullable(),
    refundAmount: z.string().optional().nullable(),
    refundNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const [updated] = await db.update(serviceInsurancesTable).set(parsed.data).where(eq(serviceInsurancesTable.id, insId)).returning();
  return res.json(updated);
});

router.delete("/my/insurances/:insId", requireAuth, async (req: any, res) => {
  const insId = Number(req.params.insId);
  const [row] = await db.select().from(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "السياسة غير موجودة" });
  await db.delete(serviceInsurancesTable).where(eq(serviceInsurancesTable.id, insId));
  return res.json({ ok: true });
});

export default router;
