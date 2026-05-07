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
  staffSessionsTable,
  salaryLogsTable,
  ownerReportArchiveTable,
  subscriptionPlansTable,
  reviewInvitationsTable,
  reviewsTable,
  ownerNotificationsTable,
  ownerRescheduleLogsTable,
  chaletSeasonsTable,
  customerNotesTable,
  chaletServicesTable,
  ownerNotificationSettingsTable,
  serviceAppointmentsTable,
  serviceProvidersTable,
  ownerTempSessionsTable,
  ownerRefundsTable,
} from "@workspace/db/schema";
import bcrypt from "bcryptjs";
import { eq, and, ne, inArray, gte, lte, sql, desc, isNull, isNotNull } from "drizzle-orm";
import { randomBytes, createHash, randomInt } from "crypto";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { sendOtpEmail } from "../lib/email";

const router = Router();

/* ── Platform-admin guard ───────────────────────────────────────
   Only the designated platform admin Replit account(s) may view
   all owners or create sessions for other owners.
   Set PLATFORM_ADMIN_IDS to a comma-separated list of Replit user
   sub values (e.g. "56719001") or leave unset to use the default.
   ──────────────────────────────────────────────────────────────── */
const PLATFORM_ADMIN_IDS = new Set(
  (process.env.PLATFORM_ADMIN_IDS ?? "56719001")
    .split(",").map(s => s.trim()).filter(Boolean)
);
function isPlatformAdmin(req: Request): boolean {
  return !!(req.user?.id && PLATFORM_ADMIN_IDS.has(String(req.user.id)));
}

/* ── Shared Hijri date helper ───────────────────────────────── */
/** Convert a "YYYY-MM-DD" Gregorian string to its Hijri {year, month} using Umm al-Qura. */
function getHijriYM(dateStr: string): { year: number; month: number } {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(d);
    return {
      year:  Number(parts.find(p => p.type === "year")?.value  ?? 0),
      month: Number(parts.find(p => p.type === "month")?.value ?? 0),
    };
  } catch { return { year: 0, month: 0 }; }
}

const HIJRI_MONTH_NAMES = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

/** Extract the Hijri day-of-month from a "YYYY-MM-DD" string using Umm al-Qura. */
function getHijriDay(dateStr: string): number {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric" }).formatToParts(d);
    return Number(parts.find(p => p.type === "day")?.value ?? 0);
  } catch { return 0; }
}

/** Recognised revenue for one booking row (deposit + balance if collected; falls back to revenueAmount, then depositPaid). */
function calcBookingRev(b: { totalPrice: string | null; depositPaid: string | null; balanceCollected: boolean | null; revenueAmount: string | null }): number {
  if (b.totalPrice !== null) {
    const dep = Number(b.depositPaid ?? 0);
    return dep + (b.balanceCollected ? Number(b.totalPrice) - dep : 0);
  }
  if (b.revenueAmount) return Number(b.revenueAmount);
  return Number(b.depositPaid ?? 0);
}

const DEFAULT_BOOKING_CONFIRMATION_TEMPLATE = "مرحباً {اسم_العميل}، تم تأكيد حجزك في {اسم_العقار} بتاريخ {التاريخ}. نسعد باستقبالك.\n\nقيمة الإيجار: {الإيجار} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي للدفع عند الوصول: {المتبقي} ريال.";
const DEFAULT_CANCELLATION_TEMPLATE = "مرحباً {اسم_العميل}، نود إشعارك بإلغاء حجزك في {اسم_العقار} بتاريخ {التاريخ}.\n\nالسبب: {سبب_الإلغاء}.\n\nتفاصيل المبالغ المُستردّة:\n• استرداد العربون: {استرداد_العربون} ريال\n• استرداد التأمين: {استرداد_التأمين} ريال\n• إجمالي المبلغ المسترد: {إجمالي_المسترد} ريال";
const DEFAULT_MODIFICATION_TEMPLATE = "مرحباً {اسم_العميل}، تم تعديل حجزك في {اسم_العقار} بناءً على ({سبب_التعديل}).\n\nالحجز السابق: يوم {اسم_اليوم_من} ({من_التاريخ} | {من_التاريخ_م}) - فترة {الفترة_القديمة}.\n\nالحجز الجديد: يوم {اسم_اليوم_إلى} ({إلى_التاريخ} | {إلى_التاريخ_م}) - فترة {الفترة_الجديدة}.\n\nقيمة الإيجار: {الإيجار} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي للدفع عند الوصول: {المتبقي} ريال.";

/* ── OTP helpers (mirrors registration.ts helpers) ─────────── */
function _genCode(): string { return String(randomInt(100000, 999999)); }
function _hashCode(code: string): string { return createHash("sha256").update(code).digest("hex"); }
async function _createOtp(email: string, code: string): Promise<void> {
  const hash = _hashCode(code);
  const exp  = new Date(Date.now() + 10 * 60 * 1000);
  await db.execute(
    sql`INSERT INTO owner_otp_tokens (email, code_hash, expires_at) VALUES (${email}, ${hash}, ${exp.toISOString()})`
  );
}
async function _verifyOtp(email: string, code: string): Promise<boolean> {
  const hash = _hashCode(code);
  const r = await db.execute(
    sql`SELECT id FROM owner_otp_tokens WHERE email = ${email} AND code_hash = ${hash} AND expires_at > now() AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`
  );
  const row = ((r as any).rows as Array<{ id: number }>)[0];
  if (!row) return false;
  await db.execute(sql`UPDATE owner_otp_tokens SET used_at = now() WHERE id = ${row.id}`);
  return true;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  /* ── Path 1: Admin impersonation via owner_temp_session cookie ── */
  const tempToken = (req.cookies as Record<string, string>)?.owner_temp_session;
  if (tempToken) {
    const r = await db.execute<{ owner_id: string }>(
      sql`SELECT owner_id FROM owner_temp_sessions
          WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
    );
    const row = ((r as any).rows as Array<{ owner_id: string }>)[0];
    if (row?.owner_id) {
      (req as any).user = { id: row.owner_id, isImpersonated: true };
      next(); return;
    }
    /* Token invalid/expired — clear stale cookie and fall through */
    res.clearCookie("owner_temp_session");
  }

  /* ── Path 2: Normal owner Passport session ── */
  if (req.isAuthenticated()) { next(); return; }

  res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
}

/* ─────────────────────────────────────────────────────────────
   Token-based Session Entry  (no auth required — token IS auth)
   GET /api/owner/enter-session?token=...
   Validates the one-time token, sets httpOnly cookie, redirects
   to /dashboard.
   ───────────────────────────────────────────────────────────── */
const TEMP_SESSION_COOKIE = "owner_temp_session";
const TEMP_SESSION_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 6 * 60 * 60 * 1000, /* 6 hours */
};

router.get("/enter-session", async (req, res) => {
  const token = String(req.query.token ?? "").trim();
  if (!token) return res.status(400).send("رمز مفقود");

  /* Clear any stale old-style impersonation cookies first */
  res.clearCookie("oidc_impersonate");
  res.clearCookie("admin_staff_sid");

  const r = await db.execute<{ owner_id: string; expires_at: Date }>(
    sql`SELECT owner_id, expires_at FROM owner_temp_sessions
        WHERE token = ${token} AND expires_at > now() LIMIT 1`
  );
  const sessionRow = ((r as any).rows as Array<{ owner_id: string; expires_at: Date }>)[0];
  if (!sessionRow) return res.status(400).send("الرمز غير صالح أو منتهي الصلاحية");

  /* Extend session lifetime to 6 hours from now */
  const newExpiry = new Date(Date.now() + 6 * 60 * 60 * 1000);
  await db.execute(
    sql`UPDATE owner_temp_sessions SET expires_at = ${newExpiry} WHERE token = ${token}`
  );

  res.cookie(TEMP_SESSION_COOKIE, token, TEMP_SESSION_OPTS);
  const frontendBase = process.env.FRONTEND_URL ?? "";
  return res.redirect(`${frontendBase}/dashboard`);
});

/* ── GET /owner/available-owners ────────────────────────────────
   Platform admins → all real owner IDs (for the switcher banner).
   Regular owners  → only their own owner_N key(s).
   ─────────────────────────────────────────────────────────────── */
router.get("/available-owners", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "يجب تسجيل الدخول" });

  if (isPlatformAdmin(req)) {
    /* Admin: return every non-demo, non-numeric owner */
    const r = await db.execute<{ owner_id: string; name_ar: string }>(
      sql`SELECT owner_id, MIN(name_ar) AS name_ar
          FROM chalet_submissions
          WHERE owner_id NOT LIKE '__demo%'
            AND NOT (owner_id ~ '^[0-9]+$')
          GROUP BY owner_id
          ORDER BY owner_id`
    );
    const rows = (r as any).rows as Array<{ owner_id: string; name_ar: string }>;
    return res.json(rows.map(row => ({ ownerId: row.owner_id, name: row.name_ar ?? row.owner_id })));
  }

  /* Regular owner: resolve their own owner_N key only */
  const email = await resolveOwnerEmail(req);
  if (!email) return res.json([]);

  const r = await db.execute<{ owner_id: string; name_ar: string }>(
    sql`SELECT cs.owner_id, MIN(cs.name_ar) AS name_ar
        FROM chalet_submissions cs
        JOIN owner_applications oa ON LOWER(oa.email) = LOWER(${email})
        WHERE cs.owner_id = CONCAT('owner_', oa.id::text)
          AND cs.owner_id NOT LIKE '__demo%'
        GROUP BY cs.owner_id
        ORDER BY cs.owner_id`
  );
  const rows = (r as any).rows as Array<{ owner_id: string; name_ar: string }>;
  return res.json(rows.map(row => ({ ownerId: row.owner_id, name: row.name_ar ?? row.owner_id })));
});

/* ── POST /owner/auto-session ───────────────────────────────────
   Platform admins → may create a session for any owner.
   Regular owners  → may only create a session for their own
                     owner_N key (self-activation, not impersonation).
   ─────────────────────────────────────────────────────────────── */
router.post("/auto-session", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  const ownerId = String(req.body?.ownerId ?? "").trim();
  if (!ownerId) return res.status(400).json({ error: "ownerId مطلوب" });

  if (!isPlatformAdmin(req)) {
    /* Non-admin: verify the requested ownerId belongs to this user */
    const email = await resolveOwnerEmail(req);
    if (!email) return res.status(403).json({ error: "غير مصرح" });

    const ownerCheck = await db.execute<{ owner_id: string }>(
      sql`SELECT cs.owner_id
          FROM chalet_submissions cs
          JOIN owner_applications oa ON LOWER(oa.email) = LOWER(${email})
          WHERE cs.owner_id = ${ownerId}
            AND cs.owner_id = CONCAT('owner_', oa.id::text)
          LIMIT 1`
    );
    if (!((ownerCheck as any).rows as any[]).length) {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول إلى حساب مالك آخر" });
    }
  }

  const check = await db.execute<{ owner_id: string }>(
    sql`SELECT owner_id FROM chalet_submissions WHERE owner_id = ${ownerId} LIMIT 1`
  );
  if (!((check as any).rows as any[]).length) return res.status(404).json({ error: "المالك غير موجود" });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  /* '__owner_self__' = owner activated their own session (not an admin impersonating) */
  const adminLabel = isPlatformAdmin(req) ? 'مدير المنصة' : '__owner_self__';
  await db.execute(
    sql`INSERT INTO owner_temp_sessions (token, owner_id, admin_label, expires_at)
        VALUES (${token}, ${ownerId}, ${adminLabel}, ${expiresAt})`
  );
  return res.json({ token });
});

router.use(requireAuth);

/* ── Impersonation Mode check (called by Dashboard banner) ── */
router.get("/impersonation-mode", async (req, res) => {
  const tempToken = (req.cookies as Record<string, string>)?.owner_temp_session;
  if (!tempToken || !(req as any).user?.isImpersonated) {
    return res.json({ active: false });
  }

  const r = await db.execute<{ owner_id: string; admin_label: string | null }>(
    sql`SELECT owner_id, admin_label FROM owner_temp_sessions
        WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
  );
  const sessionRow = ((r as any).rows as Array<{ owner_id: string; admin_label: string | null }>)[0];
  if (!sessionRow) return res.json({ active: false });

  /* Fetch owner display name */
  const or = await db.execute<{ name_ar: string }>(
    sql`SELECT name_ar FROM chalet_submissions WHERE owner_id = ${sessionRow.owner_id}
        ORDER BY created_at ASC LIMIT 1`
  );
  const ownerRow = ((or as any).rows as Array<{ name_ar: string }>)[0];

  return res.json({
    active: true,
    ownerId: sessionRow.owner_id,
    adminLabel: sessionRow.admin_label ?? "مشرف",
    ownerName: ownerRow?.name_ar ?? null,
  });
});

/* ── Exit impersonation session ── */
router.post("/exit-session", async (req, res) => {
  const tempToken = (req.cookies as Record<string, string>)?.owner_temp_session;
  if (tempToken) {
    /* Expire the token immediately in the DB */
    await db.execute(
      sql`UPDATE owner_temp_sessions SET expires_at = now() WHERE token = ${tempToken}`
    );
  }
  res.clearCookie(TEMP_SESSION_COOKIE);
  return res.json({ ok: true });
});

/* ── Helper: resolve the owner_applications email for the current session ──
   Strategy 1 – direct email from session (owner-login sessions store email).
   Strategy 2 – look up the users table by Replit user-id, then match email.
   Strategy 3 – look up via chalet_submissions.owner_id → users.email.
   Returns null only if no matching owner_application can be found.
   ──────────────────────────────────────────────────────────────────────── */
async function resolveOwnerEmail(req: Request): Promise<string | null> {
  const sessionEmail = req.user?.email ?? null;
  const userId       = req.user?.id ?? null;

  /* Strategy 1 — session email matches an owner_application */
  if (sessionEmail) {
    const r = await db.execute(
      sql`SELECT email FROM owner_applications WHERE email = ${sessionEmail} LIMIT 1`
    );
    const hit = ((r as any).rows as Array<{ email: string }>)[0];
    if (hit) return hit.email;
  }

  /* Strategy 2 — Replit user ID → users.email → owner_applications */
  if (userId) {
    const r = await db.execute(
      sql`SELECT oa.email
          FROM owner_applications oa
          JOIN users u ON lower(u.email) = lower(oa.email)
          WHERE u.id = ${userId}
          LIMIT 1`
    );
    const hit = ((r as any).rows as Array<{ email: string }>)[0];
    if (hit) return hit.email;
  }

  /* Strategy 3 — Replit user ID used as ownerId in chalet_submissions → email via users */
  if (userId) {
    const r = await db.execute(
      sql`SELECT oa.email
          FROM chalet_submissions cs
          JOIN users u ON u.id = cs.owner_id
          JOIN owner_applications oa ON lower(oa.email) = lower(u.email)
          WHERE cs.owner_id = ${userId}
          LIMIT 1`
    );
    const hit = ((r as any).rows as Array<{ email: string }>)[0];
    if (hit) return hit.email;
  }

  /* Strategy 4 — admin-assigned "owner_N" key → owner_applications by numeric id
   * When admin adds a property for an owner, chalet_submissions.owner_id = "owner_N"
   * (where N = owner_applications.id). We parse N and look up directly. */
  if (userId && /^owner_\d+$/.test(String(userId))) {
    const n = parseInt(String(userId).replace("owner_", ""), 10);
    if (!isNaN(n)) {
      const r = await db.execute(
        sql`SELECT email FROM owner_applications WHERE id = ${n} LIMIT 1`
      );
      const hit = ((r as any).rows as Array<{ email: string }>)[0];
      if (hit?.email) return hit.email;
    }
  }

  return null;
}

