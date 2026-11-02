import assert from "node:assert/strict";
import { test } from "node:test";
import { pool } from "@workspace/db";
import { migrateBookingCheckout } from "./migrate-booking-checkout";

test("atomic additive departure migration preserves history and is idempotent", async () => {
  const client = await pool.connect();
  const schema = `checkout_migration_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE owner_bookings (id int PRIMARY KEY, submission_id int, booking_date text,
        duration_days int, period text, cancelled_at timestamptz, insurance_refunded bool);
      CREATE TABLE chalets (id int PRIMARY KEY, submission_id int, check_in_time text,
        check_out_time text, evening_check_in text, evening_check_out text);
      CREATE TABLE chalet_submissions (id int PRIMARY KEY, check_in_time text, check_out_time text);
      INSERT INTO chalet_submissions VALUES (1, '١٦:٠٠', '١١:٠٠'), (2, '١٤:٠٠', '١٠:٠٠');
      INSERT INTO chalets VALUES (1, 1, NULL, NULL, '٦ م', '٢ ص');
      INSERT INTO owner_bookings VALUES
        (1, 1, '2026-10-16', 2, 'evening', NULL, false),
        (2, 2, '2020-06-15', 1, 'full_day', '2020-06-16T00:00:00Z', true),
        (3, NULL, '2026-10-16', 3, NULL, NULL, false),
        (4, 1, 'not-a-date', 1, 'evening', NULL, false),
        (5, 1, '2026-10-16', 1, 'morning', NULL, false);
    `);
    await migrateBookingCheckout(client);
    const { rows } = await client.query("SELECT * FROM owner_bookings ORDER BY id");
    assert.equal(rows[0].checkout_at.toISOString(), new Date("2026-10-18T02:00:00+03:00").toISOString());
    assert.equal(rows[1].checkout_at.toISOString(), new Date("2020-06-16T10:00:00+03:00").toISOString());
    assert.equal(rows[1].insurance_refunded, true);
    assert(rows[1].cancelled_at);
    assert.equal(rows[2].checkout_at.toISOString(), new Date("2026-10-19T00:00:00+03:00").toISOString());
    assert.equal(rows[3].checkout_at, null);
    // A published property with missing times must not mix in submission times.
    assert.equal(rows[4].checkout_at.toISOString(), new Date("2026-10-17T00:00:00+03:00").toISOString());
    await client.query("UPDATE chalets SET evening_check_out = '١١ م'");
    await migrateBookingCheckout(client);
    assert.deepEqual((await client.query("SELECT * FROM owner_bookings ORDER BY id")).rows, rows);
  } finally {
    await client.query("RESET search_path");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  }
});
