import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sendOtpEmail } from "../lib/email";

const router = Router();

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  chalet:  "مالك شاليه",
  service: "مزود خدمة",
  both:    "مالك شاليه + مزود خدمة",
};

/* ── OTP Helpers ────────────────────────────────────────────── */
function generateCode(): string {
  return String(randomInt(100000, 999999));
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

async function createOtp(email: string, code: string) {
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await db.execute(
    sql`INSERT INTO owner_otp_tokens (email, code_hash, expires_at)
        VALUES (${email}, ${codeHash}, ${expiresAt.toISOString()})`
  );
}

async function verifyAndConsumeOtp(email: string, code: string): Promise<boolean> {
  const codeHash = hashCode(code);
  const rows = await db.execute<{ id: number }>(
    sql`SELECT id FROM owner_otp_tokens
        WHERE email = ${email}
          AND code_hash = ${codeHash}
          AND expires_at > now()
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
  );
  const token = rows[0];
  if (!token) return false;
  await db.execute(
    sql`UPDATE owner_otp_tokens SET used_at = now() WHERE id = ${token.id}`
  );
  return true;
}

/* ── POST /register-owner ───────────────────────────────────
   Public registration for new partners (chalet owners / service providers).
   Stored as pending application, OTP sent to email for verification.
   ─────────────────────────────────────────────────────────── */
router.post("/register-owner", async (req, res) => {
  const { fullName, businessName, businessType = "chalet", phone, email, password } = req.body ?? {};

  if (!fullName || !businessName || !phone || !email || !password) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
  }
  if (!["chalet", "service", "both"].includes(businessType)) {
    return res.status(400).json({ error: "نوع النشاط غير صحيح" });
  }

  const emailLower = String(email).trim().toLowerCase();

  const [existing] = await db.execute<{ id: number }>(
    sql`SELECT id FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
  );
  if (existing) {
    return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل مسبقاً — إذا لم يتم التفعيل تواصل مع الإدارة" });
  }

  const phoneClean = String(phone).trim().replace(/\s+/g, "");
  const [existingPhone] = await db.execute<{ id: number }>(
    sql`SELECT id FROM owner_applications WHERE phone = ${phoneClean} LIMIT 1`
  );
  if (existingPhone) {
    return res.status(409).json({ error: "رقم الجوال مسجّل مسبقاً — إذا لم يتم التفعيل تواصل مع الإدارة" });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  await db.execute(
    sql`INSERT INTO owner_applications
          (full_name, business_name, business_type, phone, email, password_hash, status, email_verified)
        VALUES (
          ${String(fullName).trim()},
          ${String(businessName).trim()},
          ${String(businessType)},
          ${phoneClean},
          ${emailLower},
          ${passwordHash},
          'pending',
          false
        )`
  );

  /* Generate + send OTP (non-blocking — don't fail registration if email fails) */
  const code = generateCode();
  await createOtp(emailLower, code);
  sendOtpEmail(emailLower, String(fullName).trim(), code).catch(() => {});

  console.log(
    `[New Partner Application] Name: ${fullName}, Business: ${businessName}, ` +
    `Type: ${BUSINESS_TYPE_LABELS[businessType] ?? businessType}, Email: ${emailLower}`
  );

  return res.status(201).json({ ok: true, requiresVerification: true, email: emailLower });
});

/* ── POST /verify-otp ───────────────────────────────────────
   Verify the 6-digit OTP code sent to owner's email.
   ─────────────────────────────────────────────────────────── */
router.post("/verify-otp", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    return res.status(400).json({ error: "البريد الإلكتروني والرمز مطلوبان" });
  }

  const emailLower = String(email).trim().toLowerCase();
  const cleanCode  = String(code).trim().replace(/\s/g, "");

  const [app] = await db.execute<{ id: number; email_verified: boolean }>(
    sql`SELECT id, email_verified FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
  );
  if (!app) {
    return res.status(404).json({ error: "لم يتم العثور على حساب بهذا البريد الإلكتروني" });
  }
  if (app.email_verified) {
    return res.json({ ok: true, alreadyVerified: true });
  }

  const valid = await verifyAndConsumeOtp(emailLower, cleanCode);
  if (!valid) {
    return res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });
  }

  await db.execute(
    sql`UPDATE owner_applications SET email_verified = true, email_verified_at = now() WHERE email = ${emailLower}`
  );

  return res.json({ ok: true });
});

/* ── POST /resend-otp ───────────────────────────────────────
   Resend a fresh OTP to the owner's email (rate limited by client timer).
   ─────────────────────────────────────────────────────────── */
router.post("/resend-otp", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

  const emailLower = String(email).trim().toLowerCase();
  const [app] = await db.execute<{ id: number; full_name: string; email_verified: boolean }>(
    sql`SELECT id, full_name, email_verified FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
  );
  if (!app) {
    return res.status(404).json({ error: "لم يتم العثور على حساب بهذا البريد الإلكتروني" });
  }
  if (app.email_verified) {
    return res.json({ ok: true, alreadyVerified: true });
  }

  /* Invalidate previous tokens */
  await db.execute(
    sql`UPDATE owner_otp_tokens SET used_at = now() WHERE email = ${emailLower} AND used_at IS NULL`
  );

  const code = generateCode();
  await createOtp(emailLower, code);
  sendOtpEmail(emailLower, app.full_name, code).catch(() => {});

  return res.json({ ok: true });
});

/* ── GET /admin/applications ────────────────────────────────
   Returns all partner applications (admin only).
   ─────────────────────────────────────────────────────────── */
router.get("/admin/applications", async (_req, res) => {
  const rows = await db.execute<{
    id: number; full_name: string; business_name: string; business_type: string;
    phone: string; email: string; status: string; docs_status: string;
    email_verified: boolean; created_at: string;
  }>(
    sql`SELECT id, full_name, business_name, business_type, phone, email,
               status, docs_status, email_verified, created_at
        FROM owner_applications ORDER BY created_at DESC`
  );
  return res.json(rows);
});

/* ── PATCH /admin/applications/:id ─────────────────────────
   Update application status: approved | rejected | pending
   ─────────────────────────────────────────────────────────── */
router.patch("/admin/applications/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "الحالة غير صحيحة" });
  }
  await db.execute(
    sql`UPDATE owner_applications SET status = ${String(status)} WHERE id = ${Number(req.params.id)}`
  );
  return res.json({ ok: true });
});

/* ── PATCH /admin/applications/:id/manual-verify ───────────
   Admin manually marks an owner as email-verified (bypasses OTP).
   ─────────────────────────────────────────────────────────── */
router.patch("/admin/applications/:id/manual-verify", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  await db.execute(
    sql`UPDATE owner_applications SET email_verified = true, email_verified_at = now() WHERE id = ${id}`
  );
  return res.json({ ok: true });
});

export default router;
