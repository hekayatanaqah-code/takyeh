import { Router } from "express";
import { db } from "@workspace/db";
import {
  chaletSubmissionsTable,
  chaletsTable,
  citiesCatalogTable,
  districtsCatalogTable,
  amenitiesCatalogTable,
  externalServicesTable,
  chaletCategoriesTable,
  serviceCategoriesTable,
  expenseCategoriesTable,
  siteSettingsTable,
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
  subscriptionPlansTable,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId || req.user.id !== adminId) {
    res.status(403).json({ error: "غير مصرح لك بالدخول" });
    return;
  }
  next();
}

router.use(requireAdmin);

/* ── Submissions ─────────────────────────────────────────── */

router.get("/submissions", async (_req, res) => {
  const rows = await db
    .select()
    .from(chaletSubmissionsTable)
    .orderBy(chaletSubmissionsTable.createdAt);
  return res.json(rows.reverse());
});

router.patch("/submissions/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    status: z.enum(["pending", "approved", "rejected", "needs_revision"]),
    adminNote: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const updateData: Record<string, unknown> = {
    status: body.data.status,
    adminNote: body.data.adminNote ?? null,
  };
  if (body.data.status === "approved") {
    updateData.trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [submission] = await db
      .select()
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, id))
      .limit(1);

    if (submission) {
      await db.insert(chaletsTable).values({
        submissionId: submission.id,
        nameAr: submission.nameAr,
        descriptionAr: submission.descriptionAr,
        location: submission.location,
        district: submission.district ?? undefined,
        category: submission.category ?? undefined,
        propertyType: submission.propertyType ?? undefined,
        sections: submission.sections ?? undefined,
        pricePerNight: String(submission.pricePerNight ?? 0),
        priceMorning: submission.priceMorning ?? undefined,
        priceEvening: submission.priceEvening ?? undefined,
        priceFullDay: submission.priceFullDay ?? undefined,
        slotMorning: submission.slotMorning ?? true,
        slotEvening: submission.slotEvening ?? true,
        slotFullDay: submission.slotFullDay ?? true,
        priceWeekday: submission.priceWeekday ?? undefined,
        priceWeekend: submission.priceWeekend ?? undefined,
        seasonalDisclaimer: submission.seasonalDisclaimer ?? true,
        maxGuests: submission.maxGuests ?? null,
        bedrooms: submission.bedrooms ?? null,
        morningCheckIn: submission.morningCheckIn ?? null,
        morningCheckOut: submission.morningCheckOut ?? null,
        eveningCheckIn: submission.eveningCheckIn ?? null,
        eveningCheckOut: submission.eveningCheckOut ?? null,
        fullDayCheckIn: submission.fullDayCheckIn ?? null,
        fullDayCheckOut: submission.fullDayCheckOut ?? null,
        amenities: submission.amenities ?? [],
        photos: submission.photos ?? [],
        videoUrl: submission.videoUrl ?? null,
        whatsappNumber: submission.whatsappNumber,
        mapsUrl: submission.mapsUrl ?? undefined,
        socialLink: submission.socialLink ?? null,
        termsAndConditions: submission.termsAndConditions ?? null,
        isVerified: false,
      }).onConflictDoNothing();
    }
  }

  await db
    .update(chaletSubmissionsTable)
    .set(updateData)
    .where(eq(chaletSubmissionsTable.id, id));

  return res.json({ ok: true });
});

router.delete("/submissions/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id));
  return res.json({ ok: true });
});

/* ── Chalets Verification ────────────────────────────────── */

router.get("/chalets", async (_req, res) => {
  const rows = await db
    .select()
    .from(chaletsTable)
    .orderBy(chaletsTable.id);
  return res.json(rows);
});

router.patch("/chalets/:id/verify", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ isVerified: z.boolean() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  await db
    .update(chaletsTable)
    .set({ isVerified: body.data.isVerified })
    .where(eq(chaletsTable.id, id));

  return res.json({ ok: true });
});

/* ── Owners ──────────────────────────────────────────────── */

