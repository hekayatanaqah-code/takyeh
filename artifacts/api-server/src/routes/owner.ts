import { Router } from "express";
import { db } from "@workspace/db";
import {
  ownerBookingsTable,
  chaletSubmissionsTable,
  chaletsTable,
  chaletAvailabilityTable,
  ownerSubscriptionsTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  next();
}

router.use(requireAuth);

/* ── Bookings ──────────────────────────────────────────────── */

router.get("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(eq(ownerBookingsTable.ownerId, ownerId))
    .orderBy(ownerBookingsTable.createdAt);
  return res.json(rows.reverse());
});

router.post("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    submissionId: z.number().int().positive().optional(),
    clientName: z.string().min(1),
    bookingDate: z.string().min(1),
    durationDays: z.number().int().min(1).default(1),
    period: z.enum(["morning", "evening", "full_day"]).optional(),
    source: z.enum(["platform", "external"]).default("platform"),
    notes: z.string().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  if (body.data.submissionId) {
    const [sub] = await db
      .select({ ownerId: chaletSubmissionsTable.ownerId })
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, body.data.submissionId));
    if (!sub || sub.ownerId !== ownerId) {
      return res.status(403).json({ error: "غير مصرح" });
    }
  }

  const [booking] = await db
    .insert(ownerBookingsTable)
    .values({ ...body.data, ownerId })
    .returning();

  return res.status(201).json(booking);
});

router.delete("/bookings/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db
    .delete(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Owner's Approved Chalets ──────────────────────────────── */

router.get("/chalets", async (req, res) => {
  const ownerId = req.user!.id;

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));

  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.json([]);

  const chalets = await db
    .select()
    .from(chaletsTable)
    .where(inArray(chaletsTable.submissionId, subIds));

  return res.json(chalets);
});

/* ── Availability (date-slot blocking) ─────────────────────── */

router.get("/availability", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = req.query.chaletId ? Number(req.query.chaletId) : undefined;

  const conditions = [eq(chaletAvailabilityTable.ownerId, ownerId)];
  if (chaletId) conditions.push(eq(chaletAvailabilityTable.chaletId, chaletId));

  const rows = await db
    .select()
    .from(chaletAvailabilityTable)
    .where(and(...conditions))
    .orderBy(chaletAvailabilityTable.dateStr);

  return res.json(rows);
});

router.post("/availability", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    chaletId: z.number().int().positive(),
    dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodMorning: z.boolean().default(false),
    periodEvening: z.boolean().default(false),
    periodFullDay: z.boolean().default(false),
    notes: z.string().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const existing = await db
    .select()
    .from(chaletAvailabilityTable)
    .where(
      and(
        eq(chaletAvailabilityTable.chaletId, body.data.chaletId),
        eq(chaletAvailabilityTable.dateStr, body.data.dateStr),
        eq(chaletAvailabilityTable.ownerId, ownerId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(chaletAvailabilityTable)
      .set({
        periodMorning: body.data.periodMorning,
        periodEvening: body.data.periodEvening,
        periodFullDay: body.data.periodFullDay,
        notes: body.data.notes ?? null,
      })
      .where(eq(chaletAvailabilityTable.id, existing[0].id))
      .returning();
    return res.json(updated);
  }

  const [row] = await db
    .insert(chaletAvailabilityTable)
    .values({ ...body.data, ownerId })
    .returning();

  return res.status(201).json(row);
});

router.delete("/availability/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db
    .delete(chaletAvailabilityTable)
    .where(and(eq(chaletAvailabilityTable.id, id), eq(chaletAvailabilityTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Plan Limits ───────────────────────────────────────────── */

router.get("/plan-limits", async (req, res) => {
  const ownerId = req.user!.id;

  const [sub] = await db
    .select()
    .from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, ownerId));

  const plan = sub?.plan ?? "trial";

  const CHALET_LIMITS: Record<string, number> = {
    trial: 1,
    chalet_basic: 1,
    chalet_pro: 5,
    chalet_unlimited: Infinity,
    service_basic: 0,
    service_pro: Infinity,
    bundle: Infinity,
    monthly: 1,
    yearly: 3,
  };
  const SERVICE_LIMITS: Record<string, number> = {
    trial: 1,
    chalet_basic: 0,
    chalet_pro: 0,
    chalet_unlimited: 0,
    service_basic: 1,
    service_pro: Infinity,
    bundle: Infinity,
    monthly: 1,
    yearly: 3,
  };

  const chaletLimit = CHALET_LIMITS[plan] ?? 1;
  const serviceLimit = SERVICE_LIMITS[plan] ?? 1;

  const submissions = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));

  return res.json({
    plan,
    chaletLimit: chaletLimit === Infinity ? 999 : chaletLimit,
    serviceLimit: serviceLimit === Infinity ? 999 : serviceLimit,
    chaletCount: submissions.length,
  });
});

/* ── Monthly Reports ───────────────────────────────────────── */

router.get("/reports", async (req, res) => {
  const ownerId = req.user!.id;
  const month = (req.query.month as string) ?? new Date().toISOString().slice(0, 7);
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "تنسيق الشهر غير صحيح (YYYY-MM)" });
  }

  const allBookings = await db
    .select()
    .from(ownerBookingsTable)
    .where(eq(ownerBookingsTable.ownerId, ownerId));
  const filteredBookings = submissionId
    ? allBookings.filter((b) => b.submissionId === submissionId)
    : allBookings;

  const monthBookings = filteredBookings.filter((b) => b.bookingDate.startsWith(month));

  const totalBookings = monthBookings.length;
  const platformBookings = monthBookings.filter((b) => b.source === "platform");
  const externalBookings = monthBookings.filter((b) => b.source === "external");
  const totalDays = monthBookings.reduce((sum, b) => sum + (b.durationDays ?? 1), 0);

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const occupancyRate = totalDays > 0 ? Math.min(100, Math.round((totalDays / daysInMonth) * 100)) : 0;

  const slotStats = { morning: 0, evening: 0, full_day: 0, unspecified: 0 };
  for (const b of monthBookings) {
    if (b.period === "morning") slotStats.morning++;
    else if (b.period === "evening") slotStats.evening++;
    else if (b.period === "full_day") slotStats.full_day++;
    else slotStats.unspecified++;
  }

  const topSlot = Object.entries(slotStats)
    .filter(([k]) => k !== "unspecified")
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unspecified";

  const slotLabels: Record<string, string> = {
    morning: "صباحي",
    evening: "مسائي",
    full_day: "يوم كامل",
    unspecified: "غير محدد",
  };

  return res.json({
    month,
    totalBookings,
    platformBookings: platformBookings.length,
    externalBookings: externalBookings.length,
    totalDays,
    daysInMonth,
    occupancyRate,
    slotStats,
    topSlot,
    topSlotLabel: slotLabels[topSlot] ?? topSlot,
    bookings: monthBookings,
  });
});

/* ── Subscription ──────────────────────────────────────────── */

router.get("/subscription", async (req, res) => {
  const ownerId = req.user!.id;

  const [sub] = await db
    .select()
    .from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, ownerId));

  if (!sub) {
    const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return res.json({
      id: null,
      plan: "trial",
      status: "active",
      expiresAt: trialExpiry.toISOString(),
      paymentStatus: "pending",
      createdAt: new Date().toISOString(),
    });
  }

  return res.json(sub);
});

export default router;
