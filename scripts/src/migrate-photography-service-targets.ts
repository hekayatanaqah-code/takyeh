import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/photography-service-targets.sql", import.meta.url), "utf8"));
  process.stdout.write("Applied photography service targets; historical property bookings preserved.\n");
} finally { await pool.end(); }
