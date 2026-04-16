import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/email";

const router = Router();

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
  const result = await db.execute(
    sql`SELECT id FROM owner_otp_tokens
        WHERE email = ${email}
          AND code_hash = ${codeHash}
          AND expires_at > now()
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`
  );
  const rows = (result as any).rows as Array<{ id: number }>;
  const token = rows[0];
  if (!token) return false;
  await db.execute(
    sql`UPDATE owner_otp_tokens SET used_at = now() WHERE id = ${token.id}`
  );
  return true;
}

async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const keyList = keys.map(k => `'${k}'`).join(", ");
  const result = await db.execute(
    sql`SELECT key, value FROM site_settings WHERE key IN (${sql.raw(keyList)})`
  );
  const rows = (result as any).rows as Array<{ key: string; value: string }>;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/* ── POST /register-owner ───────────────────────────────────
   Public registration — only personal info required.
   Business details are collected after account activation.
   ─────────────────────────────────────────────────────────── */
router.post("/register-owner", async (req, res) => {
  const { fullName, phone, email, password } = req.body ?? {};

  if (!fullName || !phone || !email || !password) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
  }

  const emailLower = String(email).trim().toLowerCase();

  try {
    const emailCheck = await db.execute(
      sql`SELECT id FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
    );
    if (((emailCheck as any).rows as any[]).length > 0) {
      return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل مسبقاً — إذا لم يتم التفعيل تواصل مع الإدارة" });
    }

    const phoneClean = String(phone).trim().replace(/\s+/g, "");
    const phoneCheck = await db.execute(
      sql`SELECT id FROM owner_applications WHERE phone = ${phoneClean} LIMIT 1`
    );
    if (((phoneCheck as any).rows as any[]).length > 0) {
      return res.status(409).json({ error: "رقم الجوال مسجّل مسبقاً — إذا لم يتم التفعيل تواصل مع الإدارة" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const nameClean    = String(fullName).trim();

    /* businessName = fullName, businessType = "chalet" (updated after activation) */
    await db.execute(
      sql`INSERT INTO owner_applications
            (full_name, business_name, business_type, phone, email, password_hash, status, email_verified)
          VALUES (
            ${nameClean},
            ${nameClean},
            'chalet',
            ${phoneClean},
            ${emailLower},
            ${passwordHash},
            'pending',
            false
          )`
    );

    /* Fetch settings to determine OTP behaviour */
    const settings = await getSettings(["email_otp_enabled", "email_otp_subject", "email_otp_template"]).catch(() => ({} as Record<string, string>));
    const emailOtpEnabled = settings.email_otp_enabled !== "false"; // default: true

    const code = generateCode();
    await createOtp(emailLower, code);

    if (emailOtpEnabled) {
      sendOtpEmail(emailLower, nameClean, code, {
        subject: settings.email_otp_subject || undefined,
        template: settings.email_otp_template || undefined,
      }).catch(() => {});
    } else {
      console.log(`[OTP] Email OTP disabled by admin — Code for ${emailLower}: ${code}`);
    }

    console.log(`[New Partner Application] Name: ${nameClean}, Email: ${emailLower}`);

    return res.status(201).json({ ok: true, requiresVerification: true, email: emailLower });
  } catch (err) {
    console.error("[register-owner] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التسجيل، يرجى المحاولة لاحقاً" });
  }
});

/* ── POST /verify-otp ───────────────────────────────────────
   Verify the 6-digit OTP code sent to owner's email.
   On success: marks email verified + sends welcome email if enabled.
   ─────────────────────────────────────────────────────────── */
router.post("/verify-otp", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) {
    return res.status(400).json({ error: "البريد الإلكتروني والرمز مطلوبان" });
  }

  const emailLower = String(email).trim().toLowerCase();
  const cleanCode  = String(code).trim().replace(/\s/g, "");

  try {
    const appResult = await db.execute(
      sql`SELECT id, full_name, email_verified FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
    );
    const appRows = (appResult as any).rows as Array<{ id: number; full_name: string; email_verified: boolean }>;
    const app = appRows[0];

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

    /* Send welcome email if enabled */
    try {
      const settings = await getSettings([
        "welcome_email_enabled",
        "welcome_email_subject",
        "welcome_email_template",
      ]);
      if (settings.welcome_email_enabled === "true") {
        sendWelcomeEmail(emailLower, app.full_name, {
          subject: settings.welcome_email_subject || undefined,
          template: settings.welcome_email_template || undefined,
        }).catch(() => {});
      }
    } catch {}

    return res.json({ ok: true });
  } catch (err) {
    console.error("[verify-otp] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التحقق، يرجى المحاولة لاحقاً" });
  }
});

/* ── POST /resend-otp ───────────────────────────────────────
   Resend a fresh OTP to the owner's email (rate limited by client timer).
   ─────────────────────────────────────────────────────────── */
router.post("/resend-otp", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

  const emailLower = String(email).trim().toLowerCase();

  try {
    const appResult = await db.execute(
      sql`SELECT id, full_name, email_verified FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
    );
    const appRows = (appResult as any).rows as Array<{ id: number; full_name: string; email_verified: boolean }>;
    const app = appRows[0];

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

    const settings = await getSettings(["email_otp_subject", "email_otp_template"]).catch(() => ({} as Record<string, string>));
    const code = generateCode();
    await createOtp(emailLower, code);
    sendOtpEmail(emailLower, app.full_name, code, {
      subject: settings.email_otp_subject || undefined,
      template: settings.email_otp_template || undefined,
    }).catch(() => {});

    return res.json({ ok: true });
  } catch (err) {
    console.error("[resend-otp] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إعادة الإرسال" });
  }
});

/* ── GET /admin/applications ────────────────────────────────
   Returns all partner applications (admin only).
   ─────────────────────────────────────────────────────────── */
router.get("/admin/applications", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, full_name, business_name, business_type, phone, email,
                 status, docs_status, email_verified, created_at
          FROM owner_applications ORDER BY created_at DESC`
    );
    return res.json((result as any).rows);
  } catch (err) {
    console.error("[admin/applications] Error:", err);
    return res.status(500).json({ error: "حدث خطأ" });
  }
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