/* ── GET /owner/profile — fetch owner profile ──────────────── */
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user?.id ?? null;

    /* ── Path 1: owner has an owner_applications record ── */
    const email = await resolveOwnerEmail(req);
    if (email) {
      /* Phone: prefer owner_applications.phone, fall back to chalet_submissions.whatsapp_number
         for the same owner (matching by userId in chalet_submissions) */
      let phone = "";
      const oaResult = await db.execute(
        sql`SELECT full_name, phone, email, whatsapp_news_subscribe FROM owner_applications WHERE email = ${email} LIMIT 1`
      );
      const oaRow = ((oaResult as any).rows as Array<{ full_name: string; phone: string; email: string; whatsapp_news_subscribe: boolean }>)[0];
      if (!oaRow) {
        return res.json({ fullName: req.user?.firstName ?? "", phone: "", email: email, noApplication: true });
      }
      phone = oaRow.phone ?? "";
      /* If owner_applications.phone is empty, pull from chalet_submissions */
      if (!phone && userId) {
        const csResult = await db.execute(
          sql`SELECT whatsapp_number FROM chalet_submissions WHERE owner_id = ${userId} AND whatsapp_number IS NOT NULL AND whatsapp_number != '' ORDER BY created_at DESC LIMIT 1`
        );
        phone = ((csResult as any).rows as Array<{ whatsapp_number: string }>)[0]?.whatsapp_number ?? "";
      }
      console.log(`[GET /owner/profile] owner_applications path: email=${email} phone=${phone}`);
      return res.json({ fullName: oaRow.full_name, phone, email: oaRow.email, whatsappNewsSubscribe: oaRow.whatsapp_news_subscribe ?? false });
    }

    /* ── Path 2: Replit OIDC owner — look up via chalet_submissions ── */
    if (userId) {
      const csResult = await db.execute(
        sql`SELECT cs.whatsapp_number, cs.name_ar, u.email, u.first_name, u.last_name
            FROM chalet_submissions cs
            JOIN users u ON u.id = cs.owner_id
            WHERE cs.owner_id = ${userId}
              AND cs.owner_id NOT IN ('__demo_preview__')
            ORDER BY cs.created_at DESC
            LIMIT 1`
      );
      const csRow = ((csResult as any).rows as Array<{
        whatsapp_number: string; name_ar: string;
        email: string; first_name: string; last_name: string;
      }>)[0];
      if (csRow) {
        const fullName = [csRow.first_name, csRow.last_name].filter(Boolean).join(" ") || csRow.name_ar || "";
        console.log(`[GET /owner/profile] chalet_submissions path: userId=${userId} phone=${csRow.whatsapp_number}`);
        return res.json({ fullName, phone: csRow.whatsapp_number ?? "", email: csRow.email ?? req.user?.email ?? "" });
      }
    }

    /* ── Path 3: last resort — return whatever the session has ── */
    console.log(`[GET /owner/profile] no data found for userId=${userId} email=${req.user?.email}`);
    return res.json({ fullName: req.user?.firstName ?? "", phone: "", email: req.user?.email ?? "", noApplication: true });
  } catch (err) {
    console.error("[GET /owner/profile]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء جلب بيانات الحساب" });
  }
});