router.get("/owners", async (_req, res) => {
  const rows = await db
    .select({
      ownerId: chaletSubmissionsTable.ownerId,
      whatsappNumber: chaletSubmissionsTable.whatsappNumber,
      nameAr: chaletSubmissionsTable.nameAr,
      createdAt: chaletSubmissionsTable.createdAt,
    })
    .from(chaletSubmissionsTable)
    .orderBy(chaletSubmissionsTable.createdAt);

  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    if (!r.ownerId || seen.has(r.ownerId)) return false;
    seen.add(r.ownerId);
    return true;
  });

  return res.json(unique);
});

/* ── Cities ──────────────────────────────────────────────── */

router.get("/cities", async (_req, res) => {
  const rows = await db
    .select()
    .from(citiesCatalogTable)
    .orderBy(citiesCatalogTable.createdAt);
  return res.json(rows);
});

router.post("/cities", async (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "الاسم مطلوب" });

  const [city] = await db
    .insert(citiesCatalogTable)
    .values({ name: body.data.name })
    .returning();

  return res.status(201).json(city);
});

router.patch("/cities/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ name: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  await db
    .update(citiesCatalogTable)
    .set(body.data)
    .where(eq(citiesCatalogTable.id, id));

  return res.json({ ok: true });
});

router.delete("/cities/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(citiesCatalogTable).where(eq(citiesCatalogTable.id, id));
  return res.json({ ok: true });
});

/* ── Districts ───────────────────────────────────────────── */

router.get("/districts", async (_req, res) => {
  const rows = await db
    .select()
    .from(districtsCatalogTable)
    .orderBy(districtsCatalogTable.cityId, districtsCatalogTable.createdAt);
  return res.json(rows);
});

router.post("/districts", async (req, res) => {
  const body = z.object({ name: z.string().min(1), cityId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [district] = await db
    .insert(districtsCatalogTable)
    .values({ name: body.data.name, cityId: body.data.cityId })
    .returning();

  return res.status(201).json(district);
});

router.delete("/districts/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(districtsCatalogTable).where(eq(districtsCatalogTable.id, id));
  return res.json({ ok: true });
});

/* ── Amenities ───────────────────────────────────────────── */

router.get("/amenities", async (_req, res) => {
  const rows = await db
    .select()
    .from(amenitiesCatalogTable)
    .orderBy(amenitiesCatalogTable.createdAt);
  return res.json(rows);
});

router.post("/amenities", async (req, res) => {
  const body = z.object({ key: z.string().min(1), labelAr: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [amenity] = await db
    .insert(amenitiesCatalogTable)
    .values({ key: body.data.key, labelAr: body.data.labelAr })
    .returning();

  return res.status(201).json(amenity);
});

router.patch("/amenities/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ labelAr: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  await db
    .update(amenitiesCatalogTable)
    .set(body.data)
    .where(eq(amenitiesCatalogTable.id, id));

  return res.json({ ok: true });
});

router.delete("/amenities/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(amenitiesCatalogTable).where(eq(amenitiesCatalogTable.id, id));
  return res.json({ ok: true });
});

/* ── External Services ───────────────────────── */

router.get("/services", async (_req, res) => {
  const rows = await db
    .select()
    .from(externalServicesTable)
    .orderBy(externalServicesTable.createdAt);
  return res.json(rows.reverse());
});

router.post("/services", async (req, res) => {
  const body = z.object({
    nameAr: z.string().min(1),
    category: z.enum(["bounce_houses", "ice_cream", "productive_families"]),
    descriptionAr: z.string().min(1),
    whatsappNumber: z.string().min(1),
    price: z.number().positive().optional(),
    priceNote: z.string().optional(),
    city: z.string().optional(),
    photos: z.array(z.string()).optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [svc] = await db
    .insert(externalServicesTable)
    .values({
      ...body.data,
      price: body.data.price != null ? String(body.data.price) : null,
      photos: body.data.photos ?? [],
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  return res.status(201).json(svc);
});

router.patch("/services/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    nameAr: z.string().min(1).optional(),
    category: z.enum(["bounce_houses", "ice_cream", "productive_families"]).optional(),
    descriptionAr: z.string().min(1).optional(),
    whatsappNumber: z.string().min(1).optional(),
    price: z.number().positive().nullable().optional(),
    priceNote: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const updateData: Record<string, unknown> = { ...body.data };
  if ("price" in body.data && body.data.price != null) {
    updateData.price = String(body.data.price);
  }

  await db.update(externalServicesTable).set(updateData).where(eq(externalServicesTable.id, id));
  return res.json({ ok: true });
});

router.delete("/services/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(externalServicesTable).where(eq(externalServicesTable.id, id));
  return res.json({ ok: true });
});

/* ── Chalet Categories ───────────────────────── */

router.get("/categories", async (_req, res) => {
  const rows = await db.select().from(chaletCategoriesTable).orderBy(chaletCategoriesTable.createdAt);
  return res.json(rows);
});

router.post("/categories", async (req, res) => {
  const body = z.object({ nameAr: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "الاسم مطلوب" });
  const [row] = await db.insert(chaletCategoriesTable).values({ nameAr: body.data.nameAr }).returning();
  return res.status(201).json(row);
});

router.patch("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ nameAr: z.string().min(1).optional(), isActive: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.update(chaletCategoriesTable).set(body.data).where(eq(chaletCategoriesTable.id, id));
  return res.json({ ok: true });
});

router.delete("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(chaletCategoriesTable).where(eq(chaletCategoriesTable.id, id));
  return res.json({ ok: true });
});

/* ── Service Categories ──────────────────────── */

router.get("/service-categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(serviceCategoriesTable)
    .orderBy(serviceCategoriesTable.sortOrder, serviceCategoriesTable.createdAt);
  return res.json(rows);
});

