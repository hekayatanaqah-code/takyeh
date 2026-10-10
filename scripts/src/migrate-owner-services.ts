import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/owner-services.sql", import.meta.url), "utf8"));
  process.stdout.write("Applied additive owner-services schema; existing cards and photography state preserved.\n");
} finally { await pool.end(); }
