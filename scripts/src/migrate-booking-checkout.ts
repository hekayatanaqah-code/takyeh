import { pool } from "@workspace/db";
import { bookingCheckoutAt, type StayTimes } from "@workspace/booking-time";
import { fileURLToPath } from "node:url";

// Run once BEFORE starting the new API. All DDL and pins commit together.
// Re-running is a no-op, including for malformed legacy dates left locked.
export async function migrateBookingCheckout(client: Pick<typeof pool, "query">) {
 try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE owner_bookings, chalets, chalet_submissions IN SHARE ROW EXCLUSIVE MODE");
  const existing = await client.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'owner_bookings' AND column_name = 'checkout_at'`);
  if (existing.rowCount === 0) {
    await client.query("ALTER TABLE owner_bookings ADD COLUMN checkout_at timestamptz");
    const result = await client.query(`SELECT b.id, b.booking_date, b.duration_days, b.period,
      CASE WHEN c.id IS NOT NULL THEN to_jsonb(c) ELSE to_jsonb(s) END AS times
      FROM owner_bookings b
      LEFT JOIN chalet_submissions s ON s.id = b.submission_id
      LEFT JOIN LATERAL (SELECT * FROM chalets WHERE submission_id = b.submission_id ORDER BY id LIMIT 1) c ON true`);
    let unresolved = 0;
    for (const row of result.rows) {
      const raw = row.times ?? {};
      const times: StayTimes = {
        checkInTime: raw.check_in_time, checkOutTime: raw.check_out_time,
        morningCheckIn: raw.morning_check_in, morningCheckOut: raw.morning_check_out,
        eveningCheckIn: raw.evening_check_in, eveningCheckOut: raw.evening_check_out,
        fullDayCheckIn: raw.full_day_check_in, fullDayCheckOut: raw.full_day_check_out,
      };
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.booking_date)
        && Number.isFinite(Date.parse(`${row.booking_date}T00:00:00Z`))
        && new Date(`${row.booking_date}T00:00:00Z`).toISOString().slice(0, 10) === row.booking_date;
      const checkout = validDate ? bookingCheckoutAt({
        bookingDate: row.booking_date, durationDays: row.duration_days, period: row.period,
      }, times) : Number.POSITIVE_INFINITY;
      if (!Number.isFinite(checkout)) { unresolved++; continue; }
      await client.query("UPDATE owner_bookings SET checkout_at = $1 WHERE id = $2", [new Date(checkout), row.id]);
    }
    process.stdout.write(`Pinned departure for ${result.rows.length - unresolved} bookings; ${unresolved} malformed dates remain locked.\n`);
  } else {
    process.stdout.write("Booking departure migration already applied; existing pins unchanged.\n");
  }
  await client.query("COMMIT");
 } catch (error) {
  await client.query("ROLLBACK");
  throw error;
 }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = await pool.connect();
  try {
    await migrateBookingCheckout(client);
  } finally {
    client.release();
    await pool.end();
  }
}
