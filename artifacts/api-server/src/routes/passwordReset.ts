import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  classifyPublicStaffUsername,
  classifyRecoveryIdentifier,
  createRecoveryRateLimiter,
  hashRecoveryToken,
  isValidRecoveryPassword,
  makePasswordResetUrl,
  normalizeSaudiMobile,
  type RecoveryPortal,
} from "../lib/passwordRecovery";
import {
  createPasswordResetEmailProvider,
  unavailableWhatsAppResetProvider,
  type ResetLinkProvider,
} from "../lib/passwordResetDelivery";

type RecoveryDatabase = typeof db;
type RouteDependencies = {
  database?: RecoveryDatabase;
  emailProvider?: ResetLinkProvider;
  whatsappProvider?: ResetLinkProvider;
};

type ResetTarget = {
  targetType: "owner_application" | "admin_staff" | "owner_staff";
  targetId: string;
  observedPasswordHash: string;
  destination: string;
  channel: "email" | "whatsapp";
};

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_IDENTIFIER_LENGTH = 254;

function requestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function channelUnavailable(res: Response, channel: string) {
  return res.status(503).json({
    ok: false,
    code: "channel_unavailable",
    error: channel === "whatsapp"
      ? "استعادة كلمة المرور عبر واتساب غير متاحة حالياً"
      : "استعادة كلمة المرور عبر البريد الإلكتروني غير متاحة حالياً",
  });
}

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []);
}

async function findOwnerApplicationsByEmail(database: RecoveryDatabase, email: string) {
  const result = await database.execute(sql`
    SELECT id, email, password_hash
    FROM owner_applications
    WHERE LOWER(email) = ${email.toLowerCase()}
  `);
  return readRows<{ id: number; email: string | null; password_hash: string | null }>(result);
}

async function findOwnerApplicationsByPhone(database: RecoveryDatabase, phone: string) {
  const arabicPersianDigits = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
  const westernDigits = "01234567890123456789";
  const suffix = phone.slice(-9);
  const result = await database.execute(sql`
    SELECT id, phone, email, password_hash
    FROM owner_applications
    WHERE RIGHT(
      REGEXP_REPLACE(
        TRANSLATE(COALESCE(phone, ''), ${arabicPersianDigits}, ${westernDigits}),
        '[^0-9]', '', 'g'
      ),
      9
    ) = ${suffix}
  `);
  return readRows<{
    id: number; phone: string | null; email: string | null; password_hash: string | null;
  }>(result).filter(row => normalizeSaudiMobile(String(row.phone ?? "")) === phone);
}

async function findAdminStaff(database: RecoveryDatabase, identifier: string) {
  const result = await database.execute(sql`
    SELECT id, username, email, password_hash
    FROM admin_staff
    WHERE LOWER(username) = ${identifier.toLowerCase()}
       OR LOWER(email) = ${identifier.toLowerCase()}
  `);
  return readRows<{
    id: number; username: string; email: string | null; password_hash: string;
  }>(result);
}

async function findOwnerStaff(database: RecoveryDatabase, username: string) {
  const result = await database.execute(sql`
    SELECT id, username, phone_num, password_hash
    FROM owner_staff
    WHERE LOWER(username) = ${username.toLowerCase()}
  `);
  return readRows<{
    id: number; username: string | null; phone_num: string | null; password_hash: string | null;
  }>(result);
}

