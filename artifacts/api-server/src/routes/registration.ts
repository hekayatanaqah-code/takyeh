import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/email";
import { createSession, SESSION_COOKIE, SESSION_TTL } from "../lib/auth";

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

async function isDevModeEnabled(): Promise<boolean> {
  return process.env.NODE_ENV === "development";
}

const DEV_MASTER_CODE = "123456";

function normalizePhone(value: unknown): string {
  const digits = String(value ?? "").trim().replace(/[٠-٩]/g, digit =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
  );
  let phone = digits.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+966")) phone = phone.slice(4);
  else if (phone.startsWith("966")) phone = phone.slice(3);
  if (phone && !phone.startsWith("0")) phone = `0${phone}`;
  return phone;
}

async function verifyAndConsumeOtp(email: string, code: string): Promise<boolean> {
  /* Dev-mode bypass: accept master code without touching the OTP table */
  const devMode = await isDevModeEnabled();
  if (devMode && code.trim() === DEV_MASTER_CODE) {
    console.log(`[OTP-DEV] Master-code bypass accepted for ${email}`);
    return true;
  }

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

/* ── PATCH /onboarding/type ─────────────────────────────────
   Updates business_type on owner_applications for a given email.
   Called after the user picks their activity type in onboarding.
   ─────────────────────────────────────────────────────────── */
router.patch("/onboarding/type", async (req, res) => {
  const { email, phone, businessType } = req.body ?? {};
  if ((!email && !phone) || !businessType) {
    return res.status(400).json({ error: "البريد أو رقم الجوال ونوع النشاط مطلوبان" });
  }
  const allowed = ["chalet", "service", "both"];
  if (!allowed.includes(String(businessType))) {
    return res.status(400).json({ error: "نوع نشاط غير صحيح" });
  }
  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);
  try {
    if (emailLower) {
      await db.execute(
        sql`UPDATE owner_applications SET business_type = ${String(businessType)} WHERE LOWER(email) = LOWER(${emailLower})`
      );
    } else {
      await db.execute(
        sql`UPDATE owner_applications SET business_type = ${String(businessType)} WHERE phone = ${phoneClean}`
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[onboarding/type] Error:", err);
    return res.status(500).json({ error: "تعذّر الحفظ" });
  }
});

/* ── POST /auth/check-exists ────────────────────────────────
   Pre-validation: checks email + phone availability before the
   user opens the terms modal. Returns field-level errors.
   ─────────────────────────────────────────────────────────── */
router.post("/auth/check-exists", async (req, res) => {
  const { email, phone } = req.body ?? {};
  const errors: { email?: string; phone?: string } = {};

  try {
    if (email) {
      const emailLower = String(email).trim().toLowerCase();
      const emailCheck = await db.execute(
        sql`SELECT id FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
      );
      if (((emailCheck as any).rows as any[]).length > 0) {
        errors.email = "هذا البريد الإلكتروني مسجّل مسبقاً";
      }
    }

    if (phone) {
      const phoneCheck = await db.execute(
        sql`SELECT id FROM owner_applications WHERE phone = ${normalizePhone(phone)} LIMIT 1`
      );
      if (((phoneCheck as any).rows as any[]).length > 0) {
        errors.phone = "رقم الجوال هذا مسجّل مسبقاً";
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({ errors });
    }
    return res.json({ available: true });
  } catch (err) {
    console.error("[auth/check-exists] Error:", err);
    return res.status(500).json({ error: "تعذّر التحقق، يرجى المحاولة مجدداً" });
  }
});

/* ── POST /register-owner ───────────────────────────────────
   Public registration — only personal info required.
   Business details are collected after account activation.
   ─────────────────────────────────────────────────────────── */
router.post("/register-owner", async (req, res) => {
  const { fullName, phone, email, password } = req.body ?? {};

  if (!fullName || !phone || !password) {
    return res.status(400).json({ error: "يرجى تعبئة جميع الحقول المطلوبة" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
  }

  const emailLower = String(email ?? "").trim().toLowerCase();

  try {
    if (emailLower) {
      const emailCheck = await db.execute(
        sql`SELECT id FROM owner_applications WHERE email = ${emailLower} LIMIT 1`
      );
      if (((emailCheck as any).rows as any[]).length > 0) {
        return res.status(409).json({ error: "هذا البريد الإلكتروني مسجّل مسبقاً — إذا لم يتم التفعيل تواصل مع الإدارة" });
      }
    }

    const phoneClean = normalizePhone(phone);
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
             ${emailLower || null},
            ${passwordHash},
            'pending',
             ${!emailLower}
          )`
    );

    if (emailLower) {
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
    }

    console.log(`[New Partner Application] Name: ${nameClean}, Phone: ${phoneClean}, Email: ${emailLower || "not provided"}`);

    return res.status(201).json({ ok: true, requiresVerification: Boolean(emailLower), email: emailLower || null });
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

  const emailLower = String(email ?? "").trim().toLowerCase();
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

  const emailLower = String(email ?? "").trim().toLowerCase();

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

/* ── POST /owner-login ──────────────────────────────────────
   Custom email/phone+password login for chalet owners.
   Looks up owner_applications by either email or normalized phone,
   validates bcrypt password, then
   creates a platform session (sid cookie) so authMiddleware
   can set req.user correctly for all /owner/* routes.
   ─────────────────────────────────────────────────────────── */
router.post("/owner-login", async (req, res) => {
  const { identifier: rawIdentifier, email: legacyEmail, password, rememberMe } = req.body ?? {};
  const identifier = String(rawIdentifier ?? legacyEmail ?? "").trim();
  if (!identifier || !password) {
    return res.status(400).json({ error: "البريد الإلكتروني أو رقم الجوال وكلمة المرور مطلوبان" });
  }
  const identifierDigits = identifier.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  let phoneIdentifier = identifierDigits.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (phoneIdentifier.startsWith("+966")) phoneIdentifier = phoneIdentifier.slice(4);
  else if (phoneIdentifier.startsWith("966")) phoneIdentifier = phoneIdentifier.slice(3);
  if (phoneIdentifier && !phoneIdentifier.startsWith("0")) phoneIdentifier = `0${phoneIdentifier}`;
  const emailIdentifier = identifier.toLowerCase();

  try {
    const appResult = await db.execute(
      sql`SELECT id, full_name, phone, email, password_hash, email_verified, status
          FROM owner_applications
          WHERE LOWER(email) = LOWER(${emailIdentifier})
             OR phone = ${phoneIdentifier}
          LIMIT 1`
    );
    const app = ((appResult as any).rows as Array<{
      id: number; full_name: string; phone: string; email: string;
      password_hash: string; email_verified: boolean; status: string;
    }>)[0];

    if (!app) {
      return res.status(401).json({ error: "لا يوجد حساب مرتبط بهذا البريد الإلكتروني أو رقم الجوال" });
    }
    if (!app.email_verified) {
      return res.status(403).json({ error: "يرجى التحقق من بريدك الإلكتروني أولاً قبل تسجيل الدخول" });
    }
    if (!app.password_hash) {
      return res.status(401).json({ error: "هذا الحساب لا يملك كلمة مرور — تواصل مع الدعم" });
    }

    const valid = await bcrypt.compare(String(password), app.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    }

    /* ── Determine user ID:
       Prefer the Replit user ID if the owner has a Replit account with the same email
       (so existing bookings/submissions stay linked). Otherwise use "owner_<id>". ── */
    let userId = `owner_${app.id}`;
    try {
      const [replUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, String(app.email ?? "").toLowerCase()))
        .limit(1);
      if (replUser?.id) userId = replUser.id;
    } catch { /* ignore — non-critical */ }

    const ttl = rememberMe ? 30 * 24 * 60 * 60 * 1000 : SESSION_TTL;
    const sid = await createSession({
      user: {
        id: userId,
        email: app.email,
        firstName: app.full_name,
        lastName: null,
        profileImageUrl: null,
      },
      access_token: "owner_password_auth",
      expires_at: Math.floor((Date.now() + ttl) / 1000),
    });

    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: rememberMe ? ttl : undefined,
    });

    return res.json({ ok: true, redirect: "/dashboard" });
  } catch (err) {
    console.error("[owner-login] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول، يرجى المحاولة لاحقاً" });
  }
});

/* ── Phone OTP helpers ──────────────────────────────────────── */
async function createPhoneOtp(phone: string, code: string) {
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.execute(
    sql`INSERT INTO phone_otp_tokens (phone, code_hash, expires_at)
        VALUES (${phone}, ${codeHash}, ${expiresAt.toISOString()})`
  );
}

async function verifyAndConsumePhoneOtp(phone: string, code: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development" && code.trim() === DEV_MASTER_CODE) {
    console.log(`[PHONE-OTP-DEV] Master-code bypass for ${phone}`);
    return true;
  }
  const codeHash = hashCode(code);
  const result = await db.execute(
    sql`SELECT id FROM phone_otp_tokens
        WHERE phone = ${phone}
          AND code_hash = ${codeHash}
          AND expires_at > now()
          AND used_at IS NULL
        ORDER BY created_at DESC LIMIT 1`
  );
  const rows = (result as any).rows as Array<{ id: number }>;
  const token = rows[0];
  if (!token) return false;
  await db.execute(sql`UPDATE phone_otp_tokens SET used_at = now() WHERE id = ${token.id}`);
  return true;
}

/* ── POST /send-phone-otp ───────────────────────────────────── */
router.post("/send-phone-otp", async (req, res) => {
  const { email, phone } = req.body ?? {};
  if (!email && !phone) return res.status(400).json({ error: "البريد الإلكتروني أو رقم الجوال مطلوب" });
  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);
  try {
    const result = email
      ? await db.execute(sql`
          SELECT id, full_name, phone, email_verified, phone_verified
          FROM owner_applications WHERE LOWER(email) = LOWER(${emailLower}) LIMIT 1
        `)
      : await db.execute(sql`
          SELECT id, full_name, phone, email_verified, phone_verified
          FROM owner_applications WHERE phone = ${phoneClean} LIMIT 1
        `);
    const rows = (result as any).rows as Array<{
      id: number; full_name: string; phone: string;
      email_verified: boolean; phone_verified: boolean;
    }>;
    const app = rows[0];
    if (!app) return res.status(404).json({ error: "الحساب غير موجود" });
    if (!app.email_verified) return res.status(403).json({ error: "يرجى التحقق من البريد الإلكتروني أولاً" });
    if (app.phone_verified) return res.json({ ok: true, alreadyVerified: true, maskedPhone: maskPhone(app.phone) });

    const code = generateCode();
    await createPhoneOtp(app.phone, code);

    if (process.env.NODE_ENV === "development") {
      console.log(`[PHONE-OTP] Code for ${app.phone} (${emailLower}): ${code}`);
    }
    /* TODO (production): send via WhatsApp Business API or SMS provider */

    return res.json({ ok: true, maskedPhone: maskPhone(app.phone) });
  } catch (err) {
    console.error("[send-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال الرمز" });
  }
});

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{2})\d+(\d{3})$/, "$1*****$2");
}