/* ── PUT /owner/profile — update owner profile ─────────────── */
router.put("/profile", async (req, res) => {
  try {
    const currentEmail = await resolveOwnerEmail(req);

    /* ── Path C: Replit OIDC owner (no owner_applications) — direct update via chalet_submissions ── */
    if (!currentEmail) {
      const userId = req.user?.id;
      if (!userId) return res.status(404).json({ error: "لم يتم العثور على حساب مرتبط بهذا المستخدم" });

      /* Verify this user actually has a chalet_submission */
      const csCheck = await db.execute(
        sql`SELECT id FROM chalet_submissions WHERE owner_id = ${userId} LIMIT 1`
      );
      if (!((csCheck as any).rows as Array<unknown>)[0]) {
        return res.status(404).json({ error: "لم يتم العثور على حساب مرتبط بهذا المستخدم" });
      }

      const { fullName, phone } = req.body as Record<string, string>;
      /* Update display name in users table */
      if (fullName?.trim()) {
        const parts = fullName.trim().split(" ");
        const firstName = parts[0] ?? "";
        const lastName  = parts.slice(1).join(" ") ?? null;
        await db.execute(
          sql`UPDATE users SET first_name = ${firstName}, last_name = ${lastName} WHERE id = ${userId}`
        );
      }
      /* Update phone in chalet_submissions */
      if (phone !== undefined) {
        await db.execute(
          sql`UPDATE chalet_submissions SET whatsapp_number = ${phone.trim()} WHERE owner_id = ${userId}`
        );
      }
      console.log(`[PUT /owner/profile] Path C (OIDC direct): userId=${userId} phone=${phone}`);
      return res.json({ ok: true });
    }

    const { fullName, phone, email: newEmail, currentPassword, newPassword, otp, otpTarget, sensitiveChange } = req.body as Record<string, string>;
    if (!fullName?.trim()) return res.status(400).json({ error: "الاسم الكامل مطلوب" });

    /* ── Path A: Sensitive change (email / phone) — requires OTP ── */
    if (sensitiveChange === "true") {
      if (!otp?.trim()) return res.status(400).json({ error: "رمز التحقق مطلوب" });
      if (!otpTarget?.trim()) return res.status(400).json({ error: "هدف التحقق مفقود" });
      const valid = await _verifyOtp(otpTarget.trim().toLowerCase(), otp.trim());
      if (!valid) return res.status(400).json({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" });

      const newPhoneClean = phone !== undefined ? (phone ?? "").trim() : null;
      const newEmailClean = newEmail ? newEmail.trim().toLowerCase() : null;

      const updates: string[] = [`full_name = '${fullName.trim().replace(/'/g, "''")}'`];
      if (newPhoneClean !== null) updates.push(`phone = '${newPhoneClean.replace(/'/g, "''")}'`);
      if (newEmailClean && newEmailClean !== currentEmail.toLowerCase()) {
        updates.push(`email = '${newEmailClean.replace(/'/g, "''")}'`);
      }
      await db.execute(sql.raw(`UPDATE owner_applications SET ${updates.join(", ")} WHERE email = '${currentEmail.replace(/'/g, "''")}'`));

      /* Keep chalet_submissions.whatsapp_number in sync with the admin panel */
      if (newPhoneClean) {
        const ownerIdRow = await db.execute(
          sql`SELECT u.id FROM users u WHERE lower(u.email) = lower(${currentEmail}) LIMIT 1`
        );
        const ownerId = ((ownerIdRow as any).rows as Array<{ id: string }>)[0]?.id;
        if (ownerId) {
          await db.execute(
            sql`UPDATE chalet_submissions SET whatsapp_number = ${newPhoneClean} WHERE owner_id = ${ownerId}`
          );
        }
      }
      return res.json({ ok: true });
    }

    /* ── Path B: Non-sensitive change (name / password only) ── */
    if (currentPassword && newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل" });
      const pwResult = await db.execute(
        sql`SELECT password_hash FROM owner_applications WHERE email = ${currentEmail} LIMIT 1`
      );
      const pwRow = ((pwResult as any).rows as Array<{ password_hash: string }>)[0];
      if (!pwRow?.password_hash) return res.status(400).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع الدعم" });
      const match = await bcrypt.compare(currentPassword, pwRow.password_hash);
      if (!match) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      const newHash = await bcrypt.hash(newPassword, 10);
      await db.execute(sql.raw(`UPDATE owner_applications SET full_name = '${fullName.trim().replace(/'/g, "''")}', password_hash = '${newHash}' WHERE email = '${currentEmail.replace(/'/g, "''")}'`));
    } else {
      await db.execute(sql.raw(`UPDATE owner_applications SET full_name = '${fullName.trim().replace(/'/g, "''")}' WHERE email = '${currentEmail.replace(/'/g, "''")}'`));
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[PUT /owner/profile]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء حفظ البيانات" });
  }
});

/* ── PATCH /owner/profile/whatsapp-subscribe — toggle WA news opt-in ── */
router.patch("/profile/whatsapp-subscribe", requireAuth, async (req, res) => {
  try {
    const currentEmail = await resolveOwnerEmail(req);
    if (!currentEmail) return res.status(404).json({ error: "لم يتم العثور على الحساب" });
    const { subscribe } = req.body as { subscribe: boolean };
    if (!!subscribe) {
      await db.execute(
        sql`UPDATE owner_applications SET whatsapp_news_subscribe = true, whatsapp_subscribed_at = COALESCE(whatsapp_subscribed_at, NOW()) WHERE email = ${currentEmail}`
      );
    } else {
      await db.execute(
        sql`UPDATE owner_applications SET whatsapp_news_subscribe = false WHERE email = ${currentEmail}`
      );
    }
    return res.json({ ok: true, subscribe: !!subscribe });
  } catch (err) {
    console.error("[PATCH /owner/profile/whatsapp-subscribe]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── POST /owner/support-request — submit a support/feature request ── */
router.post("/support-request", requireAuth, async (req, res) => {
  try {
    const { subject, message } = req.body as { subject?: string; message?: string };
    if (!subject?.trim()) return res.status(400).json({ error: "الموضوع مطلوب" });
    if (!message?.trim()) return res.status(400).json({ error: "نص الطلب مطلوب" });

    /* Resolve owner identity — use user ID as primary key */
    const ownerId = String(req.user?.id ?? (await resolveOwnerEmail(req)) ?? "unknown");

    /* Resolve name:
     *  1. Try owner_applications via email (works when owner_id IS an email)
     *  2. Try chalet_submissions.owner_id → whatsapp_number → owner_applications.phone
     *     (works when owner_id is a Replit numeric user ID or "owner_N" key)
     */
    let ownerName: string | null = null;
    try {
      // Strategy 1 — owner_id is email-shaped
      if (ownerId.includes("@")) {
        const r = await db.execute(sql`SELECT full_name FROM owner_applications WHERE LOWER(email) = LOWER(${ownerId}) LIMIT 1`);
        ownerName = ((r as any).rows as Array<{ full_name: string }>)[0]?.full_name ?? null;
      }
      // Strategy 2 — owner_id is Replit user ID or "owner_N" → join via chalet_submissions
      if (!ownerName) {
        const r = await db.execute(
          sql`SELECT oa.full_name FROM chalet_submissions cs
              JOIN owner_applications oa ON oa.phone = cs.whatsapp_number
              WHERE cs.owner_id = ${ownerId}
              LIMIT 1`
        );
        ownerName = ((r as any).rows as Array<{ full_name: string }>)[0]?.full_name ?? null;
      }
    } catch { /* ignore — name will be null, resolved at display time */ }

    await db.execute(
      sql`INSERT INTO owner_support_requests (owner_id, owner_name, subject, message, status, created_at)
          VALUES (${String(ownerId)}, ${ownerName}, ${subject.trim()}, ${message.trim()}, 'new', now())`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[POST /owner/support-request]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال الطلب" });
  }
});

/* ── GET /owner/support-requests — list this owner's support messages ── */
router.get("/support-requests", requireAuth, async (req, res) => {
  try {
    const email = await resolveOwnerEmail(req);
    const ownerId = req.user?.id ?? email ?? "unknown";
    const result = await db.execute(
      sql`SELECT id, owner_id, subject, message, status, admin_reply, admin_reply_at, is_read_by_owner, created_at
          FROM owner_support_requests
          WHERE owner_id = ${String(ownerId)}
          ORDER BY created_at DESC`
    );
    return res.json((result as any).rows);
  } catch (err) {
    console.error("[GET /owner/support-requests]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── GET /owner/support-requests/unread-count — count unread admin replies ── */
router.get("/support-requests/unread-count", requireAuth, async (req, res) => {
  try {
    const email = await resolveOwnerEmail(req);
    const ownerId = req.user?.id ?? email ?? "unknown";
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM owner_support_requests
          WHERE owner_id = ${String(ownerId)} AND admin_reply IS NOT NULL AND is_read_by_owner = false`
    );
    const count = Number(((result as any).rows)[0]?.count ?? 0);
    return res.json({ count });
  } catch (err) {
    console.error("[GET /owner/support-requests/unread-count]", err);
    return res.status(500).json({ count: 0 });
  }
});

/* ── POST /owner/support-requests/:id/mark-read — owner reads admin reply ── */
router.post("/support-requests/:id/mark-read", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const email = await resolveOwnerEmail(req);
    const ownerId = req.user?.id ?? email ?? "unknown";
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرّف غير صحيح" });
    await db.execute(
      sql`UPDATE owner_support_requests SET is_read_by_owner = true
          WHERE id = ${id} AND owner_id = ${String(ownerId)}`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[POST /owner/support-requests/:id/mark-read]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── POST /owner/profile/request-change — verify password & send OTP ── */
router.post("/profile/request-change", async (req, res) => {
  try {
    const currentEmail = await resolveOwnerEmail(req);
    if (!currentEmail) return res.status(404).json({ error: "لم يتم العثور على الحساب" });

    const { currentPassword, newEmail, newPhone } = req.body as Record<string, string>;
    if (!currentPassword) return res.status(400).json({ error: "كلمة المرور الحالية مطلوبة" });
    if (!newEmail && !newPhone) return res.status(400).json({ error: "يرجى تحديد البريد الإلكتروني أو رقم الجوال الجديد" });
    /* Phone format validation — Saudi 05xxxxxxxx */
    if (newPhone) {
      const cleaned = newPhone.trim().replace(/\s+/g, "");
      if (!/^05\d{8}$/.test(cleaned)) {
        return res.status(400).json({ error: "صيغة رقم الجوال غير صحيحة — يجب أن يبدأ بـ 05 ويكون ١٠ أرقام" });
      }
    }

    /* Verify current password */
    const pwResult = await db.execute(
      sql`SELECT password_hash, full_name FROM owner_applications WHERE email = ${currentEmail} LIMIT 1`
    );
    const pwRow = ((pwResult as any).rows as Array<{ password_hash: string; full_name: string }>)[0];
    if (!pwRow?.password_hash) return res.status(400).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع الدعم" });
    const match = await bcrypt.compare(currentPassword, pwRow.password_hash);
    if (!match) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });

    const ownerName = pwRow.full_name ?? "صاحب الحساب";

    /* ── Changing email ── */
    if (newEmail) {
      const emailLower = newEmail.trim().toLowerCase();
      if (emailLower === currentEmail.toLowerCase()) return res.status(400).json({ error: "البريد الإلكتروني الجديد هو نفس الحالي" });
      const taken = await db.execute(sql`SELECT id FROM owner_applications WHERE lower(email) = ${emailLower} LIMIT 1`);
      if (((taken as any).rows as any[]).length > 0) return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل لدى حساب آخر" });
      const code = _genCode();
      await _createOtp(emailLower, code);
      await sendOtpEmail(emailLower, ownerName, code);
      return res.json({ ok: true, otpSentTo: emailLower, isNewEmail: true });
    }

    /* ── Changing phone ── */
    if (newPhone) {
      const phoneClean = newPhone.trim();
      const curPhoneR = await db.execute(sql`SELECT phone FROM owner_applications WHERE email = ${currentEmail} LIMIT 1`);
      const curPhone  = ((curPhoneR as any).rows as Array<{ phone: string }>)[0]?.phone ?? "";
      if (phoneClean === curPhone) return res.status(400).json({ error: "رقم الجوال الجديد هو نفس الحالي" });
      const taken = await db.execute(sql`SELECT id FROM owner_applications WHERE phone = ${phoneClean} AND email != ${currentEmail} LIMIT 1`);
      if (((taken as any).rows as any[]).length > 0) return res.status(409).json({ error: "رقم الجوال مسجّل لدى حساب آخر" });
      /* No SMS service — send OTP to current email */
      const code = _genCode();
      await _createOtp(currentEmail, code);
      await sendOtpEmail(currentEmail, ownerName, code);
      return res.json({ ok: true, otpSentTo: currentEmail, isNewEmail: false });
    }
  } catch (err) {
    console.error("[POST /owner/profile/request-change]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال رمز التحقق" });
  }
});

/* ── Availability sync helper ──────────────────────────────── */
/**
 * After any booking mutation (create / cancel / reschedule), call this to keep
 * chaletAvailabilityTable in sync so the public calendar reflects real bookings.
 * It reads ALL active bookings for the submission and recomputes each supplied date.
 */
async function syncAvailabilityFromBookings(
  submissionId: number,
  ownerId: string,
  dates: string[]
) {
  if (!dates.length) return;
  // Find the approved chalet entry for this submission
  const [chalet] = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(eq(chaletsTable.submissionId, submissionId));
  if (!chalet) return;
  const chaletId = chalet.id;

  // Load all active bookings for this submission
  const activeBookings = await db
    .select({
      bookingDate: ownerBookingsTable.bookingDate,
      durationDays: ownerBookingsTable.durationDays,
      period: ownerBookingsTable.period,
    })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.submissionId, submissionId), isNull(ownerBookingsTable.cancelledAt)));

  for (const dateStr of dates) {
    // Determine which periods are booked on this date
    const bookedPeriods = new Set<string>();
    for (const b of activeBookings) {
      if (!b.bookingDate) continue;
      const [by, bm, bd] = b.bookingDate.split("-").map(Number);
      const dur = Math.max(1, b.durationDays ?? 1);
      for (let i = 0; i < dur; i++) {
        const d = new Date(by, bm - 1, bd + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (ds === dateStr) { bookedPeriods.add(b.period ?? "full_day"); break; }
      }
    }

    const morning = bookedPeriods.has("morning") || bookedPeriods.has("full_day");
    const evening = bookedPeriods.has("evening") || bookedPeriods.has("full_day");
    const fullDay  = bookedPeriods.has("full_day");

    // Check if an entry already exists for this date
    const [existing] = await db
      .select()
      .from(chaletAvailabilityTable)
      .where(and(eq(chaletAvailabilityTable.chaletId, chaletId), eq(chaletAvailabilityTable.dateStr, dateStr)));

    if (bookedPeriods.size === 0) {
      // No bookings — if the only reason this entry existed was auto-sync, remove it.
      // We remove entries that have no notes (owner hasn't manually annotated it).
      if (existing && !existing.notes) {
        await db.delete(chaletAvailabilityTable).where(eq(chaletAvailabilityTable.id, existing.id));
      }
    } else if (existing) {
      await db
        .update(chaletAvailabilityTable)
        .set({ periodMorning: morning, periodEvening: evening, periodFullDay: fullDay })
        .where(eq(chaletAvailabilityTable.id, existing.id));
    } else {
      await db.insert(chaletAvailabilityTable).values({
        chaletId, ownerId, dateStr, periodMorning: morning, periodEvening: evening, periodFullDay: fullDay,
      });
    }
  }
}

/** Build the list of YYYY-MM-DD strings that a booking occupies */
function bookingDates(bookingDate: string, durationDays: number): string[] {
  const [y, m, d] = bookingDate.split("-").map(Number);
  const results: string[] = [];
  for (let i = 0; i < Math.max(1, durationDays); i++) {
    const dt = new Date(y, m - 1, d + i);
    results.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  return results;
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isChaletPaused(chalet: { pausedFrom?: string | null; pausedUntil?: string | null }, dateStr = getTodayStr()) {
  if (!chalet.pausedFrom) return false;
  return chalet.pausedFrom <= dateStr && (!chalet.pausedUntil || chalet.pausedUntil >= dateStr);
}

function bookingRangeOverlapsPause(bookingDate: string, durationDays: number, chalet: { pausedFrom?: string | null; pausedUntil?: string | null }) {
  if (!chalet.pausedFrom) return false;
  const dates = bookingDates(bookingDate, durationDays);
  const bookingStart = dates[0];
  const bookingEnd = dates[dates.length - 1];
  const pauseEnd = chalet.pausedUntil ?? "9999-12-31";
  return bookingStart <= pauseEnd && bookingEnd >= chalet.pausedFrom;
}

function normalizeMessageSettings(row: typeof ownerNotificationSettingsTable.$inferSelect | undefined, ownerId: string) {
  let customTemplates: Array<{ id: string; title: string; body: string }> = [];
  try {
    customTemplates = row?.waToken ? JSON.parse(row.waToken) : [];
  } catch (_) {
    customTemplates = [];
  }
  return {
    ownerId,
    waEnabled: row?.waEnabled ?? false,
    waPhone: row?.waPhone ?? "",
    bookingConfirmationEnabled: row?.bookingConfirmationEnabled ?? false,
    bookingConfirmationTemplate: (() => {
      const t = row?.bookingConfirmationTemplate;
      return (t && t.includes("{الإيجار}")) ? t : DEFAULT_BOOKING_CONFIRMATION_TEMPLATE;
    })(),
    changeNoticeEnabled: row?.changeNoticeEnabled ?? false,
    cancellationTemplate: row?.arrivalReminderTemplate || DEFAULT_CANCELLATION_TEMPLATE,
    modificationTemplate: (() => {
      const t = row?.changeNoticeTemplate;
      return (t && t.includes("{الإيجار}")) ? t : DEFAULT_MODIFICATION_TEMPLATE;
    })(),
    customTemplates: Array.isArray(customTemplates) ? customTemplates : [],
    attachmentNote: row?.waInstanceId ?? "إذا احتجت إرسال صورة أو ملف، افتح واتساب من الزر ثم أرفق الصورة يدوياً قبل الإرسال.",
    updatedAt: row?.updatedAt ?? null,
  };
}

/* ── Bookings ──────────────────────────────────────────────── */

router.get("/message-settings", async (req, res) => {
  const ownerId = req.user!.id;
  const [settings] = await db
    .select()
    .from(ownerNotificationSettingsTable)
    .where(eq(ownerNotificationSettingsTable.ownerId, ownerId))
    .limit(1);
  return res.json(normalizeMessageSettings(settings, ownerId));
});

router.put("/message-settings", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    waEnabled: z.boolean().optional(),
    waPhone: z.string().optional(),
    bookingConfirmationEnabled: z.boolean().optional(),
    bookingConfirmationTemplate: z.string().optional(),
    changeNoticeEnabled: z.boolean().optional(),
    cancellationTemplate: z.string().optional(),
    modificationTemplate: z.string().optional(),
    customTemplates: z.array(z.object({ id: z.string(), title: z.string(), body: z.string() })).optional(),
    attachmentNote: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const sanitizedCustomTemplates = (body.data.customTemplates ?? []).map((tpl) => ({
    id: tpl.id || randomBytes(8).toString("hex"),
    title: tpl.title.trim() || "رسالة إضافية",
    body: tpl.body.trim(),
  })).filter((tpl) => tpl.body);

  const values = {
    ownerId,
    waEnabled: body.data.waEnabled ?? false,
    waPhone: body.data.waPhone?.trim() || null,
    bookingConfirmationEnabled: body.data.bookingConfirmationEnabled ?? false,
    bookingConfirmationTemplate: body.data.bookingConfirmationTemplate?.trim() || DEFAULT_BOOKING_CONFIRMATION_TEMPLATE,
    arrivalReminderEnabled: false,
    arrivalReminderOffsetHours: 24,
    arrivalReminderTemplate: body.data.cancellationTemplate?.trim() || DEFAULT_CANCELLATION_TEMPLATE,
    changeNoticeEnabled: body.data.changeNoticeEnabled ?? false,
    changeNoticeTemplate: body.data.modificationTemplate?.trim() || DEFAULT_MODIFICATION_TEMPLATE,
    waInstanceId: body.data.attachmentNote?.trim() || null,
    waToken: JSON.stringify(sanitizedCustomTemplates),
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(ownerNotificationSettingsTable)
    .values(values)
    .onConflictDoUpdate({
      target: ownerNotificationSettingsTable.ownerId,
      set: values,
    })
    .returning();

  return res.json(normalizeMessageSettings(saved, ownerId));
});

router.get("/bookings/stats", async (req, res) => {
  const ownerId = req.user!.id;
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const active = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNull(ownerBookingsTable.cancelledAt)));

  const cancelled = await db
    .select({ id: ownerBookingsTable.id })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNotNull(ownerBookingsTable.cancelledAt)));

  const rescheduled = await db
    .select({ id: ownerRescheduleLogsTable.id })
    .from(ownerRescheduleLogsTable)
    .where(eq(ownerRescheduleLogsTable.ownerId, ownerId));

  const monthActive = active.filter((b) => b.bookingDate >= monthStart && b.bookingDate <= monthEnd);
  const revenueCurrentMonth = monthActive.reduce((sum, b) => sum + (b.totalPrice ? Number(b.totalPrice) : 0), 0);

  return res.json({
    activeCurrentMonth: monthActive.length,
    revenueCurrentMonth,
    totalActive: active.length,
    totalCancelled: cancelled.length,
    totalRescheduled: rescheduled.length,
  });
});

router.get("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNull(ownerBookingsTable.cancelledAt)))
    .orderBy(ownerBookingsTable.createdAt);
  return res.json(rows.reverse());
});

router.get("/bookings/cancelled", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNotNull(ownerBookingsTable.cancelledAt)))
    .orderBy(ownerBookingsTable.cancelledAt);
  return res.json(rows.reverse());
});

router.post("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    submissionId: z.number().int().positive().optional(),
    clientName: z.string().min(1),
    clientPhone: z.string().min(1, "رقم الجوال مطلوب"),
    bookingDate: z.string().min(1),
    durationDays: z.number().int().min(1).default(1),
    period: z.enum(["morning", "evening", "full_day"]),
    source: z.enum(["platform", "external"]).default("platform"),
    notes: z.string().optional(),
    revenueAmount: z.number().nonnegative().optional(),
    totalPrice: z.number().nonnegative().optional(),
    depositPaid: z.number().nonnegative().optional(),
    insuranceFee: z.number().nonnegative().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة — رقم الجوال والفترة مطلوبان" });

  if (body.data.submissionId) {
    const [sub] = await db
      .select({ ownerId: chaletSubmissionsTable.ownerId, status: chaletSubmissionsTable.status })
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, body.data.submissionId));
    if (!sub || sub.ownerId !== ownerId) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    if (sub.status !== "approved") {
      return res.status(400).json({ error: "لا يمكن إضافة حجز إلا لشاليه معتمد" });
    }
    const [chalet] = await db
      .select({
        isActive: chaletsTable.isActive,
        pausedFrom: chaletsTable.pausedFrom,
        pausedUntil: chaletsTable.pausedUntil,
      })
      .from(chaletsTable)
      .where(eq(chaletsTable.submissionId, body.data.submissionId))
      .limit(1);
    if (!chalet || chalet.isActive === false) {
      return res.status(400).json({ error: "الشاليه غير نشط حالياً" });
    }
    if (bookingRangeOverlapsPause(body.data.bookingDate, body.data.durationDays, chalet)) {
      return res.status(409).json({ error: "الشاليه موقوف مؤقتاً ضمن تاريخ الحجز المحدد" });
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

  // Auto-sync public calendar availability
  if (booking.submissionId) {
    syncAvailabilityFromBookings(
      booking.submissionId,
      ownerId,
      bookingDates(booking.bookingDate, booking.durationDays)
    ).catch(() => {});
  }

  // Create booking notification (async, don't block response)
  ;(async () => {
    try {
      let chaletName = "شاليهك";
      let chaletId: number | null = null;
      let locationLink = "";
      if (booking.submissionId) {
        const [chalet] = await db
          .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr, mapsUrl: chaletsTable.mapsUrl })
          .from(chaletsTable)
          .where(eq(chaletsTable.submissionId, booking.submissionId))
          .limit(1);
        if (chalet) { chaletName = chalet.nameAr; chaletId = chalet.id; locationLink = chalet.mapsUrl ?? ""; }
        if (!chalet) {
          const [sub] = await db
            .select({ nameAr: chaletSubmissionsTable.nameAr, mapsUrl: chaletSubmissionsTable.mapsUrl })
            .from(chaletSubmissionsTable)
            .where(eq(chaletSubmissionsTable.id, booking.submissionId))
            .limit(1);
          if (sub) { chaletName = sub.nameAr; locationLink = sub.mapsUrl ?? ""; }
        }
      }
      const periodLabel = booking.period === "morning" ? "صباحي" : booking.period === "evening" ? "مسائي" : "يوم كامل";
      let msg = `حجز جديد في ${chaletName} — ${booking.clientName} — ${booking.bookingDate} (${periodLabel})`;
      const [waSetting] = await db
        .select()
        .from(ownerNotificationSettingsTable)
        .where(eq(ownerNotificationSettingsTable.ownerId, ownerId))
        .limit(1);
      if (waSetting?.waEnabled && waSetting.waPhone) {
        const waText = encodeURIComponent(`حجز جديد في ${chaletName}:\nالعميل: ${booking.clientName}\nالتاريخ: ${booking.bookingDate}\nالفترة: ${periodLabel}`);
        msg += ` | wa.me/${waSetting.waPhone}?text=${waText}`;
      }
      await db.insert(ownerNotificationsTable).values({
        ownerId,
        type: "new_booking",
        chaletId: chaletId ?? undefined,
        bookingId: booking.id,
        message: msg,
        isRead: false,
      });
    } catch (_) {}
  })();

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
    notes: z.string().nullable().optional(),
    // Reschedule fields
    bookingDate: z.string().min(1).optional(),
    durationDays: z.number().int().min(1).optional(),
    period: z.enum(["morning", "evening", "full_day"]).nullable().optional(),
    rescheduleReason: z.string().optional(),
    // Restore from cancellation
    restore: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const { insuranceDeducted, insuranceProofImages, restore, bookingDate, durationDays, period, rescheduleReason, ...rest } = body.data;

  // If rescheduling, fetch the old booking first to record a log entry
  const isReschedule = bookingDate !== undefined || durationDays !== undefined || period !== undefined;
  let oldBooking: typeof ownerBookingsTable.$inferSelect | null = null;
  if (isReschedule && !restore) {
    const [existing] = await db
      .select()
      .from(ownerBookingsTable)
      .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)));
    oldBooking = existing ?? null;
  }

  // ── Conflict check for reschedule ──────────────────────────────────
  if (isReschedule && !restore && oldBooking) {
    const newDate2   = bookingDate  ?? oldBooking.bookingDate;
    const newDur2    = durationDays ?? oldBooking.durationDays;
    const newPeriod2 = period !== undefined ? period : oldBooking.period;

    // Build the set of dates the rescheduled booking will occupy
    const [ny, nm, nd] = newDate2.split("-").map(Number);
    const newDates = new Set<string>();
    for (let i = 0; i < newDur2; i++) {
      const d = new Date(ny, nm - 1, nd + i);
      newDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    // Load all other active bookings for the same submission (or owner if no submission)
    const filters = [
      eq(ownerBookingsTable.ownerId, ownerId),
      ne(ownerBookingsTable.id, id),
      isNull(ownerBookingsTable.cancelledAt),
      ...(oldBooking.submissionId !== null
        ? [eq(ownerBookingsTable.submissionId, oldBooking.submissionId)]
        : []),
    ];
    const others = await db.select().from(ownerBookingsTable).where(and(...filters as [any, ...any[]]));

    for (const ob of others) {
      if (!ob.bookingDate) continue;
      const [oy, om, od] = ob.bookingDate.split("-").map(Number);
      const oDur = Math.max(1, ob.durationDays ?? 1);
      for (let i = 0; i < oDur; i++) {
        const d = new Date(oy, om - 1, od + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (newDates.has(ds)) {
          const obP = ob.period ?? "full_day";
          const np  = newPeriod2 ?? "full_day";
          // Conflict: full_day vs anything, or same specific period
          if (obP === "full_day" || np === "full_day" || obP === np) {
            const isFullDay = obP === "full_day" || np === "full_day";
            const msg = isFullDay
              ? "هذا اليوم محجوز بالكامل"
              : "هذه الفترة محجوزة";
            return res.status(409).json({ error: msg });
          }
        }
      }
    }
  }
  // ───────────────────────────────────────────────────────────────────

  const [row] = await db
    .update(ownerBookingsTable)
    .set({
      ...rest,
      ...(bookingDate !== undefined ? { bookingDate } : {}),
      ...(durationDays !== undefined ? { durationDays } : {}),
      ...(period !== undefined ? { period } : {}),
      insuranceDeducted: insuranceDeducted !== undefined ? String(Math.round(insuranceDeducted)) : undefined,
      insuranceProofImages: insuranceProofImages !== undefined ? JSON.stringify(insuranceProofImages) : undefined,
      ...(restore ? { cancelledAt: null, cancelReason: null } : {}),
    })
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "not found" });

  // Insert reschedule log if date/duration/period changed
  if (oldBooking && isReschedule) {
    const newBookingDate = bookingDate ?? oldBooking.bookingDate;
    const newDurationDays = durationDays ?? oldBooking.durationDays;
    const newPeriod = period !== undefined ? period : oldBooking.period;
    const changed =
      newBookingDate !== oldBooking.bookingDate ||
      newDurationDays !== oldBooking.durationDays ||
      newPeriod !== oldBooking.period;
    if (changed) {
      await db.insert(ownerRescheduleLogsTable).values({
        ownerId,
        bookingId: id,
        clientName: oldBooking.clientName,
        clientPhone: oldBooking.clientPhone ?? null,
        oldDate: oldBooking.bookingDate,
        newDate: newBookingDate,
        oldDuration: oldBooking.durationDays,
        newDuration: newDurationDays,
        oldPeriod: oldBooking.period,
        newPeriod: newPeriod ?? null,
        reason: rescheduleReason ?? "",
      });

      // Sync old dates (freed) + new dates (now booked)
      if (row.submissionId) {
        const oldDates = bookingDates(oldBooking.bookingDate, oldBooking.durationDays);
        const newDates = bookingDates(newBookingDate, newDurationDays);
        const allDates = [...new Set([...oldDates, ...newDates])];
        syncAvailabilityFromBookings(row.submissionId, ownerId, allDates).catch(() => {});
      }
    }
  }

  // Sync availability on restore too (booking is active again)
  if (restore && row.submissionId) {
    syncAvailabilityFromBookings(
      row.submissionId,
      ownerId,
      bookingDates(row.bookingDate, row.durationDays)
    ).catch(() => {});
  }

  return res.json(row);
});

router.get("/bookings/reschedule-log", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerRescheduleLogsTable)
    .where(eq(ownerRescheduleLogsTable.ownerId, ownerId))
    .orderBy(desc(ownerRescheduleLogsTable.rescheduledAt));
  return res.json(rows);
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
  const parsed = z.object({
    reason:        z.string().optional(),
    reasonCode:    z.string().optional(),
    refundAmount:  z.number().nonnegative().optional(),
  }).parse(req.body ?? {});
  const { reason, reasonCode, refundAmount } = parsed;

  // Fetch booking before soft-delete so we can sync the freed dates
  const [target] = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)));

  // Compute cancellation income: deposit collected minus refund returned to client
  const depositPaid   = Number(target?.depositPaid ?? 0);
  const refund        = refundAmount ?? 0;
  const cancelIncome  = Math.max(0, depositPaid - refund);

  // Auto-return insurance on cancellation: client never entered the property,
  // so insurance is always fully refunded. Mark insuranceRefunded = true automatically.
  const hasInsurance = target?.insuranceFee && Number(target.insuranceFee) > 0;

  await db
    .update(ownerBookingsTable)
    .set({
      cancelledAt:        new Date(),
      cancelReason:       reason ?? null,
      cancelReasonCode:   reasonCode ?? null,
      cancelRefundAmount: refund > 0 ? String(refund) : null,
      cancelIncome:       cancelIncome > 0 ? String(cancelIncome) : null,
      ...(hasInsurance ? { insuranceRefunded: true } : {}),
    })
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)));

  // Sync availability after cancellation (booking no longer blocks these dates)
  if (target?.submissionId) {
    syncAvailabilityFromBookings(
      target.submissionId,
      ownerId,
      bookingDates(target.bookingDate, target.durationDays)
    ).catch(() => {});
  }

  // Cancellation notification (async, non-blocking)
  if (target) {
    ;(async () => {
      try {
        let chaletName = "شاليهك";
        let chaletId: number | null = null;
        if (target.submissionId) {
          const [chalet] = await db
            .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr })
            .from(chaletsTable)
            .where(eq(chaletsTable.submissionId, target.submissionId))
            .limit(1);
          if (chalet) { chaletName = chalet.nameAr; chaletId = chalet.id; }
        }
        const periodLabel = target.period === "morning" ? "صباحي" : target.period === "evening" ? "مسائي" : "يوم كامل";
        const msg = `إلغاء حجز في ${chaletName} — ${target.clientName} — ${target.bookingDate} (${periodLabel})${reason ? ` — السبب: ${reason}` : ""}`;
        await db.insert(ownerNotificationsTable).values({
          ownerId,
          type: "cancellation",
          chaletId: chaletId ?? undefined,
          bookingId: target.id,
          message: msg,
          isRead: false,
        });
      } catch (_) {}
    })();
  }

  return res.json({ ok: true });
});

/* ── Owner's Approved Chalets ──────────────────────────────── */

router.get("/chalets", async (req, res) => {
  const ownerId = req.user!.id;

  /* Build full list of owner IDs to query:
   *  1. The direct session user ID (Replit ID or "owner_N" for impersonation)
   *  2. The "owner_N" key derived from owner_applications (for Replit-OAuth owners
   *     whose admin-added properties were stored under the "owner_N" key) */
  const ownerIds = new Set<string>([ownerId]);
  try {
    const email = await resolveOwnerEmail(req);
    if (email) {
      const r = await db.execute(
        sql`SELECT id FROM owner_applications WHERE LOWER(email) = LOWER(${email}) LIMIT 1`
      );
      const appId = ((r as any).rows as Array<{ id: number }>)[0]?.id;
      if (appId) ownerIds.add(`owner_${appId}`);
    }
  } catch { /* non-fatal */ }

  const allOwnerIds = [...ownerIds];

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(inArray(chaletSubmissionsTable.ownerId, allOwnerIds));

  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.json([]);

  const chalets = await db
    .select()
    .from(chaletsTable)
    .where(inArray(chaletsTable.submissionId, subIds));

  return res.json(chalets);
});

router.patch("/chalets/:id/pause", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.id);
  if (isNaN(chaletId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const body = z.object({
    pausedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    pausedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    clear: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  if (!body.data.clear && !body.data.pausedFrom) {
    return res.status(400).json({ error: "تاريخ بداية الإيقاف مطلوب" });
  }
  if (!body.data.clear && body.data.pausedFrom && body.data.pausedUntil && body.data.pausedUntil < body.data.pausedFrom) {
    return res.status(400).json({ error: "تاريخ نهاية الإيقاف قبل البداية" });
  }

  const [chalet] = await db.select({ id: chaletsTable.id, submissionId: chaletsTable.submissionId })
    .from(chaletsTable).where(eq(chaletsTable.id, chaletId)).limit(1);
  if (!chalet) return res.status(404).json({ error: "الشاليه غير موجود" });

  const [sub] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, chalet.submissionId!)).limit(1);
  if (!sub || sub.ownerId !== ownerId) return res.status(403).json({ error: "غير مصرح" });

  const [updated] = await db.update(chaletsTable)
    .set({
      pausedFrom: body.data.clear ? null : body.data.pausedFrom!,
      pausedUntil: body.data.clear ? null : body.data.pausedUntil ?? null,
    })
    .where(eq(chaletsTable.id, chaletId))
    .returning({
      id: chaletsTable.id,
      pausedFrom: chaletsTable.pausedFrom,
      pausedUntil: chaletsTable.pausedUntil,
    });

  return res.json({ ...updated, isPausedNow: isChaletPaused(updated) });
});

/* ── Review Invitations (owner generates for their own chalets) ── */

router.post("/review-invite", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    chaletId: z.number().int().positive(),
    guestName: z.string().max(200).optional(),
    bookingId: z.number().int().positive().optional(),
  }).safeParse(req.body);
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
    .values({ token, chaletId: chalet.id, expiresAt, guestName: body.data.guestName ?? null, bookingId: body.data.bookingId ?? null })
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

/* ── Delete a review invitation ─────────────────────────────── */

router.delete("/review-invitations/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const invId = Number(req.params.id);
  if (isNaN(invId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));
  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.status(403).json({ error: "غير مصرح" });

  const myChalets = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(inArray(chaletsTable.submissionId, subIds));
  const chaletIds = myChalets.map((c) => c.id);

  const [inv] = await db
    .select()
    .from(reviewInvitationsTable)
    .where(and(eq(reviewInvitationsTable.id, invId), inArray(reviewInvitationsTable.chaletId, chaletIds)))
    .limit(1);

  if (!inv) return res.status(404).json({ error: "الدعوة غير موجودة أو غير مصرح" });
  await db.delete(reviewInvitationsTable).where(eq(reviewInvitationsTable.id, invId));
  return res.json({ ok: true });
});

/* ── Toggle Chalet Active/Inactive ────────────────────────────── */

router.patch("/chalets/:id/toggle-active", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.id);
  if (isNaN(chaletId)) return res.status(400).json({ error: "معرّف غير صالح" });

  // Verify ownership via submission link
  const [chalet] = await db.select({ id: chaletsTable.id, submissionId: chaletsTable.submissionId, isActive: chaletsTable.isActive })
    .from(chaletsTable).where(eq(chaletsTable.id, chaletId)).limit(1);
  if (!chalet) return res.status(404).json({ error: "الشاليه غير موجود" });

  const [sub] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, chalet.submissionId!)).limit(1);
  if (!sub || sub.ownerId !== ownerId) return res.status(403).json({ error: "غير مصرح" });

  const [updated] = await db.update(chaletsTable)
    .set({ isActive: !chalet.isActive })
    .where(eq(chaletsTable.id, chaletId))
    .returning({ isActive: chaletsTable.isActive });

  return res.json({ isActive: updated.isActive });
});

/* ── Delete Chalet (with upcoming bookings safety check) ─────── */

router.delete("/chalets/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.id);
  if (isNaN(chaletId)) return res.status(400).json({ error: "معرّف غير صالح" });

  // Verify ownership
  const [chalet] = await db.select({ id: chaletsTable.id, submissionId: chaletsTable.submissionId })
    .from(chaletsTable).where(eq(chaletsTable.id, chaletId)).limit(1);
  if (!chalet) return res.status(404).json({ error: "الشاليه غير موجود" });

  const [sub] = await db.select({ id: chaletSubmissionsTable.id, ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, chalet.submissionId!)).limit(1);
  if (!sub || sub.ownerId !== ownerId) return res.status(403).json({ error: "غير مصرح" });

  // Check for upcoming bookings (future date, not cancelled)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = await db.select({ id: ownerBookingsTable.id })
    .from(ownerBookingsTable)
    .where(and(
      eq(ownerBookingsTable.submissionId, sub.id),
      isNull(ownerBookingsTable.cancelledAt),
      gte(ownerBookingsTable.bookingDate, today),
    ))
    .limit(1);

  if (upcoming.length > 0) {
    return res.status(409).json({ error: "لا يمكن الحذف لوجود حجوزات مستقبلية", hasUpcomingBookings: true });
  }

  // Purge booking-linked notifications for this chalet's bookings
  // (cascade via chaletId handles chalet-linked ones; this covers booking_reminder and cancellation orphans)
  const bookingIds = await db
    .select({ id: ownerBookingsTable.id })
    .from(ownerBookingsTable)
    .where(eq(ownerBookingsTable.submissionId, sub.id));
  if (bookingIds.length > 0) {
    await db.delete(ownerNotificationsTable).where(
      inArray(ownerNotificationsTable.bookingId, bookingIds.map(b => b.id))
    );
  }

  // Delete chalet (cascade will handle chaletId-linked notifications + related records)
  await db.delete(chaletsTable).where(eq(chaletsTable.id, chaletId));
  // Keep submission for financial history (just mark it)
  await db.update(chaletSubmissionsTable).set({ status: "rejected", adminNote: "تم الحذف من قبل المالك" }).where(eq(chaletSubmissionsTable.id, sub.id));

  return res.json({ ok: true });
});

/* ── Save per-chalet WhatsApp review template ────────────────── */

router.patch("/chalets/:id/review-template", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.id);
  if (isNaN(chaletId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const body = z.object({ waReviewTemplate: z.string().max(2000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));
  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return res.status(403).json({ error: "غير مصرح" });

  const [updated] = await db
    .update(chaletsTable)
    .set({ waReviewTemplate: body.data.waReviewTemplate || null })
    .where(and(eq(chaletsTable.id, chaletId), inArray(chaletsTable.submissionId, subIds)))
    .returning({ id: chaletsTable.id });

  if (!updated) return res.status(403).json({ error: "غير مصرح أو الشاليه غير موجود" });
  return res.json({ ok: true });
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

/* ── Availability: Bulk Range Block (owner maintenance) ─────── */
router.post("/availability/bulk", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    chaletId: z.number().int().positive(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const { chaletId, startDate, endDate, notes } = body.data;

  // Verify ownership
  const chalet = await db.select({ submissionId: chaletsTable.submissionId })
    .from(chaletsTable)
    .where(eq(chaletsTable.id, chaletId))
    .limit(1);
  if (!chalet.length) return res.status(404).json({ error: "الشاليه غير موجود" });

  // Build list of YYYY-MM-DD strings in the range
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (end < start) return res.status(400).json({ error: "تاريخ النهاية قبل البداية" });

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const blockNote = notes?.trim() || "إغلاق صيانة";

  const created: number[] = [];
  for (const dateStr of dates) {
    const [existing] = await db.select({ id: chaletAvailabilityTable.id })
      .from(chaletAvailabilityTable)
      .where(and(eq(chaletAvailabilityTable.chaletId, chaletId), eq(chaletAvailabilityTable.dateStr, dateStr), eq(chaletAvailabilityTable.ownerId, ownerId)));

    if (existing) {
      await db.update(chaletAvailabilityTable)
        .set({ periodMorning: true, periodEvening: true, periodFullDay: true, notes: blockNote })
        .where(eq(chaletAvailabilityTable.id, existing.id));
      created.push(existing.id);
    } else {
      const [row] = await db.insert(chaletAvailabilityTable)
        .values({ chaletId, ownerId, dateStr, periodMorning: true, periodEvening: true, periodFullDay: true, notes: blockNote })
        .returning({ id: chaletAvailabilityTable.id });
      created.push(row.id);
    }
  }

  return res.status(201).json({ blocked: created.length, dates });
});

/* ── Availability: Delete Range (unblock dates) ─────────────── */
router.delete("/availability/range", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    chaletId: z.number().int().positive(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const { chaletId, startDate, endDate } = body.data;

  await db.delete(chaletAvailabilityTable)
    .where(
      and(
        eq(chaletAvailabilityTable.ownerId, ownerId),
        eq(chaletAvailabilityTable.chaletId, chaletId),
        gte(chaletAvailabilityTable.dateStr, startDate),
        lte(chaletAvailabilityTable.dateStr, endDate),
        isNotNull(chaletAvailabilityTable.notes),
      )
    );

  return res.json({ ok: true });
});

/* ── Chalet Seasons ─────────────────────────────────────────── */

router.get("/seasons", async (req, res) => {
  const ownerId = req.user!.id;
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  const conditions = [eq(chaletSeasonsTable.ownerId, ownerId)];
  if (submissionId) conditions.push(eq(chaletSeasonsTable.submissionId, submissionId));

  const rows = await db
    .select()
    .from(chaletSeasonsTable)
    .where(and(...conditions))
    .orderBy(chaletSeasonsTable.startDate);

  return res.json(rows);
});

router.post("/seasons", async (req, res) => {
  const ownerId = req.user!.id;
  const dayPriceSchema = z.object({
    morning: z.number().nonnegative().optional(),
    evening: z.number().nonnegative().optional(),
    fullDay: z.number().nonnegative().optional(),
  });
  const body = z.object({
    submissionId: z.number().int().positive(),
    nameAr: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priceMorning: z.number().nonnegative().optional(),
    priceEvening: z.number().nonnegative().optional(),
    priceFullDay: z.number().nonnegative().optional(),
    dailyPrices: z.record(z.string(), dayPriceSchema).optional(),
    period: z.enum(["morning", "evening", "full_day"]).optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten() });
  if (body.data.endDate < body.data.startDate) return res.status(400).json({ error: "تاريخ النهاية قبل البداية" });
  const { priceMorning, priceEvening, priceFullDay, dailyPrices } = body.data;
  const hasDailyPrice = dailyPrices && Object.values(dailyPrices).some(dp => dp.morning || dp.evening || dp.fullDay);
  if (!priceMorning && !priceEvening && !priceFullDay && !hasDailyPrice) {
    return res.status(400).json({ error: "يجب تحديد سعر واحد على الأقل" });
  }

  // Verify ownership via submission
  const [sub] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, body.data.submissionId));
  if (!sub || sub.ownerId !== ownerId) return res.status(403).json({ error: "غير مصرح" });

  // Derive a primary price for backward compat (prefer full_day, then morning, then evening)
  const allDayPrices = dailyPrices ? Object.values(dailyPrices) : [];
  const minDayPrice = allDayPrices.length
    ? Math.min(...allDayPrices.flatMap(dp => [dp.morning, dp.evening, dp.fullDay].filter(Boolean) as number[]))
    : null;
  const primaryPrice = priceFullDay ?? priceMorning ?? priceEvening ?? minDayPrice ?? 0;

  const [row] = await db.insert(chaletSeasonsTable)
    .values({
      submissionId: body.data.submissionId,
      nameAr: body.data.nameAr,
      startDate: body.data.startDate,
      endDate: body.data.endDate,
      price: String(primaryPrice),
      priceMorning: priceMorning != null ? String(priceMorning) : null,
      priceEvening: priceEvening != null ? String(priceEvening) : null,
      priceFullDay: priceFullDay != null ? String(priceFullDay) : null,
      dailyPrices: dailyPrices && Object.keys(dailyPrices).length > 0 ? dailyPrices : null,
      period: body.data.period,
      ownerId,
    })
    .returning();

  return res.status(201).json(row);
});

router.delete("/seasons/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(chaletSeasonsTable)
    .where(and(eq(chaletSeasonsTable.id, id), eq(chaletSeasonsTable.ownerId, ownerId)));
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
  const ownerId    = req.user!.id;
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  /* ── Calendar parameters ─────────────────────────────────── */
  const hijriYear  = req.query.hijriYear  ? Number(req.query.hijriYear)  : null;
  const hijriMonth = req.query.hijriMonth ? Number(req.query.hijriMonth) : null;
  const isHijriMode = !!(hijriYear && hijriMonth && hijriMonth >= 1 && hijriMonth <= 12);

  const month = typeof req.query.month === "string"
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  if (!isHijriMode && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: "تنسيق الشهر غير صحيح (YYYY-MM)" });
  }

  /* ── Unified DB fetch: one query for both calendars ─────────
     Wide year window so every booking in the relevant period is
     included regardless of Gregorian vs Hijri month boundaries. */
  let windowStart: string;
  let windowEnd:   string;
  if (isHijriMode) {
    const approxGYear = Math.floor(hijriYear! * 354.367 / 365.25 + 622);
    windowStart = `${approxGYear - 1}-01-01`;
    windowEnd   = `${approxGYear + 1}-12-31`;
  } else {
    const [yr] = month.split("-").map(Number);
    windowStart = `${yr - 1}-01-01`;
    windowEnd   = `${yr + 1}-12-31`;
  }

  const fetchConds: Parameters<typeof and>[0][] = [
    eq(ownerBookingsTable.ownerId, ownerId),
    gte(ownerBookingsTable.bookingDate, windowStart),
    lte(ownerBookingsTable.bookingDate, windowEnd),
  ];
  if (submissionId) fetchConds.push(eq(ownerBookingsTable.submissionId, submissionId));

  const windowBookings = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(...fetchConds));

  /* ── JS month grouping: only this filter differs by calendar ─ */
  const monthBookings = isHijriMode
    ? windowBookings.filter(b => {
        const hym = getHijriYM(b.bookingDate);
        return hym.year === hijriYear && hym.month === hijriMonth;
      })
    : windowBookings.filter(b => b.bookingDate.startsWith(month));

  /* ── Stats (calendar-agnostic) ──────────────────────────────── */
  const activeMonthBookings = monthBookings.filter(b => !b.cancelledAt);
  const totalBookings    = activeMonthBookings.length;
  const platformBookings = activeMonthBookings.filter(b => b.source === "platform");
  const externalBookings = activeMonthBookings.filter(b => b.source === "external");
  const totalDays = activeMonthBookings.reduce((sum, b) => sum + (b.durationDays ?? 1), 0);

  let daysInMonth: number;
  if (isHijriMode) {
    daysInMonth = 30;
  } else {
    const [year, mon] = month.split("-").map(Number);
    daysInMonth = new Date(year, mon, 0).getDate();
  }
  const occupancyRate = totalDays > 0
    ? Math.min(100, Math.round((totalDays / daysInMonth) * 100))
    : 0;

  const slotStats = { morning: 0, evening: 0, full_day: 0, unspecified: 0 };
  for (const b of activeMonthBookings) {
    if      (b.period === "morning")  slotStats.morning++;
    else if (b.period === "evening")  slotStats.evening++;
    else if (b.period === "full_day") slotStats.full_day++;
    else                              slotStats.unspecified++;
  }
  const topSlot = Object.entries(slotStats)
    .filter(([k]) => k !== "unspecified")
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unspecified";
  const slotLabels: Record<string, string> = {
    morning: "صباحي", evening: "مسائي", full_day: "يوم كامل", unspecified: "غير محدد",
  };

  /* ── Daily revenue breakdown ─────────────────────────────── */
  const dailyRevenue = isHijriMode
    ? Array.from({ length: 30 }, (_, i) => {
        const day = i + 1;
        const revenue = activeMonthBookings
          .filter(b =>
            getHijriYM(b.bookingDate).year  === hijriYear  &&
            getHijriYM(b.bookingDate).month === hijriMonth &&
            getHijriDay(b.bookingDate) === day)
          .reduce((s, b) => s + calcBookingRev(b), 0);
        return { day, revenue };
      })
    : Array.from({ length: daysInMonth }, (_, i) => {
        const day    = i + 1;
        const dayStr = `${month}-${String(day).padStart(2, "0")}`;
        const revenue = activeMonthBookings
          .filter(b => b.bookingDate === dayStr)
          .reduce((s, b) => s + calcBookingRev(b), 0);
        return { day, revenue };
      });

  /* ── Response ────────────────────────────────────────────── */
  const responseMonth = isHijriMode
    ? `${Math.floor(hijriYear! * 354.367 / 365.25 + 622)}-${String(hijriMonth!).padStart(2, "0")}`
    : month;

  return res.json({
    month: responseMonth,
    ...(isHijriMode ? {
      hijriMonthLabel: `${HIJRI_MONTH_NAMES[hijriMonth! - 1] ?? hijriMonth} ${hijriYear} هـ`,
    } : {}),
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
    dailyRevenue,
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

  const calcDaysLeft = (expiresAt: Date | null): number => {
    if (!expiresAt) return 0;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  };

  if (!sub) {
    const trialExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return res.json({
      id: null,
      plan: "trial",
      status: "active",
      expiresAt: trialExpiry.toISOString(),
      paymentStatus: "pending",
      createdAt: new Date().toISOString(),
      daysLeft: 30,
    });
  }

  return res.json({ ...sub, daysLeft: calcDaysLeft(sub.expiresAt) });
});

/* ── Expenses ──────────────────────────────────────────────── */

router.get("/expenses", async (req, res) => {
  const ownerId = req.user!.id;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const providerId = req.query.providerId ? Number(req.query.providerId) : undefined;
  const conditions = [eq(ownerExpensesTable.ownerId, ownerId)];
  if (month) {
    conditions.push(
      gte(ownerExpensesTable.dateStr, `${month}-01`),
      lte(ownerExpensesTable.dateStr, `${month}-31`),
    );
  }
  if (providerId) conditions.push(eq(ownerExpensesTable.providerId as any, providerId));
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
    providerId: z.number().int().positive().optional(),
    dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    category: z.string().min(1),
    customCategory: z.string().optional(),
    amount: z.number().positive(),
    notes: z.string().optional(),
    receiptUrl: z.string().min(1).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten() });
  const { amount, ...expRest } = body.data;
  const [row] = await db
    .insert(ownerExpensesTable)
    .values({ ownerId, ...expRest, amount: String(amount) } as any)
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
  return res.json(rows.map(({ passwordHash: _ph, ...r }) => r));
});

const PERM_KEYS = [
  "dashboardAccess","bookingsControl","financialAccess","insuranceManagement",
  "chaletManagement","pricingControl","availabilityControl","customerData","accountSettings",
] as const;

router.post("/staff", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    name: z.string().min(1),
    baseSalary: z.number().nonnegative(),
    username: z.string().min(3).optional(),
    password: z.string().min(6).optional(),
    permissions: z.record(z.boolean()).optional(),
    assignedToType: z.enum(["all", "chalet", "service"]).optional(),
    assignedToId: z.number().int().positive().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const values: Record<string, unknown> = {
    ownerId,
    name: body.data.name,
    baseSalary: String(body.data.baseSalary),
    permissions: body.data.permissions ?? {},
    assignedToType: body.data.assignedToType ?? "all",
    assignedToId: body.data.assignedToId ?? null,
  };

  if (body.data.username) {
    values.username = body.data.username.trim();
    if (body.data.password) {
      values.passwordHash = await bcrypt.hash(body.data.password, 10);
    }
  }

  const [row] = await db
    .insert(ownerStaffTable)
    .values(values as any)
    .returning();
  const { passwordHash: _ph, ...safe } = row;
  return res.status(201).json(safe);
});

router.patch("/staff/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  const body = z.object({
    name: z.string().min(1).optional(),
    baseSalary: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
    username: z.string().min(3).optional(),
    password: z.string().min(6).optional(),
    permissions: z.record(z.boolean()).optional(),
    assignedToType: z.enum(["all", "chalet", "service"]).optional(),
    assignedToId: z.number().int().positive().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const staffPatch: Record<string, unknown> = {};
  if (body.data.name !== undefined) staffPatch.name = body.data.name;
  if (body.data.isActive !== undefined) staffPatch.isActive = body.data.isActive;
  if (body.data.baseSalary !== undefined) staffPatch.baseSalary = String(body.data.baseSalary);
  if (body.data.username !== undefined) staffPatch.username = body.data.username.trim() || null;
  if (body.data.password) staffPatch.passwordHash = await bcrypt.hash(body.data.password, 10);
  if (body.data.permissions !== undefined) staffPatch.permissions = body.data.permissions;
  if (body.data.assignedToType !== undefined) staffPatch.assignedToType = body.data.assignedToType;
  if (body.data.assignedToId !== undefined) staffPatch.assignedToId = body.data.assignedToId;

  const [row] = await db
    .update(ownerStaffTable)
    .set(staffPatch as any)
    .where(and(eq(ownerStaffTable.id, id), eq(ownerStaffTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "لم يُعثر على الموظف" });
  const { passwordHash: _ph, ...safe } = row;
  return res.json(safe);
});

/* Dedicated permissions update endpoint */
router.put("/staff/:id/permissions", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  const body = z.object({ permissions: z.record(z.boolean()) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const [row] = await db
    .update(ownerStaffTable)
    .set({ permissions: body.data.permissions } as any)
    .where(and(eq(ownerStaffTable.id, id), eq(ownerStaffTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "لم يُعثر على الموظف" });
  return res.json({ ok: true, permissions: row.permissions });
});

router.delete("/staff/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffId, id));
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

  /* ── Hijri monthly financial summary ───────────────────────── */
  const hYear  = req.query.hijriYear  ? Number(req.query.hijriYear)  : null;
  const hMonth = req.query.hijriMonth ? Number(req.query.hijriMonth) : null;
  if (hYear && hMonth && hMonth >= 1 && hMonth <= 12) {
    const approxGYear = Math.floor(hYear * 354.367 / 365.25 + 622);
    const gStart = `${approxGYear - 1}-01-01`;
    const gEnd   = `${approxGYear + 1}-12-31`;

    const bConds: Parameters<typeof and>[0][] = [
      eq(ownerBookingsTable.ownerId, ownerId),
      gte(ownerBookingsTable.bookingDate, gStart),
      lte(ownerBookingsTable.bookingDate, gEnd),
      isNull(ownerBookingsTable.cancelledAt),
    ];
    if (submissionId) bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
    const allWindowBookings = await db.select().from(ownerBookingsTable).where(and(...bConds));
    const monthBookings = allWindowBookings.filter(b => {
      const hym = getHijriYM(b.bookingDate);
      return hym.year === hYear && hym.month === hMonth;
    });

    const calcRev = (b: typeof monthBookings[number]) => {
      if (b.totalPrice !== null) {
        const dep = Number(b.depositPaid ?? 0);
        return dep + (b.balanceCollected ? Number(b.totalPrice) - dep : 0);
      }
      if (b.revenueAmount) return Number(b.revenueAmount);
      return Number(b.depositPaid ?? 0);
    };
    const totalInsuranceDeducted = monthBookings.reduce((s, b) => s + (b.insuranceDeducted ? Number(b.insuranceDeducted) : 0), 0);
    const totalRevenue  = Math.round(monthBookings.reduce((s, b) => s + calcRev(b), 0) + totalInsuranceDeducted);
    const totalDeposits = Math.round(monthBookings.reduce((s, b) => s + Number(b.depositPaid ?? 0), 0));
    const totalPendingBalance = Math.round(monthBookings.filter(b => !b.balanceCollected && b.totalPrice).reduce((s, b) => s + Math.max(0, Number(b.totalPrice) - Number(b.depositPaid ?? 0)), 0));
    const totalInsuranceHeld  = monthBookings.reduce((s, b) => s + (!b.insuranceRefunded && b.insuranceFee ? Number(b.insuranceFee) : 0), 0);

    const eConds: Parameters<typeof and>[0][] = [
      eq(ownerExpensesTable.ownerId, ownerId),
      gte(ownerExpensesTable.dateStr, gStart),
      lte(ownerExpensesTable.dateStr, gEnd),
    ];
    if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
    const allExpRows = await db.select().from(ownerExpensesTable).where(and(...eConds));
    const monthExpenses = allExpRows.filter(e => {
      const hym = getHijriYM(e.dateStr);
      return hym.year === hYear && hym.month === hMonth;
    });
    const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

    const hStaffRows = await db.select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary }).from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
    const hStaffMap  = Object.fromEntries(hStaffRows.map(s => [s.id, Number(s.baseSalary)]));
    const allSlRows  = await db.select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId, month: salaryLogsTable.month })
      .from(salaryLogsTable).where(and(eq(salaryLogsTable.ownerId, ownerId), gte(salaryLogsTable.month, `${approxGYear - 1}-01`), lte(salaryLogsTable.month, `${approxGYear + 1}-12`)));
    const totalSalaries = allSlRows
      .filter(sl => { const hym = getHijriYM(`${sl.month}-15`); return hym.year === hYear && hym.month === hMonth; })
      .reduce((s, sl) => s + (hStaffMap[sl.staffId] ?? 0) + Number(sl.bonus) - Number(sl.deduction), 0);

    const categoryTotals: Record<string, number> = {};
    for (const e of monthExpenses) categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
    if (totalSalaries > 0) categoryTotals["salaries"] = (categoryTotals["salaries"] ?? 0) + totalSalaries;

    const totalExpensesAll = Math.round(totalExpenses + totalSalaries);
    const netProfit = totalRevenue - totalExpensesAll;
    const insuranceRevenueTotals: Record<string, number> = totalInsuranceDeducted > 0 ? { insurance_damage: totalInsuranceDeducted } : {};

    return res.json({
      month: `${approxGYear}-${String(hMonth).padStart(2, "0")}`,
      hijriMonthLabel: `${HIJRI_MONTH_NAMES[hMonth - 1] ?? hMonth} ${hYear} هـ`,
      totalRevenue, totalDeposits, totalPendingBalance, totalInsuranceHeld,
      totalInsuranceDeducted: Math.round(totalInsuranceDeducted),
      totalExpenses: totalExpensesAll, netProfit, categoryTotals, insuranceRevenueTotals,
      trend: [], // Trend chart is always Gregorian 6-month overview
    });
  }

  // Revenue: sum of revenueAmount in ownerBookings for this month — cancelled bookings EXCLUDED
  const bookingConditions = [
    eq(ownerBookingsTable.ownerId, ownerId),
    gte(ownerBookingsTable.bookingDate, `${selectedMonth}-01`),
    lte(ownerBookingsTable.bookingDate, `${selectedMonth}-31`),
    isNull(ownerBookingsTable.cancelledAt),
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
    if (b.revenueAmount) return Number(b.revenueAmount);
    // Fallback: depositPaid is the confirmed revenue when no price is recorded
    return Number(b.depositPaid ?? 0);
  };
  // Insurance deductions → treated as revenue under "تلفيات" category
  const totalInsuranceDeducted = monthBookings.reduce((s, b) =>
    s + (b.insuranceDeducted ? Number(b.insuranceDeducted) : 0), 0);
  const totalRevenue = monthBookings.reduce((s, b) => s + calcBookingRevenue(b), 0) + totalInsuranceDeducted;
  // Insurance held (refundable, NOT in revenue) — ONLY from active (non-cancelled) bookings.
  // Cancelled bookings auto-set insuranceRefunded=true, but we also filter by cancelledAt
  // here to correctly handle historical data from before that auto-flag was deployed.
  const totalInsuranceHeld = monthBookings
    .filter(b => !b.cancelledAt)
    .reduce((s, b) => s + (!b.insuranceRefunded && b.insuranceFee ? Number(b.insuranceFee) : 0), 0);

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

  // Monthly trend for chart (last 6 months) — cancelled bookings EXCLUDED
  const trend = await Promise.all(months.map(async (m) => {
    const bConds = [
      eq(ownerBookingsTable.ownerId, ownerId),
      gte(ownerBookingsTable.bookingDate, `${m}-01`),
      lte(ownerBookingsTable.bookingDate, `${m}-31`),
      isNull(ownerBookingsTable.cancelledAt),
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
      if (r.rev) return s + Number(r.rev);
      // Fallback: depositPaid is the confirmed revenue when no price is recorded
      return s + Number(r.depositPaid ?? 0);
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

  // ── Pending vs Realized revenue (based on checkout date) ──────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeBookings = monthBookings.filter(b => !b.cancelledAt);
  let pendingRevenue = 0;
  let realizedRevenue = 0;
  let totalFutureValue = 0; // full contracted value of future bookings (not just deposit)
  for (const b of activeBookings) {
    const rev = calcBookingRevenue(b);
    // checkout = bookingDate + durationDays days (day after last night)
    const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
    const dur = Math.max(1, b.durationDays ?? 1);
    const checkout = new Date(sy, sm - 1, sd + dur);
    checkout.setHours(0, 0, 0, 0);
    if (checkout > today) {
      pendingRevenue += rev;
      // full contracted booking value (for "Expected Revenue" card)
      totalFutureValue += b.totalPrice ? Number(b.totalPrice) : (b.revenueAmount ? Number(b.revenueAmount) : rev);
    } else {
      realizedRevenue += rev;
    }
  }

  // ── Cancellation income for this month (by cancelledAt date) ──────
  const cancelledThisMonth = await db
    .select({ cancelIncome: ownerBookingsTable.cancelIncome, cancelRefundAmount: ownerBookingsTable.cancelRefundAmount })
    .from(ownerBookingsTable)
    .where(and(
      eq(ownerBookingsTable.ownerId, ownerId),
      gte(ownerBookingsTable.cancelledAt, new Date(`${selectedMonth}-01T00:00:00Z`)),
      lte(ownerBookingsTable.cancelledAt, new Date(`${selectedMonth}-31T23:59:59Z`)),
    ));
  const totalCancellationIncome = Math.round(cancelledThisMonth.reduce((s, b) => s + Number(b.cancelIncome ?? 0), 0));
  const totalRefundedToClients  = Math.round(cancelledThisMonth.reduce((s, b) => s + Number(b.cancelRefundAmount ?? 0), 0));

  // ── ALL-TIME three-layer liquidity model ──────────────────────
  // Fetch ALL active bookings for this owner (optionally scoped to a submission)
  const allActiveConds: Parameters<typeof and>[0][] = [
    eq(ownerBookingsTable.ownerId, ownerId),
    isNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) allActiveConds.push(eq(ownerBookingsTable.submissionId, submissionId));
  const allActiveBookings = await db.select().from(ownerBookingsTable).where(and(...allActiveConds));

  // Get cancellation-window policy per submissionId
  const subIds = [...new Set(allActiveBookings.map(b => b.submissionId).filter((x): x is number => x !== null))];
  const policyMap: Record<number, { enabled: boolean; hours: number }> = {};
  if (subIds.length > 0) {
    const policies = await db
      .select({ id: chaletSubmissionsTable.id, enabled: chaletSubmissionsTable.cancellationWindowEnabled, hours: chaletSubmissionsTable.cancellationWindowHours })
      .from(chaletSubmissionsTable)
      .where(inArray(chaletSubmissionsTable.id, subIds));
    for (const p of policies) policyMap[p.id] = { enabled: p.enabled ?? false, hours: p.hours ?? 24 };
  }

  // All cancelled bookings → cancel income
  const allCancelledConds: Parameters<typeof and>[0][] = [
    eq(ownerBookingsTable.ownerId, ownerId),
    isNotNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) allCancelledConds.push(eq(ownerBookingsTable.submissionId, submissionId));
  const allCancelledRows = await db
    .select({ cancelIncome: ownerBookingsTable.cancelIncome })
    .from(ownerBookingsTable)
    .where(and(...allCancelledConds));
  const allTimeCancelIncome = Math.round(allCancelledRows.reduce((s, b) => s + Number(b.cancelIncome ?? 0), 0));

  // All refunds issued by owner
  const allRefundsConds: Parameters<typeof and>[0][] = [eq(ownerRefundsTable.ownerId, ownerId)];
  if (submissionId) {
    // Filter refunds to bookings of this submission
    const bookingIds = allActiveBookings.map(b => b.id);
    if (bookingIds.length > 0) allRefundsConds.push(inArray(ownerRefundsTable.bookingId, bookingIds));
    else allRefundsConds.push(eq(ownerRefundsTable.id, -1)); // no match
  }
  const allRefundRows = await db.select({ amount: ownerRefundsTable.amount }).from(ownerRefundsTable).where(and(...allRefundsConds));
  const allTimeRefundsIssued = Math.round(allRefundRows.reduce((s, r) => s + Number(r.amount), 0));

  // Three-layer calculation
  let totalCashCollected = allTimeCancelIncome;
  let confirmedRevenue = allTimeCancelIncome;
  let floatingCash = 0;
  let insuranceVault = 0;
  const nowMs = Date.now();

  for (const b of allActiveBookings) {
    const deposit = Number(b.depositPaid ?? 0);
    const remaining = b.totalPrice ? Math.max(0, Number(b.totalPrice) - deposit) : 0;
    const collectedBalance = b.balanceCollected ? remaining : 0;
    const insurance = !b.insuranceRefunded && b.insuranceFee ? Number(b.insuranceFee) : 0;

    totalCashCollected += deposit + collectedBalance + insurance;
    insuranceVault += insurance;

    const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
    const dur = Math.max(1, b.durationDays ?? 1);
    const checkoutDate = new Date(sy, sm - 1, sd + dur);
    checkoutDate.setHours(0, 0, 0, 0);
    const isFutureStay = checkoutDate > today;

    if (!isFutureStay) {
      // Completed stay — all revenue is confirmed
      confirmedRevenue += deposit + collectedBalance;
    } else {
      const subId = b.submissionId ?? 0;
      const policy = policyMap[subId];
      const windowEnabled = policy?.enabled ?? false;
      const windowHours = policy?.hours ?? 24;
      const bookingAgeHours = (nowMs - new Date(b.createdAt).getTime()) / 3_600_000;

      if (windowEnabled && bookingAgeHours >= windowHours) {
        // Past cancellation window → confirmed (non-refundable)
        confirmedRevenue += deposit;
        if (collectedBalance > 0) confirmedRevenue += collectedBalance;
      } else {
        // Still refundable → floating
        floatingCash += deposit;
        if (collectedBalance > 0) confirmedRevenue += collectedBalance; // paid-in-full portion is confirmed
      }
    }
  }
  totalCashCollected -= allTimeRefundsIssued;

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
    // ── Monthly split ──
    pendingRevenue:          Math.round(pendingRevenue),
    realizedRevenue:         Math.round(realizedRevenue),
    totalFutureValue:        Math.round(totalFutureValue),
    totalCancellationIncome,
    totalRefundedToClients,
    // ── All-time three-layer liquidity model ──
    totalCashCollected:      Math.round(totalCashCollected),
    confirmedRevenue:        Math.round(confirmedRevenue),
    floatingCash:            Math.round(floatingCash),
    insuranceVault:          Math.round(insuranceVault),
    allTimeRefundsIssued,
    allTimeCancelIncome,
  });
});

/* ── Refunds: POST /owner/bookings/:id/refund ──────────────── */
router.post("/bookings/:id/refund", async (req, res) => {
  const ownerId = req.user!.id;
  const bookingId = Number(req.params.id);
  if (isNaN(bookingId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const { amount, reason, type } = req.body as { amount?: number; reason?: string; type?: string };
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "المبلغ مطلوب" });

  // Verify booking belongs to this owner
  const [booking] = await db
    .select({ id: ownerBookingsTable.id, depositPaid: ownerBookingsTable.depositPaid, totalPrice: ownerBookingsTable.totalPrice, balanceCollected: ownerBookingsTable.balanceCollected })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.id, bookingId), eq(ownerBookingsTable.ownerId, ownerId)));
  if (!booking) return res.status(404).json({ error: "الحجز غير موجود" });

  // Max refundable = deposit + collected balance
  const deposit = Number(booking.depositPaid ?? 0);
  const remaining = booking.totalPrice ? Math.max(0, Number(booking.totalPrice) - deposit) : 0;
  const collected = deposit + (booking.balanceCollected ? remaining : 0);
  if (Number(amount) > collected) return res.status(400).json({ error: "المبلغ يتجاوز ما تم تحصيله" });

  const [refund] = await db
    .insert(ownerRefundsTable)
    .values({ ownerId, bookingId, amount: String(amount), type: type ?? "partial", reason: reason ?? null })
    .returning();

  return res.json(refund);
});

/* ── Refunds: GET /owner/refunds ───────────────────────────── */
router.get("/refunds", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerRefundsTable)
    .where(eq(ownerRefundsTable.ownerId, ownerId))
    .orderBy(desc(ownerRefundsTable.createdAt));
  return res.json(rows);
});

/* ── Future Cash Flow Summary ──────────────────────────────── */

router.get("/future-cash-summary", async (req, res) => {
  const ownerId = req.user!.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Fetch all active (non-cancelled) bookings
  const allActive = await db
    .select({
      id: ownerBookingsTable.id,
      clientName: ownerBookingsTable.clientName,
      clientPhone: ownerBookingsTable.clientPhone,
      bookingDate: ownerBookingsTable.bookingDate,
      durationDays: ownerBookingsTable.durationDays,
      period: ownerBookingsTable.period,
      depositPaid: ownerBookingsTable.depositPaid,
      totalPrice: ownerBookingsTable.totalPrice,
      balanceCollected: ownerBookingsTable.balanceCollected,
      insuranceFee: ownerBookingsTable.insuranceFee,
      submissionId: ownerBookingsTable.submissionId,
    })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNull(ownerBookingsTable.cancelledAt)));

  // Enrich with chalet name via left join on submissions
  const submissionIds = [...new Set(allActive.map(b => b.submissionId).filter(Boolean))] as number[];
  const submissionNames: Record<number, string> = {};
  if (submissionIds.length > 0) {
    const subs = await db
      .select({ id: chaletSubmissionsTable.id, nameAr: chaletSubmissionsTable.nameAr })
      .from(chaletSubmissionsTable)
      .where(inArray(chaletSubmissionsTable.id, submissionIds));
    for (const s of subs) submissionNames[s.id] = s.nameAr;
  }

  // Include cancellation income (retained deposit) from ALL cancelled bookings
  const cancelledRows = await db
    .select({
      cancelIncome: ownerBookingsTable.cancelIncome,
      cancelRefundAmount: ownerBookingsTable.cancelRefundAmount,
    })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNotNull(ownerBookingsTable.cancelledAt)));

  const totalCancellationIncome = Math.round(
    cancelledRows.reduce((s, b) => s + Number(b.cancelIncome ?? 0), 0)
  );
  const totalRefundedToClients = Math.round(
    cancelledRows.reduce((s, b) => s + Number(b.cancelRefundAmount ?? 0), 0)
  );

  // Compute checkout date and split into future vs past
  let globalTotalCashCollected = totalCancellationIncome; // retained cancellation income is real cash held
  let futureCashInHand = 0;
  let futureRemainingBalance = 0;
  const futureBookings: {
    id: number; clientName: string; clientPhone: string | null;
    bookingDate: string; checkoutDate: string; durationDays: number;
    period: string | null; depositPaid: number; totalPrice: number | null;
    balanceCollected: boolean; insuranceFee: number; remainingBalance: number;
    chaletName: string; submissionId: number | null;
  }[] = [];

  for (const b of allActive) {
    const dep = Math.round(Number(b.depositPaid ?? 0));
    const total = b.totalPrice ? Math.round(Number(b.totalPrice)) : null;
    const collectedBalance = (total !== null && b.balanceCollected) ? Math.max(0, total - dep) : 0;
    const cashCollected = dep + collectedBalance;

    globalTotalCashCollected += cashCollected;

    // Compute checkout date string
    const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
    const dur = Math.max(1, b.durationDays ?? 1);
    const checkout = new Date(sy, sm - 1, sd + dur);
    const checkoutStr = `${checkout.getFullYear()}-${String(checkout.getMonth() + 1).padStart(2, "0")}-${String(checkout.getDate()).padStart(2, "0")}`;

    if (checkoutStr > todayStr) {
      futureCashInHand += dep;
      const rem = (total !== null && !b.balanceCollected) ? Math.max(0, total - dep) : 0;
      futureRemainingBalance += rem;
      futureBookings.push({
        id: b.id,
        clientName: b.clientName,
        clientPhone: b.clientPhone ?? null,
        bookingDate: b.bookingDate,
        checkoutDate: checkoutStr,
        durationDays: dur,
        period: b.period ?? null,
        depositPaid: dep,
        totalPrice: total,
        balanceCollected: b.balanceCollected,
        insuranceFee: Math.round(Number(b.insuranceFee ?? 0)),
        remainingBalance: (total !== null && !b.balanceCollected) ? Math.max(0, total - dep) : 0,
        chaletName: b.submissionId ? (submissionNames[b.submissionId] ?? "") : "",
        submissionId: b.submissionId ?? null,
      });
    }
  }

  // Sort by bookingDate ascending
  futureBookings.sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));

  return res.json({
    globalTotalCashCollected: Math.round(globalTotalCashCollected),
    futureCashInHand:         Math.round(futureCashInHand),
    futureRemainingBalance:   Math.round(futureRemainingBalance),
    futureCount:              futureBookings.length,
    futureBookings,
    totalCancellationIncome,
    totalRefundedToClients,
  });
});

/* ── Service Revenue Summary (all providers combined) ────────── */

router.get("/service-revenue-summary", async (req, res) => {
  const ownerId = req.user!.id;
  const selectedMonth = (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month))
    ? req.query.month
    : new Date().toISOString().slice(0, 7);

  // Get all approved providers for this owner
  const providers = await db
    .select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.ownerId, ownerId));

  if (providers.length === 0) return res.json({ totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [] });

  const providerIds = providers.map(p => p.id);

  const appts = await db
    .select({
      providerId: serviceAppointmentsTable.providerId,
      amount: serviceAppointmentsTable.amount,
      deposit: serviceAppointmentsTable.deposit,
      insuranceAmount: serviceAppointmentsTable.insuranceAmount,
      status: serviceAppointmentsTable.status,
    })
    .from(serviceAppointmentsTable)
    .where(
      and(
        inArray(serviceAppointmentsTable.providerId, providerIds),
        gte(serviceAppointmentsTable.dateStr, `${selectedMonth}-01`),
        lte(serviceAppointmentsTable.dateStr, `${selectedMonth}-31`),
        ne(serviceAppointmentsTable.status, "cancelled"),
      )
    );

  const byProvider: Record<number, { name: string; revenue: number; deposits: number; insurance: number; pending: number }> = {};
  for (const p of providers) byProvider[p.id] = { name: p.businessName ?? `خدمة #${p.id}`, revenue: 0, deposits: 0, insurance: 0, pending: 0 };

  for (const a of appts) {
    if (!byProvider[a.providerId]) continue;
    const amt = Number(a.amount ?? 0);
    const dep = Number(a.deposit ?? 0);
    byProvider[a.providerId].revenue  += dep; // collected = deposit paid
    byProvider[a.providerId].deposits += dep;
    byProvider[a.providerId].insurance += Number(a.insuranceAmount ?? 0);
    byProvider[a.providerId].pending  += Math.max(0, amt - dep);
  }

  const totalRevenue  = Object.values(byProvider).reduce((s, p) => s + p.revenue, 0);
  const totalDeposits = Object.values(byProvider).reduce((s, p) => s + p.deposits, 0);
  const totalInsurance = Object.values(byProvider).reduce((s, p) => s + p.insurance, 0);
  const totalPending  = Object.values(byProvider).reduce((s, p) => s + p.pending, 0);

  return res.json({
    totalRevenue,
    totalDeposits,
    totalInsurance,
    totalPending,
    byProvider: Object.entries(byProvider).map(([id, v]) => ({ id: Number(id), ...v })),
  });
});

/* ── Service Clients ─────────────────────────────────────────── */

router.get("/service-clients", async (req, res) => {
  const ownerId = req.user!.id;
  const providers = await db
    .select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.ownerId, ownerId));

  if (providers.length === 0) return res.json([]);

  const providerIds = providers.map(p => p.id);
  const providerMap: Record<number, string> = {};
  for (const p of providers) providerMap[p.id] = p.businessName ?? `خدمة #${p.id}`;

  const appts = await db
    .select({
      clientName: serviceAppointmentsTable.clientName,
      clientPhone: serviceAppointmentsTable.clientPhone,
      providerId: serviceAppointmentsTable.providerId,
      dateStr: serviceAppointmentsTable.dateStr,
      amount: serviceAppointmentsTable.amount,
      status: serviceAppointmentsTable.status,
    })
    .from(serviceAppointmentsTable)
    .where(inArray(serviceAppointmentsTable.providerId, providerIds))
    .orderBy(desc(serviceAppointmentsTable.dateStr));

  // Aggregate by phone (or name if no phone)
  const map: Record<string, {
    client_name: string; client_phone: string; total_bookings: number;
    total_revenue: number; last_booking_date: string | null;
    providers: Set<string>;
  }> = {};

  for (const a of appts) {
    const key = a.clientPhone?.trim() || `name:${a.clientName}`;
    if (!map[key]) {
      map[key] = {
        client_name: a.clientName,
        client_phone: a.clientPhone ?? "",
        total_bookings: 0,
        total_revenue: 0,
        last_booking_date: null,
        providers: new Set(),
      };
    }
    map[key].total_bookings += 1;
    if (a.status !== "cancelled") map[key].total_revenue += Number(a.amount ?? 0);
    if (!map[key].last_booking_date || a.dateStr > (map[key].last_booking_date ?? "")) {
      map[key].last_booking_date = a.dateStr;
    }
    map[key].providers.add(providerMap[a.providerId] ?? `#${a.providerId}`);
  }

  return res.json(
    Object.values(map).map(c => ({
      client_name: c.client_name,
      client_phone: c.client_phone,
      total_bookings: String(c.total_bookings),
      total_revenue: String(c.total_revenue),
      last_booking_date: c.last_booking_date,
      providers: Array.from(c.providers),
    }))
  );
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
      .select({ rev: ownerBookingsTable.revenueAmount, totalPrice: ownerBookingsTable.totalPrice, depositPaid: ownerBookingsTable.depositPaid, balanceCollected: ownerBookingsTable.balanceCollected, cancelledAt: ownerBookingsTable.cancelledAt, insuranceDeducted: ownerBookingsTable.insuranceDeducted })
      .from(ownerBookingsTable).where(and(...bConds));
    const activeRows = bRows.filter(r => r.cancelledAt === null);
    const revenue = activeRows.reduce((s, r) => {
      let rev = 0;
      if (r.totalPrice !== null) {
        const dep = Number(r.depositPaid ?? 0);
        rev = dep + (r.balanceCollected ? Number(r.totalPrice) - dep : 0);
      } else if (r.rev) {
        rev = Number(r.rev);
      } else {
        rev = Number(r.depositPaid ?? 0);
      }
      return s + rev + (r.insuranceDeducted ? Number(r.insuranceDeducted) : 0);
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

/* ── Yearly Summary (Hijri calendar) ────────────────────────── */
router.get("/yearly-summary-hijri", async (req, res) => {
  const ownerId = req.user!.id;

  const hijriYearStr = typeof req.query.hijriYear === "string" ? req.query.hijriYear : "";
  const hijriYear = parseInt(hijriYearStr, 10);
  if (!hijriYear || hijriYear < 1400 || hijriYear > 1600) {
    return res.status(400).json({ error: "hijriYear غير صالح" });
  }

  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  /* Gregorian window: a Hijri year spans ~354 days starting mid-Gregorian-year.
     Approximate: gYear ≈ (hijriYear − 1) × 354.367/365.25 + 622
     We search ±1 Gregorian year around that to ensure full coverage.          */
  /* Correct formula: hijriYear (not hijriYear-1) so H1447 maps to ~2025-2026 */
  const approxGYear = Math.floor(hijriYear * 354.367 / 365.25 + 622);
  const gYearStart = approxGYear - 1;
  const gYearEnd   = approxGYear + 1;

  /* Staff salaries map */
  const staffRows = await db.select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary })
    .from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  const staffMap = Object.fromEntries(staffRows.map(s => [s.id, Number(s.baseSalary)]));

  /* Fetch non-cancelled bookings in the Gregorian window */
  const bConds: any[] = [
    eq(ownerBookingsTable.ownerId, ownerId),
    gte(ownerBookingsTable.bookingDate, `${gYearStart}-01-01`),
    lte(ownerBookingsTable.bookingDate, `${gYearEnd}-12-31`),
    isNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
  const bRows = await db.select({
    bookingDate: ownerBookingsTable.bookingDate,
    rev:             ownerBookingsTable.revenueAmount,
    totalPrice:      ownerBookingsTable.totalPrice,
    depositPaid:     ownerBookingsTable.depositPaid,
    balanceCollected: ownerBookingsTable.balanceCollected,
    insuranceDeducted: ownerBookingsTable.insuranceDeducted,
  }).from(ownerBookingsTable).where(and(...bConds));

  /* Fetch expenses in the Gregorian window */
  const eConds: any[] = [
    eq(ownerExpensesTable.ownerId, ownerId),
    gte(ownerExpensesTable.dateStr, `${gYearStart}-01-01`),
    lte(ownerExpensesTable.dateStr, `${gYearEnd}-12-31`),
  ];
  if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
  const eRows = await db.select({ dateStr: ownerExpensesTable.dateStr, amt: ownerExpensesTable.amount })
    .from(ownerExpensesTable).where(and(...eConds));

  /* Fetch salary logs in the Gregorian window (single query) */
  const slRows = await db.select({
    month: salaryLogsTable.month,
    bonus: salaryLogsTable.bonus,
    deduction: salaryLogsTable.deduction,
    staffId: salaryLogsTable.staffId,
  }).from(salaryLogsTable).where(and(
    eq(salaryLogsTable.ownerId, ownerId),
    gte(salaryLogsTable.month, `${gYearStart}-01`),
    lte(salaryLogsTable.month, `${gYearEnd}-12`),
  ));

  /* Bucket by Hijri month 1-12 */
  const revByM: Record<number, number> = {};
  const expByM: Record<number, number> = {};
  const salByM: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) { revByM[m] = 0; expByM[m] = 0; salByM[m] = 0; }

  for (const b of bRows) {
    const hym = getHijriYM(b.bookingDate);
    if (hym.year !== hijriYear) continue;
    let rev = 0;
    if (b.totalPrice !== null) {
      const dep = Number(b.depositPaid ?? 0);
      rev = dep + (b.balanceCollected ? Number(b.totalPrice) - dep : 0);
    } else if (b.rev) {
      rev = Number(b.rev);
    } else {
      rev = Number(b.depositPaid ?? 0);
    }
    rev += (b.insuranceDeducted ? Number(b.insuranceDeducted) : 0);
    revByM[hym.month] = (revByM[hym.month] ?? 0) + rev;
  }

  for (const e of eRows) {
    const hym = getHijriYM(e.dateStr);
    if (hym.year !== hijriYear) continue;
    expByM[hym.month] = (expByM[hym.month] ?? 0) + Number(e.amt);
  }

  for (const log of slRows) {
    const hym = getHijriYM(`${log.month}-15`);
    if (hym.year !== hijriYear) continue;
    const base = staffMap[log.staffId] ?? 0;
    salByM[hym.month] = (salByM[hym.month] ?? 0) + base + Number(log.bonus) - Number(log.deduction);
  }

  const hijriMonthNames = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const revenue  = revByM[m] ?? 0;
    const expenses = (expByM[m] ?? 0) + (salByM[m] ?? 0);
    return { month: `${hijriYear}-${String(m).padStart(2, "0")}`, monthName: hijriMonthNames[i], revenue, expenses, netProfit: revenue - expenses };
  });

  const totals = monthly.reduce(
    (s, m) => ({ revenue: s.revenue + m.revenue, expenses: s.expenses + m.expenses, netProfit: s.netProfit + m.netProfit }),
    { revenue: 0, expenses: 0, netProfit: 0 },
  );

  return res.json({ hijriYear, monthly, totals });
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

/* ── GET /owner/notifications ──────────────────────────────────
   Owner: list all notifications, newest first */
router.get("/notifications", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });

  const rows = await db
    .select()
    .from(ownerNotificationsTable)
    .where(eq(ownerNotificationsTable.ownerId, ownerId))
    .orderBy(desc(ownerNotificationsTable.createdAt))
    .limit(50);

  return res.json(rows);
});

/* ── PATCH /owner/notifications/read-all ───────────────────────
   Owner: mark all notifications as read */
router.patch("/notifications/read-all", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });

  await db
    .update(ownerNotificationsTable)
    .set({ isRead: true })
    .where(and(eq(ownerNotificationsTable.ownerId, ownerId), eq(ownerNotificationsTable.isRead, false)));

  return res.json({ ok: true });
});

/* ── helpers: resolve owner's chalet IDs via submissions ────── */
async function getOwnerChaletIds(ownerId: string): Promise<number[]> {
  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, ownerId));
  if (subs.length === 0) return [];
  const subIds = subs.map((s) => s.id);
  const chalets = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(inArray(chaletsTable.submissionId, subIds));
  return chalets.map((c) => c.id);
}

/* ── GET /owner/reviews ────────────────────────────────────────
   Owner: all reviews for their chalets (including hidden) */
router.get("/reviews", async (req, res) => {
  const ownerId = req.user!.id;

  const chaletIds = await getOwnerChaletIds(ownerId);
  if (chaletIds.length === 0) return res.json([]);

  const rows = await db
    .select({
      id: reviewsTable.id,
      chaletId: reviewsTable.chaletId,
      chaletName: chaletsTable.nameAr,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      photoUrls: reviewsTable.photoUrls,
      guestName: reviewsTable.guestName,
      isAnonymous: reviewsTable.isAnonymous,
      isVerified: reviewsTable.isVerified,
      isHidden: reviewsTable.isHidden,
      ownerReply: reviewsTable.ownerReply,
      ownerReplyAt: reviewsTable.ownerReplyAt,
      reportedBy: reviewsTable.reportedBy,
      reportedAt: reviewsTable.reportedAt,
      reportReason: reviewsTable.reportReason,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .leftJoin(chaletsTable, eq(reviewsTable.chaletId, chaletsTable.id))
    .where(inArray(reviewsTable.chaletId, chaletIds))
    .orderBy(desc(reviewsTable.createdAt));

  return res.json(rows);
});

/* ── POST /owner/reviews/:id/reply ────────────────────────────
   Owner: add or update a reply on one of their chalet's reviews */
router.post("/reviews/:id/reply", async (req, res) => {
  const ownerId = req.user!.id;

  const reviewId = parseInt(req.params.id, 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const body = z.object({ reply: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation" });

  const chaletIds = await getOwnerChaletIds(ownerId);
  if (chaletIds.length === 0) return res.status(403).json({ error: "forbidden" });

  const [review] = await db
    .select({ id: reviewsTable.id, chaletId: reviewsTable.chaletId })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.id, reviewId), inArray(reviewsTable.chaletId, chaletIds)))
    .limit(1);

  if (!review) return res.status(404).json({ error: "not found or forbidden" });

  await db
    .update(reviewsTable)
    .set({ ownerReply: body.data.reply, ownerReplyAt: new Date() })
    .where(eq(reviewsTable.id, reviewId));

  return res.json({ ok: true });
});

/* ── POST /owner/reviews/:id/report ───────────────────────────
   Owner: flag a review for admin manual review */
router.post("/reviews/:id/report", async (req, res) => {
  const ownerId = req.user!.id;

  const reviewId = parseInt(req.params.id, 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const body = z.object({ reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation" });

  const chaletIds = await getOwnerChaletIds(ownerId);
  if (chaletIds.length === 0) return res.status(403).json({ error: "forbidden" });

  const [review] = await db
    .select({ id: reviewsTable.id, chaletId: reviewsTable.chaletId })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.id, reviewId), inArray(reviewsTable.chaletId, chaletIds)))
    .limit(1);

  if (!review) return res.status(404).json({ error: "not found or forbidden" });

  await db
    .update(reviewsTable)
    .set({
      reportedBy: ownerId,
      reportedAt: new Date(),
      reportReason: body.data.reason ?? null,
    })
    .where(eq(reviewsTable.id, reviewId));

  return res.json({ ok: true });
});

/* ── GET /owner/deposits ─────────────────────────────────── */
router.get("/deposits", requireAuth, async (req: Request, res: Response) => {
  const ownerId = req.user!.id;

  const bookings = await db
    .select({
      id: ownerBookingsTable.id,
      clientName: ownerBookingsTable.clientName,
      clientPhone: ownerBookingsTable.clientPhone,
      bookingDate: ownerBookingsTable.bookingDate,
      durationDays: ownerBookingsTable.durationDays,
      period: ownerBookingsTable.period,
      insuranceFee: ownerBookingsTable.insuranceFee,
      insuranceRefunded: ownerBookingsTable.insuranceRefunded,
      insuranceDeducted: ownerBookingsTable.insuranceDeducted,
      insuranceDeductReason: ownerBookingsTable.insuranceDeductReason,
      insuranceProofImages: ownerBookingsTable.insuranceProofImages,
      submissionId: ownerBookingsTable.submissionId,
      chaletTitle: chaletSubmissionsTable.nameAr,
      cancelledAt: ownerBookingsTable.cancelledAt,
      createdAt: ownerBookingsTable.createdAt,
    })
    .from(ownerBookingsTable)
    .leftJoin(chaletSubmissionsTable, eq(ownerBookingsTable.submissionId, chaletSubmissionsTable.id))
    .where(
      and(
        eq(ownerBookingsTable.ownerId, ownerId),
        isNotNull(ownerBookingsTable.insuranceFee),
        ne(ownerBookingsTable.insuranceFee, "0"),
        isNull(ownerBookingsTable.cancelledAt),
      )
    )
    .orderBy(desc(ownerBookingsTable.bookingDate));

  return res.json(bookings);
});

/* ── GET /owner/submissions/:id — fetch one submission (owner only) ── */
router.get("/submissions/:id", requireAuth, async (req, res) => {
  const submissionId = Number(req.params.id);
  if (isNaN(submissionId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const [sub] = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, submissionId));

  if (!sub || sub.ownerId !== (req.user as any)?.id) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  return res.json(sub);
});

/* ── PATCH /owner/submissions/:id — owner edits all chalet data ── */
router.patch("/submissions/:id", requireAuth, async (req, res) => {
  const submissionId = Number(req.params.id);
  if (isNaN(submissionId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const [sub] = await db
    .select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, submissionId));

  if (!sub || sub.ownerId !== (req.user as any)?.id) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  const body = req.body as Record<string, any>;
  const updateData: Record<string, any> = {};

  const str = (v: any) => (v !== undefined && v !== null ? String(v).trim() : undefined);
  const num = (v: any) => (v !== undefined && v !== null && v !== "" ? String(Number(v)) : null);

  if (body.nameAr !== undefined) updateData.nameAr = String(body.nameAr).trim();
  if (body.descriptionAr !== undefined) updateData.descriptionAr = String(body.descriptionAr).trim();
  if (body.whatsappNumber !== undefined) updateData.whatsappNumber = String(body.whatsappNumber).trim();
  if (body.location !== undefined) updateData.location = String(body.location).trim();
  if (body.district !== undefined) updateData.district = body.district || null;
  if (body.mapsUrl !== undefined) { updateData.mapsUrl = body.mapsUrl || null; updateData.websiteUrl = body.mapsUrl || null; }
  if (body.socialLink !== undefined) updateData.socialLink = body.socialLink || null;
  if (body.propertyType !== undefined) updateData.propertyType = body.propertyType || null;
  if (body.sections !== undefined) updateData.sections = body.sections || null;
  if (body.termsAndConditions !== undefined) updateData.termsAndConditions = body.termsAndConditions || null;
  if (body.bookingPolicyText !== undefined) updateData.bookingPolicyText = body.bookingPolicyText || null;
  if (body.cancellationWindowEnabled !== undefined) updateData.cancellationWindowEnabled = !!body.cancellationWindowEnabled;
  if (body.cancellationWindowHours !== undefined) updateData.cancellationWindowHours = body.cancellationWindowHours ? Math.max(1, Number(body.cancellationWindowHours)) : 24;
  if (body.maxGuests !== undefined) updateData.maxGuests = body.maxGuests ? Number(body.maxGuests) : null;
  if (body.bedrooms !== undefined) updateData.bedrooms = body.bedrooms != null ? Number(body.bedrooms) : null;
  if (body.photos !== undefined) updateData.photos = Array.isArray(body.photos) ? body.photos : [];
  if (body.photoCaptions !== undefined) updateData.photoCaptions = Array.isArray(body.photoCaptions) ? body.photoCaptions : [];
  if (body.videoUrl !== undefined) updateData.videoUrl = body.videoUrl || null;
  if (body.amenities !== undefined) updateData.amenities = Array.isArray(body.amenities) ? body.amenities : [];
  if (body.priceMorning !== undefined) updateData.priceMorning = num(body.priceMorning);
  if (body.priceEvening !== undefined) updateData.priceEvening = num(body.priceEvening);
  if (body.priceFullDay !== undefined) updateData.priceFullDay = num(body.priceFullDay);
  if (body.priceWeekday !== undefined) updateData.priceWeekday = num(body.priceWeekday);
  if (body.priceWeekend !== undefined) updateData.priceWeekend = num(body.priceWeekend);
  if (body.slotMorning !== undefined) updateData.slotMorning = !!body.slotMorning;
  if (body.slotEvening !== undefined) updateData.slotEvening = !!body.slotEvening;
  if (body.slotFullDay !== undefined) updateData.slotFullDay = !!body.slotFullDay;
  if (body.dailyPrices !== undefined) updateData.dailyPrices = body.dailyPrices;
  if (body.morningCheckIn !== undefined) updateData.morningCheckIn = body.morningCheckIn || null;
  if (body.morningCheckOut !== undefined) updateData.morningCheckOut = body.morningCheckOut || null;
  if (body.eveningCheckIn !== undefined) updateData.eveningCheckIn = body.eveningCheckIn || null;
  if (body.eveningCheckOut !== undefined) updateData.eveningCheckOut = body.eveningCheckOut || null;
  if (body.fullDayCheckIn !== undefined) updateData.fullDayCheckIn = body.fullDayCheckIn || null;
  if (body.fullDayCheckOut !== undefined) updateData.fullDayCheckOut = body.fullDayCheckOut || null;

  /* ── Reminder fields live in chaletsTable, not chaletSubmissionsTable ── */
  const hasReminder = body.reminderEnabled !== undefined || body.reminderDays !== undefined;

  if (Object.keys(updateData).length > 0) {
    await db
      .update(chaletSubmissionsTable)
      .set(updateData)
      .where(eq(chaletSubmissionsTable.id, submissionId));
  }

  if (hasReminder) {
    const reminderPatch: { reminderEnabled?: boolean; reminderDays?: number } = {};
    if (body.reminderEnabled !== undefined) reminderPatch.reminderEnabled = !!body.reminderEnabled;
    if (body.reminderDays !== undefined) reminderPatch.reminderDays = Math.max(1, Math.min(7, Number(body.reminderDays) || 1));
    await db.update(chaletsTable).set(reminderPatch).where(eq(chaletsTable.submissionId, submissionId));
  }

  return res.json({ ok: true });
});

/* ════════════════════════════════════════════════════════════════
   CRM — Customer List, Profile & Private Notes
   ════════════════════════════════════════════════════════════════ */

/* GET /owner/customers — unique customers aggregated from bookings */
router.get("/customers", async (req, res) => {
  const ownerId = req.user!.id;

  /* Aggregate in JS — avoids raw sql execute array type ambiguity */
  const map = new Map<string, { client_name: string; client_phone: string; total_bookings: number; total_revenue: number; last_booking_date: string }>();
  const fullRows = await db
    .select({
      clientName: ownerBookingsTable.clientName,
      clientPhone: ownerBookingsTable.clientPhone,
      totalPrice: ownerBookingsTable.totalPrice,
      bookingDate: ownerBookingsTable.bookingDate,
    })
    .from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), isNull(ownerBookingsTable.cancelledAt)))
    .orderBy(desc(ownerBookingsTable.bookingDate));

  for (const row of fullRows) {
    const phone = row.clientPhone ?? "";
    const existing = map.get(phone);
    const revenue = parseFloat(row.totalPrice ?? "0") || 0;
    if (existing) {
      existing.total_bookings++;
      existing.total_revenue += revenue;
      if (row.bookingDate > existing.last_booking_date) existing.last_booking_date = row.bookingDate;
    } else {
      map.set(phone, {
        client_name: row.clientName,
        client_phone: phone,
        total_bookings: 1,
        total_revenue: revenue,
        last_booking_date: row.bookingDate,
      });
    }
  }

  const result = Array.from(map.values())
    .sort((a, b) => b.last_booking_date.localeCompare(a.last_booking_date))
    .map((r) => ({
      client_name: r.client_name,
      client_phone: r.client_phone,
      total_bookings: String(r.total_bookings),
      total_revenue: String(r.total_revenue),
      last_booking_date: r.last_booking_date,
    }));

  return res.json(result);
});

/* GET /owner/customers/:phone — full profile + booking history */
router.get("/customers/:phone", async (req, res) => {
  const ownerId  = req.user!.id;
  const phone    = req.params.phone;

  /* ── Fetch all bookings for this customer (with chalet name via join) ── */
  const bookingRows = await db
    .select({
      id:           ownerBookingsTable.id,
      clientName:   ownerBookingsTable.clientName,
      bookingDate:  ownerBookingsTable.bookingDate,
      durationDays: ownerBookingsTable.durationDays,
      period:       ownerBookingsTable.period,
      totalPrice:   ownerBookingsTable.totalPrice,
      submissionId: ownerBookingsTable.submissionId,
      cancelledAt:  ownerBookingsTable.cancelledAt,
      chaletName:   chaletSubmissionsTable.nameAr,
    })
    .from(ownerBookingsTable)
    .leftJoin(chaletSubmissionsTable, eq(ownerBookingsTable.submissionId, chaletSubmissionsTable.id))
    .where(
      and(
        eq(ownerBookingsTable.ownerId, ownerId),
        eq(ownerBookingsTable.clientPhone, phone),
      )
    )
    .orderBy(desc(ownerBookingsTable.bookingDate));

  if (bookingRows.length === 0) return res.status(404).json({ error: "العميل غير موجود" });

  /* ── Compute aggregate stats in JS ── */
  const clientName      = bookingRows[0].clientName;
  const lastBookingDate = bookingRows[0].bookingDate;
  const totalBookings   = bookingRows.length;
  const totalRevenue    = bookingRows.reduce((sum, r) => sum + Number(r.totalPrice ?? 0), 0);

  /* ── Fetch private note ── */
  const noteRows = await db
    .select({ notes: customerNotesTable.notes })
    .from(customerNotesTable)
    .where(
      and(
        eq(customerNotesTable.ownerId, ownerId),
        eq(customerNotesTable.clientPhone, phone),
      )
    )
    .limit(1);
  const noteRow = noteRows[0];

  return res.json({
    clientName:      clientName,
    clientPhone:     phone,
    totalBookings:   totalBookings,
    totalRevenue:    totalRevenue,
    lastBookingDate: lastBookingDate,
    bookings: bookingRows.map((b) => ({
      id:           b.id,
      booking_date: b.bookingDate,
      duration_days: b.durationDays,
      period:       b.period,
      total_price:  String(b.totalPrice ?? "0"),
      submission_id: b.submissionId,
      cancelled_at: b.cancelledAt,
      chalet_name:  b.chaletName ?? null,
    })),
    note: noteRow?.notes ?? "",
  });
});

/* PUT /owner/customers/:phone/note — upsert private note */
router.put("/customers/:phone/note", async (req, res) => {
  const ownerId = req.user!.id;
  const phone   = req.params.phone;
  const notes   = String(req.body?.notes ?? "");

  await db.execute(
    sql`
      INSERT INTO customer_notes (owner_id, client_phone, notes, updated_at)
      VALUES (${ownerId}, ${phone}, ${notes}, now())
      ON CONFLICT (owner_id, client_phone) DO UPDATE SET notes = ${notes}, updated_at = now()
    `
  );
  return res.json({ ok: true });
});

/* PUT /owner/customers/:phone — rename and/or re-phone a customer */
router.put("/customers/:phone", async (req, res) => {
  const ownerId  = req.user!.id;
  const oldPhone = req.params.phone;
  const newName  = req.body?.name  ? String(req.body.name).trim()  : null;
  const newPhone = req.body?.phone ? String(req.body.phone).trim() : null;

  if (!newName && !newPhone) {
    return res.status(400).json({ error: "يرجى تقديم اسم أو رقم جوال جديد" });
  }

  /* Update name across all bookings */
  if (newName) {
    await db
      .update(ownerBookingsTable)
      .set({ clientName: newName })
      .where(and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, oldPhone)));
  }

  /* Update phone across bookings + notes */
  if (newPhone && newPhone !== oldPhone) {
    await db
      .update(ownerBookingsTable)
      .set({ clientPhone: newPhone })
      .where(and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, oldPhone)));
    await db
      .update(customerNotesTable)
      .set({ clientPhone: newPhone })
      .where(and(eq(customerNotesTable.ownerId, ownerId), eq(customerNotesTable.clientPhone, oldPhone)));
  }

  return res.json({ ok: true, newPhone: newPhone ?? oldPhone });
});

