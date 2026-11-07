import { db } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { sqlConcat,sqlText } from "@workspace/db/sql-expressions";

/** Successful cross-kind registration makes both inventories available to the owner. */
export async function includeOwnerActivityKind(
  tx: Pick<typeof db, "execute">,
  ownerId: string,
  kind: "chalet" | "service",
) {
  const opposite = kind === "chalet"
    ? ["service", "services", "service_provider", "provider", "مزود_خدمة", "خدمة", "خدمات"]
    : ["chalet", "property", "property_owner", "owner", "مالك_عقار", "عقار", "شاليه"];
  await tx.execute(sql`
    UPDATE owner_applications
    SET business_type = 'both'
    WHERE ${inArray(sql`lower(replace(replace(trim(business_type), '-', '_'), ' ', '_'))`, opposite)}
      AND (
        ${sqlConcat(sql`'owner_'`,sqlText(sql`id`))} = ${ownerId}
        OR id IN (SELECT owner_application_id FROM owner_account_links WHERE user_id = ${ownerId})
      )
  `);
}
