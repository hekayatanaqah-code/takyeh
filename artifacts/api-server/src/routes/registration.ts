import { Router } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "crypto";
import { sql, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/email";
import { getSession, getSessionId } from "../lib/auth";
import { loginWithRoles, roleLoginGuard, issueVerifiedOwnerSession } from "../lib/role-login";
import { hashPhoneOtp, issuePhoneOtp, normalizePhoneOtp } from "../lib/phone-otp";

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

router.get("/onboarding/status", async (req, res) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  if (session?.access_token !== "owner_password_auth" || !session.ownerApplicationId) {
    return res.status(403).json({ error: "يجب توثيق الجوال وتسجيل الدخول أولاً" });
  }
  return res.json({ ok: true });
});

router.patch("/onboarding/type", async (req, res) => {
  const sid = getSessionId(req);
  const session = sid ? await getSession(sid) : null;
  if (session?.access_token !== "owner_password_auth" || !session.ownerApplicationId) {
    return res.status(403).json({ error: "يجب توثيق الجوال برمز صحيح وتسجيل الدخول أولاً" });
  }
  const { businessType } = req.body ?? {};
  const allowed = ["chalet", "service", "both"];
  if (!allowed.includes(String(businessType))) {
    return res.status(400).json({ error: "نوع نشاط غير صحيح" });
  }
  try {
    await db.execute(
      sql`UPDATE owner_applications SET business_type = ${String(businessType)}
          WHERE id = ${session.ownerApplicationId} AND phone_verified = true AND email_verified = true`
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[onboarding/type] Error:", err);
    return res.status(500).json({ error: "تعذّر الحفظ" });
  }
});

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
            'approved',
            ${!emailLower}
          )`
    );

    if (emailLower) {
      const settings = await getSettings(["email_otp_enabled", "email_otp_subject", "email_otp_template"]).catch(() => ({} as Record<string, string>));
      const emailOtpEnabled = settings.email_otp_enabled !== "false";

      const code = generateCode();
      await createOtp(emailLower, code);

      if (emailOtpEnabled) {
        sendOtpEmail(emailLower, nameClean, code, {
          subject: settings.email_otp_subject || undefined,
          template: settings.email_otp_template || undefined,
        }).catch(() => {});
      }
    }

    return res.status(201).json({ ok: true, requiresVerification: Boolean(emailLower), email: emailLower || null });
  } catch (err) {
    console.error("[register-owner] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التسجيل، يرجى المحاولة لاحقاً" });
  }
});

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

    return res.json({ ok: true });
  } catch (err) {
    console.error("[verify-otp] Error:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التحقق، يرجى المحاولة لاحقاً" });
  }
});

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

router.post("/owner-login", roleLoginGuard, loginWithRoles);

async function createPhoneOtp(phone: string) {
  await db.transaction(async tx => {
    // Serialize issuance for the same owner, including concurrent resend requests.
    await tx.execute(sql`SELECT id FROM owner_applications WHERE phone = ${phone} FOR UPDATE`);
    await issuePhoneOtp(phone, async (codeHash, expiresAt) => {
      await tx.execute(sql`UPDATE phone_otp_tokens SET used_at = now() WHERE phone = ${phone} AND used_at IS NULL`);
      await tx.execute(
        sql`INSERT INTO phone_otp_tokens (phone, code_hash, expires_at)
            VALUES (${phone}, ${codeHash}, ${expiresAt.toISOString()})`
      );
    });
  });
}

async function verifyAndConsumePhoneOtp(applicationId: number, phone: string, code: string): Promise<boolean> {
  const codeHash = hashPhoneOtp(code);
  return db.transaction(async tx => {
    const account = await tx.execute(sql`
      SELECT id FROM owner_applications WHERE id = ${applicationId} AND phone = ${phone}
      AND email_verified = true AND deleted_at IS NULL FOR UPDATE
    `);
    if (!(account as any).rows[0]) return false;
    const result = await tx.execute(
      sql`SELECT id FROM phone_otp_tokens
          WHERE phone = ${phone}
            AND code_hash = ${codeHash}
            AND expires_at > now()
            AND used_at IS NULL
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`
    );
    const rows = (result as any).rows as Array<{ id: number }>;
    const token = rows[0];
    if (!token) return false;
    await tx.execute(sql`UPDATE phone_otp_tokens SET used_at = now() WHERE id = ${token.id}`);
    await tx.execute(sql`UPDATE owner_applications
      SET phone_verified = true, phone_verified_at = now() WHERE id = ${applicationId}`);
    return true;
  });
}

router.post(["/send-phone-otp", "/owner/send-otp"], async (req, res) => {
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

    await createPhoneOtp(app.phone);

    return res.json({ ok: true, maskedPhone: maskPhone(app.phone) });
  } catch (err) {
    console.error("[send-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إرسال الرمز" });
  }
});

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{2})\d+(\d{3})$/, "$1*****$2");
}

router.post("/verify-phone-otp", async (req, res) => {
  const { email, phone, code } = req.body ?? {};
  if ((!email && !phone) || !code) return res.status(400).json({ error: "البريد أو رقم الجوال والرمز مطلوبان" });
  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);
  const cleanCode = normalizePhoneOtp(code);
  if (!/^\d{4}$/.test(cleanCode)) {
    return res.status(400).json({ error: "رمز التحقق يجب أن يكون ٤ أرقام" });
  }
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
    if (app.phone_verified) return res.status(403).json({ error: "الجوال موثّق مسبقاً، يرجى تسجيل الدخول بكلمة المرور" });

    const valid = await verifyAndConsumePhoneOtp(app.id, app.phone, cleanCode);
    if (!valid) return res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });

    const sessionResult = await issueVerifiedOwnerSession(req, res, app.id);
    if (!sessionResult.ok) {
      return res.status(403).json({ error: "تعذّر اعتماد التوثيق، يرجى تسجيل الدخول مجدداً" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[verify-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء التحقق" });
  }
});

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

    await createPhoneOtp(app.phone);

    return res.json({ ok: true, maskedPhone: maskPhone(app.phone) });
  } catch (err) {
    console.error("[resend-phone-otp]", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إعادة الإرسال" });
  }
});

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

    await createPhoneOtp(newPhoneClean);
    res.json({ ok: true, maskedPhone: maskPhone(newPhoneClean) });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء تحديث رقم الجوال" });
  }
});

router.delete("/owner-account", async (req, res): Promise<void> => {
  const { email, phone } = req.body ?? {};
  if (!email && !phone) {
    res.status(400).json({ error: "البريد الإلكتروني أو رقم الجوال مطلوب للحذف" });
    return;
  }

  const emailLower = String(email ?? "").trim().toLowerCase();
  const phoneClean = normalizePhone(phone);

  try {
    let result;
    if (emailLower) {
      result = await db.execute(
        sql`DELETE FROM owner_applications WHERE LOWER(email) = LOWER(${emailLower}) RETURNING id`
      );
    } else {
      result = await db.execute(
        sql`DELETE FROM owner_applications WHERE phone = ${phoneClean} RETURNING id`
      );
    }

    const deletedRows = (result as any).rows;
    if (!deletedRows || deletedRows.length === 0) {
      res.status(404).json({ error: "لم يتم العثور على الحساب المراد حذفه" });
      return;
    }

    if (phoneClean) {
      await db.execute(sql`DELETE FROM phone_otp_tokens WHERE phone = ${phoneClean}`).catch(() => {});
    }
    if (emailLower) {
      await db.execute(sql`DELETE FROM owner_otp_tokens WHERE email = ${emailLower}`).catch(() => {});
    }

    res.json({ ok: true, message: "تم حذف الحساب نهائياً بنجاح، يمكنك التسجيل من جديد" });
  } catch (err) {
    res.status(500).json({ error: "حدث خطأ أثناء حذف الحساب" });
  }
});

router.get("/admin/applications", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, full_name, business_name, business_type, phone, email,
                 status, docs_status, email_verified, created_at
          FROM owner_applications ORDER BY created_at DESC`
    );
    return res.json((result as any).rows);
  } catch (err) {
    return res.status(500).json({ error: "حدث خطأ" });
  }
});

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

router.patch("/admin/applications/:id/manual-verify", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
  await db.execute(
    sql`UPDATE owner_applications SET email_verified = true, email_verified_at = now() WHERE id = ${id}`
  );
  return res.json({ ok: true });
});

export default router;
