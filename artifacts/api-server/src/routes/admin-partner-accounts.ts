import { Router } from "express";
import { lockResource } from "@workspace/db/transaction-lock";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeRolePhone } from "../lib/role-login";
import { ownerSecurityNotification, ownerPasswordChangedMessage, type OwnerSecuritySender } from "../lib/owner-security-notification";

const router = Router();
const target = z.object({ kind: z.enum(["owner", "photographer"]), id: z.coerce.number().int().positive() });
const profile = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).refine(value => !!normalizeRolePhone(value)),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).transform(value => value.toLowerCase()),
}).strict();
const password = z.object({
  password: z.string().min(10).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72),
  reason: z.string().trim().min(5).max(500).optional(),
}).strict();

// Parent admin middleware enforces userManagement and persists audit intent.
router.use((req, res, next) => {
  if (req.method === "GET") return next();
  try {
    const host = req.get("x-forwarded-host")?.split(",")[0].trim() || req.get("host");
    if (!req.get("origin") || new URL(req.get("origin")!).host !== host) throw new Error("origin");
  } catch { return res.status(403).json({ error: "طلب غير مسموح من خارج المنصة" }); }
  next();
});

router.get("/photographers", async (_req, res) => {
  const rows = await db.execute(sql`SELECT id, name, whatsapp AS phone, email, status,
    (password_hash IS NOT NULL) AS "canResetPassword" FROM photographers ORDER BY id DESC`);
  res.json(rows.rows);
});

router.patch("/:kind/:id", async (req, res) => {
  const parsed = target.safeParse(req.params), body = profile.safeParse(req.body);
  if (!parsed.success || !body.success) return res.status(400).json({ error: "أدخل اسماً صحيحاً وجوالاً سعودياً وبريداً صالحاً أو اترك البريد فارغاً" });
  const { kind, id } = parsed.data;
  if (kind === "owner") return res.status(403).json({ error: "البيانات الشخصية للمالك لا يعدلها إلا المالك من داخل حسابه" });
  const { name, email } = body.data;
  const national = normalizeRolePhone(body.data.phone);
  try {
    const found = await db.transaction(async tx => {
      // Same-role contacts must remain unambiguous; cross-role sharing is valid.
      await lockResource(tx, "identity", `partner:${kind}:phone:${national}`);
      if (email) await lockResource(tx, "identity", email.toLowerCase());
      const table = sql`photographers`;
      const phoneColumn = sql`whatsapp`;
      const existing = await tx.execute(sql`SELECT id FROM ${table} WHERE id=${id}
        FOR UPDATE`);
      if (!existing.rows.length) return false;
      const duplicates = await tx.execute(sql`SELECT id FROM ${table} WHERE id<>${id}
        AND ((${email}<>'' AND LOWER(email)=${email}) OR
          regexp_replace(regexp_replace(translate(${phoneColumn}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '')=${national})
        LIMIT 1`);
      if (duplicates.rows.length) throw new Error("PARTNER_DUPLICATE");
      await tx.execute(sql`UPDATE photographers SET name=${name}, whatsapp=${`966${national}`}, email=${email} WHERE id=${id}`);
      return true;
    });
    return found ? res.json({ ok: true }) : res.status(404).json({ error: "الحساب غير موجود" });
  } catch (error) {
    if (error instanceof Error && error.message === "PARTNER_DUPLICATE"
      || (error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "الجوال أو البريد مستخدم لحساب آخر من الدور نفسه؛ يمكن مشاركته بين المالك والمصور" });
    }
    throw error;
  }
});

