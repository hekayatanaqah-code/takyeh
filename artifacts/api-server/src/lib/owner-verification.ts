import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export function hasCompletedOwnerVerification(row: {
  email_verified?: boolean;
  phone_verified?: boolean;
  phone_verified_at?: unknown;
  deleted_at?: unknown;
} | undefined): boolean {
  return !!row && row.email_verified === true && row.phone_verified === true &&
    row.phone_verified_at != null && row.deleted_at == null;
}

export async function isVerifiedOwnerApplication(id: number): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT email_verified, phone_verified, phone_verified_at, deleted_at
    FROM owner_applications WHERE id = ${id} LIMIT 1
  `);
  return hasCompletedOwnerVerification((result as any).rows[0]);
}

export async function ownerVerificationForIdentity(userId: string) {
  const localId = /^owner_(\d+)$/.exec(userId);
  const result = await db.execute(sql`
    SELECT oa.email_verified, oa.phone_verified, oa.phone_verified_at, oa.deleted_at
    FROM owner_applications oa
    LEFT JOIN owner_account_links link ON link.owner_application_id = oa.id
    WHERE link.user_id = ${userId} OR oa.id = ${localId ? Number(localId[1]) : -1}
    LIMIT 1
  `);
  return (result as any).rows[0];
}