/* DELETE /owner/customers/:phone — delete all bookings + notes for this customer */
router.delete("/customers/:phone", async (req, res) => {
  const ownerId = req.user!.id;
  const phone   = req.params.phone;

  await db.delete(ownerBookingsTable).where(
    and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, phone))
  );
  await db.delete(customerNotesTable).where(
    and(eq(customerNotesTable.ownerId, ownerId), eq(customerNotesTable.clientPhone, phone))
  );

  return res.json({ ok: true });
});

/* ── Chalet Add-on Services ──────────────────────────────── */

async function verifyOwnerChalet(ownerId: string, chaletId: number) {
  const subs = await db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, ownerId));
  const subIds = subs.map((s) => s.id);
  if (subIds.length === 0) return false;
  const rows = await db.select({ id: chaletsTable.id }).from(chaletsTable).where(and(eq(chaletsTable.id, chaletId), inArray(chaletsTable.submissionId, subIds)));
  return rows.length > 0;
}

/* GET /owner/chalets/:chaletId/services */
router.get("/chalets/:chaletId/services", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  if (!(await verifyOwnerChalet(ownerId, chaletId))) return res.status(403).json({ error: "forbidden" });
  const services = await db.select().from(chaletServicesTable).where(eq(chaletServicesTable.chaletId, chaletId)).orderBy(chaletServicesTable.createdAt);
  return res.json(services);
});

