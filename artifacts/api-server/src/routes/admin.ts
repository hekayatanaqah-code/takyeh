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
  adminStaffTable,
  adminSessionsTable,
  ownerBookingsTable,
  ownerStaffTable,
  ownerExpensesTable,
  customerNotesTable,
  ownerSubscriptionsTable,
} from "@workspace/db/schema";
import { eq, inArray, and, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";

declare global {
  namespace Express {
    interface Request {
      isSuperAdmin?: boolean;
      adminStaff?: typeof adminStaffTable.$inferSelect;
    }
  }
}

const router = Router();

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
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

/* ── requireSuperAdmin — allows OIDC admin OR DB-based super admin ── */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  /* Already verified by requireAdminOrAdminStaff global middleware */
  if ((req as any).isSuperAdmin) return next();
  /* Legacy OIDC path (fallback) */
  const adminId = process.env.ADMIN_USER_ID;
  if (req.isAuthenticated() && adminId && req.user?.id === adminId) return next();
  res.status(403).json({ error: "المشرف العام فقط يملك هذه الصلاحية" });
}

export async function requireAdminOrAdminStaff(req: Request, res: Response, next: NextFunction) {
  /* ── 1. OIDC super admin (legacy / Replit-hosted) ── */
  const adminId = process.env.ADMIN_USER_ID;
  if (req.isAuthenticated() && adminId && req.user?.id === adminId) {
    req.isSuperAdmin = true;
    return next();
  }

  /* ── 2. DB-based admin staff (username/password portal) ── */
  const sid = req.cookies?.admin_staff_sid;
  if (sid) {
    const [session] = await db.select().from(adminSessionsTable)
      .where(and(eq(adminSessionsTable.sid, sid), gt(adminSessionsTable.expire, new Date())));
    if (session) {
      const [member] = await db.select().from(adminStaffTable)
        .where(eq(adminStaffTable.id, session.adminStaffId));
      if (member?.isActive) {
        req.adminStaff = member;
        /* If flagged as super admin in the DB, grant full privileges */
        if ((member as any).isSuperAdmin) req.isSuperAdmin = true;
        return next();
      }
    }
  }

  res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
}

/* ── Impersonation status — no auth required (reads admin cookie only) ── */
router.get("/impersonation-status", async (req, res) => {
  const sid = req.cookies?.admin_staff_sid;
  if (!sid) return res.json({ impersonating: false });

  const rows = await db.execute<{ impersonated_owner_id: string | null; name: string }>(
    sql`
      SELECT s.impersonated_owner_id, a.name
      FROM admin_sessions s
      JOIN admin_staff a ON a.id = s.admin_staff_id
      WHERE s.sid = ${sid} AND s.expire > now()
      LIMIT 1
    `
  );
  const row = rows[0];
  if (!row || !row.impersonated_owner_id) return res.json({ impersonating: false });

  /* Fetch the owner's chalet name for display */
  const ownerRows = await db.execute<{ name_ar: string }>(
    sql`SELECT name_ar FROM chalet_submissions WHERE owner_id = ${row.impersonated_owner_id} ORDER BY created_at ASC LIMIT 1`
  );
  const ownerName = ownerRows[0]?.name_ar ?? null;

  return res.json({
    impersonating: true,
    ownerId: row.impersonated_owner_id,
    adminName: row.name,
    ownerName,
  });
});

router.use(requireAdminOrAdminStaff);

/* ── Access Check ─────────────────────────────────────────── */
router.get("/access-check", (req, res) => {
  if (req.isSuperAdmin) {
    return res.json({ ok: true, role: "superAdmin", permissions: {} });
  }
  return res.json({ ok: true, role: "adminStaff", permissions: req.adminStaff?.permissions ?? {} });
});

/* ── Admin Staff CRUD (super admin only) ──────────────────── */
router.get("/staff", requireSuperAdmin, async (_req, res) => {
  const rows = await db.select({
    id: adminStaffTable.id,
    name: adminStaffTable.name,
    username: adminStaffTable.username,
    permissions: adminStaffTable.permissions,
    isActive: adminStaffTable.isActive,
    isSuperAdmin: adminStaffTable.isSuperAdmin,
    createdAt: adminStaffTable.createdAt,
  }).from(adminStaffTable)
    .where(eq(adminStaffTable.isSuperAdmin, false))
    .orderBy(adminStaffTable.createdAt);
  return res.json(rows);
});