router.post("/service-categories", async (req, res) => {
  const body = z.object({
    key: z.string().min(1),
    labelAr: z.string().min(1),
    emoji: z.string().default("✨"),
    sortOrder: z.number().int().default(0),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const [row] = await db.insert(serviceCategoriesTable).values(body.data).returning();
  return res.status(201).json(row);
});

router.patch("/service-categories/reorder", async (req, res) => {
  const body = z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await Promise.all(
    body.data.map(({ id, sortOrder }) =>
      db.update(serviceCategoriesTable).set({ sortOrder }).where(eq(serviceCategoriesTable.id, id))
    )
  );
  return res.json({ ok: true });
});

router.patch("/service-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    labelAr: z.string().min(1).optional(),
    emoji: z.string().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.update(serviceCategoriesTable).set(body.data).where(eq(serviceCategoriesTable.id, id));
  return res.json({ ok: true });
});

router.delete("/service-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [cat] = await db
    .select({ key: serviceCategoriesTable.key })
    .from(serviceCategoriesTable)
    .where(eq(serviceCategoriesTable.id, id))
    .limit(1);
  if (cat && cat.key !== "other") {
    await db
      .update(serviceProviderSubmissionsTable)
      .set({ category: "other" })
      .where(eq(serviceProviderSubmissionsTable.category, cat.key));
    await db
      .update(serviceProvidersTable)
      .set({ category: "other" })
      .where(eq(serviceProvidersTable.category, cat.key));
  }
  await db.delete(serviceCategoriesTable).where(eq(serviceCategoriesTable.id, id));
  return res.json({ ok: true });
});

/* ── Expense Categories ──────────────────────────────────────── */

const DEFAULT_EXPENSE_CATS = [
  { name: "الرواتب",     emoji: "💰", color: "blue",   isOther: false, sortOrder: 0 },
  { name: "الكهرباء",    emoji: "⚡", color: "yellow", isOther: false, sortOrder: 1 },
  { name: "الماء",       emoji: "💧", color: "cyan",   isOther: false, sortOrder: 2 },
  { name: "الإنترنت",    emoji: "🌐", color: "purple", isOther: false, sortOrder: 3 },
  { name: "الصيانة",     emoji: "🔧", color: "orange", isOther: false, sortOrder: 4 },
  { name: "المستلزمات",  emoji: "📦", color: "green",  isOther: false, sortOrder: 5 },
  { name: "أخرى",        emoji: "✨", color: "slate",  isOther: true,  sortOrder: 6 },
];

