import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/provider-catalog.sql", import.meta.url), "utf8"));
  process.stdout.write("Applied additive service catalog migration.\n");
} finally {
  await pool.end();
}