const galleryPhotoSchema = z.array(z.object({ url: z.string().url(), caption: z.string().max(200) })).max(10).optional();

/* POST /owner/chalets/:chaletId/services */
router.post("/chalets/:chaletId/services", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  if (!(await verifyOwnerChalet(ownerId, chaletId))) return res.status(403).json({ error: "forbidden" });
  const schema = z.object({
    name: z.string().min(1, "اسم الخدمة مطلوب").max(200),
    category: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    price: z.number({ invalid_type_error: "السعر يجب أن يكون رقمًا" }).positive("السعر يجب أن يكون أكبر من صفر"),
    unit: z.string().max(100).optional(),
    imageUrl: z.string().url().optional().or(z.literal("")),
    galleryPhotos: galleryPhotoSchema,
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = (msgs as string[])[0] ?? "خطأ";
    }
    return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors });
  }
  const body = parsed.data;
  const [service] = await db.insert(chaletServicesTable).values({
    chaletId,
    name: body.name,
    category: body.category ?? null,
    description: body.description ?? null,
    price: String(body.price),
    unit: body.unit ?? "مرة واحدة",
    imageUrl: body.imageUrl || null,
    galleryPhotos: body.galleryPhotos ?? null,
  }).returning();
  return res.status(201).json(service);
});