/* ── POST /verify-phone-otp ─────────────────────────────────── */
router.post("/verify-phone-otp", async (req, res) => {
  const { email, phone, code } = req.body ?? {};
  if ((!email && !phone) || !code) return res.status(400).json({ error: "البريد أو رقم الجوال والرمز مطلوبان" });
  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);
  const cleanCode  = String(code).trim().replace(/\s/g, "");
  try {
    const result = email
      ? await db.execute(sql`
          SELECT id, phone, phone_verified FROM owner_applications
          WHERE LOWER(email) = LOWER(${emailLower}) LIMIT 1
        `)
      : await db.execute(sql`
          SELECT id, phone, phone_verified FROM owner_applications
          WHERE phone = ${phoneClean} LIMIT 1
        `);
    const rows = (result as any).rows as Array<{ id: number; phone: string; phone_verified: boolean }>;
    const app = rows[0];
    if (!app) return res.status(404).json({ error: "الحساب غير موجود" });
    if (app.phone_verified) return res.json({ ok: true, alreadyVerified: true });

    const valid = await verifyAndConsumePhoneOtp(app.phone, cleanCode);
    if (!valid) return res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });

    await db.execute(
      sql`UPDATE owner_applications SET phone_verified = true, phone_verified_at = now() WHERE id = ${app.id}`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[verify-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التحقق" });
  }
});

