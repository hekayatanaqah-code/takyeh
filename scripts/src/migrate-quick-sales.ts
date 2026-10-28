import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/quick-sales.sql", import.meta.url), "utf8"));
  process.stdout.write("Applied additive quick sales migration.\n");
} finally {
  await pool.end();
}