/* PATCH /owner/chalets/:chaletId/services/:serviceId */
router.patch("/chalets/:chaletId/services/:serviceId", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  const serviceId = Number(req.params.serviceId);
  if (!(await verifyOwnerChalet(ownerId, chaletId))) return res.status(403).json({ error: "forbidden" });
  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    category: z.string().max(100).nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    price: z.number().positive().optional(),
    unit: z.string().max(100).optional(),
    imageUrl: z.string().url().nullable().optional().or(z.literal("")),
    galleryPhotos: galleryPhotoSchema.or(z.null()).optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = (msgs as string[])[0] ?? "خطأ";
    }
    return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors });
  }
  const body = parsed.data;
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.category !== undefined) patch.category = body.category;
  if (body.description !== undefined) patch.description = body.description;
  if (body.price !== undefined) patch.price = String(body.price);
  if (body.unit !== undefined) patch.unit = body.unit;
  if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl || null;
  if (body.galleryPhotos !== undefined) patch.galleryPhotos = body.galleryPhotos;
  if (body.isActive !== undefined) patch.isActive = body.isActive;
  const [updated] = await db.update(chaletServicesTable).set(patch).where(and(eq(chaletServicesTable.id, serviceId), eq(chaletServicesTable.chaletId, chaletId))).returning();
  if (!updated) return res.status(404).json({ error: "not found" });
  return res.json(updated);
});