router.get("/expense-categories", async (_req, res) => {
  let rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.sortOrder, expenseCategoriesTable.createdAt);
  if (rows.length === 0) {
    rows = await db.insert(expenseCategoriesTable).values(DEFAULT_EXPENSE_CATS).returning();
  }
  return res.json(rows);
});

router.post("/expense-categories", async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    emoji: z.string().default("✨"),
    color: z.string().default("slate"),
    isOther: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const [row] = await db.insert(expenseCategoriesTable).values(body.data).returning();
  return res.status(201).json(row);
});

router.patch("/expense-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    name: z.string().min(1).optional(),
    emoji: z.string().optional(),
    color: z.string().optional(),
    isOther: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.update(expenseCategoriesTable).set(body.data).where(eq(expenseCategoriesTable.id, id));
  return res.json({ ok: true });
});

router.delete("/expense-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
  return res.json({ ok: true });
});

/* ── Site Settings ───────────────────────────── */

router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(siteSettingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return res.json(map);
});

/* ── Service Provider Submissions (Admin) ──────────────────── */

router.get("/service-submissions", async (_req, res) => {
  const rows = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .orderBy(serviceProviderSubmissionsTable.createdAt);
  return res.json(rows.reverse());
});

router.patch("/service-submissions/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    status: z.enum(["pending", "approved", "rejected", "needs_revision"]),
    adminNote: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const updateData: Record<string, unknown> = {
    status: body.data.status,
    adminNote: body.data.adminNote ?? null,
  };

  if (body.data.status === "approved") {
    const [submission] = await db
      .select()
      .from(serviceProviderSubmissionsTable)
      .where(eq(serviceProviderSubmissionsTable.id, id))
      .limit(1);

    if (submission) {
      await db.insert(serviceProvidersTable).values({
        businessName: submission.businessName,
        category: submission.category,
        city: submission.city,
        descriptionAr: submission.descriptionAr ?? undefined,
        whatsappNumber: submission.whatsappNumber,
        logoUrl: submission.logoUrl ?? undefined,
        galleryPhotos: submission.galleryPhotos ?? [],
        videoUrl: submission.videoUrl ?? undefined,
        yearsOfExperience: submission.yearsOfExperience ?? undefined,
        coverageTags: submission.coverageTags ?? [],
        customFeatureTags: submission.customFeatureTags ?? [],
        isActive: true,
      }).onConflictDoNothing();
    }
  }

  await db
    .update(serviceProviderSubmissionsTable)
    .set(updateData)
    .where(eq(serviceProviderSubmissionsTable.id, id));

  return res.json({ ok: true });
});

router.delete("/service-submissions/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(serviceProviderSubmissionsTable).where(eq(serviceProviderSubmissionsTable.id, id));
  return res.json({ ok: true });
});

router.patch("/settings", async (req, res) => {
  const body = z.record(z.string(), z.string()).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  for (const [key, value] of Object.entries(body.data)) {
    await db
      .insert(siteSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  return res.json({ ok: true });
});

/* ── Subscription Plans Management ──────────────────────── */

const PlanSchema = z.object({
  slug: z.string().min(1),
  nameAr: z.string().min(1),
  price: z.number().min(0),
  durationDays: z.number().int().min(1),
  trialDays: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

router.get("/plans", async (_req, res) => {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.id);
  return res.json(plans);
});

router.post("/plans", async (req, res) => {
  const parsed = PlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صحيحة", issues: parsed.error.issues });
  const { slug, nameAr, price, durationDays, trialDays, features, isActive, sortOrder } = parsed.data;
  const [plan] = await db
    .insert(subscriptionPlansTable)
    .values({ slug, nameAr, price: String(price), durationDays, trialDays, features, isActive, sortOrder })
    .returning();
  return res.json(plan);
});

router.put("/plans/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = PlanSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const { price, ...rest } = parsed.data;
  const [plan] = await db
    .update(subscriptionPlansTable)
    .set({ ...rest, ...(price !== undefined ? { price: String(price) } : {}) })
    .where(eq(subscriptionPlansTable.id, id))
    .returning();
  if (!plan) return res.status(404).json({ error: "الخطة غير موجودة" });
  return res.json(plan);
});

router.delete("/plans/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, id));
  return res.json({ ok: true });
});

export default router;
