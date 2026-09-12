import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";
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
  contactInquiriesTable,
  ownerTempSessionsTable,
  sectionGuidesTable,
  globalSeasonsTable,
} from "@workspace/db/schema";
import { eq, inArray, and, gt, lt, ne, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { extractCoordsFromMapsUrl } from "../lib/extractMapCoords";

declare global {
  namespace Express {
    interface Request {
      isSuperAdmin?: boolean;
      adminStaff?: typeof adminStaffTable.$inferSelect;
    }
  }
}

const router = Router();

const adminReplyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const adminReplyStorageSvc = new ObjectStorageService();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPausedNow(row: { pausedFrom?: string | null; pausedUntil?: string | null }, today = todayStr()) {
  if (!row.pausedFrom) return false;
  return row.pausedFrom <= today && (!row.pausedUntil || row.pausedUntil >= today);
}

function daysInclusive(from: string, to = todayStr()) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

async function logLongPauseAlerts(chalets: Array<{ id: number; nameAr: string; pausedFrom?: string | null; pausedUntil?: string | null }>) {
  const today = todayStr();
  const overdue = chalets
    .filter((c) => isPausedNow(c, today) && c.pausedFrom && daysInclusive(c.pausedFrom, today) > 7)
    .map((c) => ({
      chaletId: c.id,
      chaletName: c.nameAr,
      pausedFrom: c.pausedFrom!,
      pausedUntil: c.pausedUntil ?? null,
      daysPaused: daysInclusive(c.pausedFrom!, today),
      loggedAt: new Date().toISOString(),
    }));

  if (overdue.length === 0) return;

  const key = "admin_pause_alert_log";
  const [existing] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, key)).limit(1);
  let log: Array<(typeof overdue)[number] & { resolvedAt?: string | null }> = [];
  try {
    const parsed = existing?.value ? JSON.parse(existing.value) : [];
    log = Array.isArray(parsed) ? parsed : [];
  } catch {
    log = [];
  }

  for (const alert of overdue) {
    const alreadyLogged = log.some((entry) =>
      entry.chaletId === alert.chaletId &&
      entry.pausedFrom === alert.pausedFrom &&
      !entry.resolvedAt
    );
    if (!alreadyLogged) log.unshift(alert);
  }

  await db.insert(siteSettingsTable)
    .values({ key, value: JSON.stringify(log.slice(0, 100)), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value: JSON.stringify(log.slice(0, 100)), updatedAt: new Date() },
    });
}

type PauseAlertGlobal = typeof globalThis & {
  __takyaPauseAlertTimer?: ReturnType<typeof setInterval>;
  __takyaPauseAlertRunning?: boolean;
};

async function runLongPauseAlertCheck() {
  const rows = await db
    .select({
      id: chaletsTable.id,
      nameAr: chaletsTable.nameAr,
      pausedFrom: chaletsTable.pausedFrom,
      pausedUntil: chaletsTable.pausedUntil,
    })
    .from(chaletsTable);
  await logLongPauseAlerts(rows);
}

export function startLongPauseAlertCheck() {
  const g = globalThis as PauseAlertGlobal;
  if (g.__takyaPauseAlertTimer) return;
  const run = () => {
    if (g.__takyaPauseAlertRunning) return;
    g.__takyaPauseAlertRunning = true;
    runLongPauseAlertCheck()
      .catch(() => {})
      .finally(() => {
        g.__takyaPauseAlertRunning = false;
      });
  };
  run();
  g.__takyaPauseAlertTimer = setInterval(run, 60 * 60 * 1000);
}

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

export function requirePlatformSettingsAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isSuperAdmin || req.adminStaff?.permissions?.platformSettings) return next();
  res.status(403).json({ error: "لا تملك صلاحية إعدادات المنصة" });
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

/* ── Impersonation status — checks new owner_temp_session cookie ── */
router.get("/impersonation-status", async (req, res) => {
  const sessionToken = req.cookies?.owner_temp_session;
  if (!sessionToken) return res.json({ impersonating: false });

  const r = await db.execute<{
    owner_id: string; admin_label: string | null; expires_at: Date;
  }>(
    sql`SELECT owner_id, admin_label, expires_at FROM owner_temp_sessions
        WHERE token = ${sessionToken} AND expires_at > now() LIMIT 1`
  );
  const row = ((r as any).rows as Array<{ owner_id: string; admin_label: string | null; expires_at: Date }>)[0];
  if (!row) return res.json({ impersonating: false });

  const or = await db.execute<{ name_ar: string }>(
    sql`SELECT name_ar FROM chalet_submissions WHERE owner_id = ${row.owner_id}
        ORDER BY created_at ASC LIMIT 1`
  );
  const ownerRow = ((or as any).rows as Array<{ name_ar: string }>)[0];

  return res.json({
    impersonating: true,
    ownerId: row.owner_id,
    adminName: row.admin_label ?? "مشرف",
    ownerName: ownerRow?.name_ar ?? null,
  });
});

router.use(requireAdminOrAdminStaff);

