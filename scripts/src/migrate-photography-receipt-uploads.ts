import { readFile } from "node:fs/promises";
import { pool } from "@workspace/db";
try {
  await pool.query(await readFile(new URL("../../lib/db/migrations/photography-receipt-uploads.sql", import.meta.url), "utf8"));
  console.log("Applied additive photography receipt tracking schema; cleanup remains manual and unapproved.");
} finally { await pool.end(); }
