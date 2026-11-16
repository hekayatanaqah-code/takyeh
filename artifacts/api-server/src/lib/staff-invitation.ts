import { randomBytes } from "node:crypto";
import { db, ownerStaffTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hashRecoveryToken, makePasswordResetUrl } from "./passwordRecovery";
import { normalizeTaqnyatPhone, sendTaqnyatTemplate } from "../../../../taqnyatWhatsApp.js";

export const STAFF_INVITE_TTL = 24 * 60 * 60 * 1000;
export const STAFF_INVITE_TARGET = "owner_staff_invite";

export function staffInvitationsConfigured() {
  return Boolean(process.env.TAQNYAT_API_KEY);
}

/** Only the hash is persisted. The bearer link is never returned to the owner or logged. */
export async function inviteOwnerStaff(
  staffId: number,
  ownerId: string,
  ownerName: string,
  dependencies = { database: db, send: sendTaqnyatTemplate },
): Promise<"accepted" | "failed" | "unavailable" | "not_pending" | "cooldown"> {
  const database = dependencies.database;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashRecoveryToken(token);
  const issued = await database.transaction(async tx => {
    const [staff] = await tx.select().from(ownerStaffTable)
      .where(and(eq(ownerStaffTable.id, staffId), eq(ownerStaffTable.ownerId, ownerId)))
      .for("update");
    if (!staff?.isActive || staff.passwordHash || !staff.username?.startsWith("staff_")) return "not_pending" as const;
    const phone = normalizeTaqnyatPhone(staff.phoneNum || "");
    if (!phone) return "unavailable" as const;
    // Serialize resends, including concurrent clicks. Every new link revokes its predecessor.
    const recent = await tx.execute(sql`
      SELECT id FROM password_reset_tokens
      WHERE target_type = ${STAFF_INVITE_TARGET} AND target_id = ${String(staffId)}
        AND expires_at > ${new Date(Date.now() + STAFF_INVITE_TTL - 60_000)}
      LIMIT 1`);
    if (recent.rows.length) return "cooldown" as const;
    await tx.execute(sql`UPDATE password_reset_tokens SET used = true
      WHERE target_type = ${STAFF_INVITE_TARGET} AND target_id = ${String(staffId)} AND used = false`);
    await tx.execute(sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES (${STAFF_INVITE_TARGET}, ${String(staffId)}, ${tokenHash}, ${new Date(Date.now() + STAFF_INVITE_TTL)})`);
    return { phone, name: staff.name };
  });
  if (typeof issued === "string") return issued;
  const url = new URL(makePasswordResetUrl(token, "public"));
  url.searchParams.set("invite", "staff");
  try {
    const result = await dependencies.send(issued.phone, "owner_staff_invite",
      [issued.name, ownerName, url.toString()], "ar");
    if (result.success) return "accepted";
  } catch {
    // Keep the employee visibly pending, never create a usable password on delivery failure.
  }
  await database.execute(sql`UPDATE password_reset_tokens SET used = true WHERE token = ${tokenHash}`);
  return "failed";
}
