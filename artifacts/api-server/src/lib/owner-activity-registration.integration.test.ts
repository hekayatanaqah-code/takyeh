import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { includeOwnerActivityKind } from "./owner-activity-registration";

after(async () => { await pool.end(); });

test("cross-kind registration promotes only its owner, and same-kind registration preserves classification", async () => {
  const rollback = new Error("rollback activity verification");
  for (const [before, kind, expected] of [
    ["chalet", "service", "both"],
    ["service", "chalet", "both"],
    ["property_owner", "service", "both"],
    ["chalet", "chalet", "chalet"],
    ["service", "service", "service"],
    ["both", "service", "both"],
  ] as const) {
    await assert.rejects(db.transaction(async (tx) => {
      const created = await tx.execute<{ id: number }>(sql`
        INSERT INTO owner_applications (full_name,business_name,business_type,phone,password_hash)
        VALUES ('تحقق مؤقت',${randomUUID()},${before},${`05${String(randomInt(100_000_000)).padStart(8, "0")}`},'')
        RETURNING id
      `);
      const id = created.rows[0].id;
      await includeOwnerActivityKind(tx, `owner_${id}`, kind);
      const result = await tx.execute<{ business_type: string }>(sql`
        SELECT business_type FROM owner_applications WHERE id=${id}
      `);
      assert.equal(result.rows[0].business_type, expected);
      // An unrelated owner must not change this account's classification.
      await includeOwnerActivityKind(tx, `unrelated-${randomUUID()}`, kind === "chalet" ? "service" : "chalet");
      const unchanged = await tx.execute<{ business_type: string }>(sql`
        SELECT business_type FROM owner_applications WHERE id=${id}
      `);
      assert.equal(unchanged.rows[0].business_type, expected);
      throw rollback;
    }), error => error === rollback);
  }
});