router.post("/staff", requireSuperAdmin, async (req, res) => {
  const { name, username, password, permissions } = req.body ?? {};
  if (!name || !username || !password) {
    return res.status(400).json({ error: "يرجى تعبئة الاسم واسم المستخدم وكلمة المرور" });
  }
  const passwordHash = await bcrypt.hash(String(password), 10);
  const [staff] = await db.insert(adminStaffTable)
    .values({ name: String(name), username: String(username).trim(), passwordHash, permissions: permissions ?? {} })
    .returning({ id: adminStaffTable.id, name: adminStaffTable.name, username: adminStaffTable.username, permissions: adminStaffTable.permissions, isActive: adminStaffTable.isActive, createdAt: adminStaffTable.createdAt });
  return res.json(staff);
});

router.put("/staff/:id/permissions", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { permissions } = req.body ?? {};
  await db.update(adminStaffTable).set({ permissions: permissions ?? {} }).where(eq(adminStaffTable.id, id));
  return res.json({ ok: true });
});

router.put("/staff/:id/credentials", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { username, password } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (username) updates.username = String(username).trim();
  if (password) updates.passwordHash = await bcrypt.hash(String(password), 10);
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "لا توجد بيانات للتحديث" });
  await db.update(adminStaffTable).set(updates).where(eq(adminStaffTable.id, id));
  return res.json({ ok: true });
});

router.put("/staff/:id/status", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { isActive } = req.body ?? {};
  await db.update(adminStaffTable).set({ isActive: Boolean(isActive) }).where(eq(adminStaffTable.id, id));
  return res.json({ ok: true });
});

router.delete("/staff/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(adminStaffTable).where(eq(adminStaffTable.id, id));
  return res.json({ ok: true });
});

/* ── Change own password (any logged-in admin/staff) ──────── */
router.put("/change-password", async (req, res) => {
  const sid = req.cookies?.admin_staff_sid;
  if (!sid) return res.status(401).json({ error: "جلسة غير موجودة" });

  const [session] = await db.select().from(adminSessionsTable)
    .where(and(eq(adminSessionsTable.sid, sid), gt(adminSessionsTable.expire, new Date())));
  if (!session) return res.status(401).json({ error: "انتهت الجلسة" });

  const [member] = await db.select().from(adminStaffTable)
    .where(eq(adminStaffTable.id, session.adminStaffId));
  if (!member) return res.status(404).json({ error: "الحساب غير موجود" });

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "يرجى إدخال كلمة المرور الحالية والجديدة" });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
  }

  const valid = await bcrypt.compare(String(currentPassword), member.passwordHash);
  if (!valid) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });

  const newHash = await bcrypt.hash(String(newPassword), 10);
  await db.update(adminStaffTable).set({ passwordHash: newHash }).where(eq(adminStaffTable.id, member.id));
  return res.json({ ok: true });
});

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
    const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    updateData.trialEndsAt = trialExpiry;

    const [submission] = await db
      .select()
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, id))
      .limit(1);

    if (submission?.ownerId) {
      // Create or refresh a free-trial subscription for the owner
      const existingSub = await db
        .select()
        .from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, submission.ownerId))
        .limit(1);
      if (existingSub.length === 0) {
        await db.insert(ownerSubscriptionsTable).values({
          ownerId: submission.ownerId,
          plan: "trial",
          status: "active",
          paymentStatus: "free",
          expiresAt: trialExpiry,
        }).onConflictDoNothing();
      }
    }

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
        dailyPrices: submission.dailyPrices ?? null,
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
        ownerId: submission.ownerId ?? null,
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

/* ══════════════════════════════════════════════════════
   Partner Applications (owner / service provider signups)
   ══════════════════════════════════════════════════════ */
