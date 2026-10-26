import { Router } from "express";
import staffHoldingsRouter from "./staff-holdings";
import { propertyOffersRouter } from "./property-offers";
import { quotePropertyPrice } from "../lib/property-offer-pricing";
import { staffMobileSchema, staffNationalIdSchema } from "../lib/staff-contact-validation";
import { paySalaryWithExpense } from "../lib/salary-expenses";
import { readOwnerMessageTemplates } from "../lib/owner-message-templates";
import { SaveOwnerWhatsAppSettingsBody } from "@workspace/api-zod";
import { propertyStayComplete } from "../lib/booking-completion";
import { sendCrmHistory, sendCrmProfile } from "../lib/customer-history";
import { sendCrmCustomers } from "../lib/customer-directory";
import { resolveAddonQuantities } from "../lib/chalet-addon-quantity";
import { sendBookingArchive } from "../lib/booking-archive";
import { bookingCheckoutAt, INSURANCE_NOT_READY_MESSAGE, REVIEW_NOT_READY_MESSAGE } from "@workspace/booking-time";
import multer from "multer";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";
import { db } from "@workspace/db";
import {
  ownerBookingsTable,
  chaletSubmissionsTable,
  chaletsTable,
  chaletAvailabilityTable,
  ownerSubscriptionsTable,
  ownerExpensesTable,
  ownerStaffTable,
  staffHoldingsTable,
  staffSessionsTable,
  salaryLogsTable,
  ownerReportArchiveTable,
  subscriptionPlansTable,
  subscriptionAddonPurchasesTable,
  ownerBillingProfilesTable,
  subscriptionRenewalInvoicesTable,
  subscriptionRenewalAttemptsTable,
  subscriptionCheckoutIntentsTable,
  reviewInvitationsTable,
  reviewsTable,
  ownerNotificationsTable,
  ownerRescheduleLogsTable,
  chaletSeasonsTable,
  globalSeasonsTable,
  chaletGlobalSeasonsTable,
  customerNotesTable,
  chaletServicesTable,
  ownerNotificationSettingsTable,
  serviceAppointmentsTable,
  serviceProvidersTable,
  ownerTempSessionsTable,
  ownerRefundsTable,
  bookingPaymentsTable,
  cashDepositLogsTable,
  expenseCategoriesTable,
  ownerCustomersTable,
} from "@workspace/db/schema";
import bcrypt from "bcryptjs";
import { eq, and, ne, inArray, gte, gt, lte, sql, desc, isNull, isNotNull, or, getTableColumns, type SQL } from "drizzle-orm";
import { randomBytes, createHash, randomInt } from "crypto";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { sendOtpEmail, sendReportEmail } from "../lib/email";
import { normalizeCustomerPhone } from "../lib/customerPhone";
import { checkPropertyIdentity } from "../lib/property-identity";
import { hasPropertySocialConflict, socialAccountIdentity } from "../lib/property-social-account";
import { normalizeSaudiMobile } from "../lib/passwordRecovery";
import { ensureOwnerProfile } from "../lib/ownerProfile";
import { getOrStartOwnerSubscription, isSubscriptionActive, ownerPlanAccess, subscriptionOwnerKeys, getOwnerFreeAccess } from "../lib/subscription-access";
import { getOwnerAccountDiscount } from "../lib/subscription-discounts";
import { getReminderPreview } from "../lib/subscription-reminder-preview";
import { createSubscriptionCheckout, previewSubscriptionCheckout, confirmSubscriptionCheckout, redeemFreeSubscriptionCheckout, payWalletSubscriptionCheckout, SubscriptionCheckoutError } from "../lib/subscription-checkout";
import { ownerWallet } from "../lib/owner-wallet";
import { isArchivedSubscriptionPlan } from "../lib/subscription-defaults";
import { createAddonCheckout, previewAddonCheckout, readAddonCheckoutQuote, confirmAddonCheckout, redeemFreeAddonCheckout, SubscriptionAddonCheckoutError } from "../lib/subscription-addon-checkout";
import { getSubscriptionBillingReadiness } from "../lib/subscription-renewals";
import { ownerIdentityAliases } from "../lib/broadcast-utils";

const router = Router();

const supportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const supportStorageSvc = new ObjectStorageService();

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
const toArN = (n: number | string) => String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

/** Compute the actual number of days in a Hijri month (Umm al-Qura) by scanning Gregorian days. */
function computeHijriDaysInMonth(hy: number, hm: number): number {
  const epochMs = Date.UTC(622, 6, 19);
  const approxDays = (hy - 1) * 354.36707 + (hm - 1) * 29.53059;
  const approx = new Date(epochMs + approxDays * 86400000);
  const cursor = new Date(approx);
  cursor.setDate(cursor.getDate() - 6);
  let count = 0;
  let started = false;
  for (let i = 0; i < 65; i++) {
    const ds = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const h = getHijriYM(ds);
    if (h.year === hy && h.month === hm) { started = true; count++; }
    else if (started) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count || 30;
}

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

const DEFAULT_BOOKING_CONFIRMATION_TEMPLATE = "مرحباً {اسم_العميل}، تم تأكيد حجزك في {اسم_العقار} بتاريخ {التاريخ}. نسعد باستقبالك.\n\nتفاصيل المبالغ:\nقيمة الإيجار: {قيمة_الإيجار} ريال.\nقيمة الإضافات: {إجمالي_الخدمات} ريال.\nالإجمالي الكلي: {الإجمالي_الكلي} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي: {المتبقي} ريال.";
const DEFAULT_CANCELLATION_TEMPLATE = "مرحباً {اسم_العميل}، نود إشعارك بإلغاء حجزك في {اسم_العقار} بتاريخ {التاريخ}.\n\nالسبب: {سبب_الإلغاء}.\n\nتفاصيل المبالغ المُستردّة:\n• استرداد العربون: {استرداد_العربون} ريال\n• استرداد التأمين: {استرداد_التأمين} ريال\n• إجمالي المبلغ المسترد: {إجمالي_المسترد} ريال";
const DEFAULT_MODIFICATION_TEMPLATE = "مرحباً {اسم_العميل}، تم تعديل حجزك في {اسم_العقار} بناءً على ({سبب_التعديل}).\n\nالحجز السابق: يوم {اسم_اليوم_من} ({من_التاريخ} | {من_التاريخ_م}) - فترة {الفترة_القديمة}.\n\nالحجز الجديد: يوم {اسم_اليوم_إلى} ({إلى_التاريخ} | {إلى_التاريخ_م}) - فترة {الفترة_الجديدة}.\n\nقيمة الإيجار: {الإيجار} ريال.\nمبلغ التأمين: {التأمين} ريال.\nالمبلغ المدفوع: {المدفوع} ريال.\nالمتبقي: {المتبقي} ريال.";

function normalizeRemainingLabel(template: string): string {
  return template.replace(/المتبقي للدفع عند الوصول:/g, "المتبقي:");
}

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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  /* ── Path 1: owner_temp_session cookie (impersonation / self-session) ──
   *
   * SECURITY: We must verify that the session was created by the *current*
   * Replit user. Without this check, a stale admin cookie from a previous
   * impersonation persists in the browser and overrides the real logged-in
   * user for everyone who shares that browser — causing the "hardcoded
   * Al-Khozama" bug where all accounts see one owner's data.
   *
   * Rule: honour the cookie only when one of the following is true:
   *   (a) No Replit Passport session exists (staff login — no OIDC user).
   *   (b) created_by_replit_id is NULL (legacy row without creator field).
   *   (c) created_by_replit_id matches the currently authenticated user.
   * In every other case the cookie is stale and must be cleared.           */
  const tempToken = (req.cookies as Record<string, string>)?.owner_temp_session;
  if (tempToken) {
    const r = await db.execute<{ owner_id: string; created_by_replit_id: string | null }>(
      sql`SELECT owner_id, created_by_replit_id
          FROM owner_temp_sessions
          WHERE token = ${tempToken} AND expires_at > now() LIMIT 1`
    );
    const row = ((r as any).rows as Array<{ owner_id: string; created_by_replit_id: string | null }>)[0];
    if (row?.owner_id) {
      const currentReplitId = req.isAuthenticated() ? (req.user as any)?.id : null;
      const cookieOwner = row.created_by_replit_id;
      /* Accept when: no Replit session, OR creator field is null, OR creator matches current user */
      if (!currentReplitId || cookieOwner === null || cookieOwner === currentReplitId) {
        (req as any).user = { id: row.owner_id, isImpersonated: true };
        next(); return;
      }
      /* Mismatch — stale cookie from a different user's session, drop it */
      res.clearCookie("owner_temp_session");
    } else {
      /* Token invalid/expired — clear stale cookie */
      res.clearCookie("owner_temp_session");
    }
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
  /* Store the creator's Replit user ID so requireAuth can reject stale cookies */
  const createdByReplitId = req.isAuthenticated() ? (req.user as any).id : null;
  await db.execute(
    sql`INSERT INTO owner_temp_sessions (token, owner_id, admin_label, expires_at, created_by_replit_id)
        VALUES (${token}, ${ownerId}, ${adminLabel}, ${expiresAt}, ${createdByReplitId})`
  );
  return res.json({ token });
});

/* ── PUBLIC: Digital Contract Routes ───────────────────────────────────────
   These are intentionally placed BEFORE requireAuth so customers can access
   their contract link without needing an owner session.
   ─────────────────────────────────────────────────────────────────────── */

/** GET /api/owner/contract/:bookingId — returns booking summary for contract page */
router.get("/contract/:bookingId", async (req, res) => {
  const id = Number(req.params.bookingId);
  if (!id || isNaN(id)) return res.status(400).json({ error: "معرّف الحجز غير صالح." });

  const rows = await db.execute<{
    id: number; client_name: string; client_phone: string | null; booking_date: string; duration_days: number;
    period: string | null; total_price: string | null; deposit_paid: string | null;
    insurance_fee: string | null; contract_signed: boolean;
    contract_signer_name: string | null; contract_signer_id: string | null;
    contract_signature_data_url: string | null; contract_signed_at: string | null;
    name_ar: string | null; cancelled_at: string | null;
    whatsapp_number: string | null; logo_url: string | null;
    terms_and_conditions: string | null; location: string | null;
    district: string | null; insurance_received: boolean | null;
    morning_check_in: string | null; morning_check_out: string | null;
    evening_check_in: string | null; evening_check_out: string | null;
    full_day_check_in: string | null; full_day_check_out: string | null;
  }>(sql`
    SELECT b.id, b.client_name, b.client_phone, b.booking_date, b.duration_days, b.period,
           b.total_price, b.deposit_paid, b.insurance_fee,
           b.contract_signed, b.contract_signer_name, b.contract_signer_id,
           b.contract_signature_data_url, b.contract_signed_at,
           b.cancelled_at, s.name_ar, s.whatsapp_number, s.logo_url,
           s.terms_and_conditions, s.location, s.district,
           b.insurance_received,
           s.morning_check_in, s.morning_check_out,
           s.evening_check_in, s.evening_check_out,
           s.full_day_check_in, s.full_day_check_out
    FROM owner_bookings b
    LEFT JOIN chalet_submissions s ON s.id = b.submission_id
    WHERE b.id = ${id}
    LIMIT 1
  `);
  const row = ((rows as any).rows as typeof rows.rows)[0];
  if (!row) return res.status(404).json({ error: "الحجز غير موجود." });
  if (row.cancelled_at) return res.status(410).json({ error: "هذا الحجز ملغى ولا يمكن التوقيع عليه." });

  // Look up previous signing history for this guest's phone (returning guest auto-fill)
  let prevSignerName: string | null = null;
  let prevSignerId: string | null = null;
  if (row.client_phone && !row.contract_signed) {
    const prevRows = await db.execute<{ contract_signer_name: string | null; contract_signer_id: string | null }>(
      sql`SELECT contract_signer_name, contract_signer_id
          FROM owner_bookings
          WHERE client_phone = ${row.client_phone}
            AND contract_signed = true
            AND contract_signer_name IS NOT NULL
            AND id != ${row.id}
          ORDER BY contract_signed_at DESC
          LIMIT 1`
    );
    const prevRow = ((prevRows as any).rows as typeof prevRows.rows)[0];
    if (prevRow?.contract_signer_name) {
      prevSignerName = prevRow.contract_signer_name;
      prevSignerId = prevRow.contract_signer_id ?? null;
    }
  }

  return res.json({
    id: row.id,
    clientName: row.client_name,
    clientPhone: row.client_phone ?? null,
    chaletName: row.name_ar ?? "الشاليه",
    chaletLocation: row.location ?? null,
    chaletDistrict: row.district ?? null,
    chaletWhatsapp: row.whatsapp_number ?? null,
    chaletLogoUrl: row.logo_url ?? null,
    contractTerms: row.terms_and_conditions ?? null,
    bookingDate: row.booking_date,
    durationDays: row.duration_days,
    period: row.period,
    totalPrice: row.total_price,
    depositPaid: row.deposit_paid,
    insuranceFee: row.insurance_fee,
    insuranceReceived: row.insurance_received ?? null,
    contractSigned: row.contract_signed,
    contractSignerName: row.contract_signer_name ?? null,
    contractSignerId: row.contract_signer_id ?? null,
    contractSignatureDataUrl: row.contract_signature_data_url ?? null,
    contractSignedAt: row.contract_signed_at ?? null,
    prevSignerName,
    prevSignerId,
    morningCheckIn: row.morning_check_in ?? null,
    morningCheckOut: row.morning_check_out ?? null,
    eveningCheckIn: row.evening_check_in ?? null,
    eveningCheckOut: row.evening_check_out ?? null,
    fullDayCheckIn: row.full_day_check_in ?? null,
    fullDayCheckOut: row.full_day_check_out ?? null,
  });
});

/** POST /api/owner/contract/:bookingId/sign — saves signature and marks contract signed */
router.post("/contract/:bookingId/sign", async (req, res) => {
  const id = Number(req.params.bookingId);
  if (!id || isNaN(id)) return res.status(400).json({ error: "معرّف الحجز غير صالح." });

  const { fullName, idNumber, signatureDataUrl } = req.body ?? {};
  if (!fullName?.trim()) return res.status(400).json({ error: "الاسم مطلوب." });
  if (!idNumber?.trim()) return res.status(400).json({ error: "رقم الهوية مطلوب." });
  if (!signatureDataUrl?.startsWith("data:image/")) return res.status(400).json({ error: "بيانات التوقيع غير صالحة." });

  const check = await db.execute<{ cancelled_at: string | null; contract_signed: boolean }>(
    sql`SELECT cancelled_at, contract_signed FROM owner_bookings WHERE id = ${id} LIMIT 1`
  );
  const row = ((check as any).rows as typeof check.rows)[0];
  if (!row) return res.status(404).json({ error: "الحجز غير موجود." });
  if (row.cancelled_at) return res.status(410).json({ error: "هذا الحجز ملغى." });

  await db.execute(sql`
    UPDATE owner_bookings
    SET contract_signed = true,
        client_name     = ${fullName.trim()},
        contract_signer_name = ${fullName.trim()},
        contract_signer_id   = ${idNumber.trim()},
        contract_signature_data_url = ${signatureDataUrl},
        contract_signed_at   = now()
    WHERE id = ${id}
  `);

  return res.json({ ok: true });
});

router.use(requireAuth);
router.use(propertyOffersRouter(getOwnerIds));

// A property-only plan retains booking and property tools, but not the financial
// and staff-management modules. The trial deliberately enables every module.
router.use(async (req, res, next) => {
  if (!/^\/(reports|report-years|yearly-summary|yearly-summary-hijri|service-revenue-summary|transaction-history|expenses|expense-categories|staff|salaries|salary|financial-summary|future-cash-summary|refunds|cash-deposit)(\/|$)/.test(req.path)) return next();
  try {
    const access = await ownerPlanAccess(req.user!.id);
    if (!access.active || access.scope !== "full") return res.status(403).json({ error: "هذا القسم متاح في الباقة المالية والإدارية", upgradeRequired: true });
    next();
  } catch (error) {
    next(error);
  }
});

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
type ResolvedOwnerApplication = { id: number; email: string };

export async function resolveOwnerApplication(req: Request): Promise<ResolvedOwnerApplication | null> {
  const userId       = req.user?.id ?? null;

  /* Strategy 1 — durable account-to-profile mapping */
  if (userId && !/^owner_\d+$/.test(String(userId))) {
    const r = await db.execute(
      sql`SELECT oa.id, oa.email
          FROM owner_account_links link
          JOIN owner_applications oa ON oa.id = link.owner_application_id
          WHERE link.user_id = ${userId}
          LIMIT 1`
    );
    const hit = ((r as any).rows as ResolvedOwnerApplication[])[0];
    if (hit) return hit;
  }

  /* Strategy 2 — password/admin owner_N session → owner_applications by numeric id
   * When admin adds a property for an owner, chalet_submissions.owner_id = "owner_N"
   * (where N = owner_applications.id). We parse N and look up directly. */
  if (userId && /^owner_\d+$/.test(String(userId))) {
    const n = parseInt(String(userId).replace("owner_", ""), 10);
    if (!isNaN(n)) {
      const r = await db.execute(
        sql`SELECT id, email FROM owner_applications WHERE id = ${n} LIMIT 1`
      );
      const hit = ((r as any).rows as ResolvedOwnerApplication[])[0];
      return hit ?? null;
    }
  }

  /* Strategy 3 — first verified link or profile creation for an external account */
  if (userId && !(isPlatformAdmin(req) && !(req.user as any)?.isImpersonated)) {
    const linkedEmail = await ensureOwnerProfile({
      userId,
      email: req.user?.email,
      firstName: req.user?.firstName,
      lastName: req.user?.lastName,
    });
    if (linkedEmail) {
      const r = await db.execute(
        sql`SELECT oa.id, oa.email
            FROM owner_account_links link
            JOIN owner_applications oa ON oa.id = link.owner_application_id
            WHERE link.user_id = ${userId}
            LIMIT 1`
      );
      return ((r as any).rows as ResolvedOwnerApplication[])[0] ?? null;
    }
  }

  return null;
}

const broadcastPreferencesSchema = z.object({
  inApp: z.boolean().optional(),
  inbox: z.boolean().optional(),
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one preference is required");

function serializeBroadcastPreferences(row?: {
  in_app: boolean; inbox: boolean; email: boolean; whatsapp: boolean;
}) {
  return row
    ? { inApp: row.in_app, inbox: row.inbox, email: row.email, whatsapp: row.whatsapp }
    : { inApp: true, inbox: false, email: false, whatsapp: false };
}

router.get("/broadcast-preferences", async (req, res): Promise<void> => {
  const app = await resolveOwnerApplication(req);
  const ownerKey = app ? `app:${app.id}` : `user:${String(req.user?.id ?? "")}`;
  if (!req.user?.id || ownerKey === "user:") {
    res.status(404).json({ error: "لم يتم العثور على حساب المالك" });
    return;
  }
  const result = await db.execute(sql`
    SELECT in_app, inbox, email, whatsapp
    FROM owner_broadcast_preferences WHERE owner_key = ${ownerKey} LIMIT 1
  `);
  const row = ((result as any).rows as Array<{
    in_app: boolean; inbox: boolean; email: boolean; whatsapp: boolean;
  }>)[0];
  res.json(serializeBroadcastPreferences(row));
});

router.patch("/broadcast-preferences", async (req, res): Promise<void> => {
  const parsed = broadcastPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "تفضيلات الإشعارات غير صالحة", details: parsed.error.flatten() });
    return;
  }
  const app = await resolveOwnerApplication(req);
  const ownerKey = app ? `app:${app.id}` : `user:${String(req.user?.id ?? "")}`;
  if (!req.user?.id || ownerKey === "user:") {
    res.status(404).json({ error: "لم يتم العثور على حساب المالك" });
    return;
  }
  const pref = parsed.data;
  const result = await db.execute(sql`
    INSERT INTO owner_broadcast_preferences (owner_key, in_app, inbox, email, whatsapp, updated_at)
    VALUES (${ownerKey}, ${pref.inApp ?? true}, ${pref.inbox ?? false}, ${pref.email ?? false}, ${pref.whatsapp ?? false}, now())
    ON CONFLICT (owner_key) DO UPDATE SET
      in_app = COALESCE(${pref.inApp ?? null}, owner_broadcast_preferences.in_app),
      inbox = COALESCE(${pref.inbox ?? null}, owner_broadcast_preferences.inbox),
      email = COALESCE(${pref.email ?? null}, owner_broadcast_preferences.email),
      whatsapp = COALESCE(${pref.whatsapp ?? null}, owner_broadcast_preferences.whatsapp),
      updated_at = now()
    RETURNING in_app, inbox, email, whatsapp
  `);
  const row = ((result as any).rows as Array<{
    in_app: boolean; inbox: boolean; email: boolean; whatsapp: boolean;
  }>)[0];
  res.json(serializeBroadcastPreferences(row));
});

