import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
  serviceBlockedDatesTable,
  serviceSeasonsTable,
  serviceAppointmentsTable,
  serviceInsurancesTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  return next();
}

/* ── Public: list approved providers ─────────────── */
router.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const conditions = [eq(serviceProvidersTable.isActive, true)] as ReturnType<typeof eq>[];
  if (category && category !== "all") {
    conditions.push(eq(serviceProvidersTable.category, category));
  }
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(and(...conditions))
    .orderBy(serviceProvidersTable.createdAt);
  return res.json(rows.reverse());
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
    .where(eq(serviceProviderSubmissionsTable.ownerId, req.user.id))
    .orderBy(serviceProviderSubmissionsTable.createdAt);
  return res.json(rows.reverse());
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
    coverageTags: z.array(z.string()).optional(),
    customFeatureTags: z.array(z.string()).optional(),
    photoCaptions: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const [updated] = await db.update(serviceProvidersTable).set(parsed.data).where(eq(serviceProvidersTable.id, id)).returning();
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

  // upsert — ignore if date already blocked
  const existing = await db.select().from(serviceBlockedDatesTable)
    .where(and(eq(serviceBlockedDatesTable.providerId, providerId), eq(serviceBlockedDatesTable.dateStr, parsed.data.dateStr)))
    .limit(1);
  if (existing.length > 0) return res.json(existing[0]);

  const [row] = await db.insert(serviceBlockedDatesTable).values({
    providerId, ownerId: req.user.id, dateStr: parsed.data.dateStr, reason: parsed.data.reason ?? null,
  }).returning();
  return res.status(201).json(row);
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
    dateStr: z.string().min(1),
    duration: z.string().optional().nullable(),
    status: z.enum(["confirmed", "pending", "cancelled"]).default("confirmed"),
    notes: z.string().optional().nullable(),
    amount: z.string().optional().nullable(),
    deposit: z.string().optional().nullable(),
    insuranceAmount: z.string().optional().nullable(),
    source: z.enum(["platform", "whatsapp", "phone", "walk_in", "external"]).default("external"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors: parsed.error.flatten().fieldErrors });

  const [row] = await db.insert(serviceAppointmentsTable).values({
    providerId, ownerId: req.user.id, ...parsed.data,
  }).returning();
  return res.status(201).json(row);
});

router.patch("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الحجز غير موجود" });

  const schema = z.object({
    clientName: z.string().min(1).optional(),
    clientPhone: z.string().optional().nullable(),
    dateStr: z.string().optional(),
    duration: z.string().optional().nullable(),
    status: z.enum(["confirmed", "pending", "cancelled"]).optional(),
    notes: z.string().optional().nullable(),
    amount: z.string().optional().nullable(),
    cancelReason: z.string().optional().nullable(),
    insuranceStatus: z.enum(["held", "refunded", "deducted"]).optional(),
    insuranceDeductAmount: z.string().optional().nullable(),
    insuranceDeductNote: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "بيانات غير صحيحة" });

  const updates: Record<string, any> = { ...parsed.data };
  if (parsed.data.status === "cancelled" && !row.cancelledAt) {
    updates.cancelledAt = new Date();
  }
  const [updated] = await db.update(serviceAppointmentsTable).set(updates).where(eq(serviceAppointmentsTable.id, apptId)).returning();
  return res.json(updated);
});

router.delete("/my/approved/:id/appointments/:apptId", requireAuth, async (req: any, res) => {
  const apptId = Number(req.params.apptId);
  const [row] = await db.select().from(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId)).limit(1);
  if (!row || row.ownerId !== req.user.id) return res.status(404).json({ error: "الحجز غير موجود" });
  await db.delete(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.id, apptId));
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
