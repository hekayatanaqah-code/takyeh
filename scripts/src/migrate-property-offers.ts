import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/property-offers.sql", import.meta.url), "utf8"));
  process.stdout.write("Applied additive property offers migration.\n");
} finally {
  await pool.end();
}
