import { Router } from "express";
import { db } from "@workspace/db";
import { adminStaffTable, ownerStaffTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sql } from "drizzle-orm";

const router = Router();

const TOKEN_TTL_MS = 60 * 60 * 1000; // ١ ساعة

/* ── POST /forgot-password ──────────────────────────────────
   Accepts: { identifier: string, portalType: "admin"|"public" }
   Generates a reset token stored in password_reset_tokens.
   Logs the reset URL to the console (email delivery can be
   wired in when an SMTP provider is configured).
   ─────────────────────────────────────────────────────────── */
router.post("/forgot-password", async (req, res) => {
  const { identifier, portalType } = req.body ?? {};
  if (!identifier?.trim()) {
    return res.status(400).json({ error: "يرجى إدخال البريد الإلكتروني أو اسم المستخدم" });
  }

  const id = String(identifier).trim();

  /* Determine which table to look in based on portal type */
  let targetId: string | null = null;
  let targetType: string      = "owner_staff";

  if (portalType === "admin") {
    /* Look in admin_staff by username or email */
    const [admin] = await db.execute<{ id: number }>(
      sql`SELECT id FROM admin_staff WHERE username = ${id} OR email = ${id} LIMIT 1`
    );
    if (admin) { targetId = String(admin.id); targetType = "admin_staff"; }
  } else {
    /* Look in owner_staff by username */
    const [staff] = await db
      .select({ id: ownerStaffTable.id })
      .from(ownerStaffTable)
      .where(eq(ownerStaffTable.username, id));
    if (staff) { targetId = String(staff.id); targetType = "owner_staff"; }
  }

  /* Always respond with success (don't reveal if account exists) */
  if (targetId) {
    const token  = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + TOKEN_TTL_MS);

    await db.execute(
      sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
          VALUES (${targetType}, ${targetId}, ${token}, ${expires})
          ON CONFLICT (token) DO NOTHING`
    );

    /* 📧 TODO: Replace with real email delivery when SMTP is configured */
    const resetUrl = `${req.headers.origin ?? ""}/reset-password?token=${token}`;
    console.log(`[Password Reset] URL for ${id}: ${resetUrl}`);
  }

  return res.json({ ok: true });
});

/* ── POST /reset-password ───────────────────────────────────
   Accepts: { token: string, newPassword: string }
   Validates the token, updates the password, marks used.
   ─────────────────────────────────────────────────────────── */
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: "بيانات غير مكتملة" });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل" });
  }

  const [row] = await db.execute<{
    id: number; target_type: string; target_id: string; expires_at: Date; used: boolean;
  }>(sql`SELECT * FROM password_reset_tokens WHERE token = ${String(token)} LIMIT 1`);

  if (!row || row.used || new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: "الرابط منتهي الصلاحية أو تم استخدامه مسبقاً" });
  }

  const hash = await bcrypt.hash(String(newPassword), 10);

  if (row.target_type === "admin_staff") {
    await db.execute(
      sql`UPDATE admin_staff SET password_hash = ${hash} WHERE id = ${Number(row.target_id)}`
    );
  } else {
    await db.execute(
      sql`UPDATE owner_staff SET password_hash = ${hash} WHERE id = ${Number(row.target_id)}`
    );
  }

  /* Mark token as used */
  await db.execute(
    sql`UPDATE password_reset_tokens SET used = true WHERE id = ${row.id}`
  );

  return res.json({ ok: true });
});

export default router;