/* ── Centrally managed chalet seasons ──────────────────────── */
const globalSeasonDateSchema = z.string().trim().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "يجب أن يكون التاريخ بصيغة ISO (YYYY-MM-DD)",
).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "التاريخ غير صحيح");
const globalSeasonColorSchema = z.string().trim().regex(
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
  "اللون يجب أن يكون بصيغة HEX",
);
const globalSeasonSchema = z.object({
  nameAr: z.string().trim().min(1, "اسم الموسم مطلوب"),
  startDate: globalSeasonDateSchema,
  endDate: globalSeasonDateSchema,
  color: globalSeasonColorSchema.default("#D97706"),
  isActive: z.boolean().default(true),
});

router.get("/global-seasons", requirePlatformSettingsAdmin, async (_req, res) => {
  const rows = await db.select().from(globalSeasonsTable).orderBy(globalSeasonsTable.startDate, globalSeasonsTable.id);
  return res.json(rows);
});

router.post("/global-seasons", requirePlatformSettingsAdmin, async (req, res) => {
  const parsed = globalSeasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() });
  if (parsed.data.endDate < parsed.data.startDate) {
    return res.status(400).json({ error: "تاريخ النهاية قبل البداية" });
  }

  const [row] = await db.insert(globalSeasonsTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.put("/global-seasons/:id", requirePlatformSettingsAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صحيح" });

  const parsed = globalSeasonSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() });

  const [current] = await db.select().from(globalSeasonsTable).where(eq(globalSeasonsTable.id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "الموسم غير موجود" });
  const nextStartDate = parsed.data.startDate ?? current.startDate;
  const nextEndDate = parsed.data.endDate ?? current.endDate;
  if (nextEndDate < nextStartDate) {
    return res.status(400).json({ error: "تاريخ النهاية قبل البداية" });
  }

  const [row] = await db.update(globalSeasonsTable)
    .set(parsed.data)
    .where(eq(globalSeasonsTable.id, id))
    .returning();
  return res.json(row);
});

router.delete("/global-seasons/:id", requirePlatformSettingsAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صحيح" });
  const deleted = await db.delete(globalSeasonsTable)
    .where(eq(globalSeasonsTable.id, id))
    .returning({ id: globalSeasonsTable.id });
  if (deleted.length === 0) return res.status(404).json({ error: "الموسم غير موجود" });
  return res.json({ ok: true });
});

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
      /* Extract real GPS coordinates from the owner's Google Maps link */
      const coords = submission.mapsUrl
        ? await extractCoordsFromMapsUrl(submission.mapsUrl)
        : null;

      await db.insert(chaletsTable).values({
        submissionId: submission.id,
        ownerId: submission.ownerId,
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
        logoUrl: submission.logoUrl ?? null,
        whatsappNumber: submission.whatsappNumber,
        mapsUrl: submission.mapsUrl ?? undefined,
        socialLink: submission.socialLink ?? null,
        termsAndConditions: submission.termsAndConditions ?? null,
        isVerified: false,
        latitude: coords?.[0] ?? null,
        longitude: coords?.[1] ?? null,
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

/* ── Approve a suggested category ───────────────────────────── */
router.post("/submissions/:id/approve-category", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ nameOverride: z.string().trim().min(1).optional(), emoji: z.string().optional().default("🏠") }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [sub] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id)).limit(1);
  if (!sub) return res.status(404).json({ error: "الطلب غير موجود" });

  const categoryName = (body.data.nameOverride || sub.suggestedCategoryName || "").trim();
  if (!categoryName) return res.status(400).json({ error: "اسم الفئة مطلوب" });

  /* Create the new category (or reuse if it already exists) */
  const existing = await db.select({ id: chaletCategoriesTable.id, nameAr: chaletCategoriesTable.nameAr })
    .from(chaletCategoriesTable)
    .where(sql`LOWER(${chaletCategoriesTable.nameAr}) = LOWER(${categoryName})`)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(chaletCategoriesTable).values({ nameAr: categoryName, emoji: body.data.emoji });
  }

  /* Update the submission */
  await db.update(chaletSubmissionsTable)
    .set({ propertyType: categoryName, suggestedCategoryName: null, pendingCategoryApproval: false } as any)
    .where(eq(chaletSubmissionsTable.id, id));

  return res.json({ ok: true, categoryName });
});

/* ── Reassign a pending-category submission to an existing category ── */
router.post("/submissions/:id/reassign-category", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    categoryName: z.string().trim().min(1),
    ownerNote: z.string().trim().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [sub] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, id)).limit(1);
  if (!sub) return res.status(404).json({ error: "الطلب غير موجود" });

  const updateObj: Record<string, unknown> = {
    propertyType: body.data.categoryName,
    suggestedCategoryName: null,
    pendingCategoryApproval: false,
  };
  if (body.data.ownerNote) updateObj.adminNote = body.data.ownerNote;

  await db.update(chaletSubmissionsTable).set(updateObj as any).where(eq(chaletSubmissionsTable.id, id));

  return res.json({ ok: true });
});

/* ── Chalets Verification ────────────────────────────────── */