router.get("/applications", async (_req, res) => {
  const rows = await db.execute<{
    id: number; full_name: string; business_name: string; business_type: string;
    phone: string; email: string; status: string; docs_status: string; created_at: string;
  }>(
    sql`SELECT id, full_name, business_name, business_type, phone, email, status,
               COALESCE(docs_status, 'pending_docs') as docs_status, created_at
        FROM owner_applications ORDER BY created_at DESC`
  );
  return res.json(rows.rows);
});

/* ══════════════════════════════════════════════════════
   Demo Preview  (Super-Admin only — sandbox with fake data)
   ══════════════════════════════════════════════════════ */
const DEMO_OWNER_ID = "__demo_preview__";

function demoDateStr(today: Date, offsetDays: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

router.post("/demo-preview", async (req, res) => {
  if (!(req as any).isSuperAdmin) {
    return res.status(403).json({ error: "المشرف العام فقط" });
  }
  const sid = req.cookies?.admin_staff_sid;
  if (!sid) return res.status(401).json({ error: "جلسة الإدارة غير موجودة" });

  const today = new Date();

  /* Always reset demo data so the sandbox is fresh on every click */
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, DEMO_OWNER_ID));
  await db.delete(ownerStaffTable).where(eq(ownerStaffTable.ownerId, DEMO_OWNER_ID));
  await db.delete(ownerExpensesTable).where(eq(ownerExpensesTable.ownerId, DEMO_OWNER_ID));
  await db.execute(sql`DELETE FROM customer_notes WHERE owner_id = ${DEMO_OWNER_ID}`);
  await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, DEMO_OWNER_ID));

  {
    /* ── 1. Demo chalet submission ── */
    const [newSub] = await db.insert(chaletSubmissionsTable).values({
      ownerId: DEMO_OWNER_ID,
      nameAr: "شاليه النخيل التجريبي",
      whatsappNumber: "0501234567",
      location: "القصيم - بريدة",
      district: "حي الروضة",
      category: "شاليه",
      descriptionAr: "شاليه تجريبي لاختبار ميزات منصة تكية — البيانات افتراضية ولا تؤثر على أي مستخدم حقيقي",
      pricePerNight: "500",
      priceMorning: "300",
      priceEvening: "350",
      priceFullDay: "600",
      priceWeekday: "450",
      priceWeekend: "600",
      maxGuests: 20,
      bedrooms: 4,
      status: "approved",
      trialEndsAt: new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()),
    }).returning({ id: chaletSubmissionsTable.id });
    const subId = newSub.id;

    /* ── 2. Demo bookings — 5 repeat customers with history ── */
    const demoBookings = [
      /* أحمد العتيبي — 3 bookings (VIP repeat customer) */
      { offset: -45, name: "أحمد العتيبي",   phone: "0501111222", period: "full_day", amount: "600", deposit: "200" },
      { offset: -20, name: "أحمد العتيبي",   phone: "0501111222", period: "full_day", amount: "600", deposit: "200" },
      { offset: -3,  name: "أحمد العتيبي",   phone: "0501111222", period: "evening",  amount: "350", deposit: "100" },
      /* فيصل الحربي — 2 bookings */
      { offset: -30, name: "فيصل الحربي",    phone: "0552223333", period: "morning",  amount: "300", deposit: "100" },
      { offset: -8,  name: "فيصل الحربي",    phone: "0552223333", period: "full_day", amount: "600", deposit: "200" },
      /* سلطان الزهراني — 2 bookings */
      { offset: -25, name: "سلطان الزهراني", phone: "0533334444", period: "evening",  amount: "350", deposit: "150" },
      { offset: 4,   name: "سلطان الزهراني", phone: "0533334444", period: "full_day", amount: "600", deposit: "200" },
      /* خالد المطيري — 1 booking */
      { offset: 9,   name: "خالد المطيري",   phone: "0544445555", period: "evening",  amount: "350", deposit: "100" },
      /* نورة القحطاني — 2 bookings */
      { offset: -15, name: "نورة القحطاني",  phone: "0555556666", period: "morning",  amount: "300", deposit: "100" },
      { offset: 15,  name: "نورة القحطاني",  phone: "0555556666", period: "full_day", amount: "600", deposit: "200" },
    ];
    for (const b of demoBookings) {
      await db.insert(ownerBookingsTable).values({
        ownerId: DEMO_OWNER_ID,
        submissionId: subId,
        clientName: b.name,
        clientPhone: b.phone,
        bookingDate: demoDateStr(today, b.offset),
        durationDays: 1,
        period: b.period,
        source: "external",
        revenueAmount: b.amount,
        totalPrice: b.amount,
        depositPaid: b.deposit,
      });
    }

    /* ── 3. Demo staff ── */
    await db.insert(ownerStaffTable).values([
      {
        ownerId: DEMO_OWNER_ID,
        name: "محمد العمري",
        baseSalary: "3000",
        permissions: { dashboardAccess: true, bookingsControl: true, financialAccess: true },
      },
      {
        ownerId: DEMO_OWNER_ID,
        name: "سعد الدوسري",
        baseSalary: "2500",
        permissions: { dashboardAccess: true, bookingsControl: true },
      },
    ]);

    /* ── 4. Demo expenses ── */
    await db.insert(ownerExpensesTable).values([
      { ownerId: DEMO_OWNER_ID, submissionId: subId, category: "صيانة",  dateStr: demoDateStr(today, -18), amount: "850",  notes: "إصلاح مكيف الغرفة الرئيسية" },
      { ownerId: DEMO_OWNER_ID, submissionId: subId, category: "نظافة",  dateStr: demoDateStr(today, -9),  amount: "400",  notes: "تنظيف شامل بعد حجز" },
      { ownerId: DEMO_OWNER_ID, submissionId: subId, category: "كهرباء", dateStr: demoDateStr(today, -4),  amount: "620",  notes: "فاتورة الكهرباء الشهرية" },
    ]);
  }

  /* ── 5. Customer notes (fresh insert — old notes deleted above) ── */
  await db.insert(customerNotesTable).values([
    { ownerId: DEMO_OWNER_ID, clientPhone: "0501111222", notes: "عميل VIP — يفضل الدفع نقداً، يحجز دائماً ليلة الخميس والجمعة. أرسل هدية ترحيبية في آخر زيارة." },
    { ownerId: DEMO_OWNER_ID, clientPhone: "0552223333", notes: "عائلة كبيرة (8 أفراد)، يحتاج غرفة إضافية. تواصل سابق لاستفسار عن خصم الحجز المتكرر." },
    { ownerId: DEMO_OWNER_ID, clientPhone: "0533334444", notes: "يحب الهدوء — لا يريد جيران بجانبه. طلب مرة صواني فطور. يفضل التواصل على واتساب." },
    { ownerId: DEMO_OWNER_ID, clientPhone: "0544445555", notes: "جديد — حجز أول مرة. تابع ما إذا أعجبه الشاليه وابعث له رابط تقييم." },
    { ownerId: DEMO_OWNER_ID, clientPhone: "0555556666", notes: "تحب الديكور الأبيض والنظافة العالية. دائماً تنسّق مسبقاً لترتيب الورود عند الوصول." },
  ]);

  /* ── Set impersonation to demo owner ── */
  await db.execute(
    sql`UPDATE admin_sessions SET impersonated_owner_id = ${DEMO_OWNER_ID} WHERE sid = ${sid}`
  );

  return res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════
   Owner Impersonation  (Super-Admin only)
   ══════════════════════════════════════════════════════ */