async function findRecoveryTarget(
  database: RecoveryDatabase,
  portalType: RecoveryPortal,
  identifier: string,
  kind: "email" | "phone" | "username",
): Promise<ResetTarget | null> {
  if (portalType === "admin") {
    const matches = await findAdminStaff(database, identifier);
    if (matches.length !== 1 || !matches[0]?.password_hash) return null;
    const email = String(matches[0].email ?? "").trim().toLowerCase();
    if (!email) return null;
    return {
      targetType: "admin_staff",
      targetId: String(matches[0].id),
      observedPasswordHash: String(matches[0].password_hash),
      destination: email,
      channel: "email",
    };
  }

  if (kind === "email") {
    const matches = await findOwnerApplicationsByEmail(database, identifier);
    if (matches.length !== 1 || !matches[0]?.password_hash || !matches[0].email) return null;
    return {
      targetType: "owner_application",
      targetId: String(matches[0].id),
      observedPasswordHash: String(matches[0].password_hash),
      destination: String(matches[0].email).trim().toLowerCase(),
      channel: "email",
    };
  }

  if (kind === "phone") {
    const phone = normalizeSaudiMobile(identifier);
    if (!phone) return null;
    const matches = await findOwnerApplicationsByPhone(database, phone);
    if (matches.length !== 1 || !matches[0]?.password_hash || !matches[0].phone) return null;
    return {
      targetType: "owner_application",
      targetId: String(matches[0].id),
      observedPasswordHash: String(matches[0].password_hash),
      destination: phone,
      channel: "whatsapp",
    };
  }

  const matches = await findOwnerStaff(database, identifier);
  if (matches.length !== 1 || !matches[0]?.password_hash || !matches[0].phone_num) return null;
  const phone = normalizeSaudiMobile(matches[0].phone_num);
  if (!phone) return null;
  return {
    targetType: "owner_staff",
    targetId: String(matches[0].id),
    observedPasswordHash: String(matches[0].password_hash),
    destination: phone,
    channel: "whatsapp",
  };
}

async function issueResetToken(
  database: RecoveryDatabase,
  target: ResetTarget,
  tokenHash: string,
  expiresAt: Date,
): Promise<boolean> {
  return database.transaction(async (tx) => {
    let current: unknown;
    const targetId = Number(target.targetId);
    switch (target.targetType) {
      case "owner_application":
        current = await tx.execute(sql`
          SELECT password_hash FROM owner_applications WHERE id = ${targetId} FOR UPDATE
        `);
        break;
      case "admin_staff":
        current = await tx.execute(sql`
          SELECT password_hash FROM admin_staff WHERE id = ${targetId} FOR UPDATE
        `);
        break;
      case "owner_staff":
        current = await tx.execute(sql`
          SELECT password_hash FROM owner_staff WHERE id = ${targetId} FOR UPDATE
        `);
        break;
    }
    const account = readRows<{ password_hash: string | null }>(current)[0];
    if (!account?.password_hash || account.password_hash !== target.observedPasswordHash) return false;

    await tx.execute(sql`
      INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES (${target.targetType}, ${target.targetId}, ${tokenHash}, ${expiresAt})
    `);
    return true;
  });
}