router.get("/chalets", async (req, res) => {
  const rows = await db
    .select()
    .from(chaletsTable)
    .orderBy(chaletsTable.id);

  await logLongPauseAlerts(rows);

  if (req.query.includeStatus !== "true") {
    return res.json(rows);
  }

  const pending = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.status, "pending"))
    .orderBy(chaletSubmissionsTable.createdAt);

  const deleted = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(and(eq(chaletSubmissionsTable.status, "rejected"), eq(chaletSubmissionsTable.adminNote, "تم الحذف من قبل المالك")))
    .orderBy(chaletSubmissionsTable.createdAt);

  const today = todayStr();
  const activeRows = rows.map((row) => {
    if (row.deletedAt) {
      return { ...row, adminStatus: "deleted" as const, isPausedNow: false, hiddenByOwner: false, pausedDays: 0, pauseAlert: false };
    }
    const paused = isPausedNow(row, today);
    const pausedDays = paused && row.pausedFrom ? daysInclusive(row.pausedFrom, today) : 0;
    const hiddenByOwner = row.isActive === false;
    return {
      ...row,
      adminStatus: (paused || hiddenByOwner ? "paused" : "active") as "paused" | "active",
      isPausedNow: paused,
      hiddenByOwner,
      pausedDays,
      pauseAlert: pausedDays > 7,
    };
  });

  const pendingRows = pending.map((row) => ({
    id: -row.id,
    submissionId: row.id,
    nameAr: row.nameAr,
    location: row.location,
    district: row.district,
    category: row.category,
    whatsappNumber: row.whatsappNumber,
    createdAt: row.createdAt,
    isVerified: false,
    isActive: false,
    adminStatus: "pending",
    isPausedNow: false,
    pausedDays: 0,
    pauseAlert: false,
  }));

  const deletedRows = deleted.map((row) => ({
    id: -100000 - row.id,
    submissionId: row.id,
    nameAr: row.nameAr,
    location: row.location,
    district: row.district,
    category: row.category,
    whatsappNumber: row.whatsappNumber,
    createdAt: row.createdAt,
    isVerified: false,
    isActive: false,
    adminStatus: "deleted",
    isPausedNow: false,
    pausedDays: 0,
    pauseAlert: false,
  }));

  return res.json([...activeRows, ...pendingRows.reverse(), ...deletedRows.reverse()]);
});

router.get("/pause-alerts", async (_req, res) => {
  await runLongPauseAlertCheck();
  const [existing] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "admin_pause_alert_log")).limit(1);
  try {
    return res.json(existing?.value ? JSON.parse(existing.value) : []);
  } catch {
    return res.json([]);
  }
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

router.patch("/chalets/:id/soft-delete", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || id <= 0) return res.status(400).json({ error: "معرّف غير صحيح" });
  const body = z.object({ reason: z.string().trim().min(3, "سبب الحذف مطلوب (٣ أحرف على الأقل)") }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });
  await db.update(chaletsTable)
    .set({ deletedAt: new Date(), deleteReason: body.data.reason, isActive: false })
    .where(eq(chaletsTable.id, id));
  return res.json({ ok: true });
});

/* ── Owners ──────────────────────────────────────────────── */

router.get("/owners", async (_req, res) => {
  /* ── Step 1: pull all submissions with enrichment data ── */
  const subRows = await db
    .select({
      ownerId:       chaletSubmissionsTable.ownerId,
      whatsappNumber: chaletSubmissionsTable.whatsappNumber,
      nameAr:        chaletSubmissionsTable.nameAr,
      location:      chaletSubmissionsTable.location,
      district:      chaletSubmissionsTable.district,
      propertyType:  chaletSubmissionsTable.propertyType,
      createdAt:     chaletSubmissionsTable.createdAt,
    })
    .from(chaletSubmissionsTable)
    .orderBy(chaletSubmissionsTable.createdAt);

  /* ── Step 2: pull owner_applications for full names / phones ── */
  const appRows = await db.execute<{
    id: number; full_name: string; phone: string; created_at: string;
  }>(
    sql`SELECT id, full_name, phone, created_at FROM owner_applications WHERE deleted_at IS NULL ORDER BY created_at ASC`
  );
  const appByOwnerId = new Map<string, { fullName: string; phone: string; createdAt: string }>();
  for (const a of (appRows as any).rows) {
    appByOwnerId.set(`owner_${a.id}`, {
      fullName: a.full_name ?? "",
      phone: a.phone ?? "",
      createdAt: a.created_at ?? "",
    });
  }

  /* ── Step 3: pull subscription data ── */
  const subData = await db.execute<{ owner_id: string; expires_at: string | null; status: string }>(
    sql`SELECT owner_id, expires_at, status FROM owner_subscriptions`
  );
  const subsByOwnerId = new Map<string, { expiresAt: string | null; subscriptionStatus: string }>();
  for (const s of (subData as any).rows) {
    subsByOwnerId.set(s.owner_id, { expiresAt: s.expires_at ?? null, subscriptionStatus: s.status ?? "" });
  }

  type OwnerRow = {
    ownerId: string; ownerName: string; primaryProperty: string;
    whatsappNumber: string; location: string; district?: string; propertyType: string | null;
    createdAt: string | null; expiresAt: string | null; subscriptionStatus: string;
  };

  const seen = new Set<string>();
  const result: OwnerRow[] = [];

  for (const r of subRows) {
    if (!r.ownerId || seen.has(r.ownerId)) continue;
    seen.add(r.ownerId);
    const app = appByOwnerId.get(r.ownerId);
    const sub = subsByOwnerId.get(r.ownerId);
    result.push({
      ownerId:            r.ownerId,
      ownerName:          app?.fullName || r.ownerId,
      primaryProperty:    r.nameAr ?? "",
      whatsappNumber:     r.whatsappNumber ?? "",
      location:           r.location ?? "",
      district:           r.district ?? "",
      propertyType:       r.propertyType ?? null,
      createdAt:          r.createdAt?.toISOString() ?? null,
      expiresAt:          sub?.expiresAt ?? null,
      subscriptionStatus: sub?.subscriptionStatus ?? "",
    });
  }

  /* Approved owners with NO chalet yet */
  for (const a of (appRows as any).rows) {
    const ownerId = `owner_${a.id}`;
    if (seen.has(ownerId)) continue;
    seen.add(ownerId);
    const sub = subsByOwnerId.get(ownerId);
    result.push({
      ownerId,
      ownerName:          a.full_name ?? ownerId,
      primaryProperty:    "—",
      whatsappNumber:     a.phone ?? "",
      location:           "",
      propertyType:       null,
      createdAt:          a.created_at ?? null,
      expiresAt:          sub?.expiresAt ?? null,
      subscriptionStatus: sub?.subscriptionStatus ?? "",
    });
  }

  return res.json(result);
});