router.post("/impersonate", async (req, res) => {
  if (!(req as any).isSuperAdmin) {
    return res.status(403).json({ error: "المشرف العام فقط يملك هذه الصلاحية" });
  }
  const ownerId = String(req.body?.ownerId ?? "").trim();
  if (!ownerId) return res.status(400).json({ error: "ownerId مطلوب" });

  const sid = req.cookies?.admin_staff_sid;
  if (!sid) return res.status(401).json({ error: "جلسة الإدارة غير موجودة" });

  await db.execute(
    sql`UPDATE admin_sessions SET impersonated_owner_id = ${ownerId} WHERE sid = ${sid}`
  );
  return res.json({ ok: true });
});

router.post("/impersonate/end", async (_req, res) => {
  const sid = (_req as any).cookies?.admin_staff_sid;
  if (sid) {
    await db.execute(
      sql`UPDATE admin_sessions SET impersonated_owner_id = NULL WHERE sid = ${sid}`
    );
  }
  return res.json({ ok: true });
});

/* ── Audit Log (edit-mode activation) ──────────────── */
router.post("/audit-log", async (req, res) => {
  const { action, targetOwnerId } = req.body ?? {};
  const adminName = (req as any).adminStaff?.name ?? (req as any).user?.name ?? "مجهول";
  const adminId   = (req as any).adminStaff?.id   ?? (req as any).user?.id  ?? null;

  /* Persist in DB so it survives restarts */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id         SERIAL PRIMARY KEY,
      admin_id   TEXT,
      admin_name TEXT,
      action     TEXT NOT NULL,
      target_owner_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    INSERT INTO admin_audit_logs (admin_id, admin_name, action, target_owner_id)
    VALUES (${String(adminId)}, ${adminName}, ${String(action ?? "")}, ${String(targetOwnerId ?? "")})
  `);

  return res.json({ ok: true, logged: true });
});

router.patch("/applications/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["approved", "rejected", "pending"].includes(String(status))) {
    return res.status(400).json({ error: "الحالة غير صحيحة" });
  }
  await db.execute(
    sql`UPDATE owner_applications SET status = ${String(status)} WHERE id = ${Number(req.params.id)}`
  );
  return res.json({ ok: true });
});

router.patch("/applications/:id/docs", async (req, res) => {
  const { docs_status } = req.body ?? {};
  if (!["pending_docs", "docs_submitted", "verified"].includes(String(docs_status))) {
    return res.status(400).json({ error: "حالة التوثيق غير صحيحة" });
  }
  await db.execute(
    sql`UPDATE owner_applications SET docs_status = ${String(docs_status)} WHERE id = ${Number(req.params.id)}`
  );
  return res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════
   Platform Budget — subscriptions income vs platform expenses → net profit
   ══════════════════════════════════════════════════════ */
router.get("/platform-revenue", async (_req, res) => {
  // Subscription revenue
  const subRows = await db.execute<{
    plan: string; count: string; plan_price: string;
  }>(sql`
    SELECT os.plan,
           COUNT(*) as count,
           COALESCE(sp.price::text, '0') as plan_price
    FROM owner_subscriptions os
    LEFT JOIN subscription_plans sp ON sp.slug = os.plan
    WHERE os.payment_status = 'paid'
    GROUP BY os.plan, sp.price
  `);

  const breakdown = subRows.rows.map(r => ({
    plan: r.plan,
    count: Number(r.count),
    planPrice: Number(r.plan_price),
    total: Number(r.count) * Number(r.plan_price),
  }));
  const totalSubscriptionRevenue = breakdown.reduce((s, r) => s + r.total, 0);
  const totalSubCount = breakdown.reduce((s, r) => s + r.count, 0);

  // Platform expenses — stored as owner_expenses with owner_id = '__platform__'
  const expRows = await db.execute<{
    id: number; date_str: string; category: string; custom_category: string;
    amount: string; notes: string;
  }>(sql`
    SELECT id, date_str, category, custom_category, amount, notes
    FROM owner_expenses
    WHERE owner_id = '__platform__'
    ORDER BY date_str DESC
  `);

  const platformExpenses = expRows.rows.map(r => ({
    id: r.id,
    dateStr: r.date_str,
    category: r.custom_category || r.category,
    amount: Number(r.amount),
    notes: r.notes,
  }));
  const totalExpenses = platformExpenses.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalSubscriptionRevenue - totalExpenses;

  const allSubs = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*) as count FROM owner_subscriptions GROUP BY status
  `);

  return res.json({
    totalSubscriptionRevenue,
    totalExpenses,
    netProfit,
    totalSubscriptions: totalSubCount,
    subscriptionBreakdown: breakdown,
    subscriptionsByStatus: allSubs.rows,
    platformExpenses,
  });
});