async function resolveOwnerEmail(req: Request): Promise<string | null> {
  return (await resolveOwnerApplication(req))?.email ?? null;
}

/* ── Helper: build all valid ownerIds for the current session ──────────
 * Combines the primary session ID with the "owner_N" alias from email
 * bridging so that Replit-OAuth owners can see data stored under their
 * admin-assigned "owner_N" key.
 *
 * Platform admins in their direct (non-impersonated) Replit session are
 * intentionally NOT bridged to any owner — they must use temp sessions
 * via the Admin panel to access owner-specific data.
 * ─────────────────────────────────────────────────────────────────────── */
export async function getOwnerIds(req: Request): Promise<string[]> {
  const primary = req.user!.id;
  if (isPlatformAdmin(req) && !(req.user as any)?.isImpersonated) {
    return [primary];
  }
  let linkedAlias: string | null = null;
  try {
    const legacyOwnerMatch = /^owner_(\d+)$/.exec(primary);
    if (legacyOwnerMatch) {
      const applicationId = Number(legacyOwnerMatch[1]);
      const r = await db.execute(sql`
        SELECT user_id FROM owner_account_links
        WHERE owner_application_id = ${applicationId}
          AND user_id !~ '^owner_[0-9]+$' LIMIT 1
      `);
      const linkedUserId = ((r as any).rows as Array<{ user_id: string }>)[0]?.user_id;
      linkedAlias = linkedUserId ?? null;
    } else {
      await resolveOwnerEmail(req);
      const r = await db.execute(
        sql`SELECT owner_application_id
            FROM owner_account_links
            WHERE user_id = ${primary}
            LIMIT 1`
      );
      const appId = ((r as any).rows as Array<{ owner_application_id: number }>)[0]?.owner_application_id;
      if (appId) linkedAlias = `owner_${appId}`;
    }
  } catch { /* non-fatal */ }
  return ownerIdentityAliases(primary, linkedAlias);
}

type OwnerBusinessType = "chalet" | "service" | "both";

function normalizeOwnerBusinessType(value: unknown): OwnerBusinessType | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if ([
    "service", "services", "service_provider", "provider",
    "مزود_خدمة", "خدمة", "خدمات",
  ].includes(normalized)) return "service";

  if ([
    "chalet", "property", "property_owner", "owner",
    "مالك_عقار", "عقار", "شاليه",
  ].includes(normalized)) return "chalet";

  if ([
    "both", "all", "chalet_service", "service_chalet",
    "كلاهما", "الكل", "عقار_وخدمات",
  ].includes(normalized)) return "both";

  return null;
}

async function findLatestRegisteredBusinessType(
  email: string | null,
  phone: string | null,
  userId: string | null,
): Promise<OwnerBusinessType | null> {
  const candidates: unknown[] = [];

  if (email) {
    const result = await db.execute(
      sql`SELECT business_type
          FROM owner_applications
          WHERE LOWER(email) = LOWER(${email})
          ORDER BY created_at DESC, id DESC`
    );
    candidates.push(...((result as any).rows as Array<{ business_type: unknown }>).map((row) => row.business_type));
  }

  if (phone) {
    const result = await db.execute(
      sql`SELECT business_type
          FROM owner_applications
          WHERE phone = ${phone}
          ORDER BY created_at DESC, id DESC`
    );
    candidates.push(...((result as any).rows as Array<{ business_type: unknown }>).map((row) => row.business_type));
  }

  if (userId && /^owner_\d+$/.test(userId)) {
    const applicationId = Number(userId.slice("owner_".length));
    const result = await db.execute(
      sql`SELECT business_type FROM owner_applications WHERE id = ${applicationId} LIMIT 1`
    );
    candidates.push(...((result as any).rows as Array<{ business_type: unknown }>).map((row) => row.business_type));
  }

  for (const candidate of candidates) {
    const businessType = normalizeOwnerBusinessType(candidate);
    if (businessType) return businessType;
  }

  return null;
}

/* ── GET /owner/profile — fetch owner profile ──────────────── */
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user?.id ?? null;

    /* ── Path 1: owner has an owner_applications record ── */
    const ownerAccount = await resolveOwnerApplication(req);
    if (ownerAccount) {
      const email = ownerAccount.email;
      /* Phone: prefer owner_applications.phone, fall back to chalet_submissions.whatsapp_number
         for the same owner (matching by userId in chalet_submissions) */
      let phone = "";
      const oaResult = await db.execute(
        sql`SELECT full_name, phone, email, password_hash, whatsapp_news_subscribe, business_type, bookings_cal_pref, reports_cal_pref, salary_cal_pref FROM owner_applications WHERE id = ${ownerAccount.id} LIMIT 1`
      );
      const oaRow = ((oaResult as any).rows as Array<{ full_name: string; phone: string; email: string; password_hash: string; whatsapp_news_subscribe: boolean; business_type: string; bookings_cal_pref: string; reports_cal_pref: string; salary_cal_pref: string }>)[0];
      if (!oaRow) {
        const businessType = await findLatestRegisteredBusinessType(email, null, userId) ?? "both";
        return res.json({ fullName: req.user?.firstName ?? "", phone: "", email, businessType, noApplication: true });
      }
      phone = oaRow.phone ?? "";
      /* If owner_applications.phone is empty, pull from chalet_submissions */
      if (!phone && userId) {
        const csResult = await db.execute(
          sql`SELECT whatsapp_number
              FROM (
                SELECT whatsapp_number, created_at FROM chalet_submissions WHERE owner_id = ${userId}
                UNION ALL
                SELECT whatsapp_number, created_at FROM service_provider_submissions WHERE owner_id = ${userId}
                UNION ALL
                SELECT whatsapp_number, created_at FROM service_providers WHERE owner_id = ${userId}
              ) owner_phones
              WHERE whatsapp_number IS NOT NULL AND whatsapp_number != ''
              ORDER BY created_at DESC LIMIT 1`
        );
        phone = ((csResult as any).rows as Array<{ whatsapp_number: string }>)[0]?.whatsapp_number ?? "";
      }
      console.log(`[GET /owner/profile] owner_applications path: email=${email} phone=${phone}`);
      const businessType = normalizeOwnerBusinessType(oaRow.business_type)
        ?? await findLatestRegisteredBusinessType(oaRow.email, phone, userId)
        ?? "both";
      return res.json({ fullName: oaRow.full_name, phone, email: oaRow.email, hasPassword: Boolean(oaRow.password_hash), whatsappNewsSubscribe: oaRow.whatsapp_news_subscribe ?? false, businessType, bookingsCalPref: "hijri", reportsCalPref: "hijri", salaryCalPref: oaRow.salary_cal_pref ?? "gregorian" });
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
        const profileEmail = csRow.email ?? req.user?.email ?? "";
        const businessType = await findLatestRegisteredBusinessType(profileEmail, csRow.whatsapp_number, userId) ?? "chalet";
        return res.json({ fullName, phone: csRow.whatsapp_number ?? "", email: profileEmail, businessType });
      }
    }

    /* ── Path 3: last resort — return whatever the session has ── */
    console.log(`[GET /owner/profile] no data found for userId=${userId} email=${req.user?.email}`);
    const fallbackEmail = req.user?.email ?? "";
    const businessType = await findLatestRegisteredBusinessType(fallbackEmail, null, userId) ?? "both";
    return res.json({ fullName: req.user?.firstName ?? "", phone: "", email: fallbackEmail, businessType, noApplication: true });
  } catch (err) {
    console.error("[GET /owner/profile]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء جلب بيانات الحساب" });
  }
});