router.patch("/owners/:id/soft-delete", async (req, res) => {
  const rawId = String(req.params.id);
  const numId = Number(rawId.replace(/^owner_/, ""));
  if (!numId || isNaN(numId)) return res.status(400).json({ error: "معرّف غير صحيح" });
  const body = z.object({ reason: z.string().trim().min(3, "سبب الحذف مطلوب (٣ أحرف على الأقل)") }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });
  await db.execute(sql`
    UPDATE owner_applications SET deleted_at = NOW(), delete_reason = ${body.data.reason} WHERE id = ${numId}
  `);
  return res.json({ ok: true });
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
  const body = z.object({
    nameAr: z.string().min(1),
    emoji: z.string().optional().default("🏠"),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "الاسم مطلوب" });
  const [row] = await db.insert(chaletCategoriesTable).values({ nameAr: body.data.nameAr, emoji: body.data.emoji }).returning();
  return res.status(201).json(row);
});

router.patch("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    nameAr: z.string().min(1).optional(),
    emoji: z.string().optional(),
    isActive: z.boolean().optional(),
    showSectionFilter: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.update(chaletCategoriesTable).set(body.data).where(eq(chaletCategoriesTable.id, id));
  return res.json({ ok: true });
});


/* ── Chalet Categories ───────────────────────────────────── */
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
        pricingUnit: submission.pricingUnit ?? undefined,
        dailyCapacity: submission.dailyCapacity ?? undefined,
        requiresInsurance: submission.requiresInsurance,
        requiresContract: submission.requiresContract,
        contractText: submission.contractText ?? null,
        includeElectronicSignature: submission.includeElectronicSignature,
        insuranceAmount: submission.requiresInsurance ? submission.insuranceAmount : null,
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

router.get("/contact-inquiries", async (_req, res) => {
  const rows = await db
    .select({
      id: contactInquiriesTable.id,
      name: contactInquiriesTable.name,
      phone: contactInquiriesTable.phone,
      email: contactInquiriesTable.email,
      message: contactInquiriesTable.message,
      status: contactInquiriesTable.status,
      created_at: contactInquiriesTable.createdAt,
    })
    .from(contactInquiriesTable)
    .orderBy(sql`${contactInquiriesTable.createdAt} DESC`)
    .limit(200);
  return res.json(rows);
});

router.patch("/contact-inquiries/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ status: z.enum(["new", "read", "replied"]) }).safeParse(req.body);
  if (!body.success || !Number.isFinite(id)) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.update(contactInquiriesTable).set({ status: body.data.status }).where(eq(contactInquiriesTable.id, id));
  return res.json({ ok: true });
});

