import { test } from "node:test";
import assert from "node:assert/strict";
import { auditSource } from "./runtime-audit";

test("flags PostgreSQL imports, mutations, locks and SQL result shapes", () => {
  const findings = auditSource("route.ts", [
    'import {db} from "@workspace/db";',
    'await db.insert(table).values({}).returning();',
    'await db.insert(table).values({}).onConflictDoNothing();',
    'await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id})), sum(amount)::text FROM ledger`);',
    'const entries = result.rows;',
  ].join("\n"));
  for (const rule of ["legacy-database-import", "mutation-returning", "postgres-upsert",
    "postgres-advisory-lock", "postgres-cast", "postgres-result-shape"]) {
    assert.ok(findings.some(item => item.rule === rule), rule);
  }
  assert.equal(findings.find(item => item.rule === "postgres-cast")?.line, 4);
});

test("comments and prose do not become SQL findings", () => {
  assert.deepEqual(auditSource("route.ts", [
    '// pg_advisory_xact_lock() and .returning() were removed',
    'const note = "Use ::text in PostgreSQL";',
    'const sql = "documentation only";',
  ].join("\n")), []);
});

test("native MariaDB transaction SQL passes structural scan", () => {
  assert.deepEqual(auditSource("route.ts", [
    'import {drizzle} from "drizzle-orm/mysql2";',
    'await tx.execute(sql`INSERT INTO locks (id) VALUES (${id}) ON DUPLICATE KEY UPDATE id=VALUES(id)`);',
    'await tx.execute(sql`SELECT amount FROM entries WHERE owner_id=${id} FOR UPDATE`);',
  ].join("\n")), []);
});

test("detects dynamic driver imports and SQL features inside interpolated statements", () => {
  const findings = auditSource("route.ts", [
    'const pg = await import("pg");',
    'await db.execute(sql`SELECT ${field} FROM ledger WHERE name ILIKE ${value} ORDER BY created_at NULLS LAST`);',
  ].join("\n"));
  assert.ok(findings.some(item => item.rule === "postgres-driver-or-schema"));
  assert.ok(findings.some(item => item.rule === "postgres-case-insensitive-match"));
  assert.ok(findings.some(item => item.rule === "postgres-null-ordering"));
});
