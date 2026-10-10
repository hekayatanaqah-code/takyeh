import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  const migration = await readFile(new URL("../../lib/db/migrations/photography.sql", import.meta.url), "utf8");
  await pool.query(migration);
  process.stdout.write("Applied additive photography schema; existing enable state preserved.\n");
} finally { await pool.end(); }