/* ── Owner Support Requests ──────────────────────────────── */
router.get("/support-requests", async (req, res) => {
  try {
    const ownerId = req.query.ownerId as string | undefined;
    /*
     * Multi-strategy name resolution (owner_id may be a Replit user ID like "56719001"
     * or a custom key like "owner_4" — neither maps directly to owner_applications.email).
     *
     * Correct path:  owner_id → chalet_submissions.owner_id → whatsapp_number
     *                         → owner_applications.phone → full_name
     *
     * COALESCE priority:
     *   1. owner_name stored on the record (set at insert time when possible)
     *   2. full_name from owner_applications via whatsapp/chalet join
     *   3. Raw owner_id as last-resort fallback
     */
    const result = await db.execute(
      ownerId
        ? sql`SELECT s.id, s.owner_id,
                COALESCE(NULLIF(TRIM(s.owner_name), ''), oa.full_name, s.owner_id) AS owner_name,
                s.subject, s.message, s.status,
                CASE WHEN array_length(s.attachment_urls, 1) > 0 THEN s.attachment_urls WHEN s.attachment_url IS NOT NULL THEN ARRAY[s.attachment_url] ELSE '{}'::text[] END AS attachment_urls,
                s.admin_reply, s.admin_reply_at,
                CASE WHEN array_length(s.admin_attachment_urls, 1) > 0 THEN s.admin_attachment_urls WHEN s.admin_attachment_url IS NOT NULL THEN ARRAY[s.admin_attachment_url] ELSE '{}'::text[] END AS admin_attachment_urls,
                s.is_read_by_owner, s.created_at
              FROM owner_support_requests s
              LEFT JOIN LATERAL (
                SELECT whatsapp_number FROM chalet_submissions WHERE owner_id = s.owner_id LIMIT 1
              ) cs ON true
              LEFT JOIN owner_applications oa ON oa.phone = cs.whatsapp_number
              WHERE s.owner_id = ${ownerId}
              ORDER BY s.created_at DESC LIMIT 300`
        : sql`SELECT s.id, s.owner_id,
                COALESCE(NULLIF(TRIM(s.owner_name), ''), oa.full_name, s.owner_id) AS owner_name,
                s.subject, s.message, s.status,
                CASE WHEN array_length(s.attachment_urls, 1) > 0 THEN s.attachment_urls WHEN s.attachment_url IS NOT NULL THEN ARRAY[s.attachment_url] ELSE '{}'::text[] END AS attachment_urls,
                s.admin_reply, s.admin_reply_at,
                CASE WHEN array_length(s.admin_attachment_urls, 1) > 0 THEN s.admin_attachment_urls WHEN s.admin_attachment_url IS NOT NULL THEN ARRAY[s.admin_attachment_url] ELSE '{}'::text[] END AS admin_attachment_urls,
                s.is_read_by_owner, s.created_at
              FROM owner_support_requests s
              LEFT JOIN LATERAL (
                SELECT whatsapp_number FROM chalet_submissions WHERE owner_id = s.owner_id LIMIT 1
              ) cs ON true
              LEFT JOIN owner_applications oa ON oa.phone = cs.whatsapp_number
              ORDER BY s.created_at DESC LIMIT 300`
    );
    return res.json((result as any).rows);
  } catch (err) {
    console.error("[GET /admin/support-requests]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

router.patch("/support-requests/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({ status: z.enum(["new", "in_progress", "resolved"]) }).safeParse(req.body);
  if (!body.success || !Number.isFinite(id)) return res.status(400).json({ error: "بيانات غير صحيحة" });
  await db.execute(
    sql`UPDATE owner_support_requests SET status = ${body.data.status} WHERE id = ${id}`
  );
  return res.json({ ok: true });
});

router.post("/support-requests/:id/reply", adminReplyUpload.array("files", 10), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const reply = (req.body?.reply ?? "").trim();
  if (!reply) return res.status(400).json({ error: "نص الرد مطلوب" });
  if (reply.length > 2000) return res.status(400).json({ error: "الرد طويل جداً" });

  /* Upload attachments if provided */
  const adminAttachmentUrls: string[] = [];
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (files && files.length > 0) {
    for (const file of files) {
      try {
        const isImage = file.mimetype.startsWith("image/");
        const isPdf   = file.mimetype === "application/pdf" || file.originalname?.endsWith(".pdf");
        let buffer: Buffer; let contentType: string; let ext: string;
        if (isPdf) {
          buffer = file.buffer; contentType = "application/pdf"; ext = "pdf";
        } else if (isImage) {
          buffer = await sharp(file.buffer).resize({ width: 2048, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
          contentType = "image/webp"; ext = "webp";
        } else {
          continue;
        }
        const url = await adminReplyStorageSvc.uploadBuffer(buffer, contentType, ext);
        adminAttachmentUrls.push(url);
      } catch (uploadErr) {
        console.error("[POST /admin/support-requests/:id/reply] attachment upload failed:", uploadErr);
      }
    }
  }

  try {
    await db.execute(
      sql`UPDATE owner_support_requests
          SET admin_reply = ${reply},
              admin_reply_at = NOW(),
              status = 'in_progress',
              is_read_by_owner = false
              ${adminAttachmentUrls.length > 0 ? sql`, admin_attachment_urls = ${`{${adminAttachmentUrls.join(",")}}`}::text[]` : sql``}
          WHERE id = ${id}`
    );
    return res.json({ ok: true, admin_attachment_urls: adminAttachmentUrls });
  } catch (err) {
    console.error("[POST /admin/support-requests/:id/reply]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
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
   Owner Impersonation — Token-Based Clean Switch
   Super-Admin generates a one-time token → owner gets
   a real separate owner session (no role mixing)
   ══════════════════════════════════════════════════════ */
router.post("/impersonate", async (req, res) => {
  if (!(req as any).isSuperAdmin) {
    return res.status(403).json({ error: "المشرف العام فقط يملك هذه الصلاحية" });
  }
  const ownerId = String(req.body?.ownerId ?? "").trim();
  if (!ownerId) return res.status(400).json({ error: "ownerId مطلوب" });

  /* Determine admin display name */
  const adminLabel =
    (req as any).adminStaff?.name ??
    (req as any).user?.firstName ??
    (req as any).user?.name ??
    "مشرف";

  /* Generate a cryptographically secure one-time token (10-min TTL) */
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  /* Store the admin's Replit user ID so requireAuth can reject stale cookies for other users */
  const createdByReplitId = (req as any).user?.id ?? null;
  await db.insert(ownerTempSessionsTable).values({ token, ownerId, adminLabel, expiresAt, createdByReplitId });

  return res.json({ token });
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
    SELECT TO_CHAR(DATE_TRUNC('month', os.created_at), 'YYYY-MM') AS month,
           SUM(sp.price) AS total
    FROM owner_subscriptions os
    LEFT JOIN subscription_plans sp ON sp.slug = os.plan
    WHERE os.payment_status = 'paid'
      AND os.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY DATE_TRUNC('month', os.created_at)
    ORDER BY DATE_TRUNC('month', os.created_at)
  `);

  // 2. Market distribution — chalets vs services
  const chaletCount = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM chalets`);
  const serviceCount = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM external_services`);

  // 3. Geographic heatmap — bookings by city (top 10)
  const geoData = await db.execute<{ city: string; count: string }>(sql`
    SELECT cs.location AS city, COUNT(b.id) AS count
    FROM owner_bookings b
    JOIN chalet_submissions cs ON cs.id = b.submission_id
    WHERE cs.location IS NOT NULL
    GROUP BY cs.location
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

/* ── Admin: direct-add chalet under owner ──────────────────── */
router.post("/direct-add-chalet", requireSuperAdmin, async (req, res) => {
  const body = z.object({
    ownerId: z.string().min(1),
    nameAr: z.string().min(2, "الاسم مطلوب"),
    location: z.string().min(1, "المدينة مطلوبة"),
    district: z.string().min(1, "الحي مطلوب"),
    whatsappNumber: z.string().min(9, "رقم واتساب غير صحيح"),
    pricePerNight: z.number().min(0),
    descriptionAr: z.string().optional().default(""),
    propertyType: z.string().optional(),
    sections: z.string().optional(),
    bedrooms: z.number().int().min(0).nullable().optional(),
    maxGuests: z.number().int().min(1).nullable().optional(),
    mapsUrl: z.string().optional().nullable(),
    socialLink: z.string().optional().nullable(),
    amenities: z.array(z.string()).optional().default([]),
    photos: z.array(z.string()).optional().default([]),
    videoUrl: z.string().optional().nullable(),
    logoUrl: z.string().optional().nullable(),
    termsAndConditions: z.string().optional().nullable(),
    seasonalDisclaimer: z.boolean().optional().default(true),
    dailyPrices: z.record(z.string(), z.record(z.string(), z.number())).nullable().optional(),
    morningCheckIn: z.string().optional().nullable(),
    morningCheckOut: z.string().optional().nullable(),
    eveningCheckIn: z.string().optional().nullable(),
    eveningCheckOut: z.string().optional().nullable(),
    fullDayCheckIn: z.string().optional().nullable(),
    fullDayCheckOut: z.string().optional().nullable(),
    slotMorning: z.boolean().optional().default(true),
    slotEvening: z.boolean().optional().default(true),
    slotFullDay: z.boolean().optional().default(true),
    priceMorning: z.number().nullable().optional(),
    priceEvening: z.number().nullable().optional(),
    priceFullDay: z.number().nullable().optional(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten().fieldErrors });
  }

  const data = body.data;

  /* Uniqueness check */
  const [dup] = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(
      and(
        sql`lower(${chaletSubmissionsTable.nameAr}) = lower(${data.nameAr})`,
        sql`lower(${chaletSubmissionsTable.location}) = lower(${data.location})`,
        ne(chaletSubmissionsTable.status, "rejected"),
      )
    ).limit(1);
  if (dup) {
    return res.status(409).json({ error: "هذا الاسم مستخدم مسبقاً في هذه المدينة" });
  }

  /* Resolve the most specific owner ID:
   * If admin selected "owner_N", check if that owner has a Replit account
   * (owner_applications.email → users.id). If found, use the Replit user ID
   * so the owner sees the property in their own dashboard without needing
   * impersonation. Fall back to "owner_N" if no Replit account exists. */
  let effectiveOwnerId = data.ownerId;
  if (/^owner_\d+$/.test(data.ownerId)) {
    try {
      const n = parseInt(data.ownerId.replace("owner_", ""), 10);
      const r = await db.execute(
        sql`SELECT u.id FROM owner_applications oa
            JOIN users u ON LOWER(u.email) = LOWER(oa.email)
            WHERE oa.id = ${n}
            LIMIT 1`
      );
      const userId = ((r as any).rows as Array<{ id: string }>)[0]?.id;
      if (userId) effectiveOwnerId = String(userId);
    } catch { /* keep original "owner_N" if lookup fails */ }
  }

  const vals = {
    ownerId: effectiveOwnerId,
    nameAr: data.nameAr,
    location: data.location,
    district: data.district,
    whatsappNumber: data.whatsappNumber,
    descriptionAr: data.descriptionAr || "",
    pricePerNight: String(data.pricePerNight),
    priceMorning: data.priceMorning != null ? String(data.priceMorning) : null,
    priceEvening: data.priceEvening != null ? String(data.priceEvening) : null,
    priceFullDay: data.priceFullDay != null ? String(data.priceFullDay) : null,
    status: "approved" as const,
    amenities: data.amenities ?? [],
    photos: data.photos ?? [],
    videoUrl: data.videoUrl || null,
    logoUrl: data.logoUrl || null,
    propertyType: data.propertyType || null,
    sections: data.sections || null,
    bedrooms: data.bedrooms ?? null,
    maxGuests: data.maxGuests ?? null,
    mapsUrl: data.mapsUrl || null,
    socialLink: data.socialLink || null,
    termsAndConditions: data.termsAndConditions || null,
    seasonalDisclaimer: data.seasonalDisclaimer ?? true,
    dailyPrices: data.dailyPrices ?? null,
    slotMorning: data.slotMorning ?? true,
    slotEvening: data.slotEvening ?? true,
    slotFullDay: data.slotFullDay ?? true,
    morningCheckIn: data.morningCheckIn || null,
    morningCheckOut: data.morningCheckOut || null,
    eveningCheckIn: data.eveningCheckIn || null,
    eveningCheckOut: data.eveningCheckOut || null,
    fullDayCheckIn: data.fullDayCheckIn || null,
    fullDayCheckOut: data.fullDayCheckOut || null,
  };

  /* Create submission (already approved) */
  const [submission] = await db
    .insert(chaletSubmissionsTable)
    .values(vals)
    .returning({ id: chaletSubmissionsTable.id });

  /* Auto-create active chalet record */
  await db.insert(chaletsTable).values({
    submissionId: submission.id,
    ownerId: effectiveOwnerId,
    nameAr: vals.nameAr,
    descriptionAr: vals.descriptionAr,
    location: vals.location,
    district: vals.district ?? undefined,
    pricePerNight: vals.pricePerNight,
    priceMorning: vals.priceMorning ?? undefined,
    priceEvening: vals.priceEvening ?? undefined,
    priceFullDay: vals.priceFullDay ?? undefined,
    whatsappNumber: vals.whatsappNumber,
    amenities: vals.amenities,
    photos: vals.photos,
    videoUrl: vals.videoUrl ?? undefined,
    logoUrl: vals.logoUrl ?? null,
    propertyType: vals.propertyType ?? undefined,
    sections: vals.sections ?? undefined,
    bedrooms: vals.bedrooms,
    maxGuests: vals.maxGuests,
    mapsUrl: vals.mapsUrl ?? undefined,
    socialLink: vals.socialLink,
    termsAndConditions: vals.termsAndConditions,
    seasonalDisclaimer: vals.seasonalDisclaimer,
    dailyPrices: vals.dailyPrices,
    slotMorning: vals.slotMorning,
    slotEvening: vals.slotEvening,
    slotFullDay: vals.slotFullDay,
    morningCheckIn: vals.morningCheckIn,
    morningCheckOut: vals.morningCheckOut,
    eveningCheckIn: vals.eveningCheckIn,
    eveningCheckOut: vals.eveningCheckOut,
    fullDayCheckIn: vals.fullDayCheckIn,
    fullDayCheckOut: vals.fullDayCheckOut,
    isVerified: false,
  }).onConflictDoNothing();

  return res.status(201).json({ ok: true, submissionId: submission.id });
});

/* ── Admin: direct-add service provider under owner ──────── */
router.post("/direct-add-service", requireSuperAdmin, async (req, res) => {
  const body = z.object({
    ownerId: z.string().min(1),
    businessName: z.string().min(2, "الاسم مطلوب"),
    category: z.string().min(1, "الفئة مطلوبة"),
    city: z.string().min(1, "المدينة مطلوبة"),
    whatsappNumber: z.string().min(9, "رقم واتساب غير صحيح"),
    descriptionAr: z.string().optional().default(""),
    yearsOfExperience: z.number().int().min(0).optional(),
    requiresInsurance: z.boolean().optional().default(false),
    insuranceAmount: z.union([z.string(), z.number()]).transform((value) => String(value)).optional().nullable(),
    coverageTags: z.array(z.string()).optional().default([]),
    customFeatureTags: z.array(z.string()).optional().default([]),
    logoUrl: z.string().optional().nullable(),
    galleryPhotos: z.array(z.string()).min(3, "يجب إضافة ٣ صور على الأقل للمعرض"),
    videoUrl: z.string().optional().nullable(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten().fieldErrors });
  }

  const data = body.data;
  const normalizedInsuranceAmount = data.insuranceAmount?.trim() ?? "";
  const insuranceAmountNumber = Number(normalizedInsuranceAmount);
  if (data.requiresInsurance && (!normalizedInsuranceAmount || !Number.isFinite(insuranceAmountNumber) || insuranceAmountNumber <= 0)) {
    return res.status(400).json({
      error: "بيانات التأمين غير صحيحة",
      details: { insuranceAmount: ["قيمة التأمين مطلوبة ويجب أن تكون أكبر من صفر"] },
    });
  }

  /* Add manually entered coverage cities to the searchable city catalog. */
  for (const coverageCity of [...new Set(data.coverageTags.map(city => city.trim()).filter(Boolean))]) {
    const [existingCity] = await db
      .select({ id: citiesCatalogTable.id })
      .from(citiesCatalogTable)
      .where(sql`LOWER(${citiesCatalogTable.name}) = LOWER(${coverageCity})`)
      .limit(1);
    if (!existingCity) await db.insert(citiesCatalogTable).values({ name: coverageCity });
  }

  /* Uniqueness check */
  const [dup] = await db
    .select({ id: serviceProviderSubmissionsTable.id })
    .from(serviceProviderSubmissionsTable)
    .where(
      and(
        sql`lower(${serviceProviderSubmissionsTable.businessName}) = lower(${data.businessName})`,
        sql`lower(${serviceProviderSubmissionsTable.city}) = lower(${data.city})`,
        ne(serviceProviderSubmissionsTable.status, "rejected"),
      )
    ).limit(1);
  if (dup) {
    return res.status(409).json({ error: "هذا الاسم مستخدم مسبقاً في هذه المدينة" });
  }

  const svcVals = {
    ownerId: data.ownerId,
    businessName: data.businessName,
    category: data.category,
    city: data.city,
    whatsappNumber: data.whatsappNumber,
    descriptionAr: data.descriptionAr || null,
    yearsOfExperience: data.yearsOfExperience ?? null,
    requiresInsurance: data.requiresInsurance,
    insuranceAmount: data.requiresInsurance ? insuranceAmountNumber.toFixed(2) : null,
    coverageTags: data.coverageTags ?? [],
    customFeatureTags: data.customFeatureTags ?? [],
    logoUrl: data.logoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='32' fill='%231e293b'/%3E%3Ccircle cx='80' cy='80' r='48' fill='%23f59e0b' opacity='.18'/%3E%3Cpath d='M48 98V72l32-22 32 22v26l-32 18-32-18Zm32-27 22 15v-9L80 62 58 77v9l22-15Z' fill='%23fbbf24'/%3E%3C/svg%3E",
    galleryPhotos: data.galleryPhotos ?? [],
    videoUrl: data.videoUrl || null,
  };

  /* Create submission (already approved) */
  const [submission] = await db
    .insert(serviceProviderSubmissionsTable)
    .values({ ...svcVals, status: "approved" })
    .returning({ id: serviceProviderSubmissionsTable.id });

  /* Auto-create active service provider record */
  await db.insert(serviceProvidersTable).values({
    ...svcVals,
    isActive: true,
  }).onConflictDoNothing();

  return res.status(201).json({ ok: true, submissionId: submission.id });
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

/* ── GET /admin/wa-subscribers — WhatsApp news subscribers list ── */
/* ── Section Guides ─────────────────────────────────────────── */
router.get("/section-guides", async (_req, res) => {
  try {
    const rows = await db.select().from(sectionGuidesTable).orderBy(sectionGuidesTable.sectionKey, sectionGuidesTable.id);
    return res.json(rows);
  } catch (err) {
    console.error("[GET /admin/section-guides]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

router.post("/section-guides", async (req, res) => {
  try {
    const { sectionKey, title, videoUrl } = req.body as { sectionKey: string; title: string; videoUrl: string };
    if (!sectionKey || !title || !videoUrl) return res.status(400).json({ error: "بيانات ناقصة" });
    const [row] = await db.insert(sectionGuidesTable).values({ sectionKey, title, videoUrl }).returning();
    return res.json(row);
  } catch (err) {
    console.error("[POST /admin/section-guides]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

router.put("/section-guides/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, videoUrl } = req.body as { title?: string; videoUrl?: string };
    const [row] = await db.update(sectionGuidesTable)
      .set({ ...(title !== undefined && { title }), ...(videoUrl !== undefined && { videoUrl }) })
      .where(eq(sectionGuidesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "غير موجود" });
    return res.json(row);
  } catch (err) {
    console.error("[PUT /admin/section-guides]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

router.delete("/section-guides/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(sectionGuidesTable).where(eq(sectionGuidesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /admin/section-guides]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

router.get("/wa-subscribers", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        oa.id,
        oa.full_name,
        oa.email,
        oa.whatsapp_news_subscribe,
        oa.whatsapp_subscribed_at,
        oa.created_at,
        COALESCE(
          (SELECT cs.whatsapp_number FROM chalet_submissions cs
           WHERE cs.owner_id = oa.email
             AND cs.whatsapp_number IS NOT NULL AND cs.whatsapp_number != ''
           ORDER BY cs.created_at DESC LIMIT 1),
          oa.phone
        ) AS whatsapp_number,
        COALESCE(
          (SELECT cs.name_ar FROM chalet_submissions cs
           WHERE cs.owner_id = oa.email
           ORDER BY cs.created_at DESC LIMIT 1),
          oa.full_name
        ) AS chalet_name
      FROM owner_applications oa
      WHERE oa.whatsapp_subscribed_at IS NOT NULL
         OR oa.whatsapp_news_subscribe = true
      ORDER BY
        oa.whatsapp_news_subscribe DESC,
        COALESCE(oa.whatsapp_subscribed_at, oa.created_at) DESC
    `);
    return res.json((result as any).rows ?? []);
  } catch (err) {
    console.error("[GET /admin/wa-subscribers]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
