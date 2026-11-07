import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { is, sql } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import * as tables from "@workspace/db/mariadb/schema";
import * as contracts from "@workspace/db/mariadb/application-schema";

test("all native models read the imported schema plus the explicit additive application migration", { timeout: 30000 }, async () => {
  const socketPath = process.env.MARIADB_TEST_SOCKET;
  assert.ok(socketPath && process.env.NODE_ENV !== "production", "Local test socket required.");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const exports = path.join(root, ".local/mariadb-exports");
  const directories = (await readdir(exports, { withFileTypes: true }))
    .filter(item => item.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(item.name)).map(item => item.name).sort();
  assert.ok(directories.length, "Generate a private schema export first.");
  const schema = await readFile(path.join(exports, directories.at(-1)!, "schema.sql"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(exports, directories.at(-1)!, "manifest.json"), "utf8"));
  // The fixture imports schema only, never administrative seed/accounts.
  assert.doesNotMatch(schema, /^\s*(?:USE|DROP|TRUNCATE|GRANT|INSERT|UPDATE|DELETE)\b/im);
  const extension = await readFile(path.join(root, "lib/db/src/mariadb/001-application-contract.sql"), "utf8");
  const database = `takyeh_models_test_${randomBytes(6).toString("hex")}`;
  const control = await mysql.createConnection({ socketPath, user: "root", charset: "utf8mb4", multipleStatements: true });
  let target: ReturnType<typeof createMariaDbConnection> | undefined;
  try {
    await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    await control.query(`USE \`${database}\``);
    await control.query(schema);
    await control.query(extension);
    target = createMariaDbConnection({ socketPath, database, user: "root" });
    await target.verifyTarget();
    let count = 0;
    for (const table of Object.values(tables)) {
      if (!is(table, MySqlTable)) continue;
      assert.deepEqual(await target.db.select().from(table).limit(1), []);
      count++;
    }
    assert.equal(count, manifest.tableCount);
    const [calendar] = await target.db.select({
      day: sql<string>`CAST('2026-11-07' AS DATE)`.mapWith(tables.quickSalesTable.dateStr),
    }).from(sql`(SELECT 1) AS calendar_probe`);
    assert.equal(calendar.day, "2026-11-07", "calendar dates remain date-only strings");
    for (const table of Object.values(contracts)) {
      if (is(table, MySqlTable)) assert.deepEqual(await target.db.select().from(table).limit(1), []);
    }
    for (const schema of [contracts.insertChaletSchema, contracts.insertSubmissionSchema]) {
      for (const column of ["amenities", "photos"] as const) {
        const field = schema.shape[column];
        if (!field) continue;
        assert.equal(field.safeParse(["مرفق عربي"]).success, true);
        assert.equal(field.safeParse({ invalid: true }).success, false);
        assert.equal(field.safeParse([42]).success, false);
      }
    }
  } finally {
    await target?.close();
    await control.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await control.end();
  }
});