/* DELETE /owner/chalets/:chaletId/services/:serviceId */
router.delete("/chalets/:chaletId/services/:serviceId", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  const serviceId = Number(req.params.serviceId);
  if (!(await verifyOwnerChalet(ownerId, chaletId))) return res.status(403).json({ error: "forbidden" });
  await db.delete(chaletServicesTable).where(and(eq(chaletServicesTable.id, serviceId), eq(chaletServicesTable.chaletId, chaletId)));
  return res.json({ ok: true });
});

/* ── GET /owner/notification-settings ─────────────────────────
   Returns the owner's notification preferences */
router.get("/notification-settings", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });
  const [row] = await db.select().from(ownerNotificationSettingsTable).where(eq(ownerNotificationSettingsTable.ownerId, ownerId));
  return res.json(row ?? { ownerId, waEnabled: false, waPhone: null });
});

/* ── PATCH /owner/notification-settings ───────────────────────
   Update WhatsApp notification preferences */
router.patch("/notification-settings", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });
  const { waEnabled, waPhone } = z.object({
    waEnabled: z.boolean().optional(),
    waPhone: z.string().max(20).nullable().optional(),
  }).parse(req.body);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (waEnabled !== undefined) patch.waEnabled = waEnabled;
  if (waPhone !== undefined) patch.waPhone = waPhone;
  await db.insert(ownerNotificationSettingsTable)
    .values({ ownerId, waEnabled: waEnabled ?? false, waPhone: waPhone ?? null })
    .onConflictDoUpdate({ target: ownerNotificationSettingsTable.ownerId, set: patch });
  return res.json({ ok: true });
});

export default router;
