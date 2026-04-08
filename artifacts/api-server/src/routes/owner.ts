import { Router } from "express";
import { db } from "@workspace/db";
import {
  ownerBookingsTable,
  chaletSubmissionsTable,
  chaletsTable,
  chaletAvailabilityTable,
  ownerSubscriptionsTable,
  ownerExpensesTable,
  ownerStaffTable,
  salaryLogsTable,
  ownerReportArchiveTable,
  subscriptionPlansTable,
  reviewInvitationsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, gte, lte, sql, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
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
    clientPhone: z.string().optional(),
    bookingDate: z.string().min(1),
    durationDays: z.number().int().min(1).default(1),
    period: z.enum(["morning", "evening", "full_day"]).optional(),
    source: z.enum(["platform", "external"]).default("platform"),
    notes: z.string().optional(),
    revenueAmount: z.number().nonnegative().optional(),
    totalPrice: z.number().nonnegative().optional(),
    depositPaid: z.number().nonnegative().optional(),
    insuranceFee: z.number().nonnegative().optional(),
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

  const { revenueAmount, totalPrice, depositPaid, insuranceFee, ...restBooking } = body.data;
  const [booking] = await db
    .insert(ownerBookingsTable)
    .values({
      ...restBooking,
      ownerId,
      revenueAmount: revenueAmount !== undefined ? String(Math.round(revenueAmount)) : null,
      totalPrice: totalPrice !== undefined ? String(Math.round(totalPrice)) : null,
      depositPaid: depositPaid !== undefined ? String(Math.round(depositPaid)) : null,
      insuranceFee: insuranceFee !== undefined ? String(Math.round(insuranceFee)) : null,
    })
    .returning();

  return res.status(201).json(booking);
});

router.patch("/bookings/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  const body = z.object({
    balanceCollected: z.boolean().optional(),
    insuranceRefunded: z.boolean().optional(),
    insuranceDeducted: z.number().nonnegative().optional(),
    insuranceDeductReason: z.string().nullable().optional(),
    insuranceProofImages: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const { insuranceDeducted, insuranceProofImages, ...rest } = body.data;
  const [row] = await db
    .update(ownerBookingsTable)
    .set({
      ...rest,
      insuranceDeducted: insuranceDeducted !== undefined ? String(Math.round(insuranceDeducted)) : undefined,
      insuranceProofImages: insuranceProofImages !== undefined ? JSON.stringify(insuranceProofImages) : undefined,
    })
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "not found" });
  return res.json(row);
});

/* Phone lookup — auto-fill client name from previous bookings */
router.get("/bookings/lookup", async (req, res) => {
  const ownerId = req.user!.id;
  const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (phone.length < 3) return res.json(null);
  const rows = await db
    .select({ clientName: ownerBookingsTable.clientName, clientPhone: ownerBookingsTable.clientPhone })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, phone)))
    .limit(1);
  return res.json(rows[0] ?? null);
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

/* ── Review Invitations (owner generates for their own chalets) ── */

router.post("/review-invite", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({ chaletId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));

  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.status(403).json({ error: "غير مصرح" });

  const [chalet] = await db
    .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr })
    .from(chaletsTable)
    .where(and(eq(chaletsTable.id, body.data.chaletId), inArray(chaletsTable.submissionId, subIds)))
    .limit(1);

  if (!chalet) return res.status(403).json({ error: "غير مصرح أو الشاليه غير موجود" });

  const token = randomBytes(5).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(reviewInvitationsTable)
    .values({ token, chaletId: chalet.id, expiresAt })
    .returning();

  return res.json({ token: inv.token, chaletId: chalet.id, chaletName: chalet.nameAr });
});

router.get("/review-invitations", async (req, res) => {
  const ownerId = req.user!.id;

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));

  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.json([]);

  const myChalets = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(inArray(chaletsTable.submissionId, subIds));

  const chaletIds = myChalets.map((c) => c.id);
  if (chaletIds.length === 0) return res.json([]);

  const rows = await db
    .select()
    .from(reviewInvitationsTable)
    .where(inArray(reviewInvitationsTable.chaletId, chaletIds))
    .orderBy(desc(reviewInvitationsTable.createdAt));

  return res.json(rows);
});

/* ── Update chalet check-in/check-out times ────────────────── */