/* ── POST /resend-phone-otp ─────────────────────────────────── */
router.post("/resend-phone-otp", async (req, res) => {
  const { email, phone } = req.body ?? {};
  if (!email && !phone) return res.status(400).json({ error: "البريد أو رقم الجوال مطلوب" });
  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);
  try {
    const result = email
      ? await db.execute(sql`
          SELECT phone, phone_verified FROM owner_applications
          WHERE LOWER(email) = LOWER(${emailLower}) LIMIT 1
        `)
      : await db.execute(sql`
          SELECT phone, phone_verified FROM owner_applications
          WHERE phone = ${phoneClean} LIMIT 1
        `);
    const rows = (result as any).rows as Array<{ phone: string; phone_verified: boolean }>;
    const app = rows[0];
    if (!app) return res.status(404).json({ error: "الحساب غير موجود" });
    if (app.phone_verified) return res.json({ ok: true, alreadyVerified: true });

    await db.execute(
      sql`UPDATE phone_otp_tokens SET used_at = now() WHERE phone = ${app.phone} AND used_at IS NULL`
    );
    const code = generateCode();
    await createPhoneOtp(app.phone, code);

    if (process.env.NODE_ENV === "development") {
      console.log(`[PHONE-OTP] Resend for ${app.phone}: ${code}`);
    }
    return res.json({ ok: true, maskedPhone: maskPhone(app.phone) });
  } catch (err) {
    console.error("[resend-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إعادة الإرسال" });
  }
});