async function consumeAndResetPassword(
  database: RecoveryDatabase,
  tokenHash: string,
  newPasswordHash: string,
): Promise<"consumed" | "invalid"> {
  return database.transaction(async (tx) => {
    /* Lock the target first so concurrent sibling links serialize without
       deadlocking while each transaction revokes the other's token. */
    const identityResult = await tx.execute(sql`
      SELECT target_type, target_id
      FROM password_reset_tokens
      WHERE token = ${tokenHash}
    `);
    const identity = readRows<{ target_type: string; target_id: string }>(identityResult)[0];
    if (!identity || !/^[1-9]\d{0,9}$/.test(identity.target_id)
      || !Number.isSafeInteger(Number(identity.target_id))) return "invalid";

    let lockedTarget: unknown;
    switch (identity.target_type) {
      case "owner_application":
        lockedTarget = await tx.execute(sql`
          SELECT id FROM owner_applications WHERE id = ${Number(identity.target_id)} FOR UPDATE
        `);
        break;
      case "admin_staff":
        lockedTarget = await tx.execute(sql`
          SELECT id FROM admin_staff WHERE id = ${Number(identity.target_id)} FOR UPDATE
        `);
        break;
      case "owner_staff":
        lockedTarget = await tx.execute(sql`
          SELECT id FROM owner_staff WHERE id = ${Number(identity.target_id)} FOR UPDATE
        `);
        break;
      default:
        return "invalid";
    }
    if (readRows<{ id: number }>(lockedTarget).length !== 1) return "invalid";

    const tokenResult = await tx.execute(sql`
      SELECT id, target_type, target_id, expires_at, used
      FROM password_reset_tokens
      WHERE token = ${tokenHash}
      FOR UPDATE
    `);
    const row = readRows<{
      id: number; target_type: string; target_id: string; expires_at: Date | string; used: boolean;
    }>(tokenResult)[0];
    if (!row || row.used || new Date(row.expires_at).getTime() <= Date.now()) return "invalid";
    if (row.target_type !== identity.target_type || row.target_id !== identity.target_id) return "invalid";

    let updated: unknown;
    switch (row.target_type) {
      case "owner_application":
        updated = await tx.execute(sql`
          UPDATE owner_applications SET password_hash = ${newPasswordHash}
          WHERE id = ${Number(row.target_id)}
          RETURNING id
        `);
        break;
      case "admin_staff":
        updated = await tx.execute(sql`
          UPDATE admin_staff SET password_hash = ${newPasswordHash}
          WHERE id = ${Number(row.target_id)}
          RETURNING id
        `);
        break;
      case "owner_staff":
        updated = await tx.execute(sql`
          UPDATE owner_staff SET password_hash = ${newPasswordHash}
          WHERE id = ${Number(row.target_id)}
          RETURNING id
        `);
        break;
      default:
        return "invalid";
    }

    if (readRows<{ id: number }>(updated).length !== 1) return "invalid";

    const consumed = await tx.execute(sql`
      UPDATE password_reset_tokens SET used = true
      WHERE id = ${row.id} AND used = false
      RETURNING id
    `);
    if (readRows<{ id: number }>(consumed).length !== 1) {
      throw new Error("password_reset_token_consumption_failed");
    }

    await tx.execute(sql`
      UPDATE password_reset_tokens SET used = true
      WHERE target_type = ${row.target_type}
        AND target_id = ${row.target_id}
        AND used = false
    `);

    switch (row.target_type) {
      case "owner_application": {
        const ownerApplicationId = Number(row.target_id);
        const legacyOwnerId = `owner_${row.target_id}`;
        await tx.execute(sql`
          DELETE FROM sessions AS session
          WHERE session.sess ->> 'ownerApplicationId' = ${row.target_id}
             OR session.sess #>> '{user,id}' IN (
               SELECT user_id FROM owner_account_links
               WHERE owner_application_id = ${ownerApplicationId}
             )
             OR (
               session.sess ->> 'access_token' = 'owner_password_auth'
               AND (
                 session.sess #>> '{user,id}' = ${legacyOwnerId}
                 OR EXISTS (
                   SELECT 1
                   FROM owner_applications AS owner
                   JOIN users AS auth_user
                     ON LOWER(auth_user.email) = LOWER(owner.email)
                   WHERE owner.id = ${ownerApplicationId}
                     AND auth_user.id = session.sess #>> '{user,id}'
                     AND owner.email IS NOT NULL
                     AND (
                       SELECT COUNT(*) FROM owner_applications AS same_email
                       WHERE LOWER(same_email.email) = LOWER(owner.email)
                     ) = 1
                 )
               )
               AND NOT EXISTS (
                 SELECT 1 FROM owner_account_links AS conflicting_link
                 WHERE conflicting_link.user_id = session.sess #>> '{user,id}'
                   AND conflicting_link.owner_application_id <> ${ownerApplicationId}
               )
             )
        `);
        break;
      }
      case "admin_staff":
        await tx.execute(sql`
          DELETE FROM admin_sessions
          WHERE admin_staff_id = ${Number(row.target_id)}
        `);
        break;
      case "owner_staff":
        await tx.execute(sql`
          DELETE FROM staff_sessions
          WHERE staff_id = ${Number(row.target_id)}
        `);
        break;
    }
    return "consumed";
  });
}