router.patch("/chalets/:chaletId/times", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);

  const body = z.object({
    checkInTime: z.string().nullable().optional(),
    checkOutTime: z.string().nullable().optional(),
    morningCheckIn: z.string().nullable().optional(),
    morningCheckOut: z.string().nullable().optional(),
    eveningCheckIn: z.string().nullable().optional(),
    eveningCheckOut: z.string().nullable().optional(),
    fullDayCheckIn: z.string().nullable().optional(),
    fullDayCheckOut: z.string().nullable().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));

  const subIds = subs.map((s) => s.id);

  const chaletRows = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(and(eq(chaletsTable.id, chaletId), inArray(chaletsTable.submissionId, subIds.length > 0 ? subIds : [-1])))
    .limit(1);

  if (chaletRows.length === 0) return res.status(403).json({ error: "غير مصرح" });

  const [updated] = await db
    .update(chaletsTable)
    .set({
      checkInTime: body.data.checkInTime ?? null,
      checkOutTime: body.data.checkOutTime ?? null,
      morningCheckIn: body.data.morningCheckIn ?? null,
      morningCheckOut: body.data.morningCheckOut ?? null,
      eveningCheckIn: body.data.eveningCheckIn ?? null,
      eveningCheckOut: body.data.eveningCheckOut ?? null,
      fullDayCheckIn: body.data.fullDayCheckIn ?? null,
      fullDayCheckOut: body.data.fullDayCheckOut ?? null,
    })
    .where(eq(chaletsTable.id, chaletId))
    .returning();

  return res.json(updated);
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

/* Plan config: price in SAR and duration */
const PLAN_CONFIG: Record<string, { price: number; days: number; label: string }> = {
  monthly:          { price: 99,   days: 30,  label: "الخطة الشهرية" },
  yearly:           { price: 799,  days: 365, label: "الخطة السنوية" },
  chalet_basic:     { price: 149,  days: 30,  label: "شاليه — أساسي" },
  chalet_pro:       { price: 299,  days: 30,  label: "شاليه — احترافي" },
  chalet_unlimited: { price: 499,  days: 30,  label: "شاليه — غير محدود" },
  service_basic:    { price: 99,   days: 30,  label: "خدمات — أساسي" },
  service_pro:      { price: 249,  days: 30,  label: "خدمات — احترافي" },
  bundle:           { price: 599,  days: 30,  label: "حزمة شاملة" },
};

/* GET /owner/plans — return available plans (DB-first, fallback to hardcoded) */
router.get("/plans", async (_req, res) => {
  const dbPlans = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.id);

  if (dbPlans.length > 0) {
    return res.json(
      dbPlans
        .filter((p) => p.isActive)
        .map((p) => ({
          id: p.slug,
          label: p.nameAr,
          price: Number(p.price),
          days: p.durationDays,
          trialDays: p.trialDays,
          features: p.features ?? [],
        }))
    );
  }

  // Fallback to hardcoded config if no plans in DB yet
  return res.json(
    Object.entries(PLAN_CONFIG).map(([id, cfg]) => ({ id, ...cfg }))
  );
});

/* POST /owner/subscription/initiate — create a Moyasar payment and return payment_id + form data */
router.post("/subscription/initiate", async (req, res) => {
  const ownerId = req.user!.id;
  const { plan } = req.body as { plan: string };

  // Resolve plan from DB or fallback to hardcoded
  let resolvedCfg: { price: number; days: number; label: string } | undefined;
  const [dbPlan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, plan))
    .limit(1);
  if (dbPlan) {
    resolvedCfg = { price: Number(dbPlan.price), days: dbPlan.durationDays, label: dbPlan.nameAr };
  } else {
    resolvedCfg = PLAN_CONFIG[plan];
  }

  if (!resolvedCfg) {
    return res.status(400).json({ error: "خطة غير صالحة" });
  }
  const cfg = resolvedCfg;

  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "بوابة الدفع غير مُهيأة — يرجى إضافة MOYASAR_SECRET_KEY" });
  }

  const amountHalala = cfg.price * 100; // Moyasar uses smallest currency unit

  // We do NOT pre-create the payment on server here.
  // Instead we return the publishable key and plan info, and let the client use
  // Moyasar.js form (hosted fields) to submit directly to Moyasar and get a payment_id back.
  // The client then calls /subscription/confirm with the payment_id.

  return res.json({
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
    plan,
    amountHalala,
    label: cfg.label,
    days: cfg.days,
  });
});