router.post("/platform-expenses", async (req, res) => {
  const { dateStr, category, amount, notes } = req.body ?? {};
  if (!dateStr || !category || !amount) {
    return res.status(400).json({ error: "البيانات ناقصة" });
  }
  await db.execute(sql`
    INSERT INTO owner_expenses (owner_id, date_str, category, custom_category, amount, notes)
    VALUES ('__platform__', ${String(dateStr)}, 'other', ${String(category)}, ${Number(amount)}, ${String(notes ?? "")})
  `);
  return res.json({ ok: true });
});

router.delete("/platform-expenses/:id", async (req, res) => {
  await db.execute(sql`
    DELETE FROM owner_expenses WHERE id = ${Number(req.params.id)} AND owner_id = '__platform__'
  `);
  return res.json({ ok: true });
});

/* ── Admin Analytics ─────────────────────────────────────── */
router.get("/analytics", async (_req, res) => {
  // 1. Monthly subscription revenue — last 12 months
  const monthlyRev = await db.execute<{ month: string; total: string }>(sql`
    SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
           SUM(sp.price) AS total
    FROM owner_subscriptions os
    LEFT JOIN subscription_plans sp ON sp.slug = os.plan
    WHERE os.payment_status = 'paid'
      AND os.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  `);

  // 2. Market distribution — chalets vs services
  const chaletCount = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM chalets`);
  const serviceCount = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM external_services`);

  // 3. Geographic heatmap — bookings by city (top 10)
  const geoData = await db.execute<{ city: string; count: string }>(sql`
    SELECT c.location AS city, COUNT(b.id) AS count
    FROM owner_bookings b
    JOIN chalets c ON c.id = b.chalet_id
    GROUP BY c.location
    ORDER BY COUNT(b.id) DESC
    LIMIT 10
  `);

  // 4. Account status distribution
  const statusDist = await db.execute<{ status: string; count: string }>(sql`
    SELECT status, COUNT(*) as count FROM owner_subscriptions GROUP BY status
  `);
  const noSubOwners = await db.execute<{ count: string }>(sql`
    SELECT COUNT(DISTINCT cs.owner_id) as count
    FROM chalet_submissions cs
    WHERE cs.owner_id IS NOT NULL
      AND cs.status = 'approved'
      AND cs.owner_id NOT IN (SELECT owner_id FROM owner_subscriptions)
  `);

  return res.json({
    monthlyRevenue: monthlyRev.rows.map(r => ({
      month: r.month,
      total: Number(r.total ?? 0),
    })),
    marketDistribution: {
      chalets: Number(chaletCount.rows[0]?.count ?? 0),
      services: Number(serviceCount.rows[0]?.count ?? 0),
    },
    geographicData: geoData.rows.map(r => ({
      city: r.city,
      count: Number(r.count),
    })),
    accountStatus: [
      ...statusDist.rows.map(r => ({ status: r.status, count: Number(r.count) })),
      ...(Number(noSubOwners.rows[0]?.count ?? 0) > 0
        ? [{ status: "no_sub", count: Number(noSubOwners.rows[0]?.count ?? 0) }]
        : []),
    ],
  });
});

