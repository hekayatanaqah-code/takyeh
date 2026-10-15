import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeRolePhone } from "../lib/role-login";

const router = Router();
const target = z.object({ kind: z.enum(["owner", "photographer"]), id: z.coerce.number().int().positive() });
const profile = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).refine(value => !!normalizeRolePhone(value)),
  email: z.union([z.string().trim().email().max(254), z.literal("")]).transform(value => value.toLowerCase()),
}).strict();
const password = z.object({
  password: z.string().min(10).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72),
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
  const { name, email } = body.data;
  const national = normalizeRolePhone(body.data.phone);
  try {
    const found = await db.transaction(async tx => {
      // Same-role contacts must remain unambiguous; cross-role sharing is valid.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`partner:${kind}:phone:${national}`}))`);
      if (email) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(LOWER(${email})))`);
      const table = kind === "owner" ? sql`owner_applications` : sql`photographers`;
      const phoneColumn = kind === "owner" ? sql`phone` : sql`whatsapp`;
      const existing = await tx.execute(sql`SELECT id FROM ${table} WHERE id=${id}
        ${kind === "owner" ? sql`AND deleted_at IS NULL` : sql``} FOR UPDATE`);
      if (!existing.rows.length) return false;
      const duplicates = await tx.execute(sql`SELECT id FROM ${table} WHERE id<>${id}
        AND ((${email}<>'' AND LOWER(email)=${email}) OR
          regexp_replace(regexp_replace(translate(${phoneColumn}, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '')=${national})
        LIMIT 1`);
      if (duplicates.rows.length) throw new Error("PARTNER_DUPLICATE");
      if (kind === "photographer") {
        await tx.execute(sql`UPDATE photographers SET name=${name}, whatsapp=${`966${national}`}, email=${email} WHERE id=${id}`);
      } else {
        await tx.execute(sql`UPDATE owner_applications SET full_name=${name}, phone=${`0${national}`}, email=${email || null} WHERE id=${id}`);
        const links = await tx.execute<{ user_id: string }>(sql`SELECT user_id FROM owner_account_links
          WHERE owner_application_id=${id} AND user_id !~ '^owner_[0-9]+$'`);
        const ownerIds = [`owner_${id}`, ...links.rows.map(row => row.user_id)];
        for (const ownerId of ownerIds) {
          await tx.execute(sql`UPDATE chalet_submissions SET whatsapp_number=${`0${national}`} WHERE owner_id=${ownerId}`);
          await tx.execute(sql`UPDATE chalets SET whatsapp_number=${`0${national}`} WHERE owner_id=${ownerId}`);
          await tx.execute(sql`UPDATE service_provider_submissions SET whatsapp_number=${`0${national}`} WHERE owner_id=${ownerId}`);
          await tx.execute(sql`UPDATE service_providers SET whatsapp_number=${`0${national}`} WHERE owner_id=${ownerId}`);
        }
        // Durable links stay unchanged. Do not attach a different user by email.
      }
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
  const hash = await bcrypt.hash(body.data.password, 12);
  const result = await db.transaction(async tx => {
    if (kind === "photographer") {
      const row = await tx.execute(sql`SELECT id, password_hash FROM photographers WHERE id=${id} FOR UPDATE`);
      if (!row.rows.length) return "missing";
      if (!row.rows[0].password_hash) return "incomplete";
      await tx.execute(sql`UPDATE photographers SET password_hash=${hash} WHERE id=${id}`);
      await tx.execute(sql`DELETE FROM photographer_sessions WHERE photographer_id=${id}`);
      await tx.execute(sql`DELETE FROM password_reset_tokens WHERE target_type='photographer' AND target_id=${String(id)}`);
    } else {
      const row = await tx.execute(sql`SELECT id FROM owner_applications WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`);
      if (!row.rows.length) return "missing";
      // A trusted administrative reset is manual account recovery, not a new signup.
      await tx.execute(sql`UPDATE owner_applications SET password_hash=${hash}, email_verified=true WHERE id=${id}`);
      await tx.execute(sql`DELETE FROM sessions WHERE sess->>'access_token'='owner_password_auth'
        AND (sess->>'ownerApplicationId'=${String(id)} OR sess->'user'->>'id'=${`owner_${id}`} OR
          sess->'user'->>'id' IN (SELECT user_id FROM owner_account_links WHERE owner_application_id=${id} AND user_id !~ '^owner_[0-9]+$'))`);
      await tx.execute(sql`DELETE FROM password_reset_tokens WHERE target_type='owner_application' AND target_id=${String(id)}`);
    }
    return "ok";
  });
  if (result === "missing") return res.status(404).json({ error: "الحساب غير موجود" });
  if (result === "incomplete") return res.status(409).json({ error: "يجب أن يكمل المصور التسجيل وقبول العقد أولاً" });
  return res.json({ ok: true });
});

export default router;
