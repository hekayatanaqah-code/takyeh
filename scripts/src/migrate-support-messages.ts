import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";

try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/support-messages.sql", import.meta.url), "utf8"));
} finally {
  await pool.end();
}