/* ── Auto-deactivation export (called at server startup) ─── */
export async function runSubscriptionExpiryJob() {
  try {
    // Find expired active subscriptions
    const expired = await db
      .select({ ownerId: ownerSubscriptionsTable.ownerId })
      .from(ownerSubscriptionsTable)
      .where(
        and(
          eq(ownerSubscriptionsTable.status, "active"),
          lt(ownerSubscriptionsTable.expiresAt, new Date()),
        )
      );

    if (expired.length === 0) return;

    const ownerIds = expired.map(r => r.ownerId);

    // Mark subscriptions as inactive
    await db
      .update(ownerSubscriptionsTable)
      .set({ status: "inactive" })
      .where(
        and(
          eq(ownerSubscriptionsTable.status, "active"),
          lt(ownerSubscriptionsTable.expiresAt, new Date()),
        )
      );

    // Deactivate all chalets belonging to expired owners
    await db
      .update(chaletsTable)
      .set({ isActive: false })
      .where(inArray(chaletsTable.ownerId, ownerIds));

    // Deactivate all services belonging to expired owners
    await db
      .update(externalServicesTable)
      .set({ isActive: false })
      .where(inArray(externalServicesTable.ownerId, ownerIds));

    console.log(`[subscription-expiry] Deactivated ${ownerIds.length} owners`);
  } catch (err) {
    console.error("[subscription-expiry] Error:", err);
  }
}

export default router;