export function createPasswordResetRouter(dependencies: RouteDependencies = {}) {
  const router = Router();
  const database = dependencies.database ?? db;
  const emailProvider = dependencies.emailProvider ?? createPasswordResetEmailProvider();
  const whatsappProvider = dependencies.whatsappProvider ?? unavailableWhatsAppResetProvider;
  const limiter = createRecoveryRateLimiter();

  router.post("/forgot-password", async (req, res) => {
    const { identifier: rawIdentifier, portalType, identifierType } = req.body ?? {};
    if ((identifierType !== undefined && identifierType !== "username")
      || (identifierType === "username" && portalType !== "public")) {
      return res.status(400).json({ error: "نوع المعرّف غير صالح" });
    }
    if ((portalType !== "public" && portalType !== "admin")
      || typeof rawIdentifier !== "string"
      || !rawIdentifier.trim()
      || rawIdentifier.trim().length > MAX_IDENTIFIER_LENGTH) {
      return res.status(400).json({ error: "يرجى إدخال بريد إلكتروني أو رقم جوال صحيح" });
    }

    const cleanIdentifier = rawIdentifier.trim();
    const classified = identifierType === "username"
      ? classifyPublicStaffUsername(cleanIdentifier)
      : classifyRecoveryIdentifier(cleanIdentifier, portalType as RecoveryPortal);
    if (!classified) {
      return res.status(400).json({ error: "يرجى إدخال بريد إلكتروني أو رقم جوال سعودي صحيح" });
    }

    const throttleIdentifier = createHash("sha256")
      .update(`${portalType}:${classified.kind}:${classified.value.toLowerCase()}`)
      .digest("hex");
    const ipHash = createHash("sha256").update(requestIp(req)).digest("hex");
    if (!limiter.allow(ipHash, throttleIdentifier)) {
      return res.status(429).json({ error: "طلبات كثيرة جداً. يرجى المحاولة لاحقاً" });
    }

    const channel = classified.kind === "phone" || (portalType === "public" && classified.kind === "username")
      ? "whatsapp"
      : "email";
    const provider = channel === "email" ? emailProvider : whatsappProvider;
    let sender: Awaited<ReturnType<ResetLinkProvider["prepare"]>>;
    try {
      sender = await provider.prepare();
    } catch {
      sender = null;
    }
    if (!sender) return channelUnavailable(res, channel);

    try {
      const target = await findRecoveryTarget(
        database,
        portalType as RecoveryPortal,
        classified.value,
        classified.kind,
      );
      if (!target || target.channel !== channel) return res.json({ ok: true, channel });

      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashRecoveryToken(token);
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
      const issued = await issueResetToken(database, target, tokenHash, expiresAt);
      if (!issued) return res.json({ ok: true, channel });

      const resetUrl = makePasswordResetUrl(token, portalType as RecoveryPortal);
      try {
        await sender.send(target.destination, resetUrl);
      } catch {
        await database.execute(sql`
          UPDATE password_reset_tokens SET used = true
          WHERE token = ${tokenHash} AND used = false
        `).catch(() => undefined);
        return res.status(503).json({
          ok: false,
          code: "delivery_failed",
          error: "تعذّر إرسال رابط الاستعادة حالياً. يرجى المحاولة لاحقاً",
        });
      }

      return res.json({ ok: true, channel });
    } catch {
      return res.status(500).json({ error: "حدث خطأ أثناء معالجة طلب الاستعادة" });
    }
  });

  router.post("/reset-password", async (req, res) => {
    const { token: rawToken, newPassword } = req.body ?? {};
    if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256
      || typeof newPassword !== "string") {
      return res.status(400).json({ error: "بيانات غير مكتملة" });
    }
    if (!isValidRecoveryPassword(newPassword)) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون ٦ أحرف على الأقل وألا تتجاوز ٧٢ بايتاً" });
    }
    const ipHash = createHash("sha256").update(requestIp(req)).digest("hex");
    if (!limiter.allow(ipHash, createHash("sha256").update(rawToken).digest("hex"))) {
      return res.status(429).json({ error: "طلبات كثيرة جداً. يرجى المحاولة لاحقاً" });
    }

    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);
      const result = await consumeAndResetPassword(database, hashRecoveryToken(rawToken), passwordHash);
      if (result === "invalid") {
        return res.status(410).json({ error: "الرابط منتهي الصلاحية أو تم استخدامه مسبقاً" });
      }

      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "تعذّر تحديث كلمة المرور حالياً" });
    }
  });

  return router;
}

const router = createPasswordResetRouter();
export default router;