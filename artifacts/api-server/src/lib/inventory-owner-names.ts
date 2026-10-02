import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/** Administrative display only: use durable identity links, never email matching. */
export async function inventoryOwnerNames(): Promise<Map<string, string>> {
  const result = await db.execute<{ id: number; full_name: string | null; user_id: string | null }>(
    sql`SELECT oa.id, oa.full_name, oal.user_id
        FROM owner_applications oa
        LEFT JOIN owner_account_links oal ON oal.owner_application_id = oa.id`,
  );
  const names = new Map<string, string>();
  for (const row of result.rows) {
    const name = row.full_name?.trim();
    if (!name) continue;
    names.set(`owner_${row.id}`, name);
    if (row.user_id) names.set(row.user_id, name);
  }
  return names;
}