/* ── PUT /owner/profile — update owner profile ─────────────── */
router.put("/profile", async (req, res) => {
  if ((req.user as { isImpersonated?: boolean } | undefined)?.isImpersonated) {
    return res.status(403).json({ error: "تعديل البيانات الشخصية متاح للمالك فقط، وليس أثناء الدخول الإداري نيابة عنه" });
  }
  try {
    const userId = req.user?.id;
    const ownerAccount = await resolveOwnerApplication(req);
    const currentEmail = ownerAccount?.email ?? null;
    const ownerIds = userId ? await getOwnerIds(req) : [];

    /* ── Path C: Replit OIDC owner (no owner_applications) — direct update via chalet_submissions ── */
    if (!currentEmail) {
      if (!userId) return res.status(404).json({ error: "لم يتم العثور على حساب مرتبط بهذا المستخدم" });

      /* Verify this user has at least one property or service record */
      const accountCheck = await db.execute(
        sql`SELECT
              EXISTS(SELECT 1 FROM chalet_submissions WHERE owner_id = ${userId})
              OR EXISTS(SELECT 1 FROM service_provider_submissions WHERE owner_id = ${userId})
              OR EXISTS(SELECT 1 FROM service_providers WHERE owner_id = ${userId}) AS found`
      );
      if (!((accountCheck as any).rows as Array<{ found: boolean }>)[0]?.found) {
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
        await db.execute(
          sql`UPDATE service_provider_submissions SET whatsapp_number = ${phone.trim()} WHERE owner_id = ${userId}`
        );
        await db.execute(
          sql`UPDATE service_providers SET whatsapp_number = ${phone.trim()} WHERE owner_id = ${userId}`
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
      const otpTargetClean = otpTarget.trim().toLowerCase();
      if (!ownerAccount) return res.status(404).json({ error: "لم يتم العثور على حساب مرتبط بهذا المستخدم" });

      if (newEmailClean && newEmailClean !== currentEmail.toLowerCase()) {
        if (otpTargetClean !== newEmailClean) {
          return res.status(400).json({ error: "رمز التحقق غير مرتبط بالبريد الإلكتروني الجديد" });
        }
      } else if (newPhoneClean !== null && otpTargetClean !== currentEmail.toLowerCase()) {
        return res.status(400).json({ error: "رمز التحقق غير مرتبط بهذا الحساب" });
      }

      try {
        await db.transaction(async (tx) => {
          if (newEmailClean && newEmailClean !== currentEmail.toLowerCase()) {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(LOWER(${newEmailClean})))`);
            const duplicateEmail = await tx.execute(
              sql`SELECT id
                  FROM owner_applications
                  WHERE LOWER(email) = LOWER(${newEmailClean})
                    AND id != ${ownerAccount.id}
                  LIMIT 1`
            );
            if (((duplicateEmail as any).rows as Array<{ id: number }>)[0]) {
              throw new Error("DUPLICATE_OWNER_EMAIL");
            }
            if (newPhoneClean !== null) {
              await tx.execute(
                sql`UPDATE owner_applications
                    SET full_name = ${fullName.trim()},
                        phone = ${newPhoneClean},
                        email = ${newEmailClean}
                    WHERE id = ${ownerAccount.id}`
              );
            } else {
              await tx.execute(
                sql`UPDATE owner_applications
                    SET full_name = ${fullName.trim()},
                        email = ${newEmailClean}
                    WHERE id = ${ownerAccount.id}`
              );
            }
          } else {
            if (newPhoneClean !== null) {
              await tx.execute(
                sql`UPDATE owner_applications
                    SET full_name = ${fullName.trim()},
                        phone = ${newPhoneClean}
                    WHERE id = ${ownerAccount.id}`
              );
            } else {
              await tx.execute(
                sql`UPDATE owner_applications
                    SET full_name = ${fullName.trim()}
                    WHERE id = ${ownerAccount.id}`
              );
            }
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message === "DUPLICATE_OWNER_EMAIL") {
          return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل لدى حساب آخر" });
        }
        throw error;
      }

      /* Keep every owner product's WhatsApp number in sync */
      if (newPhoneClean !== null) {
        for (const linkedOwnerId of ownerIds) {
          await Promise.all([
            db.execute(
              sql`UPDATE chalet_submissions SET whatsapp_number = ${newPhoneClean} WHERE owner_id = ${linkedOwnerId}`
            ),
            db.execute(
              sql`UPDATE service_provider_submissions SET whatsapp_number = ${newPhoneClean} WHERE owner_id = ${linkedOwnerId}`
            ),
            db.execute(
              sql`UPDATE service_providers SET whatsapp_number = ${newPhoneClean} WHERE owner_id = ${linkedOwnerId}`
            ),
          ]);
        }
      }
      return res.json({ ok: true });
    }

    /* ── Path B: Non-sensitive change (name / password only) ── */
    if (currentPassword && newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل" });
      const pwResult = await db.execute(
        sql`SELECT password_hash FROM owner_applications WHERE id = ${ownerAccount!.id} LIMIT 1`
      );
      const pwRow = ((pwResult as any).rows as Array<{ password_hash: string }>)[0];
      if (!pwRow?.password_hash) return res.status(400).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع الدعم" });
      const match = await bcrypt.compare(currentPassword, pwRow.password_hash);
      if (!match) return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      const newHash = await bcrypt.hash(newPassword, 10);
      await db.execute(sql`UPDATE owner_applications SET full_name = ${fullName.trim()}, password_hash = ${newHash} WHERE id = ${ownerAccount!.id}`);
    } else {
      await db.execute(sql`UPDATE owner_applications SET full_name = ${fullName.trim()} WHERE id = ${ownerAccount!.id}`);
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
    const ownerAccount = await resolveOwnerApplication(req);
    if (!ownerAccount) return res.status(404).json({ error: "لم يتم العثور على الحساب" });
    const { subscribe } = req.body as { subscribe: boolean };
    if (!!subscribe) {
      await db.execute(
        sql`UPDATE owner_applications SET whatsapp_news_subscribe = true, whatsapp_subscribed_at = COALESCE(whatsapp_subscribed_at, NOW()) WHERE id = ${ownerAccount.id}`
      );
    } else {
      await db.execute(
        sql`UPDATE owner_applications SET whatsapp_news_subscribe = false WHERE id = ${ownerAccount.id}`
      );
    }
    return res.json({ ok: true, subscribe: !!subscribe });
  } catch (err) {
    console.error("[PATCH /owner/profile/whatsapp-subscribe]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── PATCH /owner/profile/calendar-prefs — save calendar preferences ── */
router.patch("/profile/calendar-prefs", requireAuth, async (req, res) => {
  try {
    const ownerAccount = await resolveOwnerApplication(req);
    if (!ownerAccount) return res.status(404).json({ error: "لم يتم العثور على الحساب" });
    const { bookingsCalPref, reportsCalPref, salaryCalPref } = req.body as { bookingsCalPref?: string; reportsCalPref?: string; salaryCalPref?: string };
    const valid = ["hijri", "gregorian"];
    if ((bookingsCalPref !== undefined && bookingsCalPref !== "hijri") || (reportsCalPref !== undefined && reportsCalPref !== "hijri")) {
      return res.status(400).json({ error: "التقويم الأساسي المعتمد هجري، والميلادي ثانوي" });
    }
    if (bookingsCalPref && !valid.includes(bookingsCalPref)) return res.status(400).json({ error: "قيمة غير صالحة" });
    if (reportsCalPref  && !valid.includes(reportsCalPref))  return res.status(400).json({ error: "قيمة غير صالحة" });
    if (salaryCalPref   && !valid.includes(salaryCalPref))   return res.status(400).json({ error: "قيمة غير صالحة" });
    if (bookingsCalPref !== undefined) {
      await db.execute(sql`UPDATE owner_applications SET bookings_cal_pref = ${bookingsCalPref} WHERE id = ${ownerAccount.id}`);
    }
    if (reportsCalPref !== undefined) {
      await db.execute(sql`UPDATE owner_applications SET reports_cal_pref = ${reportsCalPref} WHERE id = ${ownerAccount.id}`);
    }
    if (salaryCalPref !== undefined) {
      await db.execute(sql`UPDATE owner_applications SET salary_cal_pref = ${salaryCalPref} WHERE id = ${ownerAccount.id}`);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /owner/profile/calendar-prefs]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── POST /owner/support-request — submit a support/feature request ── */
router.post("/support-request", requireAuth, supportUpload.array("files", 10), async (req, res) => {
  try {
    const { subject, message } = req.body as { subject?: string; message?: string };
    if (!subject?.trim()) return res.status(400).json({ error: "الموضوع مطلوب" });
    if (!message?.trim()) return res.status(400).json({ error: "نص الطلب مطلوب" });

    /* Resolve owner identity — use user ID as primary key */
    const ownerId = String(req.user?.id ?? (await resolveOwnerEmail(req)) ?? "unknown");

    /* Resolve name */
    let ownerName: string | null = null;
    try {
      if (ownerId.includes("@")) {
        const r = await db.execute(sql`SELECT full_name FROM owner_applications WHERE LOWER(email) = LOWER(${ownerId}) LIMIT 1`);
        ownerName = ((r as any).rows as Array<{ full_name: string }>)[0]?.full_name ?? null;
      }
      if (!ownerName) {
        const r = await db.execute(
          sql`SELECT oa.full_name FROM chalet_submissions cs
              JOIN owner_applications oa ON oa.phone = cs.whatsapp_number
              WHERE cs.owner_id = ${ownerId}
              LIMIT 1`
        );
        ownerName = ((r as any).rows as Array<{ full_name: string }>)[0]?.full_name ?? null;
      }
    } catch { /* ignore */ }

    /* Upload attachments if provided */
    const attachmentUrls: string[] = [];
    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      for (const file of files) {
        try {
          const isImage = file.mimetype.startsWith("image/");
          const isPdf   = file.mimetype === "application/pdf" || file.originalname?.endsWith(".pdf");
          let buffer: Buffer;
          let contentType: string;
          let ext: string;
          if (isPdf) {
            buffer = file.buffer;
            contentType = "application/pdf";
            ext = "pdf";
          } else if (isImage) {
            buffer = await sharp(file.buffer)
              .resize({ width: 2048, withoutEnlargement: true })
              .webp({ quality: 82 })
              .toBuffer();
            contentType = "image/webp";
            ext = "webp";
          } else {
            continue;
          }
          const url = await supportStorageSvc.uploadBuffer(buffer, contentType, ext);
          attachmentUrls.push(url);
        } catch (uploadErr) {
          console.error("[POST /owner/support-request] attachment upload failed:", uploadErr);
        }
      }
    }

    /* drizzle spreads JS arrays as ($1,$2) record — pass as Postgres literal instead */
    const pgAttachArr = `{${attachmentUrls.join(",")}}`;
    await db.execute(
      sql`INSERT INTO owner_support_requests (owner_id, owner_name, subject, message, status, attachment_urls, created_at)
          VALUES (${String(ownerId)}, ${ownerName}, ${subject.trim()}, ${message.trim()}, 'new', ${pgAttachArr}::text[], now())`
    );
    return res.json({ ok: true, attachment_urls: attachmentUrls });
  } catch (err) {
    console.error("[POST /owner/support-request]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال الطلب" });
  }
});

/* ── GET /owner/support-requests — list this owner's support messages ── */
router.get("/support-requests", requireAuth, async (req, res) => {
  try {
    const ownerIds = await getOwnerIds(req);
    const ownerIdFilter = sql.join(ownerIds.map(ownerId => sql`${ownerId}`), sql`, `);
    const result = await db.execute(
      sql`SELECT * FROM (
            SELECT id, owner_id, subject, message, status, source,
              CASE WHEN array_length(attachment_urls, 1) > 0 THEN attachment_urls WHEN attachment_url IS NOT NULL THEN ARRAY[attachment_url] ELSE '{}'::text[] END AS attachment_urls,
              admin_reply, admin_reply_at,
              CASE WHEN array_length(admin_attachment_urls, 1) > 0 THEN admin_attachment_urls WHEN admin_attachment_url IS NOT NULL THEN ARRAY[admin_attachment_url] ELSE '{}'::text[] END AS admin_attachment_urls,
              is_read_by_owner, created_at, false AS platform_message, 'owner' AS sender
            FROM owner_support_requests
            WHERE owner_id IN (${ownerIdFilter}) AND source <> 'admin_broadcast'
            UNION ALL
            SELECT -id AS id, owner_id, subject, message, 'admin_message' AS status,
              'admin_broadcast' AS source, '{}'::text[] AS attachment_urls,
              NULL::text AS admin_reply, NULL::timestamptz AS admin_reply_at,
              '{}'::text[] AS admin_attachment_urls, is_read AS is_read_by_owner,
              created_at, true AS platform_message, 'platform' AS sender
            FROM owner_broadcast_inbox
            WHERE owner_id IN (${ownerIdFilter})
          ) messages
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
    const ownerIds = await getOwnerIds(req);
    const ownerIdFilter = sql.join(ownerIds.map(ownerId => sql`${ownerId}`), sql`, `);
    const result = await db.execute(
      sql`SELECT (
            SELECT COUNT(*) FROM owner_support_requests
            WHERE owner_id IN (${ownerIdFilter}) AND source <> 'admin_broadcast'
              AND admin_reply IS NOT NULL AND is_read_by_owner = false
          ) + (
            SELECT COUNT(*) FROM owner_broadcast_inbox
            WHERE owner_id IN (${ownerIdFilter}) AND is_read = false
          ) AS count`
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
    const ownerIds = await getOwnerIds(req);
    const ownerIdFilter = sql.join(ownerIds.map(ownerId => sql`${ownerId}`), sql`, `);
    if (!Number.isFinite(id) || id === 0) return res.status(400).json({ error: "معرّف غير صحيح" });
    if (id < 0) {
      await db.execute(sql`UPDATE owner_broadcast_inbox SET is_read = true
        WHERE id = ${Math.abs(id)} AND owner_id IN (${ownerIdFilter})`);
    } else {
      await db.execute(
        sql`UPDATE owner_support_requests SET is_read_by_owner = true
            WHERE id = ${id} AND owner_id IN (${ownerIdFilter}) AND source <> 'admin_broadcast'`
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[POST /owner/support-requests/:id/mark-read]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

/* ── POST /owner/profile/request-change — verify password & send OTP ── */
router.post("/profile/request-change", async (req, res): Promise<void> => {
  try {
    const ownerAccount = await resolveOwnerApplication(req);
    if (!ownerAccount) {
      res.status(404).json({ error: "لم يتم العثور على الحساب" });
      return;
    }
    const currentEmail = ownerAccount.email;

    const { currentPassword, newEmail, newPhone } = req.body as Record<string, string>;
    if (!currentPassword) {
      res.status(400).json({ error: "كلمة المرور الحالية مطلوبة" });
      return;
    }
    if (!newEmail && !newPhone) {
      res.status(400).json({ error: "يرجى تحديد البريد الإلكتروني أو رقم الجوال الجديد" });
      return;
    }
    /* Phone format validation — Saudi 05xxxxxxxx */
    if (newPhone) {
      const cleaned = newPhone.trim().replace(/\s+/g, "");
      if (!/^05\d{8}$/.test(cleaned)) {
        res.status(400).json({ error: "صيغة رقم الجوال غير صحيحة — يجب أن يبدأ بـ 05 ويكون ١٠ أرقام" });
        return;
      }
    }

    /* Verify current password */
    const pwResult = await db.execute(
      sql`SELECT password_hash, full_name FROM owner_applications WHERE id = ${ownerAccount.id} LIMIT 1`
    );
    const pwRow = ((pwResult as any).rows as Array<{ password_hash: string; full_name: string }>)[0];
    if (!pwRow?.password_hash) {
      res.status(400).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع الدعم" });
      return;
    }
    const match = await bcrypt.compare(currentPassword, pwRow.password_hash);
    if (!match) {
      res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }

    const ownerName = pwRow.full_name ?? "صاحب الحساب";

    /* ── Changing email ── */
    if (newEmail) {
      const emailLower = newEmail.trim().toLowerCase();
      if (emailLower === currentEmail.toLowerCase()) {
        res.status(400).json({ error: "البريد الإلكتروني الجديد هو نفس الحالي" });
        return;
      }
      const taken = await db.execute(sql`SELECT id FROM owner_applications WHERE lower(email) = ${emailLower} AND id != ${ownerAccount.id} LIMIT 1`);
      if (((taken as any).rows as any[]).length > 0) {
        res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل لدى حساب آخر" });
        return;
      }
      const code = _genCode();
      await _createOtp(emailLower, code);
      await sendOtpEmail(emailLower, ownerName, code);
      res.json({ ok: true, otpSentTo: emailLower, isNewEmail: true });
      return;
    }

    /* ── Changing phone ── */
    if (newPhone) {
      const phoneClean = newPhone.trim();
      const curPhoneR = await db.execute(sql`SELECT phone FROM owner_applications WHERE id = ${ownerAccount.id} LIMIT 1`);
      const curPhone  = ((curPhoneR as any).rows as Array<{ phone: string }>)[0]?.phone ?? "";
      if (phoneClean === curPhone) {
        res.status(400).json({ error: "رقم الجوال الجديد هو نفس الحالي" });
        return;
      }
      const taken = await db.execute(sql`SELECT id FROM owner_applications WHERE phone = ${phoneClean} AND id != ${ownerAccount.id} LIMIT 1`);
      if (((taken as any).rows as any[]).length > 0) {
        res.status(409).json({ error: "رقم الجوال مسجّل لدى حساب آخر" });
        return;
      }
      /* No SMS service — send OTP to current email */
      const code = _genCode();
      await _createOtp(currentEmail, code);
      await sendOtpEmail(currentEmail, ownerName, code);
      res.json({ ok: true, otpSentTo: currentEmail, isNewEmail: false });
      return;
    }
  } catch (err) {
    console.error("[POST /owner/profile/request-change]", err);
    res.status(500).json({ error: "حدث خطأ أثناء إرسال رمز التحقق" });
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
  const templates = readOwnerMessageTemplates(row?.waToken);
  return {
    ownerId,
    waEnabled: row?.waEnabled ?? false,
    waPhone: row?.waPhone ?? "",
    bookingConfirmationEnabled: row?.bookingConfirmationEnabled ?? false,
    bookingConfirmationTemplate: (() => {
      const t = row?.bookingConfirmationTemplate;
      return normalizeRemainingLabel(t ?? DEFAULT_BOOKING_CONFIRMATION_TEMPLATE);
    })(),
    changeNoticeEnabled: row?.changeNoticeEnabled ?? false,
    cancellationTemplate: row?.arrivalReminderTemplate || DEFAULT_CANCELLATION_TEMPLATE,
    modificationTemplate: (() => {
      const t = row?.changeNoticeTemplate;
      return normalizeRemainingLabel(t ?? DEFAULT_MODIFICATION_TEMPLATE);
    })(),
    ...templates,
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
  const body = SaveOwnerWhatsAppSettingsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const [existing] = await db.select().from(ownerNotificationSettingsTable)
    .where(eq(ownerNotificationSettingsTable.ownerId, ownerId)).limit(1);
  const existingTemplates = readOwnerMessageTemplates(existing?.waToken);
  const sanitizedCustomTemplates = (body.data.customTemplates ?? existingTemplates.customTemplates).map((tpl) => ({
    id: tpl.id || randomBytes(8).toString("hex"),
    title: tpl.title.trim() || "رسالة إضافية",
    body: tpl.body.trim(),
  })).filter((tpl) => tpl.body);

  const values = {
    ownerId,
    waEnabled: body.data.waEnabled ?? false,
    waPhone: body.data.waPhone?.trim() || null,
    bookingConfirmationEnabled: body.data.bookingConfirmationEnabled ?? false,
    bookingConfirmationTemplate: normalizeRemainingLabel(body.data.bookingConfirmationTemplate?.trim() || DEFAULT_BOOKING_CONFIRMATION_TEMPLATE),
    arrivalReminderEnabled: false,
    arrivalReminderOffsetHours: 24,
    arrivalReminderTemplate: body.data.cancellationTemplate?.trim() || DEFAULT_CANCELLATION_TEMPLATE,
    changeNoticeEnabled: body.data.changeNoticeEnabled ?? false,
    changeNoticeTemplate: normalizeRemainingLabel(body.data.modificationTemplate?.trim() || DEFAULT_MODIFICATION_TEMPLATE),
    waInstanceId: body.data.attachmentNote?.trim() || null,
    waToken: JSON.stringify({
      customTemplates: sanitizedCustomTemplates,
      detailedReceiptTemplate: body.data.detailedReceiptTemplate === undefined
        ? existingTemplates.detailedReceiptTemplate : body.data.detailedReceiptTemplate,
    }),
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
  const allOwnerIds = await getOwnerIds(req);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const active = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(inArray(ownerBookingsTable.ownerId, allOwnerIds), isNull(ownerBookingsTable.cancelledAt)));

  const cancelled = await db
    .select({ id: ownerBookingsTable.id })
    .from(ownerBookingsTable)
    .where(and(inArray(ownerBookingsTable.ownerId, allOwnerIds), isNotNull(ownerBookingsTable.cancelledAt)));

  const rescheduled = await db
    .select({ id: ownerRescheduleLogsTable.id })
    .from(ownerRescheduleLogsTable)
    .where(inArray(ownerRescheduleLogsTable.ownerId, allOwnerIds));

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
  const allOwnerIds = await getOwnerIds(req);
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(inArray(ownerBookingsTable.ownerId, allOwnerIds), isNull(ownerBookingsTable.cancelledAt)))
    .orderBy(ownerBookingsTable.createdAt);

  // Enrich: which bookings have been rescheduled at least once?
  const bookingIds = rows.map(r => r.id);
  const logMap = new Map<number, { oldDate: string; reason: string }>();
  if (bookingIds.length > 0) {
    const logs = await db
      .select({
        bookingId: ownerRescheduleLogsTable.bookingId,
        oldDate: ownerRescheduleLogsTable.oldDate,
        reason: ownerRescheduleLogsTable.reason,
      })
      .from(ownerRescheduleLogsTable)
      .where(inArray(ownerRescheduleLogsTable.bookingId, bookingIds))
      .orderBy(desc(ownerRescheduleLogsTable.rescheduledAt));
    for (const log of logs) {
      if (!logMap.has(log.bookingId)) {
        logMap.set(log.bookingId, { oldDate: log.oldDate, reason: log.reason ?? "" });
      }
    }
  }

  const enriched = rows.map(r => ({
    ...r,
    isRescheduled: logMap.has(r.id),
    originalDate: logMap.get(r.id)?.oldDate ?? null,
    rescheduleReason: logMap.get(r.id)?.reason ?? null,
  }));

  return res.json(enriched.reverse());
});

router.get("/bookings/archive", async (req, res) => {
  return sendBookingArchive(req, res, await getOwnerIds(req));
});

router.get("/bookings/cancelled", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(inArray(ownerBookingsTable.ownerId, allOwnerIds), isNotNull(ownerBookingsTable.cancelledAt)))
    .orderBy(ownerBookingsTable.cancelledAt);
  return res.json(rows.reverse());
});

router.post("/bookings", async (req, res) => {
  console.log("[POST /owner/bookings] raw body:", JSON.stringify(req.body));
  const ownerId = req.user!.id;
  const access = await ownerPlanAccess(ownerId);
  if (!access.active) {
    return res.status(403).json({ error: "انتهى اشتراكك. جدّده لاستقبال حجوزات جديدة.", upgradeRequired: true });
  }
  const body = z.object({
    submissionId: z.number().int().positive().optional(),
    clientName: z.string().optional(),
    clientPhone: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().min(1, "رقم الجوال مطلوب")
    ),
    bookingDate: z.string().min(1, "تاريخ الحجز مطلوب"),
    durationDays: z.number().int().min(1).default(1),
    period: z.enum(["morning", "evening", "full_day"], {
      errorMap: () => ({ message: "الفترة الزمنية مطلوبة (صباحي/مسائي/يوم كامل)" }),
    }),
    source: z.enum(["platform", "external"]).default("platform"),
    notes: z.string().optional(),
    revenueAmount: z.number().nonnegative().optional(),
    totalPrice: z.number().nonnegative().optional(),
    applyOfferPrice: z.boolean().optional(),
    depositPaid: z.number().nonnegative().optional(),
    insuranceFee: z.number().nonnegative().optional(),
    insuranceReceived: z.boolean().default(false),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).default("cash"),
    cashDeposited: z.boolean().default(false),
    insurancePaymentMethod: z.enum(["cash", "transfer"]).default("transfer"),
    paymentReceiptUrl: z.string().nullable().optional(),
    addonIds: z.array(z.number().int().positive()).optional(),
    addonQuantities: z.array(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(1).max(1000000) })).max(100).optional(),
  }).safeParse(req.body);

  if (!body.success) {
    console.error("[POST /owner/bookings] Zod validation failed. body:", JSON.stringify(req.body), "errors:", JSON.stringify(body.error.flatten()));
    return res.status(400).json({ error: "بيانات غير صحيحة — رقم الجوال والفترة مطلوبان", details: body.error.flatten() });
  }

  // Never trust a browser's offer total. Recalculate after property authorization
  // and add-on resolution below; a changed quote requires explicit review.
  /* ── Deposit cap: depositPaid must not exceed totalPrice (+ addons) ── */
  if (body.data.depositPaid !== undefined && body.data.totalPrice !== undefined) {
    if (body.data.depositPaid > body.data.totalPrice) {
      return res.status(400).json({ error: "العربون لا يمكن أن يتجاوز إجمالي قيمة الحجز" });
    }
  }

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

  /* Resolve selected addon details for denormalized storage */
  let resolvedAddons: Array<{ id: number; name: string; price: string; unit: string }> | null = null;
  if (body.data.addonQuantities?.length && !body.data.addonIds?.length) {
    return res.status(400).json({ error: "حدّد الخدمات المطلوبة قبل إدخال الكميات." });
  }
  if (body.data.addonIds && body.data.addonIds.length > 0) {
    if (!body.data.submissionId) return res.status(400).json({ error: "يجب تحديد العقار لطلب الخدمات." });
    const services = await db
      .select({ id: chaletServicesTable.id, name: chaletServicesTable.name, price: chaletServicesTable.price, unit: chaletServicesTable.unit, maxQuantity: chaletServicesTable.maxQuantity })
      .from(chaletServicesTable)
      .innerJoin(chaletsTable, eq(chaletsTable.id, chaletServicesTable.chaletId))
      .where(and(inArray(chaletServicesTable.id, body.data.addonIds),
        eq(chaletsTable.submissionId, body.data.submissionId), eq(chaletServicesTable.isActive, true)));
    try { resolvedAddons = resolveAddonQuantities(services, body.data.addonIds, body.data.addonQuantities); }
    catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  }

  const { revenueAmount, totalPrice: requestedTotal, depositPaid, insuranceFee, addonIds: _addonIds, addonQuantities: _addonQuantities, applyOfferPrice, ...restBooking } = body.data;
  let totalPrice = requestedTotal;
  let offerSnapshot: Awaited<ReturnType<typeof quotePropertyPrice>> | null = null;
  if (applyOfferPrice) {
    if (!body.data.submissionId || body.data.durationDays > 60) return res.status(400).json({ error: "حدد العقار ومدة لا تتجاوز ٦٠ يوماً لحساب العرض" });
    try {
      offerSnapshot = await quotePropertyPrice(body.data.submissionId, body.data.bookingDate, body.data.period, body.data.durationDays);
    } catch (error) { return res.status(400).json({ error: (error as Error).message }); }
    const addonsPrice = (resolvedAddons ?? []).reduce((sum, item) => sum + Number(item.price), 0);
    const verifiedTotal = Math.round((offerSnapshot.price + addonsPrice) * 100) / 100;
    if (requestedTotal == null || Math.abs(requestedTotal - verifiedTotal) > 0.001) {
      return res.status(409).json({ error: "تغيّر السعر المعتمد. راجع السعر المحدّث قبل تأكيد الحجز.", quote: offerSnapshot });
    }
    totalPrice = verifiedTotal;
    if (depositPaid != null && depositPaid > totalPrice) return res.status(400).json({ error: "العربون يتجاوز السعر بعد الخصم" });
  }
  const customerName = restBooking.clientName?.trim() || "عميل مؤقت";
  const phoneNormalized = normalizeCustomerPhone(restBooking.clientPhone);
  const booking = await db.transaction(async (tx) => {
    await tx.insert(ownerCustomersTable).values({
      ownerId,
      phoneNormalized,
      phone: phoneNormalized,
      name: customerName,
    }).onConflictDoUpdate({
      target: [ownerCustomersTable.ownerId, ownerCustomersTable.phoneNormalized],
      set: {
        phone: phoneNormalized,
        name: customerName,
        updatedAt: new Date(),
      },
    });

    const [createdBooking] = await tx
      .insert(ownerBookingsTable)
      .values({
        ...restBooking,
        clientName: customerName,
        clientPhone: phoneNormalized,
        ownerId,
        revenueAmount: revenueAmount !== undefined ? String(Math.round(revenueAmount)) : null,
        totalPrice: totalPrice !== undefined ? (applyOfferPrice ? totalPrice.toFixed(2) : String(Math.round(totalPrice * 100) / 100)) : null,
        offerSnapshot,
        depositPaid: depositPaid !== undefined ? String(Math.round(depositPaid)) : null,
        insuranceFee: insuranceFee !== undefined ? String(Math.round(insuranceFee)) : null,
        bookedAddons: resolvedAddons,
      })
      .returning();
    return createdBooking;
  });

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
      const _notifAddons = (booking.bookedAddons as Array<{ id: number; name: string; price: string; unit: string }> | null) ?? [];
      const _notifAddonsTotal = _notifAddons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0).reduce((sum, a) => sum + Math.round(Number(a.price)), 0);
      const _notifAddonsSuffix = _notifAddons.length > 0
        ? `\nالخدمات الإضافية: ${_notifAddons.map(a => a.name).join("، ")}${_notifAddonsTotal > 0 ? ` (${_notifAddonsTotal} ر.س)` : " (مجاني)"}`
        : "";
      let msg = `حجز جديد في ${chaletName} — ${booking.clientName} — ${booking.bookingDate} (${periodLabel})${_notifAddonsSuffix}`;
      const [waSetting] = await db
        .select()
        .from(ownerNotificationSettingsTable)
        .where(eq(ownerNotificationSettingsTable.ownerId, ownerId))
        .limit(1);
      if (waSetting?.waEnabled && waSetting.waPhone) {
        const waText = encodeURIComponent(`حجز جديد في ${chaletName}:\nالعميل: ${booking.clientName}\nالتاريخ: ${booking.bookingDate}\nالفترة: ${periodLabel}${_notifAddonsSuffix}`);
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
    insuranceReceived: z.boolean().optional(),
    insuranceRefunded: z.boolean().optional(),
    insuranceDeducted: z.number().nonnegative().optional(),
    insuranceDeductReason: z.string().nullable().optional(),
    insuranceProofImages: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
    paymentMethod: z.enum(["cash", "transfer", "pos"]).optional(),
    cashDeposited: z.boolean().optional(),
    insurancePaymentMethod: z.enum(["cash", "transfer"]).optional(),
    paymentReceiptUrl: z.string().nullable().optional(),
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

  const settlesInsurance = body.data.insuranceRefunded === true
    || insuranceDeducted !== undefined || body.data.insuranceDeductReason !== undefined
    || insuranceProofImages !== undefined;
  if (settlesInsurance) {
    if (bookingDate !== undefined || durationDays !== undefined || period !== undefined)
      return res.status(400).json({ error: "احفظ تعديل موعد الحجز أولاً قبل تسوية التأمين" });
  }

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

  const updateResult = await db.transaction(async tx => {
    if (settlesInsurance) {
      // Lock against concurrent rescheduling while checking and settling.
      const [existing] = await tx.select().from(ownerBookingsTable)
        .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)))
        .limit(1).for("update");
      if (!existing) return { error: "الحجز غير موجود", status: 404 };
      if (!await propertyStayComplete(existing))
        return { error: INSURANCE_NOT_READY_MESSAGE, status: 409 };
      const deduction = insuranceDeducted ?? Number(existing.insuranceDeducted ?? 0);
      if (deduction > Number(existing.insuranceFee ?? 0))
        return { error: "لا يمكن أن يتجاوز الخصم مبلغ التأمين", status: 400 };
      if (deduction > 0 && !(body.data.insuranceDeductReason ?? existing.insuranceDeductReason)?.trim())
        return { error: "يجب توثيق سبب خصم التأمين", status: 400 };
    }
    const [row] = await tx
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
    return { row };
  });
  if (updateResult.status !== undefined) return res.status(updateResult.status).json({ error: updateResult.error });
  const row = updateResult.row;
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

/* Customer lookup shared by property and service booking forms. */
router.get(["/customers/lookup", "/bookings/lookup"], async (req, res) => {
  const ownerId = req.user!.id;
  const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  const phoneNormalized = normalizeCustomerPhone(phone);
  if (phoneNormalized.length < 9) return res.json(null);

  const [customer] = await db
    .select()
    .from(ownerCustomersTable)
    .where(and(
      eq(ownerCustomersTable.ownerId, ownerId),
      eq(ownerCustomersTable.phoneNormalized, phoneNormalized),
    ))
    .limit(1);
  if (customer) {
    return res.json({
      clientName: customer.name,
      clientPhone: customer.phone,
      serviceAddress: customer.serviceAddress,
      serviceDeliveryMethod: customer.serviceDeliveryMethod,
      clientIdNumber: customer.clientIdNumber,
    });
  }

  const [propertyHistory, serviceHistory] = await Promise.all([
    db
      .select({
        clientName: ownerBookingsTable.clientName,
        clientPhone: ownerBookingsTable.clientPhone,
        createdAt: ownerBookingsTable.createdAt,
      })
      .from(ownerBookingsTable)
      .where(eq(ownerBookingsTable.ownerId, ownerId))
      .orderBy(desc(ownerBookingsTable.createdAt))
      .limit(500),
    db
      .select({
        clientName: serviceAppointmentsTable.clientName,
        clientPhone: serviceAppointmentsTable.clientPhone,
        serviceAddress: serviceAppointmentsTable.serviceAddress,
        serviceDeliveryMethod: serviceAppointmentsTable.serviceDeliveryMethod,
        clientIdNumber: serviceAppointmentsTable.clientIdNumber,
        createdAt: serviceAppointmentsTable.createdAt,
      })
      .from(serviceAppointmentsTable)
      .where(eq(serviceAppointmentsTable.ownerId, ownerId))
      .orderBy(desc(serviceAppointmentsTable.createdAt))
      .limit(500),
  ]);
  const historical = [...serviceHistory, ...propertyHistory]
    .filter((row) => normalizeCustomerPhone(row.clientPhone ?? "") === phoneNormalized)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (!historical?.clientName) return res.json(null);

  const serviceAddress: string | null = "serviceAddress" in historical
    ? (String(historical.serviceAddress ?? "").trim() || null)
    : null;
  const serviceDeliveryMethod: string | null = "serviceDeliveryMethod" in historical
    ? (String(historical.serviceDeliveryMethod ?? "").trim() || null)
    : null;
  const clientIdNumber: string | null = "clientIdNumber" in historical
    ? (String(historical.clientIdNumber ?? "").trim() || null)
    : null;
  await db.insert(ownerCustomersTable).values({
    ownerId,
    phoneNormalized,
    phone,
    name: historical.clientName,
    serviceAddress,
    serviceDeliveryMethod,
    clientIdNumber,
  }).onConflictDoNothing();

  return res.json({
    clientName: historical.clientName,
    clientPhone: phone,
    serviceAddress,
    serviceDeliveryMethod,
    clientIdNumber,
  });
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

  // Auto-purge undeposited cash payments for this booking:
  // Once cancelled, any "cash on hand" entries are no longer valid liquidity.
  await db
    .delete(bookingPaymentsTable)
    .where(and(eq(bookingPaymentsTable.bookingId, id), eq(bookingPaymentsTable.cashDeposited, false)));

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
  const allOwnerIds = await getOwnerIds(req);

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

  if (body.data.bookingId) {
    const [booking] = await db.select().from(ownerBookingsTable)
      .where(and(eq(ownerBookingsTable.id, body.data.bookingId),
        inArray(ownerBookingsTable.ownerId, await getOwnerIds(req)))).limit(1);
    if (!booking || booking.submissionId !== (await db.select({ submissionId: chaletsTable.submissionId })
      .from(chaletsTable).where(eq(chaletsTable.id, chalet.id)).limit(1))[0]?.submissionId || booking.cancelledAt)
      return res.status(400).json({ error: "الحجز غير مرتبط بهذا العقار أو غير متاح" });
    if (!await propertyStayComplete(booking))
      return res.status(409).json({ error: REVIEW_NOT_READY_MESSAGE });
  }

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
  if (!chalet.isActive && !(await ownerPlanAccess(ownerId)).active) {
    return res.status(403).json({ error: "جدّد اشتراكك لتفعيل العقار", upgradeRequired: true });
  }

  const [sub] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, chalet.submissionId!)).limit(1);
  if (!sub || sub.ownerId !== ownerId) return res.status(403).json({ error: "غير مصرح" });

  const updated = await db.transaction(async tx => {
    const [current] = await tx.select({ status: chaletSubmissionsTable.status })
      .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, chalet.submissionId!)).for("update");
    if (current?.status !== "approved") return null;
    const [saved] = await tx.update(chaletsTable).set({ isActive: !chalet.isActive })
      .where(eq(chaletsTable.id, chaletId)).returning({ isActive: chaletsTable.isActive });
    return saved;
  });
  if (!updated) return res.status(409).json({ error: "لا يمكن تفعيل عقار لم تتم الموافقة على طلبه أو رُفض نهائياً." });

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

/* ── PATCH /owner/chalets/:chaletId/buffer-policy — save cleaning buffer settings ── */
router.patch("/chalets/:chaletId/buffer-policy", requireAuth, async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  if (isNaN(chaletId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const body = z.object({
    bufferPolicyEnabled: z.boolean().optional(),
    bufferBlockNextMorningFullDay: z.boolean().optional(),
    bufferBlockNextMorningEvening: z.boolean().optional(),
    bufferBlockSameDayEvening: z.boolean().optional(),
    bufferExceptionWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
    bufferExceptionDates: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periods: z.array(z.enum(["morning", "evening"])),
      action: z.enum(["disable", "enable"]),
    })).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  /* Verify ownership */
  const allOwnerIds = new Set<string>([ownerId]);
  try {
    const email = await resolveOwnerEmail(req);
    if (email) {
      const r = await db.execute(sql`SELECT id FROM owner_applications WHERE LOWER(email) = LOWER(${email}) LIMIT 1`);
      const appId = ((r as any).rows as Array<{ id: number }>)[0]?.id;
      if (appId) allOwnerIds.add(`owner_${appId}`);
    }
  } catch { /* non-fatal */ }

  const subs = await db
    .select({ id: chaletSubmissionsTable.id })
    .from(chaletSubmissionsTable)
    .where(inArray(chaletSubmissionsTable.ownerId, [...allOwnerIds]));

  const subIds = subs.map((s) => s.id);
  const chaletRows = await db
    .select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(and(eq(chaletsTable.id, chaletId), inArray(chaletsTable.submissionId, subIds.length > 0 ? subIds : [-1])))
    .limit(1);

  if (chaletRows.length === 0) return res.status(403).json({ error: "غير مصرح" });

  const patch: Record<string, boolean | string> = {};
  if (body.data.bufferPolicyEnabled !== undefined) patch.bufferPolicyEnabled = body.data.bufferPolicyEnabled;
  if (body.data.bufferBlockNextMorningFullDay !== undefined) patch.bufferBlockNextMorningFullDay = body.data.bufferBlockNextMorningFullDay;
  if (body.data.bufferBlockNextMorningEvening !== undefined) patch.bufferBlockNextMorningEvening = body.data.bufferBlockNextMorningEvening;
  if (body.data.bufferBlockSameDayEvening !== undefined) patch.bufferBlockSameDayEvening = body.data.bufferBlockSameDayEvening;
  if (body.data.bufferExceptionWeekdays !== undefined) patch.bufferExceptionWeekdays = JSON.stringify(body.data.bufferExceptionWeekdays);
  if (body.data.bufferExceptionDates !== undefined) patch.bufferExceptionDates = JSON.stringify(body.data.bufferExceptionDates);

  if (Object.keys(patch).length > 0) {
    await db.update(chaletsTable).set(patch).where(eq(chaletsTable.id, chaletId));
  }

  return res.json({ ok: true });
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

/* ── Availability: Delete Range (unblock dates) — must be before /:id ── */
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

/* ── Chalet Seasons ─────────────────────────────────────────── */

router.get("/global-seasons", async (req, res) => {
  const ownerIds = await getOwnerIds(req);
  const rawSubmissionId = req.query.submissionId;
  if (typeof rawSubmissionId !== "string" || !/^\d+$/.test(rawSubmissionId)) {
    return res.status(400).json({ error: "submissionId مطلوب" });
  }
  const submissionId = Number(rawSubmissionId);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: "معرّف العقار غير صحيح" });
  }

  const [submission] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, submissionId))
    .limit(1);
  if (!submission?.ownerId || !ownerIds.includes(submission.ownerId)) return res.status(403).json({ error: "غير مصرح" });

  const seasons = await db.select()
    .from(globalSeasonsTable)
    .where(eq(globalSeasonsTable.isActive, true))
    .orderBy(globalSeasonsTable.startDate, globalSeasonsTable.id);
  const associations = await db.select({
    globalSeasonId: chaletGlobalSeasonsTable.globalSeasonId,
    enabled: chaletGlobalSeasonsTable.enabled,
    priceMorning: chaletGlobalSeasonsTable.priceMorning,
    priceEvening: chaletGlobalSeasonsTable.priceEvening,
    priceFullDay: chaletGlobalSeasonsTable.priceFullDay,
    dailyPrices: chaletGlobalSeasonsTable.dailyPrices,
  }).from(chaletGlobalSeasonsTable)
    .where(eq(chaletGlobalSeasonsTable.submissionId, submissionId));
  const associationBySeasonId = new Map(associations.map((association) => [association.globalSeasonId, association]));

  return res.json(seasons.map((season) => ({
    ...season,
    enabled: associationBySeasonId.get(season.id)?.enabled ?? true,
    priceMorning: associationBySeasonId.get(season.id)?.priceMorning ?? null,
    priceEvening: associationBySeasonId.get(season.id)?.priceEvening ?? null,
    priceFullDay: associationBySeasonId.get(season.id)?.priceFullDay ?? null,
    dailyPrices: associationBySeasonId.get(season.id)?.dailyPrices ?? null,
  })));
});

router.patch("/global-seasons/:globalSeasonId", async (req, res) => {
  const ownerIds = await getOwnerIds(req);
  const globalSeasonId = Number(req.params.globalSeasonId);
  if (!Number.isSafeInteger(globalSeasonId) || globalSeasonId <= 0) {
    return res.status(400).json({ error: "معرّف الموسم غير صحيح" });
  }
  const parsed = z.object({
    submissionId: z.number().int().positive(),
    enabled: z.boolean(),
    priceMorning: z.number().nonnegative().nullable().optional(),
    priceEvening: z.number().nonnegative().nullable().optional(),
    priceFullDay: z.number().nonnegative().nullable().optional(),
    dailyPrices: z.record(z.string(), z.object({
      morning: z.number().nonnegative().optional(),
      evening: z.number().nonnegative().optional(),
      fullDay: z.number().nonnegative().optional(),
    })).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات غير صحيحة", details: parsed.error.flatten() });

  const [submission] = await db.select({ ownerId: chaletSubmissionsTable.ownerId })
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, parsed.data.submissionId))
    .limit(1);
  if (!submission?.ownerId || !ownerIds.includes(submission.ownerId)) return res.status(403).json({ error: "غير مصرح" });

  const [season] = await db.select({ id: globalSeasonsTable.id })
    .from(globalSeasonsTable)
    .where(eq(globalSeasonsTable.id, globalSeasonId))
    .limit(1);
  if (!season) return res.status(404).json({ error: "الموسم غير موجود" });

  const [association] = await db.insert(chaletGlobalSeasonsTable)
    .values({
      submissionId: parsed.data.submissionId,
      globalSeasonId,
      enabled: parsed.data.enabled,
      priceMorning: parsed.data.priceMorning != null ? String(parsed.data.priceMorning) : null,
      priceEvening: parsed.data.priceEvening != null ? String(parsed.data.priceEvening) : null,
      priceFullDay: parsed.data.priceFullDay != null ? String(parsed.data.priceFullDay) : null,
      dailyPrices: parsed.data.dailyPrices ?? null,
    })
    .onConflictDoUpdate({
      target: [chaletGlobalSeasonsTable.submissionId, chaletGlobalSeasonsTable.globalSeasonId],
      set: {
        enabled: parsed.data.enabled,
        ...(parsed.data.priceMorning !== undefined
          ? { priceMorning: parsed.data.priceMorning != null ? String(parsed.data.priceMorning) : null }
          : {}),
        ...(parsed.data.priceEvening !== undefined
          ? { priceEvening: parsed.data.priceEvening != null ? String(parsed.data.priceEvening) : null }
          : {}),
        ...(parsed.data.priceFullDay !== undefined
          ? { priceFullDay: parsed.data.priceFullDay != null ? String(parsed.data.priceFullDay) : null }
          : {}),
        ...(parsed.data.dailyPrices !== undefined ? { dailyPrices: parsed.data.dailyPrices } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return res.json({
    ...season,
    submissionId: parsed.data.submissionId,
    enabled: association.enabled,
    priceMorning: association.priceMorning,
    priceEvening: association.priceEvening,
    priceFullDay: association.priceFullDay,
    dailyPrices: association.dailyPrices,
    updatedAt: association.updatedAt,
  });
});

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

router.put("/seasons/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  const dayPriceSchema = z.object({
    morning: z.number().nonnegative().optional(),
    evening: z.number().nonnegative().optional(),
    fullDay: z.number().nonnegative().optional(),
  });
  const body = z.object({
    nameAr: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priceMorning: z.number().nonnegative().optional(),
    priceEvening: z.number().nonnegative().optional(),
    priceFullDay: z.number().nonnegative().optional(),
    dailyPrices: z.record(z.string(), dayPriceSchema).optional(),
    period: z.enum(["morning", "evening", "full_day"]).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  if (body.data.endDate < body.data.startDate) return res.status(400).json({ error: "تاريخ النهاية قبل البداية" });
  const { priceMorning, priceEvening, priceFullDay, dailyPrices } = body.data;
  const hasDailyPrice = dailyPrices && Object.values(dailyPrices).some(dp => dp.morning || dp.evening || dp.fullDay);
  if (!priceMorning && !priceEvening && !priceFullDay && !hasDailyPrice) {
    return res.status(400).json({ error: "يجب تحديد سعر واحد على الأقل" });
  }
  const allDayPrices = dailyPrices ? Object.values(dailyPrices) : [];
  const minDayPrice = allDayPrices.length
    ? Math.min(...allDayPrices.flatMap(dp => [dp.morning, dp.evening, dp.fullDay].filter(Boolean) as number[]))
    : null;
  const primaryPrice = priceFullDay ?? priceMorning ?? priceEvening ?? minDayPrice ?? 0;
  const [row] = await db.update(chaletSeasonsTable)
    .set({
      nameAr: body.data.nameAr,
      startDate: body.data.startDate,
      endDate: body.data.endDate,
      price: String(primaryPrice),
      priceMorning: priceMorning != null ? String(priceMorning) : null,
      priceEvening: priceEvening != null ? String(priceEvening) : null,
      priceFullDay: priceFullDay != null ? String(priceFullDay) : null,
      dailyPrices: dailyPrices && Object.keys(dailyPrices).length > 0 ? dailyPrices : null,
      period: body.data.period ?? null,
    })
    .where(and(eq(chaletSeasonsTable.id, id), eq(chaletSeasonsTable.ownerId, ownerId)))
    .returning();
  if (!row) return res.status(404).json({ error: "الموسم غير موجود" });
  return res.json(row);
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
  const access = await ownerPlanAccess(ownerId);
  const billing = await getSubscriptionBillingReadiness(access.subscription.ownerId);
  return res.json({
    plan: access.subscription.plan,
    active: access.active,
    freeAccess: access.freeAccess,
    scope: access.scope,
    chaletLimit: access.chaletLimit,
    serviceLimit: access.serviceLimit,
    baseChaletLimit: access.baseChaletLimit,
    baseServiceLimit: access.baseServiceLimit,
    purchasedChaletSlots: access.purchasedChaletSlots,
    purchasedServiceSlots: access.purchasedServiceSlots,
    chaletCount: access.chaletCount,
    serviceCount: access.serviceCount,
    extraChaletPrice: access.extraChaletPrice,
    extraServicePrice: access.extraServicePrice,
    ...billing,
    recurringConfigured: billing.autoRenewAvailable,
    canSavePaymentMethod: billing.autoRenewAvailable,
  });
});

/* ── Monthly Reports ───────────────────────────────────────── */

router.get("/reports", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const ownerId = allOwnerIds[0];
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

  /* ── Unified DB fetch: all owner bookings, no SQL date filter ──
     Gregorian months are matched with new Date(bookingDate) so
     year/month comparison is always calendar-correct.
     Hijri uses a SQL window (approx Gregorian range) + JS Hijri
     calendar math to keep the result set small.              */
  const fetchConds: Parameters<typeof and>[0][] = [
    inArray(ownerBookingsTable.ownerId, allOwnerIds),
  ];
  if (isHijriMode) {
    const approxGYear = Math.floor(hijriYear! * 354.367 / 365.25 + 622);
    fetchConds.push(gte(ownerBookingsTable.bookingDate, `${approxGYear - 1}-01-01`));
    fetchConds.push(lte(ownerBookingsTable.bookingDate, `${approxGYear + 1}-12-31`));
  }
  if (submissionId) fetchConds.push(eq(ownerBookingsTable.submissionId, submissionId));

  const allOwnerBookings = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(...fetchConds));

  /* ── JS month grouping ───────────────────────────────────────
     Gregorian: new Date(bookingDate).getFullYear/getMonth()
     Hijri:     getHijriYM(bookingDate) calendar conversion     */
  const [gYear, gMon] = isHijriMode ? [0, 0] : month.split("-").map(Number);
  const monthBookings = isHijriMode
    ? allOwnerBookings.filter(b => {
        const hym = getHijriYM(b.bookingDate);
        return hym.year === hijriYear && hym.month === hijriMonth;
      })
    : allOwnerBookings.filter(b => {
        const d = new Date(b.bookingDate);
        return d.getFullYear() === gYear && d.getMonth() === gMon - 1;
      });

  /* ── Stats (calendar-agnostic) ──────────────────────────────── */
  const activeMonthBookings = monthBookings.filter(b => !b.cancelledAt);
  const totalBookings    = activeMonthBookings.length;
  const platformBookings = activeMonthBookings.filter(b => b.source === "platform");
  const externalBookings = activeMonthBookings.filter(b => b.source === "external");
  const totalDays = activeMonthBookings.reduce((sum, b) => sum + (b.durationDays ?? 1), 0);

  let daysInMonth: number;
  if (isHijriMode) {
    daysInMonth = computeHijriDaysInMonth(hijriYear!, hijriMonth!);
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
    ? Array.from({ length: daysInMonth }, (_, i) => {
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
      hijriMonthLabel: `${HIJRI_MONTH_NAMES[hijriMonth! - 1] ?? hijriMonth} ${toArN(hijriYear!)} هـ`,
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

/* GET /owner/plans — administrators control the entire purchasable catalog. */
router.get("/plans", async (_req, res) => {
  const dbPlans = await db
    .select()
    .from(subscriptionPlansTable)
    .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.id);

  return res.json(dbPlans.filter((p) =>
    p.slug !== "trial" && p.isActive && !isArchivedSubscriptionPlan(p),
  ).map((p) => ({
    id: p.slug,
    label: p.nameAr,
    price: Number(p.price),
    days: p.durationDays,
    trialDays: p.trialDays,
    features: p.features ?? [],
    scope: p.scope ?? "full",
    chaletLimit: p.chaletLimit,
    serviceLimit: p.serviceLimit,
    extraChaletPrice: p.extraChaletPrice == null ? null : Number(p.extraChaletPrice),
    extraServicePrice: p.extraServicePrice == null ? null : Number(p.extraServicePrice),
  })));
});

/* POST /owner/subscription/initiate — create a Moyasar payment and return payment_id + form data */
router.get("/wallet", async (req, res) => res.json(await ownerWallet(req.user!.id)));
router.post("/subscription/wallet-pay", async (req, res) => {
  try { return res.json(await payWalletSubscriptionCheckout({ ownerId: req.user!.id, checkoutId: req.body?.checkoutId })); }
  catch (error) { if (error instanceof SubscriptionCheckoutError) return res.status(error.statusCode).json({ error: error.message }); throw error; }
});
router.post("/subscription/preview", async (req, res) => {
  const parsed = z.object({
    plan: z.string().min(1).max(100),
    promoCode: z.string().max(100).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "بيانات معاينة الاشتراك غير صالحة" });
  try {
    return res.json(await previewSubscriptionCheckout({
      ownerId: req.user!.id,
      plan: parsed.data.plan,
      promoCode: parsed.data.promoCode,
    }));
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

router.post("/subscription/initiate", async (req, res) => {
  try {
    const { plan, promoCode, autoRenewConsent, paymentMethod } = req.body ?? {};
    if (paymentMethod !== undefined && !["card", "wallet"].includes(paymentMethod)) return res.status(400).json({ error: "وسيلة الدفع غير صالحة" });
    if (autoRenewConsent !== undefined && typeof autoRenewConsent !== "boolean") {
      return res.status(400).json({ error: "موافقة التجديد التلقائي يجب أن تكون قيمة منطقية" });
    }
    const checkout = await createSubscriptionCheckout({
      ownerId: req.user!.id, plan, promoCode,
      autoRenewConsent: paymentMethod === "wallet" ? false : autoRenewConsent === true, paymentMethod,
    });
    return res.json({
      ...checkout,
      autoRenewConsent: paymentMethod !== "wallet" && autoRenewConsent === true,
      saveCard: paymentMethod !== "wallet" && autoRenewConsent === true,
      autoRenewAvailable: checkout.canSavePaymentMethod,
    });
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

/* POST /owner/subscription/confirm — verify payment with Moyasar and activate subscription */
router.post("/subscription/confirm", async (req, res) => {
  try {
    const { checkoutId, paymentId } = req.body ?? {};
    return res.json(await confirmSubscriptionCheckout({ ownerId: req.user!.id, checkoutId, paymentId }));
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.post("/subscription/redeem", async (req, res) => {
  try {
    return res.json(await redeemFreeSubscriptionCheckout({ ownerId: req.user!.id, checkoutId: req.body?.checkoutId }));
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.post("/subscription/addons/initiate", async (req, res) => {
  const parsed = z.object({
    addonType: z.enum(["chalet", "service"]),
    quantity: z.number().int().min(1).max(50).default(1),
    autoRenewConsent: z.boolean().optional().default(false),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "نوع الإضافة غير صالح، ويجب أن تكون الكمية عدداً صحيحاً بين 1 و50" });
  }
  try {
    const checkout = await createAddonCheckout({
      ownerId: req.user!.id,
      addonType: parsed.data.addonType,
      quantity: parsed.data.quantity,
      autoRenewConsent: parsed.data.autoRenewConsent,
    });
    return res.json({
      ...checkout,
      saveCard: parsed.data.autoRenewConsent,
      autoRenewAvailable: checkout.canSavePaymentMethod,
    });
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.post("/subscription/addons/preview", async (req, res) => {
  const parsed = z.object({
    addonType: z.enum(["chalet", "service"]),
    quantity: z.number().int().min(1).max(50).default(1),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "نوع الإضافة غير صالح، ويجب أن تكون الكمية عدداً صحيحاً بين 1 و50" });
  }
  try {
    return res.json(await previewAddonCheckout({
      ownerId: req.user!.id,
      addonType: parsed.data.addonType,
      quantity: parsed.data.quantity,
    }));
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }
});

router.get("/subscription/addons/checkouts/:checkoutId", async (req, res) => {
  try {
    return res.json(await readAddonCheckoutQuote({
      ownerId: req.user!.id,
      checkoutId: req.params.checkoutId,
    }));
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.post("/subscription/addons/confirm", async (req, res) => {
  try {
    return res.json(await confirmAddonCheckout({
      ownerId: req.user!.id,
      checkoutId: req.body?.checkoutId,
      paymentId: req.body?.paymentId,
    }));
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.post("/subscription/addons/redeem", async (req, res) => {
  try {
    return res.json(await redeemFreeAddonCheckout({ ownerId: req.user!.id, checkoutId: req.body?.checkoutId }));
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) return res.status(error.statusCode).json({ error: error.message });
    throw error;
  }
});

router.get("/subscription/addons", async (req, res) => {
  const ownerKeys = await subscriptionOwnerKeys(req.user!.id);
  const purchases = await db.select().from(subscriptionAddonPurchasesTable)
    .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
  const now = new Date();
  return res.json(purchases.map((purchase) => ({
    id: purchase.id,
    addonType: purchase.addonType,
    quantity: purchase.quantity,
    recurring: purchase.recurring,
    grandfathered: !purchase.recurring,
    monthlyUnitPriceHalala: purchase.monthlyUnitPriceHalala,
    paidThroughAt: purchase.paidThroughAt,
    cancelAtPeriodEnd: purchase.cancelAtPeriodEnd,
    active: !purchase.recurring || (!!purchase.paidThroughAt && purchase.paidThroughAt > now),
  })));
});

router.post("/subscription/addons/:purchaseId/cancel", async (req, res) => {
  const purchaseId = Number(req.params.purchaseId);
  if (!Number.isSafeInteger(purchaseId) || purchaseId < 1) {
    return res.status(400).json({ error: "معرّف الإضافة غير صالح" });
  }
  const ownerKeys = await subscriptionOwnerKeys(req.user!.id);
  const result = await db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(inArray(ownerSubscriptionsTable.ownerId, ownerKeys))
      .for("update").limit(1);
    const [purchase] = await tx.select().from(subscriptionAddonPurchasesTable)
      .where(and(
        eq(subscriptionAddonPurchasesTable.id, purchaseId),
        inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys),
      )).for("update").limit(1);
    if (!purchase) return { kind: "missing" as const };
    if (!purchase.recurring) return { kind: "legacy" as const };
    if (purchase.cancelAtPeriodEnd) return { kind: "cancelled" as const, purchase };
    if (!subscription) return { kind: "missing" as const };

    // All quote creation, invoice claiming, and cancellation serialize on the
    // subscription row. Once a renewal snapshot or attempt exists, don't mutate it.
    const [openInvoice] = await tx.select({ id: subscriptionRenewalInvoicesTable.id })
      .from(subscriptionRenewalInvoicesTable)
      .where(and(
        eq(subscriptionRenewalInvoicesTable.ownerId, subscription.ownerId),
        inArray(subscriptionRenewalInvoicesTable.status, ["pending", "processing", "failed"]),
      )).limit(1);
    if (openInvoice) return { kind: "open-invoice" as const };

    const intents = await tx.select({
      id: subscriptionCheckoutIntentsTable.id,
      recurringAddonSnapshot: subscriptionCheckoutIntentsTable.recurringAddonSnapshot,
      invoiceLines: subscriptionCheckoutIntentsTable.invoiceLines,
    }).from(subscriptionCheckoutIntentsTable)
      .where(and(
        inArray(subscriptionCheckoutIntentsTable.ownerId, ownerKeys),
        isNull(subscriptionCheckoutIntentsTable.consumedAt),
        gt(subscriptionCheckoutIntentsTable.expiresAt, new Date()),
      ));
    const hasManualSnapshot = intents.some((intent) =>
      (intent.recurringAddonSnapshot ?? []).some((line) => line.id === purchase.id) ||
      (intent.invoiceLines ?? []).some((line) => line.addonPurchaseId === purchase.id),
    );
    if (hasManualSnapshot) return { kind: "open-checkout" as const };

    const [updated] = await tx.update(subscriptionAddonPurchasesTable)
      .set({
        cancelAtPeriodEnd: true,
        revision: sql`${subscriptionAddonPurchasesTable.revision} + 1`,
      })
      .where(and(
        eq(subscriptionAddonPurchasesTable.id, purchase.id),
        inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys),
      )).returning();
    return updated ? { kind: "updated" as const, purchase: updated } : { kind: "missing" as const };
  });
  if (result.kind === "missing") return res.status(404).json({ error: "الإضافة غير موجودة" });
  if (result.kind === "legacy") return res.status(409).json({ error: "هذه إضافة تاريخية مدى الحياة ولا تتجدد" });
  if (result.kind === "open-invoice" || result.kind === "open-checkout") {
    return res.status(409).json({ error: "توجد فاتورة أو عملية دفع دورية مفتوحة؛ لا يمكن تغيير الإضافة الآن" });
  }
  const updated = result.purchase;
  return res.json({
    id: updated.id,
    cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    paidThroughAt: updated.paidThroughAt,
  });
});

router.post("/subscription/auto-renew/cancel", async (req, res) => {
  const ownerKeys = await subscriptionOwnerKeys(req.user!.id);
  const [subscription] = await db.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, ownerKeys)).limit(1);
  if (!subscription) return res.status(404).json({ error: "الاشتراك غير موجود" });
  const result = await db.transaction(async (tx) => {
    const [lockedSubscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, subscription.ownerId)).for("update").limit(1);
    const [profile] = await tx.select().from(ownerBillingProfilesTable)
      .where(eq(ownerBillingProfilesTable.ownerId, subscription.ownerId)).for("update").limit(1);
    const [invoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(and(
        eq(subscriptionRenewalInvoicesTable.ownerId, subscription.ownerId),
        inArray(subscriptionRenewalInvoicesTable.status, ["pending", "processing", "failed"]),
      )).orderBy(desc(subscriptionRenewalInvoicesTable.createdAt)).limit(1);
    if (invoice) {
      const [attempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
        .where(eq(subscriptionRenewalAttemptsTable.invoiceId, invoice.id))
        .orderBy(desc(subscriptionRenewalAttemptsTable.attemptNumber)).limit(1);
      if (attempt && attempt.status !== "failed") return { blocked: true as const };
      await tx.update(subscriptionRenewalInvoicesTable)
        .set({ status: "cancelled", lastError: "Owner disabled automatic renewal" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    }
    if (lockedSubscription) {
      await tx.update(ownerSubscriptionsTable)
        .set({ autoRenewEnabled: false })
        .where(eq(ownerSubscriptionsTable.ownerId, lockedSubscription.ownerId));
    }
    if (profile) {
      await tx.update(ownerBillingProfilesTable)
        .set({ autoRenewEnabled: false, updatedAt: new Date() })
        .where(eq(ownerBillingProfilesTable.ownerId, profile.ownerId));
    }
    return { blocked: false as const };
  });
  if (result.blocked) {
    return res.status(409).json({ error: "يوجد تحصيل قيد المعالجة؛ أعد المحاولة بعد اكتماله" });
  }
  return res.json({
    autoRenewEnabled: false,
    expiresAt: subscription.expiresAt,
  });
});

router.get("/subscription", async (req, res) => {
  const ownerId = req.user!.id;
  const sub = await getOrStartOwnerSubscription(ownerId);
  const freeAccess = await getOwnerFreeAccess(ownerId);
  const accountDiscount = await getOwnerAccountDiscount(ownerId);
  const billing = await getSubscriptionBillingReadiness(sub.ownerId);
  // Only the dashboard explicitly opts in to the visual preview. Billing and
  // checkout readers of this endpoint always receive the real subscription.
  const preview = req.query.reminderPreview === "1"
    ? await getReminderPreview(ownerId) : null;
  const [planDetails] = await db.select({
    nameAr: subscriptionPlansTable.nameAr,
    features: subscriptionPlansTable.features,
    scope: subscriptionPlansTable.scope,
  }).from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, sub.plan)).limit(1);

  const calcDaysLeft = (expiresAt: Date | null): number => {
    if (!expiresAt) return 0;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  };

  return res.json({
    ...sub,
    planDetails: sub.termsSnapshot ?? planDetails ?? null,
    status: preview || freeAccess?.active ? "active" : isSubscriptionActive(sub) ? sub.status : "expired",
    expiresAt: preview ? preview.expiresAt : freeAccess?.active ? freeAccess.expiresAt : sub.expiresAt,
    paidExpiresAt: sub.expiresAt,
    daysLeft: preview
      ? preview.milestone
      : freeAccess?.active
        ? freeAccess.expiresAt ? calcDaysLeft(freeAccess.expiresAt) : null
        : calcDaysLeft(sub.expiresAt),
    freeAccess,
    accountDiscount,
    ...billing,
    autoRenewEnabled: billing.autoRenewEnabled,
    ...(preview ? { reminderPreviewMilestone: preview.milestone } : {}),
  });
});

/* ── Expenses ──────────────────────────────────────────────── */

router.get("/expenses", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const providerId = req.query.providerId ? Number(req.query.providerId) : undefined;
  const conditions = [inArray(ownerExpensesTable.ownerId, allOwnerIds)];
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

router.post("/expense-categories", async (req, res) => {
  const body = z.object({ name: z.string().min(1), emoji: z.string().default("✨"), color: z.string().default("slate") }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });
  const existing = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.name, body.data.name));
  if (existing.length > 0) return res.json(existing[0]);
  const [row] = await db.insert(expenseCategoriesTable).values({ ...body.data, isOther: false, sortOrder: 100 }).returning();
  return res.status(201).json(row);
});

/* ── Staff ─────────────────────────────────────────────────── */

router.get("/staff/check-username", async (req, res) => {
  const username = String(req.query.username ?? "").trim().toLowerCase();
  if (username.length < 3) return res.json({ available: false, reason: "short" });
  const [existing] = await db
    .select({ id: ownerStaffTable.id })
    .from(ownerStaffTable)
    .where(sql`lower(${ownerStaffTable.username}) = ${username}`)
    .limit(1);
  return res.json({ available: !existing });
});

router.use("/staff/:staffId/holdings", staffHoldingsRouter);

router.get("/staff", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const rows = await db
    .select()
    .from(ownerStaffTable)
    .where(inArray(ownerStaffTable.ownerId, allOwnerIds))
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
    name: z.string().trim().min(1, "الاسم الكامل مطلوب"),
    phoneNum: staffMobileSchema,
    baseSalary: z.number({ required_error: "الراتب الأساسي مطلوب" }).finite()
      .nonnegative("الراتب الأساسي لا يمكن أن يكون سالباً").max(99_999_999.99),
    grantAccess: z.boolean().default(false),
    permissions: z.record(z.boolean()).optional(),
    assignedToType: z.enum(["all", "chalet", "service"]).optional(),
    assignedToId: z.number().int().positive().optional(),
    nationalId: staffNationalIdSchema.optional(),
    jobTitle: z.string().trim().max(120).optional(),
    email: z.union([z.string().trim().email("أدخل بريداً إلكترونياً صحيحاً").max(254), z.literal("")]).optional(),
    birthDate: z.string().optional(),
    hireDate: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });

  if (body.data.grantAccess) {
    // Do not create credentials or claim an invitation until a functioning
    // WhatsApp activation provider has been connected.
    return res.status(503).json({
      code: "staff_invitation_unavailable",
      error: "دعوات تفعيل الموظفين عبر واتساب غير متاحة حالياً. لم تتم إضافة الموظف؛ يلزم ربط خدمة واتساب أولاً لمنحه صلاحية دخول.",
    });
  }

  const values: Record<string, unknown> = {
    ownerId,
    name: body.data.name,
    baseSalary: String(body.data.baseSalary),
    permissions: {},
    username: null,
    passwordHash: null,
    assignedToType: body.data.assignedToType ?? "all",
    assignedToId: body.data.assignedToId ?? null,
    nationalId: body.data.nationalId || null,
    jobTitle: body.data.jobTitle || null,
    email: body.data.email || null,
    phoneNum: body.data.phoneNum,
    birthDate: body.data.birthDate || null,
    hireDate: body.data.hireDate || null,
  };

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
    nationalId: staffNationalIdSchema.optional(),
    phoneNum: staffMobileSchema.optional(),
    birthDate: z.string().optional(),
    hireDate: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });

  const staffPatch: Record<string, unknown> = {};
  if (body.data.name !== undefined) staffPatch.name = body.data.name;
  if (body.data.isActive !== undefined) staffPatch.isActive = body.data.isActive;
  if (body.data.baseSalary !== undefined) staffPatch.baseSalary = String(body.data.baseSalary);
  if (body.data.username !== undefined) staffPatch.username = body.data.username.trim() || null;
  if (body.data.password) staffPatch.passwordHash = await bcrypt.hash(body.data.password, 10);
  if (body.data.permissions !== undefined) staffPatch.permissions = body.data.permissions;
  if (body.data.assignedToType !== undefined) staffPatch.assignedToType = body.data.assignedToType;
  if (body.data.assignedToId !== undefined) staffPatch.assignedToId = body.data.assignedToId;
  if (body.data.nationalId !== undefined) staffPatch.nationalId = body.data.nationalId || null;
  if (body.data.phoneNum !== undefined) staffPatch.phoneNum = body.data.phoneNum || null;
  if (body.data.birthDate !== undefined) staffPatch.birthDate = body.data.birthDate || null;
  if (body.data.hireDate !== undefined) staffPatch.hireDate = body.data.hireDate || null;

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
  const [holding] = await db.select({ id: staffHoldingsTable.id }).from(staffHoldingsTable)
    .where(and(eq(staffHoldingsTable.ownerId, ownerId), eq(staffHoldingsTable.staffId, id))).limit(1);
  if (holding) return res.status(409).json({ error: "لا يمكن حذف موظف له سجل عهد أو تأمينات؛ يمكنك تعطيل الموظف مع الاحتفاظ بسجله." });
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
      bonusNotes: salaryLogsTable.bonusNotes,
      deductionNotes: salaryLogsTable.deductionNotes,
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
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    bonus: z.number().nonnegative().default(0),
    deduction: z.number().nonnegative().default(0),
    notes: z.string().optional(),
    bonusNotes: z.string().optional(),
    deductionNotes: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  const result = await paySalaryWithExpense(ownerId, body.data);
  if (result.kind === "not-found") return res.status(403).json({ error: "غير مصرح" });
  if (result.kind === "already-paid") return res.status(409).json({ error: "تم صرف راتب هذا الموظف للشهر المحدد مسبقاً؛ لم يتم إنشاء مصروف مكرر" });
  if (result.kind === "invalid-amount") return res.status(400).json({ error: "يجب أن يكون صافي الراتب المصروف مبلغاً موجباً وصالحاً" });
  return res.json({ salaryLog: result.salaryLog, expense: result.expense });
});

router.delete("/salary-logs/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db.delete(salaryLogsTable).where(and(eq(salaryLogsTable.id, id), eq(salaryLogsTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

/* ── Financial Summary ─────────────────────────────────────── */

router.get("/financial-summary", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const ownerId = allOwnerIds[0];

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

  // Cash on Hand: all-time, computed for both Hijri & Gregorian responses
  const cashConds: Parameters<typeof and>[0][] = [
    inArray(ownerBookingsTable.ownerId, allOwnerIds),
    isNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) cashConds.push(eq(ownerBookingsTable.submissionId, submissionId));
  const cashBookingsAll = await db
    .select({
      id: ownerBookingsTable.id,
      clientName: ownerBookingsTable.clientName,
      bookingDate: ownerBookingsTable.bookingDate,
      depositPaid: ownerBookingsTable.depositPaid,
      balanceCollected: ownerBookingsTable.balanceCollected,
      totalPrice: ownerBookingsTable.totalPrice,
      paymentMethod: ownerBookingsTable.paymentMethod,
      cashDeposited: ownerBookingsTable.cashDeposited,
    })
    .from(ownerBookingsTable).where(and(...cashConds));

  // Set of booking IDs that have installment payment records (to avoid double-counting balance)
  const bookingIdsWithInstallmentsPre = new Set(
    (await db.select({ bookingId: bookingPaymentsTable.bookingId })
      .from(bookingPaymentsTable)
      .where(inArray(bookingPaymentsTable.ownerId, allOwnerIds))
    ).map(r => r.bookingId)
  );

  const legacyCashEntries = cashBookingsAll
    .filter(b => (b.paymentMethod ?? "cash") === "cash" && !b.cashDeposited);
  const legacyBookingCash = legacyCashEntries.reduce((s, b) => {
    const dep = Number(b.depositPaid ?? 0);
    // Only add balance portion for bookings without installment tracking (otherwise installmentCashSum covers it)
    const bal = (!bookingIdsWithInstallmentsPre.has(b.id) && b.balanceCollected)
      ? Math.max(0, Number(b.totalPrice ?? 0) - dep) : 0;
    return s + dep + bal;
  }, 0);

  const instCashConds: Parameters<typeof and>[0][] = [
    inArray(bookingPaymentsTable.ownerId, allOwnerIds),
    eq(bookingPaymentsTable.method, "cash"),
    eq(bookingPaymentsTable.cashDeposited, false),
    // Exclude payments linked to cancelled bookings
    isNull(ownerBookingsTable.cancelledAt),
  ];
  const installmentCashRows = await db
    .select({
      id: bookingPaymentsTable.id,
      bookingId: bookingPaymentsTable.bookingId,
      amount: bookingPaymentsTable.amount,
      paymentDate: bookingPaymentsTable.paymentDate,
      clientName: ownerBookingsTable.clientName,
    })
    .from(bookingPaymentsTable)
    .innerJoin(ownerBookingsTable, eq(bookingPaymentsTable.bookingId, ownerBookingsTable.id))
    .where(and(...instCashConds));
  const installmentCashSum = installmentCashRows.reduce((s, p) => s + Number(p.amount), 0);
  const cashOnHand = Math.round(legacyBookingCash + installmentCashSum);

  // Build breakdown list for the clickable liquidity box
  const cashBreakdown: { clientName: string; date: string; amount: number; source: string; bookingId: number; paymentId?: number }[] = [
    ...legacyCashEntries.map(b => {
      const dep = Number(b.depositPaid ?? 0);
      const bal = (!bookingIdsWithInstallmentsPre.has(b.id) && b.balanceCollected)
        ? Math.max(0, Number(b.totalPrice ?? 0) - dep) : 0;
      return { clientName: b.clientName, date: b.bookingDate, amount: dep + bal, source: "booking", bookingId: b.id };
    }).filter(x => x.amount > 0),
    ...installmentCashRows.map(p => ({
      clientName: p.clientName,
      date: p.paymentDate,
      amount: Number(p.amount),
      source: "installment",
      paymentId: p.id,
      bookingId: p.bookingId,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  /* ── Hijri monthly financial summary ───────────────────────── */
  const hYear  = req.query.hijriYear  ? Number(req.query.hijriYear)  : null;
  const hMonth = req.query.hijriMonth ? Number(req.query.hijriMonth) : null;
  if (hYear && hMonth && hMonth >= 1 && hMonth <= 12) {
    const approxGYear = Math.floor(hYear * 354.367 / 365.25 + 622);
    const gStart = `${approxGYear - 1}-01-01`;
    const gEnd   = `${approxGYear + 1}-12-31`;

    const bConds: Parameters<typeof and>[0][] = [
      inArray(ownerBookingsTable.ownerId, allOwnerIds),
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
      inArray(ownerExpensesTable.ownerId, allOwnerIds),
      gte(ownerExpensesTable.dateStr, gStart),
      lte(ownerExpensesTable.dateStr, gEnd),
    ];
    if (submissionId) eConds.push(or(eq(ownerExpensesTable.submissionId, submissionId), isNull(ownerExpensesTable.submissionId)));
    const allExpRows = await db.select().from(ownerExpensesTable).where(and(...eConds));
    const monthExpenses = allExpRows.filter(e => {
      const hym = getHijriYM(e.dateStr);
      return hym.year === hYear && hym.month === hMonth;
    });
    const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

    const hStaffRows = await db.select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary }).from(ownerStaffTable).where(inArray(ownerStaffTable.ownerId, allOwnerIds));
    const hStaffMap  = Object.fromEntries(hStaffRows.map(s => [s.id, Number(s.baseSalary)]));
    const allSlRows  = await db.select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId, month: salaryLogsTable.month })
      .from(salaryLogsTable).where(and(inArray(salaryLogsTable.ownerId, allOwnerIds), gte(salaryLogsTable.month, `${approxGYear - 1}-01`), lte(salaryLogsTable.month, `${approxGYear + 1}-12`)));
    const totalSalaries = allSlRows
      .filter(sl => { const hym = getHijriYM(`${sl.month}-15`); return hym.year === hYear && hym.month === hMonth; })
      .reduce((s, sl) => s + (hStaffMap[sl.staffId] ?? 0) + Number(sl.bonus) - Number(sl.deduction), 0);

    const categoryTotals: Record<string, number> = {};
    for (const e of monthExpenses) categoryTotals[e.category] = (categoryTotals[e.category] ?? 0) + Number(e.amount);
    if (totalSalaries > 0) categoryTotals["salaries"] = (categoryTotals["salaries"] ?? 0) + totalSalaries;

    const totalExpensesAll = Math.round(totalExpenses + totalSalaries);
    const netProfit = totalRevenue - totalExpensesAll;
    const insuranceRevenueTotals: Record<string, number> = totalInsuranceDeducted > 0 ? { insurance_damage: totalInsuranceDeducted } : {};
    const totalWithdrawals = Math.round(monthExpenses.filter(e => e.category === "withdrawal").reduce((s, e) => s + Number(e.amount), 0));

    return res.json({
      month: `${approxGYear}-${String(hMonth).padStart(2, "0")}`,
      hijriMonthLabel: `${HIJRI_MONTH_NAMES[hMonth - 1] ?? hMonth} ${toArN(hYear)} هـ`,
      totalRevenue, totalDeposits, totalPendingBalance, totalInsuranceHeld,
      totalInsuranceDeducted: Math.round(totalInsuranceDeducted),
      totalExpenses: totalExpensesAll, netProfit, categoryTotals, insuranceRevenueTotals,
      trend: [], cashOnHand, cashBreakdown, totalWithdrawals,
    });
  }

  // Revenue: fetch all active bookings for this owner, then JS-filter to the
  // selected Gregorian month using new Date() so year/month comparison is correct.
  const [fYear, fMon] = selectedMonth.split("-").map(Number);
  const monthActiveConds: Parameters<typeof and>[0][] = [
    inArray(ownerBookingsTable.ownerId, allOwnerIds),
    isNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) monthActiveConds.push(eq(ownerBookingsTable.submissionId, submissionId));

  const ownerActiveBookings = await db
    .select()
    .from(ownerBookingsTable)
    .where(and(...monthActiveConds));

  const monthBookings = ownerActiveBookings.filter(b => {
    const d = new Date(b.bookingDate);
    return d.getFullYear() === fYear && d.getMonth() === fMon - 1;
  });

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
  const expenseConditions: SQL[] = [
    inArray(ownerExpensesTable.ownerId, allOwnerIds),
    gte(ownerExpensesTable.dateStr, `${selectedMonth}-01`),
    lte(ownerExpensesTable.dateStr, `${selectedMonth}-31`),
  ];
  if (submissionId) {
    const propertyExpenseCondition = or(
      eq(ownerExpensesTable.submissionId, submissionId),
      isNull(ownerExpensesTable.submissionId),
    );
    if (propertyExpenseCondition) expenseConditions.push(propertyExpenseCondition);
  }

  const monthExpenses = await db
    .select()
    .from(ownerExpensesTable)
    .where(and(...expenseConditions));

  const totalExpenses = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Salary expenses for this month (not linked to submission)
  const salaryLogs = await db
    .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
    .from(salaryLogsTable)
    .where(and(inArray(salaryLogsTable.ownerId, allOwnerIds), eq(salaryLogsTable.month, selectedMonth)));

  const staffRows = await db
    .select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary })
    .from(ownerStaffTable)
    .where(inArray(ownerStaffTable.ownerId, allOwnerIds));

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
  const totalWithdrawals = Math.round(monthExpenses.filter(e => e.category === "withdrawal").reduce((s, e) => s + Number(e.amount), 0));
  // Insurance revenue category (deductions from insurance → تلفيات)
  const insuranceRevenueTotals: Record<string, number> = {};
  if (totalInsuranceDeducted > 0) {
    insuranceRevenueTotals["insurance_damage"] = totalInsuranceDeducted;
  }

  // Monthly trend for chart (last 6 months) — cancelled bookings EXCLUDED
  const trend = await Promise.all(months.map(async (m) => {
    const bConds = [
      inArray(ownerBookingsTable.ownerId, allOwnerIds),
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
      inArray(ownerExpensesTable.ownerId, allOwnerIds),
      gte(ownerExpensesTable.dateStr, `${m}-01`),
      lte(ownerExpensesTable.dateStr, `${m}-31`),
    ];
    if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
    const eRows = await db.select({ amt: ownerExpensesTable.amount }).from(ownerExpensesTable).where(and(...eConds));
    const exp = eRows.reduce((s, r) => s + Number(r.amt), 0);

    const slRows = await db
      .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
      .from(salaryLogsTable)
      .where(and(inArray(salaryLogsTable.ownerId, allOwnerIds), eq(salaryLogsTable.month, m)));
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
      inArray(ownerBookingsTable.ownerId, allOwnerIds),
      gte(ownerBookingsTable.cancelledAt, new Date(`${selectedMonth}-01T00:00:00Z`)),
      lte(ownerBookingsTable.cancelledAt, new Date(`${selectedMonth}-31T23:59:59Z`)),
    ));
  const totalCancellationIncome = Math.round(cancelledThisMonth.reduce((s, b) => s + Number(b.cancelIncome ?? 0), 0));
  const totalRefundedToClients  = Math.round(cancelledThisMonth.reduce((s, b) => s + Number(b.cancelRefundAmount ?? 0), 0));

  // ── ALL-TIME three-layer liquidity model ──────────────────────
  // Fetch ALL active bookings for this owner (optionally scoped to a submission)
  const allActiveConds: Parameters<typeof and>[0][] = [
    inArray(ownerBookingsTable.ownerId, allOwnerIds),
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
    inArray(ownerBookingsTable.ownerId, allOwnerIds),
    isNotNull(ownerBookingsTable.cancelledAt),
  ];
  if (submissionId) allCancelledConds.push(eq(ownerBookingsTable.submissionId, submissionId));
  const allCancelledRows = await db
    .select({ cancelIncome: ownerBookingsTable.cancelIncome })
    .from(ownerBookingsTable)
    .where(and(...allCancelledConds));
  const allTimeCancelIncome = Math.round(allCancelledRows.reduce((s, b) => s + Number(b.cancelIncome ?? 0), 0));

  // All refunds issued by owner
  const allRefundsConds: Parameters<typeof and>[0][] = [inArray(ownerRefundsTable.ownerId, allOwnerIds)];
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
    cashOnHand,
    cashBreakdown,
    totalWithdrawals,
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

/* ── GET /owner/booking-payments ────────────────────────────── */
router.get("/booking-payments", async (req, res) => {
  const ownerId = req.user!.id;
  const payments = await db
    .select()
    .from(bookingPaymentsTable)
    .where(eq(bookingPaymentsTable.ownerId, ownerId))
    .orderBy(bookingPaymentsTable.paymentDate);
  return res.json(payments);
});

/* ── POST /owner/bookings/:id/payments ──────────────────────── */
router.post("/bookings/:id/payments", async (req, res) => {
  const ownerId = req.user!.id;
  const bookingId = Number(req.params.id);
  if (isNaN(bookingId)) return res.status(400).json({ error: "invalid" });
  const schema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(["cash", "transfer", "pos"]),
    cashDeposited: z.boolean(),
    receiptUrl: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid data", details: parsed.error.errors });
  const [booking] = await db.select().from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.id, bookingId), eq(ownerBookingsTable.ownerId, ownerId)));
  if (!booking) return res.status(404).json({ error: "not found" });
  const { amount, paymentDate, method, cashDeposited, receiptUrl } = parsed.data;
  const isDeposited = method === "transfer" ? true : cashDeposited;
  await db.insert(bookingPaymentsTable).values({
    bookingId, ownerId, amount: String(amount), paymentDate, method,
    cashDeposited: isDeposited, receiptUrl: receiptUrl ?? null,
  });
  const allPmts = await db.select({ amount: bookingPaymentsTable.amount })
    .from(bookingPaymentsTable).where(eq(bookingPaymentsTable.bookingId, bookingId));
  const totalPaid = allPmts.reduce((s, p) => s + Number(p.amount), 0);
  const dep = Number(booking.depositPaid ?? 0);
  const total = Number(booking.totalPrice ?? 0);
  const remaining = Math.max(0, total - dep);
  const isFullyPaid = remaining > 0 && totalPaid >= remaining;
  await db.update(ownerBookingsTable).set({ balanceCollected: isFullyPaid })
    .where(eq(ownerBookingsTable.id, bookingId));
  return res.json({ ok: true, fullyPaid: isFullyPaid, totalPaid, remaining });
});

/* ── DELETE /owner/bookings/:id/payments/:paymentId ──────────── */
router.delete("/bookings/:id/payments/:paymentId", async (req, res) => {
  const ownerId = req.user!.id;
  const bookingId = Number(req.params.id);
  const paymentId = Number(req.params.paymentId);
  await db.delete(bookingPaymentsTable).where(
    and(eq(bookingPaymentsTable.id, paymentId), eq(bookingPaymentsTable.ownerId, ownerId),
      eq(bookingPaymentsTable.bookingId, bookingId))
  );
  const [booking] = await db.select().from(ownerBookingsTable).where(eq(ownerBookingsTable.id, bookingId));
  if (booking) {
    const allPmts = await db.select({ amount: bookingPaymentsTable.amount })
      .from(bookingPaymentsTable).where(eq(bookingPaymentsTable.bookingId, bookingId));
    const totalPaid = allPmts.reduce((s, p) => s + Number(p.amount), 0);
    const dep = Number(booking.depositPaid ?? 0);
    const total = Number(booking.totalPrice ?? 0);
    const remaining = Math.max(0, total - dep);
    await db.update(ownerBookingsTable).set({ balanceCollected: remaining > 0 && totalPaid >= remaining })
      .where(eq(ownerBookingsTable.id, bookingId));
  }
  return res.json({ ok: true });
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
  const ownerIds = await getOwnerIds(req);
  const hasHijriPeriod = req.query.hijriYear !== undefined || req.query.hijriMonth !== undefined;
  const hijriYear = Number(req.query.hijriYear);
  const hijriMonth = Number(req.query.hijriMonth);
  if (hasHijriPeriod && (!/^\d{4}$/.test(String(req.query.hijriYear)) || !Number.isInteger(hijriYear) || hijriYear < 1300 || hijriYear > 1600
    || !/^\d{1,2}$/.test(String(req.query.hijriMonth)) || !Number.isInteger(hijriMonth) || hijriMonth < 1 || hijriMonth > 12
    || req.query.month !== undefined))
    return res.status(400).json({ error: "اختر سنة وشهرًا هجريين صحيحين دون خلط التقويمين" });
  if (!hasHijriPeriod && req.query.month !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.month)))
    return res.status(400).json({ error: "الشهر الميلادي غير صالح" });
  const selectedMonth = (typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month))
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  const approximateYear = Math.floor(hijriYear * 354.367 / 365.25 + 622);
  const fromDate = hasHijriPeriod ? `${approximateYear - 1}-01-01` : `${selectedMonth}-01`;
  const toDate = hasHijriPeriod ? `${approximateYear + 1}-12-31` : `${selectedMonth}-31`;

  // Get all approved providers for this owner
  const providers = await db
    .select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(inArray(serviceProvidersTable.ownerId, ownerIds));

  if (providers.length === 0) return res.json({ totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, totalPending: 0, byProvider: [] });

  const providerIds = providers.map(p => p.id);

  const appts = await db
    .select({
      providerId: serviceAppointmentsTable.providerId,
      amount: serviceAppointmentsTable.amount,
      deposit: serviceAppointmentsTable.deposit,
      insuranceAmount: serviceAppointmentsTable.insuranceAmount,
      status: serviceAppointmentsTable.status,
      dateStr: serviceAppointmentsTable.dateStr,
    })
    .from(serviceAppointmentsTable)
    .where(
      and(
        inArray(serviceAppointmentsTable.providerId, providerIds),
        gte(serviceAppointmentsTable.dateStr, fromDate),
        lte(serviceAppointmentsTable.dateStr, toDate),
        ne(serviceAppointmentsTable.status, "cancelled"),
      )
    );

  const byProvider: Record<number, { name: string; revenue: number; deposits: number; insurance: number; pending: number }> = {};
  for (const p of providers) byProvider[p.id] = { name: p.businessName ?? `خدمة #${p.id}`, revenue: 0, deposits: 0, insurance: 0, pending: 0 };

  for (const a of appts) {
    if (hasHijriPeriod) {
      const date = getHijriYM(a.dateStr);
      if (date.year !== hijriYear || date.month !== hijriMonth) continue;
    }
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
  const requestedProviderId = req.query.providerId ? Number(req.query.providerId) : null;
  if (req.query.providerId && (!Number.isInteger(requestedProviderId) || Number(requestedProviderId) <= 0)) {
    return res.status(400).json({ error: "معرّف الخدمة غير صحيح" });
  }
  const providers = await db
    .select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(requestedProviderId
      ? and(
          eq(serviceProvidersTable.ownerId, ownerId),
          eq(serviceProvidersTable.id, requestedProviderId),
        )
      : eq(serviceProvidersTable.ownerId, ownerId));

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

async function verifyOwnerServiceProvider(ownerId: string, providerId: number) {
  const [provider] = await db.select({ id: serviceProvidersTable.id, businessName: serviceProvidersTable.businessName })
    .from(serviceProvidersTable)
    .where(and(eq(serviceProvidersTable.id, providerId), eq(serviceProvidersTable.ownerId, ownerId)))
    .limit(1);
  return provider ?? null;
}

router.get("/crm/profile", sendCrmProfile);
router.get("/crm/customers", sendCrmCustomers);
router.get("/crm/history", sendCrmHistory);

router.get("/service-clients/:phone", async (req, res) => {
  const ownerId = req.user!.id;
  const providerId = Number(req.query.providerId);
  const phone = req.params.phone;
  if (!Number.isInteger(providerId)) return res.status(400).json({ error: "معرّف الخدمة مطلوب" });
  const provider = await verifyOwnerServiceProvider(ownerId, providerId);
  if (!provider) return res.status(404).json({ error: "الخدمة غير موجودة" });

  const rows = await db.select().from(serviceAppointmentsTable)
    .where(and(
      eq(serviceAppointmentsTable.ownerId, ownerId),
      eq(serviceAppointmentsTable.providerId, providerId),
      eq(serviceAppointmentsTable.clientPhone, phone),
    ))
    .orderBy(desc(serviceAppointmentsTable.dateStr));
  if (rows.length === 0) return res.status(404).json({ error: "العميل غير موجود" });

  const [noteRow] = await db.select({ notes: customerNotesTable.notes }).from(customerNotesTable)
    .where(and(eq(customerNotesTable.ownerId, ownerId), eq(customerNotesTable.clientPhone, phone)))
    .limit(1);
  return res.json({
    clientName: rows[0].clientName,
    clientPhone: phone,
    clientIdNumber: null,
    totalBookings: rows.length,
    totalRevenue: rows.reduce((sum, row) => sum + (row.status === "cancelled" ? 0 : Number(row.amount ?? 0)), 0),
    lastBookingDate: rows[0].dateStr,
    bookings: rows.map((row) => ({
      id: row.id,
      booking_date: row.dateStr,
      duration_days: null,
      period: row.duration,
      total_price: String(row.amount ?? "0"),
      submission_id: null,
      cancelled_at: row.cancelledAt,
      chalet_name: provider.businessName,
      contract_signed: false,
      contract_signer_id: null,
      insurance_fee: row.insuranceAmount ? String(row.insuranceAmount) : null,
      insurance_received: row.insuranceAmount ? true : null,
      insurance_refunded: row.insuranceStatus === "refunded",
      original_date: null,
      rescheduled_at: null,
    })),
    note: noteRow?.notes ?? "",
  });
});

router.put("/service-clients/:phone/note", async (req, res) => {
  const ownerId = req.user!.id;
  const providerId = Number(req.query.providerId);
  if (!Number.isInteger(providerId) || !await verifyOwnerServiceProvider(ownerId, providerId)) {
    return res.status(404).json({ error: "الخدمة غير موجودة" });
  }
  const phone = req.params.phone;
  const notes = String(req.body?.notes ?? "");
  await db.execute(sql`
    INSERT INTO customer_notes (owner_id, client_phone, notes, updated_at)
    VALUES (${ownerId}, ${phone}, ${notes}, now())
    ON CONFLICT (owner_id, client_phone) DO UPDATE SET notes = ${notes}, updated_at = now()
  `);
  return res.json({ ok: true });
});

router.put("/service-clients/:phone", async (req, res) => {
  const ownerId = req.user!.id;
  const providerId = Number(req.query.providerId);
  if (!Number.isInteger(providerId) || !await verifyOwnerServiceProvider(ownerId, providerId)) {
    return res.status(404).json({ error: "الخدمة غير موجودة" });
  }
  const oldPhone = req.params.phone;
  const newName = req.body?.name ? String(req.body.name).trim() : null;
  const newPhone = req.body?.phone ? String(req.body.phone).trim() : null;
  if (!newName && !newPhone) return res.status(400).json({ error: "يرجى تقديم اسم أو رقم جوال جديد" });
  const setValues: Record<string, string> = {};
  if (newName) setValues.clientName = newName;
  if (newPhone) setValues.clientPhone = newPhone;
  await db.update(serviceAppointmentsTable).set(setValues).where(and(
    eq(serviceAppointmentsTable.ownerId, ownerId),
    eq(serviceAppointmentsTable.providerId, providerId),
    eq(serviceAppointmentsTable.clientPhone, oldPhone),
  ));
  if (newPhone && newPhone !== oldPhone) {
    const [remainingService] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceAppointmentsTable)
      .where(and(eq(serviceAppointmentsTable.ownerId, ownerId), eq(serviceAppointmentsTable.clientPhone, oldPhone)));
    const [remainingChalet] = await db.select({ count: sql<number>`count(*)::int` }).from(ownerBookingsTable)
      .where(and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, oldPhone)));
    if ((remainingService?.count ?? 0) === 0 && (remainingChalet?.count ?? 0) === 0) {
      await db.update(customerNotesTable).set({ clientPhone: newPhone }).where(and(
        eq(customerNotesTable.ownerId, ownerId),
        eq(customerNotesTable.clientPhone, oldPhone),
      ));
    }
  }
  return res.json({ ok: true, newPhone: newPhone ?? oldPhone });
});

router.delete("/service-clients/:phone", async (req, res) => {
  const ownerId = req.user!.id;
  const providerId = Number(req.query.providerId);
  if (!Number.isInteger(providerId) || !await verifyOwnerServiceProvider(ownerId, providerId)) {
    return res.status(404).json({ error: "الخدمة غير موجودة" });
  }
  await db.delete(serviceAppointmentsTable).where(and(
    eq(serviceAppointmentsTable.ownerId, ownerId),
    eq(serviceAppointmentsTable.providerId, providerId),
    eq(serviceAppointmentsTable.clientPhone, req.params.phone),
  ));
  const [remainingService] = await db.select({ count: sql<number>`count(*)::int` }).from(serviceAppointmentsTable)
    .where(and(eq(serviceAppointmentsTable.ownerId, ownerId), eq(serviceAppointmentsTable.clientPhone, req.params.phone)));
  const [remainingChalet] = await db.select({ count: sql<number>`count(*)::int` }).from(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.ownerId, ownerId), eq(ownerBookingsTable.clientPhone, req.params.phone)));
  if ((remainingService?.count ?? 0) === 0 && (remainingChalet?.count ?? 0) === 0) {
    await db.delete(customerNotesTable).where(and(
      eq(customerNotesTable.ownerId, ownerId),
      eq(customerNotesTable.clientPhone, req.params.phone),
    ));
  }
  return res.json({ ok: true });
});

/* ── Report Years (years that have actual data) ─────────────── */
router.get("/report-years", async (req, res) => {
  try {
    const allOwnerIds = await getOwnerIds(req);
    const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
    const providerId = req.query.providerId ? Number(req.query.providerId) : undefined;
    const activity = req.query.activity ?? "properties";
    if (typeof activity !== "string" || !["properties", "services", "unified"].includes(activity)
      || (req.query.submissionId !== undefined && (!Number.isSafeInteger(submissionId) || submissionId! <= 0))
      || (req.query.providerId !== undefined && (!Number.isSafeInteger(providerId) || providerId! <= 0))) {
      return res.status(400).json({ error: "اختر نشاطًا ومعرّفات صحيحة" });
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const allDates: string[] = [];
    if (activity !== "services") {
    const bConds: any[] = [inArray(ownerBookingsTable.ownerId, allOwnerIds)];
    if (submissionId) bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
    const bookingRows = await db
      .select({ d: ownerBookingsTable.bookingDate, cancelledAt: ownerBookingsTable.cancelledAt,
        totalPrice: ownerBookingsTable.totalPrice, revenueAmount: ownerBookingsTable.revenueAmount,
        depositPaid: ownerBookingsTable.depositPaid, insuranceFee: ownerBookingsTable.insuranceFee })
      .from(ownerBookingsTable)
      .where(and(...bConds));

    const eConds: any[] = [inArray(ownerExpensesTable.ownerId, allOwnerIds)];
    if (submissionId) eConds.push(or(eq(ownerExpensesTable.submissionId, submissionId), isNull(ownerExpensesTable.submissionId)));
    const expenseRows = await db
      .select({ d: ownerExpensesTable.dateStr, amount: ownerExpensesTable.amount })
      .from(ownerExpensesTable)
      .where(and(...eConds));
    allDates.push(...bookingRows.filter(row => !row.cancelledAt && [row.totalPrice, row.revenueAmount, row.depositPaid, row.insuranceFee].some(value => Number(value) > 0)).map(row => row.d),
      ...expenseRows.filter(row => Number(row.amount) > 0).map(row => row.d));
    }
    if (activity !== "properties") {
      const providers = await db.select({ id: serviceProvidersTable.id }).from(serviceProvidersTable)
        .where(and(inArray(serviceProvidersTable.ownerId, allOwnerIds), providerId ? eq(serviceProvidersTable.id, providerId) : undefined));
      if (providers.length) {
        const appointments = await db.select({ d: serviceAppointmentsTable.dateStr, amount: serviceAppointmentsTable.amount,
          deposit: serviceAppointmentsTable.deposit, insurance: serviceAppointmentsTable.insuranceAmount })
          .from(serviceAppointmentsTable).where(and(inArray(serviceAppointmentsTable.providerId, providers.map(provider => provider.id)),
            ne(serviceAppointmentsTable.status, "cancelled")));
        allDates.push(...appointments.filter(row => [row.amount, row.deposit, row.insurance].some(value => Number(value) > 0)).map(row => row.d));
      }
    }
    const gregMonths = new Set<string>();
    const hijriMonths = new Set<string>();
    for (const d of allDates) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) continue;
      gregMonths.add(d.slice(0, 7));
      const hym = getHijriYM(d);
      if (hym.year) hijriMonths.add(`${hym.year}-${String(hym.month).padStart(2, "0")}`);
    }
    const gregorianMonths = [...gregMonths].sort().reverse();
    const hijriMonthKeys = [...hijriMonths].sort().reverse();
    return res.json({
      gregorianYears: [...new Set(gregorianMonths.map(key => Number(key.slice(0, 4))))],
      hijriYears: [...new Set(hijriMonthKeys.map(key => Number(key.slice(0, 4))))],
      gregorianMonths, hijriMonths: hijriMonthKeys,
    });
  } catch (err) {
    console.error("[report-years] error:", err);
    return res.status(500).json({ error: "تعذّر تحميل الفترات المالية" });
  }
});

/* ── Yearly Summary ─────────────────────────────────────────── */

router.get("/yearly-summary", async (req, res) => {
  const allOwnerIds = await getOwnerIds(req);
  const ownerId = allOwnerIds[0];
  const year = (typeof req.query.year === "string" && /^\d{4}$/.test(req.query.year))
    ? req.query.year
    : new Date().getFullYear().toString();
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  const staffRows = await db
    .select({ id: ownerStaffTable.id, baseSalary: ownerStaffTable.baseSalary })
    .from(ownerStaffTable)
    .where(inArray(ownerStaffTable.ownerId, allOwnerIds));
  const staffMap = Object.fromEntries(staffRows.map((s) => [s.id, Number(s.baseSalary)]));

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const monthly = await Promise.all(months.map(async (m) => {
    const bConds: any[] = [
      inArray(ownerBookingsTable.ownerId, allOwnerIds),
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
      inArray(ownerExpensesTable.ownerId, allOwnerIds),
      gte(ownerExpensesTable.dateStr, `${m}-01`),
      lte(ownerExpensesTable.dateStr, `${m}-31`),
    ];
    if (submissionId) eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
    const eRows = await db.select({ amt: ownerExpensesTable.amount }).from(ownerExpensesTable).where(and(...eConds));
    const exp = eRows.reduce((s, r) => s + Number(r.amt), 0);

    const slRows = await db
      .select({ bonus: salaryLogsTable.bonus, deduction: salaryLogsTable.deduction, staffId: salaryLogsTable.staffId })
      .from(salaryLogsTable)
      .where(and(inArray(salaryLogsTable.ownerId, allOwnerIds), eq(salaryLogsTable.month, m)));
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

/* ── POST /owner/reports/send-email ── send report as real email with PDF attachment */
router.post("/reports/send-email", async (req, res) => {
  const { to, chaletName, monthLabel, pdfUrl, viewMode, report, financial, year, yearlyTotals } = req.body;
  if (!to || !pdfUrl || !chaletName) return res.status(400).json({ error: "Missing required fields: to, pdfUrl, chaletName" });

  const result = await sendReportEmail({ to, chaletName, monthLabel: monthLabel ?? "", pdfUrl, viewMode: viewMode ?? "monthly", report: report ?? null, financial: financial ?? null, year: year ?? undefined, yearlyTotals: yearlyTotals ?? null });
  if (!result.ok) return res.status(503).json({ error: result.error ?? "فشل إرسال البريد." });
  return res.json({ ok: true, previewUrl: result.previewUrl, isTest: result.isTest });
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
  const ownerIds = await getOwnerIds(req);

  const query = z.object({ history: z.enum(["true", "false"]).optional() }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "نطاق الإشعارات غير صالح" });

  const notificationsQuery = db
    .select({
      ...getTableColumns(ownerNotificationsTable),
      clientName: ownerBookingsTable.clientName,
      submissionId: ownerBookingsTable.submissionId,
      propertyName: sql<string | null>`coalesce(${chaletSubmissionsTable.nameAr}, ${chaletsTable.nameAr})`,
    })
    .from(ownerNotificationsTable)
    .leftJoin(ownerBookingsTable, and(
      eq(ownerBookingsTable.id, ownerNotificationsTable.bookingId),
      inArray(ownerBookingsTable.ownerId, ownerIds),
    ))
    .leftJoin(chaletSubmissionsTable, eq(chaletSubmissionsTable.id, ownerBookingsTable.submissionId))
    .leftJoin(chaletsTable, eq(chaletsTable.id, ownerNotificationsTable.chaletId))
    .where(inArray(ownerNotificationsTable.ownerId, ownerIds))
    .orderBy(desc(ownerNotificationsTable.createdAt), desc(ownerNotificationsTable.id));
  // The searchable tab needs the complete history; live alert polling keeps its
  // existing latest-50 behavior so its notification-diff logic stays unchanged.
  const rows = await (query.data.history === "true" ? notificationsQuery : notificationsQuery.limit(50));

  return res.json(rows);
});

/* ── PATCH /owner/notifications/read-all ───────────────────────
   Owner: mark all notifications as read */
router.patch("/notifications/read-all", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });
  const ownerIds = await getOwnerIds(req);
  const scope = z.object({
    chaletId: z.number().int().positive().optional(),
    submissionId: z.number().int().positive().optional(),
    providerId: z.number().int().positive().optional(),
  }).refine(value => !value.providerId || (!value.chaletId && !value.submissionId))
    .safeParse(req.body ?? {});
  if (!scope.success) return res.status(400).json({ error: "نطاق الإشعارات غير صالح" });
  // This register currently contains property/account notices, not independent
  // service appointments. A service scope must never mark property notices read.
  if (scope.data.providerId) return res.json({ ok: true });
  const scopeConditions: SQL[] = [];
  if (scope.data.chaletId) scopeConditions.push(eq(ownerNotificationsTable.chaletId, scope.data.chaletId));
  if (scope.data.submissionId) scopeConditions.push(inArray(ownerNotificationsTable.bookingId,
    db.select({ id: ownerBookingsTable.id }).from(ownerBookingsTable).where(and(
      inArray(ownerBookingsTable.ownerId, ownerIds),
      eq(ownerBookingsTable.submissionId, scope.data.submissionId),
    ))));

  await db
    .update(ownerNotificationsTable)
    .set({ isRead: true })
    .where(and(inArray(ownerNotificationsTable.ownerId, ownerIds), eq(ownerNotificationsTable.isRead, false),
      scopeConditions.length ? or(...scopeConditions) : undefined));

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

  const body = z.object({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation" });

  const chaletIds = await getOwnerChaletIds(ownerId);
  if (chaletIds.length === 0) return res.status(403).json({ error: "forbidden" });

  const [review] = await db
    .select({ id: reviewsTable.id, chaletId: reviewsTable.chaletId })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.id, reviewId), inArray(reviewsTable.chaletId, chaletIds)))
    .limit(1);

  if (!review) return res.status(404).json({ error: "not found or forbidden" });

  const [reported] = await db
    .update(reviewsTable)
    .set({
      reportedBy: ownerId,
      reportedAt: new Date(),
      reportReason: body.data.reason,
    })
    .where(and(eq(reviewsTable.id, reviewId), sql`${reviewsTable.reportedAt} IS NULL`))
    .returning({ id: reviewsTable.id });
  if (!reported) return res.status(409).json({ error: "يوجد اعتراض قيد المراجعة بالفعل" });

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
      insuranceReceived: ownerBookingsTable.insuranceReceived,
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

  const propertyIds = [...new Set(bookings.flatMap(booking => booking.submissionId ? [booking.submissionId] : []))];
  const [liveProperties, submittedProperties] = propertyIds.length ? await Promise.all([
    db.select().from(chaletsTable).where(inArray(chaletsTable.submissionId, propertyIds)),
    db.select().from(chaletSubmissionsTable).where(inArray(chaletSubmissionsTable.id, propertyIds)),
  ]) : [[], []];
  const liveById = new Map(liveProperties.map(property => [property.submissionId, property]));
  const submittedById = new Map(submittedProperties.map(property => [property.id, property]));
  return res.json(bookings.map(booking => {
    const times = booking.submissionId ? liveById.get(booking.submissionId) ?? submittedById.get(booking.submissionId) : undefined;
    const checkoutAt = bookingCheckoutAt(booking, times);
    return { ...booking, checkoutAt: Number.isFinite(checkoutAt) ? new Date(checkoutAt).toISOString() : null };
  }));
});

/* ── GET /owner/submissions/:id — fetch one submission (owner only) ── */
router.get("/submissions/:id", requireAuth, async (req, res) => {
  const submissionId = Number(req.params.id);
  if (isNaN(submissionId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const [sub] = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, submissionId));

  const ownerIds = await getOwnerIds(req);
  if (!sub || !ownerIds.includes(sub.ownerId ?? "")) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  return res.json(sub);
});

/* ── PATCH /owner/submissions/:id — owner edits all chalet data ── */
router.patch("/submissions/:id", requireAuth, async (req, res) => {
  const submissionId = Number(req.params.id);
  if (isNaN(submissionId)) return res.status(400).json({ error: "معرّف غير صالح" });

  const [sub] = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.id, submissionId));

  const ownerIds = await getOwnerIds(req);
  if (!sub || !ownerIds.includes(sub.ownerId ?? "")) {
    return res.status(403).json({ error: "غير مصرح" });
  }

  const body = req.body as Record<string, any>;
  if (sub.status === "rejected") {
    return res.status(409).json({ error: "هذا الطلب مرفوض ومغلق نهائياً. يمكنك إضافة عقار جديد من لوحة التحكم." });
  }
  if (body.whatsappNumber !== undefined && !/^[0-9٠-٩۰-۹]+$/.test(String(body.whatsappNumber))) {
    return res.status(400).json({ error: "رقم الواتساب يقبل الأرقام فقط" });
  }
  if (body.socialLink != null && typeof body.socialLink !== "string") {
    return res.status(400).json({ error: "أدخل رابط حساب أو معرف صحيح." });
  }
  if (body.socialLink?.trim()) {
    if (!socialAccountIdentity(body.socialLink)) return res.status(400).json({ error: "أدخل رابط حساب Instagram / Snapchat أو معرف حساب صحيح." });
    if (await hasPropertySocialConflict(body.socialLink, submissionId)) {
      return res.status(409).json({ error: "حساب التواصل هذا مرتبط بعقار آخر مسجل مسبقاً." });
    }
  }
  const requiredMediaAndTerms = z.object({
    photos: z.array(z.string().trim().min(1).refine(value => value !== "error"))
      .min(1, "أضف صورة رئيسية واحدة على الأقل").max(15).optional(),
    termsAndConditions: z.string().trim().min(1, "الشروط والأحكام الخاصة مطلوبة").nullable().optional(),
  }).safeParse(body);
  if (!requiredMediaAndTerms.success) {
    return res.status(400).json({ error: "تحقق من الصورة الرئيسية والشروط الخاصة", details: requiredMediaAndTerms.error.flatten().fieldErrors });
  }
  const updateData: Record<string, any> = {};
  const isResubmission = sub.status === "needs_revision";
  if (isResubmission) {
    const identity = await checkPropertyIdentity({
      nameAr: String(body.nameAr ?? sub.nameAr),
      location: String(body.location ?? sub.location),
      district: String(body.district ?? sub.district ?? ""),
      whatsappNumber: String(body.whatsappNumber ?? sub.whatsappNumber),
    }, submissionId);
    const fields = [
      ...(identity?.nameConflict ? ["الاسم والمدينة والحي"] : []),
      ...(identity?.whatsappConflict ? ["رقم الواتساب"] : []),
    ];
    if (fields.length) return res.status(409).json({
      error: `البيانات التالية مرتبطة بعقار آخر: ${fields.join("، ")}`,
      fields,
    });
  }

  const str = (v: any) => (v !== undefined && v !== null ? String(v).trim() : undefined);
  const num = (v: any) => (v !== undefined && v !== null && v !== "" ? String(Number(v)) : null);

  if (body.nameAr !== undefined) updateData.nameAr = String(body.nameAr).trim();
  if (body.descriptionAr !== undefined) updateData.descriptionAr = String(body.descriptionAr).trim();
  if (body.whatsappNumber !== undefined) updateData.whatsappNumber = normalizeCustomerPhone(String(body.whatsappNumber));
  if (body.region !== undefined) updateData.region = String(body.region).trim();
  if (body.pricePerNight !== undefined) updateData.pricePerNight = num(body.pricePerNight);
  if (body.seasonalDisclaimer !== undefined) updateData.seasonalDisclaimer = !!body.seasonalDisclaimer;
  if (body.suggestedCityName !== undefined) updateData.suggestedCityName = body.suggestedCityName || null;
  if (body.location !== undefined) updateData.location = String(body.location).trim();
  if (body.district !== undefined) updateData.district = body.district || null;
  if (body.mapsUrl !== undefined) { updateData.mapsUrl = body.mapsUrl || null; updateData.websiteUrl = body.mapsUrl || null; }
  if (body.socialLink !== undefined) updateData.socialLink = body.socialLink || null;
  if (body.propertyType !== undefined) {
    const suggested = body.propertyType === "__other__";
    updateData.propertyType = suggested ? null : body.propertyType || null;
    updateData.suggestedCategoryName = suggested ? body.suggestedCategoryName || null : null;
    updateData.pendingCategoryApproval = suggested && !!body.suggestedCategoryName;
  }
  if (body.sections !== undefined) updateData.sections = body.sections || null;
  if (body.termsAndConditions !== undefined) updateData.termsAndConditions = body.termsAndConditions || null;
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl || null;
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

  /* ── Some fields live in chaletsTable, not chaletSubmissionsTable ── */
  const hasReminder = body.reminderEnabled !== undefined || body.reminderDays !== undefined;
  const hasTimesInBody =
    body.morningCheckIn !== undefined || body.morningCheckOut !== undefined ||
    body.eveningCheckIn !== undefined || body.eveningCheckOut !== undefined ||
    body.fullDayCheckIn !== undefined || body.fullDayCheckOut !== undefined;

  if (Object.keys(updateData).length > 0) {
    if (isResubmission) {
      const result = await db.transaction(async (tx) => {
        const access = await ownerPlanAccess(req.user!.id);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(731205, hashtext(${access.subscription.ownerId}))`);
        const [current] = await tx.select({ status: chaletSubmissionsTable.status })
          .from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, submissionId)).for("update");
        if (current?.status !== "needs_revision") return "changed";
        // Revision requests already reserve quota. Return the same record to review.
        await tx.update(chaletSubmissionsTable).set({ ...updateData, status: "pending" })
          .where(eq(chaletSubmissionsTable.id, submissionId));
        return "ok";
      });
      if (result === "changed") return res.status(409).json({ error: "تغيرت حالة الطلب. يرجى تحديث الصفحة." });
    } else {
      const saved = await db.update(chaletSubmissionsTable).set(updateData)
        .where(and(eq(chaletSubmissionsTable.id, submissionId), eq(chaletSubmissionsTable.status, sub.status)))
        .returning({ id: chaletSubmissionsTable.id });
      if (!saved.length) return res.status(409).json({ error: "تغيرت حالة الطلب. يرجى تحديث الصفحة." });
    }
  }

  if (hasReminder) {
    const reminderPatch: { reminderEnabled?: boolean; reminderDays?: number } = {};
    if (body.reminderEnabled !== undefined) reminderPatch.reminderEnabled = !!body.reminderEnabled;
    if (body.reminderDays !== undefined) reminderPatch.reminderDays = Math.max(1, Math.min(7, Number(body.reminderDays) || 1));
    await db.update(chaletsTable).set(reminderPatch).where(eq(chaletsTable.submissionId, submissionId));
  }

  /* ── Mirror time fields to chaletsTable so the live calendar stays in sync ── */
  if (hasTimesInBody) {
    const timesPatch: Record<string, string | null> = {};
    if (body.morningCheckIn !== undefined) timesPatch.morningCheckIn = body.morningCheckIn || null;
    if (body.morningCheckOut !== undefined) timesPatch.morningCheckOut = body.morningCheckOut || null;
    if (body.eveningCheckIn !== undefined) timesPatch.eveningCheckIn = body.eveningCheckIn || null;
    if (body.eveningCheckOut !== undefined) timesPatch.eveningCheckOut = body.eveningCheckOut || null;
    if (body.fullDayCheckIn !== undefined) timesPatch.fullDayCheckIn = body.fullDayCheckIn || null;
    if (body.fullDayCheckOut !== undefined) timesPatch.fullDayCheckOut = body.fullDayCheckOut || null;
    await db.update(chaletsTable).set(timesPatch).where(eq(chaletsTable.submissionId, submissionId));
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
      totalPrice:        ownerBookingsTable.totalPrice,
      submissionId:      ownerBookingsTable.submissionId,
      cancelledAt:       ownerBookingsTable.cancelledAt,
      chaletName:        chaletSubmissionsTable.nameAr,
      contractSigned:    ownerBookingsTable.contractSigned,
      contractSignerId:  ownerBookingsTable.contractSignerId,
      insuranceFee:      ownerBookingsTable.insuranceFee,
      insuranceReceived: ownerBookingsTable.insuranceReceived,
      insuranceRefunded: ownerBookingsTable.insuranceRefunded,
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

  /* ── Fetch reschedule logs for these bookings ── */
  const bookingIds = bookingRows.map(b => b.id);
  const rescheduleLogMap = new Map<number, { oldDate: string; rescheduledAt: string }>();
  if (bookingIds.length > 0) {
    const logs = await db
      .select({
        bookingId:    ownerRescheduleLogsTable.bookingId,
        oldDate:      ownerRescheduleLogsTable.oldDate,
        rescheduledAt: ownerRescheduleLogsTable.rescheduledAt,
      })
      .from(ownerRescheduleLogsTable)
      .where(inArray(ownerRescheduleLogsTable.bookingId, bookingIds))
      .orderBy(desc(ownerRescheduleLogsTable.rescheduledAt));
    for (const log of logs) {
      if (!rescheduleLogMap.has(log.bookingId)) {
        rescheduleLogMap.set(log.bookingId, { oldDate: log.oldDate, rescheduledAt: String(log.rescheduledAt) });
      }
    }
  }

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

  /* Derive national ID from the most recent signed booking */
  const clientIdNumber = bookingRows.find(b => b.contractSignerId)?.contractSignerId ?? null;

  return res.json({
    clientName:      clientName,
    clientPhone:     phone,
    clientIdNumber:  clientIdNumber,
    totalBookings:   totalBookings,
    totalRevenue:    totalRevenue,
    lastBookingDate: lastBookingDate,
    bookings: bookingRows.map((b) => ({
      id:                 b.id,
      booking_date:       b.bookingDate,
      duration_days:      b.durationDays,
      period:             b.period,
      total_price:        String(b.totalPrice ?? "0"),
      submission_id:      b.submissionId,
      cancelled_at:       b.cancelledAt,
      chalet_name:        b.chaletName ?? null,
      contract_signed:    b.contractSigned ?? false,
      contract_signer_id: b.contractSignerId ?? null,
      insurance_fee:      b.insuranceFee ? String(b.insuranceFee) : null,
      insurance_received: b.insuranceReceived ?? null,
      insurance_refunded: b.insuranceRefunded ?? null,
      original_date:      rescheduleLogMap.get(b.id)?.oldDate ?? null,
      rescheduled_at:     rescheduleLogMap.get(b.id)?.rescheduledAt ?? null,
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

/* GET /owner/submission-addons/:submissionId — active add-ons for a chalet by submission ID */
router.get("/submission-addons/:submissionId", async (req, res) => {
  const submissionId = Number(req.params.submissionId);
  if (!submissionId) return res.json([]);
  const [chalet] = await db.select({ id: chaletsTable.id })
    .from(chaletsTable)
    .where(eq(chaletsTable.submissionId, submissionId))
    .limit(1);
  if (!chalet) return res.json([]);
  const addons = await db.select()
    .from(chaletServicesTable)
    .where(and(eq(chaletServicesTable.chaletId, chalet.id), eq(chaletServicesTable.isActive, true)))
    .orderBy(chaletServicesTable.createdAt);
  return res.json(addons);
});

const galleryPhotoSchema = z.array(z.object({ url: z.string().min(1), caption: z.string().max(200) })).max(10).optional();

/* POST /owner/chalets/:chaletId/services */
router.post("/chalets/:chaletId/services", async (req, res) => {
  const ownerId = req.user!.id;
  const chaletId = Number(req.params.chaletId);
  if (!(await verifyOwnerChalet(ownerId, chaletId))) return res.status(403).json({ error: "forbidden" });
  const schema = z.object({
    name: z.string().min(1, "اسم الخدمة مطلوب").max(200),
    category: z.string().max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    price: z.number({ invalid_type_error: "السعر يجب أن يكون رقمًا" }).nonnegative("السعر لا يمكن أن يكون سالبًا"),
    unit: z.string().max(100).optional(),
    imageUrl: z.string().nullable().optional().or(z.literal("")),
    galleryPhotos: galleryPhotoSchema,
    minPersons: z.number().int().nonnegative().nullable().optional(),
    maxPersons: z.number().int().nonnegative().nullable().optional(),
    maxQuantity: z.number().int().min(0).max(1000000).nullable().optional(),
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
    minPersons: body.minPersons ?? null,
    maxPersons: body.maxPersons ?? null,
    maxQuantity: body.maxQuantity ?? null,
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
    price: z.number().nonnegative().optional(),
    unit: z.string().max(100).optional(),
    imageUrl: z.string().nullable().optional().or(z.literal("")),
    galleryPhotos: galleryPhotoSchema.or(z.null()).optional(),
    isActive: z.boolean().optional(),
    minPersons: z.number().int().nonnegative().nullable().optional(),
    maxPersons: z.number().int().nonnegative().nullable().optional(),
    maxQuantity: z.number().int().min(0).max(1000000).nullable().optional(),
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
  if (body.minPersons !== undefined) patch.minPersons = body.minPersons;
  if (body.maxPersons !== undefined) patch.maxPersons = body.maxPersons;
  if (body.maxQuantity !== undefined) patch.maxQuantity = body.maxQuantity;
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
  return res.json(row ?? { ownerId, waEnabled: false, waPhone: null, waSupportEnabled: false });
});

/* ── GET /owner/transaction-history ───────────────────────────
   Combined log: bookings income + refunds + expenses + withdrawals
   Client-side filtering by month; API returns all data for owner. */
router.get("/transaction-history", async (req, res) => {
  const ownerId = req.user!.id;
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  const bConds: Parameters<typeof and>[0][] = [eq(ownerBookingsTable.ownerId, ownerId)];
  const eConds: Parameters<typeof and>[0][] = [eq(ownerExpensesTable.ownerId, ownerId)];
  const pConds: Parameters<typeof and>[0][] = [eq(bookingPaymentsTable.ownerId, ownerId)];
  if (submissionId) {
    bConds.push(eq(ownerBookingsTable.submissionId, submissionId));
    eConds.push(eq(ownerExpensesTable.submissionId, submissionId));
  }

  const [bookings, expenses, instPayments] = await Promise.all([
    db.select().from(ownerBookingsTable).where(and(...bConds)).orderBy(ownerBookingsTable.bookingDate),
    db.select().from(ownerExpensesTable).where(and(...eConds)).orderBy(ownerExpensesTable.dateStr),
    db.select({
      id: bookingPaymentsTable.id,
      bookingId: bookingPaymentsTable.bookingId,
      amount: bookingPaymentsTable.amount,
      paymentDate: bookingPaymentsTable.paymentDate,
      method: bookingPaymentsTable.method,
      cashDeposited: bookingPaymentsTable.cashDeposited,
      receiptUrl: bookingPaymentsTable.receiptUrl,
      clientName: ownerBookingsTable.clientName,
      submissionId: ownerBookingsTable.submissionId,
    })
    .from(bookingPaymentsTable)
    .innerJoin(ownerBookingsTable, eq(bookingPaymentsTable.bookingId, ownerBookingsTable.id))
    .where(and(...pConds)),
  ]);

  const bookingIdsWithInstallments = new Set(instPayments.map(p => p.bookingId));

  const items = [
    /* Booking entries — distinguish refund vs cancelled vs normal income */
    ...bookings.flatMap(b => {
      const dep = Number(b.depositPaid ?? 0);
      const refundAmt = Number((b as any).cancelRefundAmount ?? 0);
      const hasInst = bookingIdsWithInstallments.has(b.id);
      const bal = (!hasInst && b.balanceCollected) ? Math.max(0, Number(b.totalPrice ?? 0) - dep) : 0;

      /* Helper: safely convert Drizzle Date object or string to YYYY-MM-DD */
      const toDateStr = (v: unknown): string => {
        if (!v) return b.bookingDate ?? "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        const s = String(v);
        /* Already ISO YYYY-MM-DD or YYYY-MM-DDTHH… */
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        /* Fallback: parse and format */
        const d = new Date(s);
        return isNaN(d.getTime()) ? (b.bookingDate ?? "") : d.toISOString().slice(0, 10);
      };

      if (b.cancelledAt) {
        const cancelDate = toDateStr(b.cancelledAt);
        if (dep > 0 && refundAmt > 0) {
          /* Money was received AND partially/fully refunded →
             Keep original deposit row (+dep) AND add a refund row (-refundAmt).
             The difference (dep - refundAmt) = cancellation fee that stays with owner. */
          return [
            {
              id: `b-${b.id}-dep`,
              date: b.bookingDate ?? "",
              type: "income" as const,
              label: `إيداع — ${b.clientName}`,
              amount: dep,
              method: (b.paymentMethod ?? "transfer") as string,
              status: "collected" as string,
              cashDeposited: true as boolean | null,
              paymentReceiptUrl: b.paymentReceiptUrl ?? null,
              bookingId: b.id as number | null,
              remainingBalance: null as number | null,
            },
            {
              id: `b-${b.id}-ref`,
              date: cancelDate,
              type: "refund" as const,
              label: `استرداد — ${b.clientName}`,
              amount: refundAmt,
              method: (b.paymentMethod ?? "transfer") as string,
              status: "refunded" as string,
              cashDeposited: null as boolean | null,
              paymentReceiptUrl: null as string | null,
              bookingId: b.id as number | null,
              remainingBalance: null as number | null,
            },
          ];
        }
        /* Cancelled — no money ever paid (dep==0), or 100% kept as fee (refundAmt==0) */
        return [{
          id: `b-${b.id}`,
          date: b.bookingDate ?? "",
          type: "income" as const,
          label: `إيداع — ${b.clientName}`,
          amount: dep,
          method: (b.paymentMethod ?? "transfer") as string,
          status: "cancelled" as string,
          cashDeposited: null as boolean | null,
          paymentReceiptUrl: null as string | null,
          bookingId: b.id as number | null,
          remainingBalance: null as number | null,
        }];
      }

      /* Normal income — determine full-payment status by comparing amount vs totalPrice */
      const total = Number(b.totalPrice ?? 0);
      const fullAmountCollected = b.balanceCollected || (total > 0 && dep >= total);
      const remaining = (total > 0 && !fullAmountCollected && !hasInst)
        ? Math.max(0, total - dep)
        : 0;
      return [{
        id: `b-${b.id}`,
        date: b.bookingDate,
        type: "income" as const,
        label: `إيداع — ${b.clientName}`,
        amount: dep + bal,
        method: (b.paymentMethod ?? "transfer") as string,
        status: hasInst ? "deposit_only" : (fullAmountCollected ? "collected" : "deposit_only"),
        cashDeposited: true as boolean | null,
        paymentReceiptUrl: b.paymentReceiptUrl ?? null,
        bookingId: b.id as number | null,
        remainingBalance: remaining > 0 ? remaining : null as number | null,
      }];
    }),
    ...instPayments
      .filter(p => !submissionId || p.submissionId === submissionId)
      .map(p => ({
        id: `p-${p.id}`,
        date: p.paymentDate,
        type: "income" as const,
        label: `دفعة — ${p.clientName}`,
        amount: Number(p.amount),
        method: p.method,
        status: "collected" as string,
        cashDeposited: p.cashDeposited as boolean | null,
        paymentReceiptUrl: p.receiptUrl ?? null,
        bookingId: p.bookingId as number | null,
      })),
    ...expenses.map(e => ({
      id: `e-${e.id}`,
      date: e.dateStr,
      type: e.category === "withdrawal" ? "withdrawal" as const : "expense" as const,
      label: e.customCategory || e.category,
      amount: Number(e.amount),
      method: "na" as const,
      status: "paid" as const,
      cashDeposited: null as boolean | null,
      paymentReceiptUrl: null as string | null,
      bookingId: null as number | null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return res.json(items);
});

/* ── PATCH /owner/notification-settings ───────────────────────
   Update WhatsApp notification preferences */
router.patch("/notification-settings", async (req, res) => {
  const ownerId = (req.user as any)?.id;
  if (!ownerId) return res.status(401).json({ error: "unauthorized" });
  const { waEnabled, waPhone, waSupportEnabled } = z.object({
    waEnabled: z.boolean().optional(),
    waPhone: z.string().max(20).nullable().optional(),
    waSupportEnabled: z.boolean().optional(),
  }).parse(req.body);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (waEnabled !== undefined) patch.waEnabled = waEnabled;
  if (waPhone !== undefined) patch.waPhone = waPhone;
  if (waSupportEnabled !== undefined) patch.waSupportEnabled = waSupportEnabled;
  await db.insert(ownerNotificationSettingsTable)
    .values({ ownerId, waEnabled: waEnabled ?? false, waPhone: waPhone ?? null, waSupportEnabled: waSupportEnabled ?? false })
    .onConflictDoUpdate({ target: ownerNotificationSettingsTable.ownerId, set: patch });
  return res.json({ ok: true });
});

/* ── GET /owner/cash-deposit-logs ──────────────────────────────
   Return all cash deposit log entries for the owner */
router.get("/cash-deposit-logs", async (req, res) => {
  const ownerId = req.user!.id;
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;

  const conditions = [eq(cashDepositLogsTable.ownerId, ownerId)];
  if (submissionId) conditions.push(eq(cashDepositLogsTable.submissionId, submissionId));

  const rows = await db
    .select()
    .from(cashDepositLogsTable)
    .where(and(...conditions))
    .orderBy(desc(cashDepositLogsTable.createdAt));

  return res.json(rows);
});

/* ── POST /owner/mark-cash-deposited ───────────────────────────
   Record a (partial or full) cash deposit to the bank ledger */
router.post("/mark-cash-deposited", async (req, res) => {
  const ownerId = req.user!.id;
  const { amount, submissionId, bookingId, isInsurance, totalCash, note } = req.body as {
    amount: number; submissionId?: number; bookingId?: number; isInsurance?: boolean; totalCash?: number; note?: string;
  };

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "المبلغ غير صحيح" });
  }

  const [log] = await db
    .insert(cashDepositLogsTable)
    .values({
      ownerId,
      submissionId: submissionId ? Number(submissionId) : null,
      bookingId: bookingId ? Number(bookingId) : null,
      amount: String(Math.round(Number(amount))),
      note: note ?? "إيداع نقدي",
    })
    .returning();

  if (bookingId && !isInsurance && totalCash && Number(amount) >= Number(totalCash)) {
    await db
      .update(ownerBookingsTable)
      .set({ cashDeposited: true })
      .where(and(eq(ownerBookingsTable.id, Number(bookingId)), eq(ownerBookingsTable.ownerId, ownerId)));
  }

  return res.json({ ok: true, log });
});

/* ── Section Guides — read-only for all authenticated users ── */
router.get("/section-guides", async (_req, res) => {
  try {
    const rows = await db.execute(sql`SELECT id, section_key, title, video_url FROM section_guides ORDER BY section_key, id`);
    return res.json((rows as any).rows ?? []);
  } catch (err) {
    console.error("[GET /owner/section-guides]", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
