import { randomBytes } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { hashRecoveryToken, makeStaffActivationUrl } from "./passwordRecovery";
import { normalizeTaqnyatPhone, sendTaqnyatTemplate } from "../../../../taqnyatWhatsApp.js";

export const STAFF_INVITE_TTL = 24 * 60 * 60 * 1000;
export const STAFF_INVITE_TARGET = "owner_staff_invite";
export const ADMIN_INVITE_TARGET = "admin_staff_invite";
// Provider template names are independent of the stored activation-token target.
export const ADMIN_INVITE_TEMPLATE = "owner_staff_invite";
type Dependencies = { database: typeof db; send: typeof sendTaqnyatTemplate };
type InvitationResult = "accepted" | "failed" | "unavailable" | "not_pending" | "cooldown";
const defaults: Dependencies = { database: db, send: sendTaqnyatTemplate };

/** Only hashes are persisted. Links are never returned to the inviter or logged. */
async function inviteStaff(
  kind: "owner" | "admin", staffId: number, ownerId: string | undefined,
  ownerName: string | undefined, dependencies: Dependencies,
): Promise<InvitationResult> {
  const database = dependencies.database;
  const target = kind === "owner" ? STAFF_INVITE_TARGET : ADMIN_INVITE_TARGET;
  const table = sql.identifier(kind === "owner" ? "owner_staff" : "admin_staff");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashRecoveryToken(token);
  const issued = await database.transaction(async tx => {
    const result = await tx.execute<{
      name: string; phone: string; username: string; password_hash: string | null; is_active: boolean;
    }>(sql`SELECT name, username, password_hash, is_active,
      ${sql.identifier(kind === "owner" ? "phone_num" : "mobile")} AS phone
      FROM ${table} WHERE id = ${staffId} AND ${kind === "owner"
        ? sql`owner_id = ${ownerId}` : sql`is_super_admin = false`} FOR UPDATE`);
    const staff = result.rows[0];
    if (!staff?.is_active || staff.password_hash || !staff.username) return "not_pending" as const;
    const phone = normalizeTaqnyatPhone(staff.phone || "");
    if (!phone) return "unavailable" as const;
    const recent = await tx.execute(sql`SELECT id FROM password_reset_tokens
      WHERE target_type = ${target} AND target_id = ${String(staffId)}
        AND expires_at > ${new Date(Date.now() + STAFF_INVITE_TTL - 60_000)} LIMIT 1`);
    if (recent.rows.length) return "cooldown" as const;
    await tx.execute(sql`UPDATE password_reset_tokens SET used = true
      WHERE target_type = ${target} AND target_id = ${String(staffId)} AND used = false`);
    await tx.execute(sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES (${target}, ${String(staffId)}, ${tokenHash}, ${new Date(Date.now() + STAFF_INVITE_TTL)})`);
    return { phone, name: staff.name };
  });
  if (typeof issued === "string") return issued;
  const url = makeStaffActivationUrl(token, kind === "admin" ? "admin" : "public");
  try {
    const parameters = kind === "admin"
      ? [issued.name, url] : [issued.name, ownerName || "إدارة النشاط", url];
    const template = kind === "admin" ? ADMIN_INVITE_TEMPLATE : STAFF_INVITE_TARGET;
    const result = await dependencies.send(issued.phone, template, parameters, "ar");
    if (result.success) return "accepted";
  } catch {
    // A delivery failure never removes the saved employee or gives them usable credentials.
  }
  await database.execute(sql`UPDATE password_reset_tokens SET used = true WHERE token = ${tokenHash}`);
  return "failed";
}

export function inviteOwnerStaff(staffId: number, ownerId: string, ownerName: string, dependencies = defaults) {
  return inviteStaff("owner", staffId, ownerId, ownerName, dependencies);
}
export function inviteAdminStaff(staffId: number, dependencies = defaults) {
  return inviteStaff("admin", staffId, undefined, undefined, dependencies);
}