/* POST /owner/subscription/confirm — verify payment with Moyasar and activate subscription */
router.post("/subscription/confirm", async (req, res) => {
  const ownerId = req.user!.id;
  const { paymentId, plan } = req.body as { paymentId: string; plan: string };

  if (!paymentId || !plan) {
    return res.status(400).json({ error: "بيانات غير مكتملة" });
  }

  // Resolve plan from DB or fallback to hardcoded
  let resolvedConfirmCfg: { price: number; days: number; label: string } | undefined;
  const [dbConfirmPlan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, plan))
    .limit(1);
  if (dbConfirmPlan) {
    resolvedConfirmCfg = { price: Number(dbConfirmPlan.price), days: dbConfirmPlan.durationDays, label: dbConfirmPlan.nameAr };
  } else {
    resolvedConfirmCfg = PLAN_CONFIG[plan];
  }
  if (!resolvedConfirmCfg) {
    return res.status(400).json({ error: "خطة غير صالحة" });
  }
  const cfg = resolvedConfirmCfg;

  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "بوابة الدفع غير مُهيأة" });
  }

  // Fetch payment from Moyasar to verify it
  let moyasarPayment: any;
  try {
    const moyasarRes = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(secretKey + ":").toString("base64")}`,
      },
    });
    if (!moyasarRes.ok) {
      const errText = await moyasarRes.text();
      return res.status(400).json({ error: `فشل التحقق من الدفع: ${errText}` });
    }
    moyasarPayment = await moyasarRes.json();
  } catch (e: any) {
    return res.status(500).json({ error: `خطأ في الاتصال بموياسار: ${e.message}` });
  }

  // Verify payment status and amount
  const expectedAmount = cfg.price * 100;
  if (moyasarPayment.status !== "paid") {
    return res.status(400).json({ error: `حالة الدفع: ${moyasarPayment.status} — لم يكتمل` });
  }
  if (moyasarPayment.amount !== expectedAmount) {
    return res.status(400).json({ error: "المبلغ المدفوع لا يتطابق مع الخطة المطلوبة" });
  }

  // Activate / extend subscription
  const now = new Date();
  const [existing] = await db
    .select()
    .from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, ownerId));

  // If sub exists and is still active, extend from current expiry; otherwise from today
  const baseDate =
    existing?.expiresAt && new Date(existing.expiresAt) > now
      ? new Date(existing.expiresAt)
      : now;

  const newExpiry = new Date(baseDate.getTime() + cfg.days * 24 * 60 * 60 * 1000);

  if (existing) {
    await db
      .update(ownerSubscriptionsTable)
      .set({
        plan,
        status: "active",
        expiresAt: newExpiry,
        paymentStatus: "paid",
      })
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  } else {
    await db.insert(ownerSubscriptionsTable).values({
      ownerId,
      plan,
      status: "active",
      expiresAt: newExpiry,
      paymentStatus: "paid",
    });
  }

  // Return updated subscription + invoice details
  const [updated] = await db
    .select()
    .from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, ownerId));

  return res.json({
    subscription: updated,
    invoice: {
      paymentId: moyasarPayment.id,
      plan,
      label: cfg.label,
      amount: cfg.price,
      currency: "SAR",
      paidAt: moyasarPayment.created_at ?? now.toISOString(),
      expiresAt: newExpiry.toISOString(),
      ownerName: (req.user as any)?.firstName ?? "صاحب الحساب",
    },
  });
});

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

/* ── Expenses ──────────────────────────────────────────────── */

router.get("/expenses", async (req, res) => {
  const ownerId = req.user!.id;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const conditions = [eq(ownerExpensesTable.ownerId, ownerId)];
  if (month) {
    conditions.push(
      gte(ownerExpensesTable.dateStr, `${month}-01`),
      lte(ownerExpensesTable.dateStr, `${month}-31`),
    );
  }
  const rows = await db
    .select()
    .from(ownerExpensesTable)
    .where(and(...conditions))
    .orderBy(ownerExpensesTable.dateStr);
  return res.json(rows.reverse());
});

router.post("/expenses", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    submissionId: z.number().int().positive().optional(),
    dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.string().min(1),
    customCategory: z.string().optional(),
    amount: z.number().positive(),
    notes: z.string().optional(),
    receiptUrl: z.string().url().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten() });
  const { amount, ...expRest } = body.data;
  const [row] = await db
    .insert(ownerExpensesTable)
    .values({ ownerId, ...expRest, amount: String(amount) })
    .returning();
  return res.status(201).json(row);
});

router.delete("/expenses/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(ownerExpensesTable).where(and(eq(ownerExpensesTable.id, id), eq(ownerExpensesTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Staff ─────────────────────────────────────────────────── */

router.get("/staff", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.ownerId, ownerId))
    .orderBy(ownerStaffTable.createdAt);
  return res.json(rows);
});

router.post("/staff", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    name: z.string().min(1),
    baseSalary: z.number().nonnegative(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const [row] = await db
    .insert(ownerStaffTable)
    .values({ ownerId, name: body.data.name, baseSalary: String(body.data.baseSalary) })
    .returning();
  return res.status(201).json(row);
});

router.patch("/staff/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  const body = z.object({
    name: z.string().min(1).optional(),
    baseSalary: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const staffPatch: Record<string, unknown> = {};
  if (body.data.name !== undefined) staffPatch.name = body.data.name;
  if (body.data.isActive !== undefined) staffPatch.isActive = body.data.isActive;
  if (body.data.baseSalary !== undefined) staffPatch.baseSalary = String(body.data.baseSalary);
  const [row] = await db
    .update(ownerStaffTable)
    .set(staffPatch as any)
    .where(and(eq(ownerStaffTable.id, id), eq(ownerStaffTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "لم يُعثر على الموظف" });
  return res.json(row);
});

router.delete("/staff/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(ownerStaffTable).where(and(eq(ownerStaffTable.id, id), eq(ownerStaffTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Salary Logs ───────────────────────────────────────────── */

router.get("/salary-logs", async (req, res) => {
  const ownerId = req.user!.id;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const conditions = [eq(salaryLogsTable.ownerId, ownerId)];
  if (month) conditions.push(eq(salaryLogsTable.month, month));
  const logs = await db
    .select()
    .from(salaryLogsTable)
    .where(and(...conditions))
    .orderBy(salaryLogsTable.createdAt);
  return res.json(logs);
});

router.post("/salary-logs", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    staffId: z.number().int().positive(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    bonus: z.number().nonnegative().default(0),
    deduction: z.number().nonnegative().default(0),
    notes: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [staff] = await db
    .select()
    .from(ownerStaffTable)
    .where(and(eq(ownerStaffTable.id, body.data.staffId), eq(ownerStaffTable.ownerId, ownerId)));
  if (!staff) return res.status(403).json({ error: "غير مصرح" });

  const [existing] = await db
    .select()
    .from(salaryLogsTable)
    .where(and(eq(salaryLogsTable.staffId, body.data.staffId), eq(salaryLogsTable.month, body.data.month)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(salaryLogsTable)
      .set({ bonus: String(body.data.bonus), deduction: String(body.data.deduction), notes: body.data.notes ?? null })
      .where(eq(salaryLogsTable.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const [row] = await db
    .insert(salaryLogsTable)
    .values({
      ownerId,
      staffId: body.data.staffId,
      month: body.data.month,
      bonus: String(body.data.bonus),
      deduction: String(body.data.deduction),
      notes: body.data.notes ?? null,
    })
    .returning();
  return res.status(201).json(row);
});

/* Payment history – all paid logs with staff name */
router.get("/salary-logs/history", async (req, res) => {
  const ownerId = req.user!.id;
  const staffId = typeof req.query.staffId === "string" ? Number(req.query.staffId) : undefined;
  const conditions: ReturnType<typeof eq>[] = [
    eq(salaryLogsTable.ownerId, ownerId),
    sql`${salaryLogsTable.paidAt} IS NOT NULL` as any,
  ];
  if (staffId && !isNaN(staffId)) conditions.push(eq(salaryLogsTable.staffId, staffId) as any);
  const rows = await db
    .select({
      id: salaryLogsTable.id,
      staffId: salaryLogsTable.staffId,
      staffName: ownerStaffTable.name,
      baseSalary: ownerStaffTable.baseSalary,
      month: salaryLogsTable.month,
      bonus: salaryLogsTable.bonus,
      deduction: salaryLogsTable.deduction,
      notes: salaryLogsTable.notes,
      paidAt: salaryLogsTable.paidAt,
      expenseId: salaryLogsTable.expenseId,
    })
    .from(salaryLogsTable)
    .innerJoin(ownerStaffTable, eq(salaryLogsTable.staffId, ownerStaffTable.id))
    .where(and(...conditions))
    .orderBy(sql`${salaryLogsTable.paidAt} DESC`);
  return res.json(rows);
});

/* Pay salary – marks log as paid + auto-creates expense */
router.post("/salary-logs/pay", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    staffId: z.number().int().positive(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    bonus: z.number().nonnegative().default(0),
    deduction: z.number().nonnegative().default(0),
    notes: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [staff] = await db
    .select()
    .from(ownerStaffTable)
    .where(and(eq(ownerStaffTable.id, body.data.staffId), eq(ownerStaffTable.ownerId, ownerId)));
  if (!staff) return res.status(403).json({ error: "غير مصرح" });

  const netSalary = Number(staff.baseSalary) + body.data.bonus - body.data.deduction;
  const paidAt = new Date();
  const dateStr = paidAt.toISOString().slice(0, 10);

  /* Create expense entry automatically */
  const [expense] = await db
    .insert(ownerExpensesTable)
    .values({
      ownerId,
      category: "salaries",
      amount: String(netSalary),
      dateStr,
      notes: `راتب ${staff.name} – ${body.data.month}${body.data.notes ? ` – ${body.data.notes}` : ""}`,
      receiptUrl: null,
      submissionId: null,
    })
    .returning();

  /* Upsert salary log with paidAt + expenseId */
  const [existing] = await db
    .select()
    .from(salaryLogsTable)
    .where(and(eq(salaryLogsTable.staffId, body.data.staffId), eq(salaryLogsTable.month, body.data.month)))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(salaryLogsTable)
      .set({
        bonus: String(body.data.bonus),
        deduction: String(body.data.deduction),
        notes: body.data.notes ?? null,
        paidAt,
        expenseId: expense.id,
      })
      .where(eq(salaryLogsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(salaryLogsTable)
      .values({
        ownerId,
        staffId: body.data.staffId,
        month: body.data.month,
        bonus: String(body.data.bonus),
        deduction: String(body.data.deduction),
        notes: body.data.notes ?? null,
        paidAt,
        expenseId: expense.id,
      })
      .returning();
  }

  return res.json({ salaryLog: row, expense });
});

router.delete("/salary-logs/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(salaryLogsTable).where(and(eq(salaryLogsTable.id, id), eq(salaryLogsTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Financial Summary ─────────────────────────────────────── */

router.get("/financial-summary", async (req, res) => {
  const ownerId = req.user!.id;

  // Build last 6 months list
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const selectedMonth = (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month))
    ? req.query.month
    : months[months.length - 1];
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  // Revenue: sum of revenueAmount in ownerBookings for this month
  const bookingConditions = [
    eq(ownerBookingsTable.ownerId, ownerId),
    gte(ownerBookingsTable.bookingDate, `${selectedMonth}-01`),
    lte(ownerBookingsTable.bookingDate, `${selectedMonth}-31`),
  ];
  if (submissionId) bookingConditions.push(eq(ownerBookingsTable.submissionId, submissionId));

  const monthBookings = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(...bookingConditions));

  // Revenue: if totalPrice is set, use deposit + remaining (if collected); else fall back to revenueAmount
  const calcBookingRevenue = (b: typeof monthBookings[number]) => {
    if (b.totalPrice !== null) {
      const deposit = Number(b.depositPaid ?? 0);
      const remaining = Number(b.totalPrice) - deposit;
      return deposit + (b.balanceCollected ? remaining : 0);
    }
    return b.revenueAmount ? Number(b.revenueAmount) : 0;
  };
  // Insurance deductions → treated as revenue under "تلفيات" category
  const totalInsuranceDeducted = monthBookings.reduce((s, b) =>
    s + (b.insuranceDeducted ? Number(b.insuranceDeducted) : 0), 0);
  const totalRevenue = monthBookings.reduce((s, b) => s + calcBookingRevenue(b), 0) + totalInsuranceDeducted;
  // Insurance held (refundable, NOT in revenue — only unresolved insurance fees)
  const totalInsuranceHeld = monthBookings.reduce((s, b) =>
    s + (!b.insuranceRefunded && b.insuranceFee ? Number(b.insuranceFee) : 0), 0);

  // Expenses: for this month
  const expenseConditions = [
    eq(ownerExpensesTable.ownerId, ownerId),
    gte(ownerExpensesTable.dateStr, `${selectedMonth}-01`),
    lte(ownerExpensesTable.dateStr, `${selectedMonth}-31`),
  ];
  if (submissionId) expenseConditions.push(eq(ownerExpensesTable.submissionId, submissionId));

  const monthExpenses = await db
    .select()
    .from(ownerExpensesTable)
    .where(and(...expenseConditions));

  const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Salary expenses for this month (not linked to submission)
  const salaryLogs = await db
    .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
    .from(salaryLogsTable)
    .where(and(eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, selectedMonth)));

  const staffRows = await db
    .select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary })
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.ownerId, ownerId));

  const staffMap = Object.fromEntries(staffRows.map((s) => [s.id, Number(s.baseSalary)]));
  const totalSalaries = salaryLogs.reduce((s, log) => {
    const base = staffMap[log.staffId] ?? 0;
    return s + base + Number(log.bonus) - Number(log.deduction);
  }, 0);

  // Expense breakdown by category
  const categoryTotals: Record<string, number> = {};
  for (const e of monthExpenses) {
    categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
  }
  if (totalSalaries > 0) {
    categoryTotals["salaries"] = (categoryTotals["salaries"] ?? 0) + totalSalaries;
  }
  const totalExpensesAll = totalExpenses + totalSalaries;
  const netProfit = totalRevenue - totalExpensesAll;
  // Insurance revenue category (deductions from insurance → تلفيات)
  const insuranceRevenueTotals: Record<string, number> = {};
  if (totalInsuranceDeducted > 0) {
    insuranceRevenueTotals["insurance_damage"] = totalInsuranceDeducted;
  }

  // Monthly trend for chart (last 6 months)
  const trend = await Promise.all(months.map(async (m) => {
    const bConds = [
      eq(ownerBookingsTable.ownerId, ownerId),
      gte(ownerBookingsTable.bookingDate, `${m}-01`),
      lte(ownerBookingsTable.bookingDate, `${m}-31`),
    ];
    if (submissionId) bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
    const bRows = await db
      .select({ rev: ownerBookingsTable.revenueAmount, totalPrice: ownerBookingsTable.totalPrice, depositPaid: ownerBookingsTable.depositPaid, balanceCollected: ownerBookingsTable.balanceCollected })
      .from(ownerBookingsTable).where(and(...bConds));
    const rev = bRows.reduce((s, r) => {
      if (r.totalPrice !== null) {
        const dep = Number(r.depositPaid ?? 0);
        return s + dep + (r.balanceCollected ? Number(r.totalPrice) - dep : 0);
      }
      return s + (r.rev ? Number(r.rev) : 0);
    }, 0);

    const eConds = [
      eq(ownerExpensesTable.ownerId, ownerId),
      gte(ownerExpensesTable.dateStr, `${m}-01`),
      lte(ownerExpensesTable.dateStr, `${m}-31`),
    ];
    if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
    const eRows = await db.select({ amt: ownerExpensesTable.amount }).from(ownerExpensesTable).where(and(...eConds));
    const exp = eRows.reduce((s, r) => s + Number(r.amt), 0);

    const slRows = await db
      .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
      .from(salaryLogsTable)
      .where(and(eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, m)));
    const salExp = slRows.reduce((s, log) => {
      const base = staffMap[log.staffId] ?? 0;
      return s + base + Number(log.bonus) - Number(log.deduction);
    }, 0);

    return { month: m, revenue: rev, expenses: exp + salExp };
  }));

  // Deposit / pending breakdown for Revenue tab
  const totalDeposits = Math.round(monthBookings.reduce((s, b) => s + Number(b.depositPaid ?? 0), 0));
  const totalPendingBalance = Math.round(monthBookings.reduce((s, b) => {
    if (!b.totalPrice || b.balanceCollected) return s;
    return s + Math.max(0, Number(b.totalPrice) - Number(b.depositPaid ?? 0));
  }, 0));

  return res.json({
    month: selectedMonth,
    totalRevenue,
    totalDeposits,
    totalPendingBalance,
    totalInsuranceHeld,
    totalInsuranceDeducted,
    totalExpenses: totalExpensesAll,
    netProfit,
    categoryTotals,
    insuranceRevenueTotals,
    trend,
  });
});

/* ── Yearly Summary ─────────────────────────────────────────── */

router.get("/yearly-summary", async (req, res) => {
  const ownerId = req.user!.id;
  const year = (typeof req.query.year === "string" && /^\d{4}$/.test(req.query.year))
    ? req.query.year
    : new Date().getFullYear().toString();
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  const staffRows = await db
    .select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary })
    .from(ownerStaffTable)
    .where(eq(ownerStaffTable.ownerId, ownerId));
  const staffMap = Object.fromEntries(staffRows.map((s) => [s.id, Number(s.baseSalary)]));

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const monthly = await Promise.all(months.map(async (m) => {
    const bConds: any[] = [
      eq(ownerBookingsTable.ownerId, ownerId),
      gte(ownerBookingsTable.bookingDate, `${m}-01`),
      lte(ownerBookingsTable.bookingDate, `${m}-31`),
    ];
    if (submissionId) bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
    const bRows = await db
      .select({ rev: ownerBookingsTable.revenueAmount, totalPrice: ownerBookingsTable.totalPrice, depositPaid: ownerBookingsTable.depositPaid, balanceCollected: ownerBookingsTable.balanceCollected })
      .from(ownerBookingsTable).where(and(...bConds));
    const revenue = bRows.reduce((s, r) => {
      if (r.totalPrice !== null) {
        const dep = Number(r.depositPaid ?? 0);
        return s + dep + (r.balanceCollected ? Number(r.totalPrice) - dep : 0);
      }
      return s + (r.rev ? Number(r.rev) : 0);
    }, 0);

    const eConds: any[] = [
      eq(ownerExpensesTable.ownerId, ownerId),
      gte(ownerExpensesTable.dateStr, `${m}-01`),
      lte(ownerExpensesTable.dateStr, `${m}-31`),
    ];
    if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
    const eRows = await db.select({ amt: ownerExpensesTable.amount }).from(ownerExpensesTable).where(and(...eConds));
    const exp = eRows.reduce((s, r) => s + Number(r.amt), 0);

    const slRows = await db
      .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
      .from(salaryLogsTable)
      .where(and(eq(salaryLogsTable.ownerId, ownerId), eq(salaryLogsTable.month, m)));
    const salExp = slRows.reduce((s, log) => {
      const base = staffMap[log.staffId] ?? 0;
      return s + base + Number(log.bonus) - Number(log.deduction);
    }, 0);

    const expenses = exp + salExp;
    return { month: m, revenue, expenses, netProfit: revenue - expenses };
  }));

  const totals = monthly.reduce(
    (s, m) => ({ revenue: s.revenue + m.revenue, expenses: s.expenses + m.expenses, netProfit: s.netProfit + m.netProfit }),
    { revenue: 0, expenses: 0, netProfit: 0 },
  );

  return res.json({ year, monthly, totals });
});

/* ── Report Archive ─────────────────────────────────────────── */

router.get("/reports/archive", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerReportArchiveTable)
    .where(eq(ownerReportArchiveTable.ownerId, ownerId))
    .orderBy(sql`${ownerReportArchiveTable.createdAt} DESC`);
  return res.json(rows);
});

router.post("/reports/archive", async (req, res) => {
  const ownerId = req.user!.id;
  const { reportType, reportPeriod, submissionId, propertyName, pdfUrl, data } = req.body;
  if (!reportType || !reportPeriod) return res.status(400).json({ error: "Missing required fields" });

  const existing = await db
    .select({ id: ownerReportArchiveTable.id })
    .from(ownerReportArchiveTable)
    .where(and(
      eq(ownerReportArchiveTable.ownerId, ownerId),
      eq(ownerReportArchiveTable.reportType, reportType),
      eq(ownerReportArchiveTable.reportPeriod, reportPeriod),
      submissionId
        ? eq(ownerReportArchiveTable.submissionId, submissionId)
        : sql`${ownerReportArchiveTable.submissionId} IS NULL` as any,
    ))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(ownerReportArchiveTable)
      .set({ data, propertyName, pdfUrl: pdfUrl ?? null, createdAt: new Date() })
      .where(eq(ownerReportArchiveTable.id, existing[0].id))
      .returning();
    return res.json(updated);
  }

  const [created] = await db
    .insert(ownerReportArchiveTable)
    .values({ ownerId, reportType, reportPeriod, submissionId: submissionId ?? null, propertyName, pdfUrl: pdfUrl ?? null, data })
    .returning();
  return res.json(created);
});

router.delete("/reports/archive/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db
    .delete(ownerReportArchiveTable)
    .where(and(eq(ownerReportArchiveTable.id, id), eq(ownerReportArchiveTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

export default router;