/* ── POST /change-phone ────────────────────────────────────────
   Replaces the phone number for an unverified owner and issues a
   fresh OTP for the new number.
   ─────────────────────────────────────────────────────────── */
router.post("/change-phone", async (req, res): Promise<void> => {
  const { email, phone, newPhone } = req.body ?? {};
  if (!email && !phone) {
    res.status(400).json({ error: "البريد أو رقم الجوال مطلوب" });
    return;
  }
  const emailLower = String(email ?? "").trim().toLowerCase();
  const newPhoneClean = normalizePhone(newPhone);
  if (!/^05\d{8}$/.test(newPhoneClean)) {
    res.status(400).json({ error: "رقم الجوال الجديد يجب أن يبدأ بـ 05 ويتكون من 10 أرقام" });
    return;
  }

  try {
    const currentPhone = normalizePhone(phone);
    const result = emailLower
      ? await db.execute(sql`
          SELECT id, phone, phone_verified
          FROM owner_applications
          WHERE LOWER(email) = LOWER(${emailLower}) LIMIT 1
        `)
      : await db.execute(sql`
          SELECT id, phone, phone_verified
          FROM owner_applications
          WHERE phone = ${currentPhone} LIMIT 1
        `);
    const rows = (result as any).rows as Array<{
      id: number;
      phone: string;
      phone_verified: boolean;
    }>;
    const app = rows[0];
    if (!app) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    if (app.phone_verified) {
      res.status(400).json({ error: "لا يمكن تغيير رقم جوال مفعّل" });
      return;
    }
    if (app.phone === newPhoneClean) {
      res.status(400).json({ error: "يرجى إدخال رقم جوال جديد" });
      return;
    }

    const duplicate = await db.execute(sql`
      SELECT id FROM owner_applications
      WHERE phone = ${newPhoneClean} AND id <> ${app.id}
      LIMIT 1
    `);
    if (((duplicate as any).rows as Array<{ id: number }>).length > 0) {
      res.status(409).json({ error: "رقم الجوال الجديد مسجّل مسبقاً" });
      return;
    }

    await db.execute(
      sql`UPDATE phone_otp_tokens SET used_at = now() WHERE phone = ${app.phone} AND used_at IS NULL`
    );
    await db.execute(
      sql`UPDATE owner_applications
          SET phone = ${newPhoneClean}, phone_verified = false, phone_verified_at = NULL
          WHERE id = ${app.id}`
    );

    const code = generateCode();
    await createPhoneOtp(newPhoneClean, code);
    if (process.env.NODE_ENV === "development") {
      req.log.debug({ phone: newPhoneClean }, "Phone OTP issued after phone change");
    }
    res.json({ ok: true, maskedPhone: maskPhone(newPhoneClean) });
  } catch (err) {
    req.log.error({ err }, "Failed to change phone number");
    res.status(500).json({ error: "حدث خطأ أثناء تحديث رقم الجوال" });
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