router.post("/:kind/:id/password", async (req, res) => {
  const parsed = target.safeParse(req.params), body = password.safeParse(req.body);
  if (!parsed.success || !body.success) return res.status(400).json({ error: "كلمة المرور مطلوبة: ١٠ أحرف على الأقل، وبحد أقصى ٧٢ بايت" });
  const { kind, id } = parsed.data;
  let sender: OwnerSecuritySender | null = null;
  if (kind === "owner") {
    if (!body.data.reason) return res.status(400).json({ error: "سبب التغيير مطلوب للحالات الطارئة (٥–٥٠٠ حرف)" });
    res.locals.adminAuditDetails = { reason: body.data.reason, targetAccount: { kind, id } };
    try { sender = await ownerSecurityNotification.prepare(); } catch { /* fail closed */ }
    if (!sender) {
      res.locals.adminAuditDetails.whatsappNotification = { status: "unavailable" };
      return res.status(503).json({ error: "إعادة التعيين متوقفة حتى ربط تنبيه واتساب الأمني. لم تُغيّر كلمة المرور." });
    }
    if (!Number.isInteger(res.locals.adminAuditId)) return res.status(503).json({ error: "تعذر توثيق العملية؛ لم تُغيّر كلمة المرور" });
  }
  const hash = await bcrypt.hash(body.data.password, 12);
  let result: string;
  try { result = await db.transaction(async tx => {
    if (kind === "photographer") {
      const row = await tx.execute(sql`SELECT id, password_hash FROM photographers WHERE id=${id} FOR UPDATE`);
      if (!row.rows.length) return "missing";
      if (!row.rows[0].password_hash) return "incomplete";
      await tx.execute(sql`UPDATE photographers SET password_hash=${hash} WHERE id=${id}`);
      await tx.execute(sql`DELETE FROM photographer_sessions WHERE photographer_id=${id}`);
      await tx.execute(sql`DELETE FROM password_reset_tokens WHERE target_type='photographer' AND target_id=${String(id)}`);
    } else {
      const row = await tx.execute<{ id: number; full_name: string; phone: string }>(sql`SELECT id, full_name, phone FROM owner_applications WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`);
      if (!row.rows.length) return "missing";
      const owner = row.rows[0];
      const destination = normalizeRolePhone(owner.phone);
      if (!destination) return "invalid_phone";
      res.locals.adminAuditDetails = {
        reason: body.data.reason,
        targetAccount: { kind, id, name: owner.full_name },
        whatsappNotification: { status: "pending" },
      };
      // Persist the reason and exact target in the SAME transaction as the
      // credential change; the write-ahead actor and timestamp already exist.
      const audit = await tx.execute(sql`UPDATE admin_audit_logs
        SET metadata=metadata || ${JSON.stringify(res.locals.adminAuditDetails)}::jsonb
        WHERE id=${res.locals.adminAuditId} RETURNING id`);
      if (!audit.rows.length) throw new Error("OWNER_RESET_AUDIT_MISSING");
      // A trusted administrative reset is manual account recovery, not a new signup.
      await tx.execute(sql`UPDATE owner_applications SET password_hash=${hash}, email_verified=true WHERE id=${id}`);
      await tx.execute(sql`DELETE FROM sessions WHERE sess->>'access_token'='owner_password_auth'
        AND (sess->>'ownerApplicationId'=${String(id)} OR sess->'user'->>'id'=${`owner_${id}`} OR
          sess->'user'->>'id' IN (SELECT user_id FROM owner_account_links WHERE owner_application_id=${id} AND user_id !~ '^owner_[0-9]+$'))`);
      await tx.execute(sql`DELETE FROM password_reset_tokens WHERE target_type='owner_application' AND target_id=${String(id)}`);
      try {
        // Emergency-only operation. A rejected/unconfirmed send rolls the
        // transaction back rather than changing a password without a notice.
        const notice = await sender!.send({ to: `966${destination}`, body: ownerPasswordChangedMessage });
        if (!notice.messageId?.trim()) throw new Error("Missing provider acknowledgement");
        res.locals.adminAuditDetails.whatsappNotification = { status: "accepted", messageId: notice.messageId.slice(0, 200) };
        await tx.execute(sql`UPDATE admin_audit_logs SET metadata=metadata ||
          ${JSON.stringify(res.locals.adminAuditDetails)}::jsonb WHERE id=${res.locals.adminAuditId}`);
      } catch {
        res.locals.adminAuditDetails.whatsappNotification = { status: "unconfirmed" };
        throw new Error("OWNER_SECURITY_NOTICE_FAILED");
      }
    }
    return "ok";
  }); } catch (error) {
    if (error instanceof Error && error.message === "OWNER_SECURITY_NOTICE_FAILED") return res.status(502).json({ error: "تعذر تأكيد إرسال تنبيه واتساب؛ لم تُغيّر كلمة المرور" });
    throw error;
  }
  if (result === "missing") return res.status(404).json({ error: "الحساب غير موجود" });
  if (result === "incomplete") return res.status(409).json({ error: "يجب أن يكمل المصور التسجيل وقبول العقد أولاً" });
  if (result === "invalid_phone") return res.status(409).json({ error: "يجب أن يصحح المالك رقم جواله من حسابه قبل إعادة التعيين" });
  return res.json({ ok: true });
});

export default router;
