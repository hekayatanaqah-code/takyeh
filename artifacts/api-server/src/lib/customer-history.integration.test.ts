import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, ownerBookingsTable, serviceAppointmentsTable, serviceProvidersTable } from "@workspace/db";
import { timeMinutes, bookingCheckoutAt } from "@workspace/booking-time";
import { GetOwnerCrmHistoryResponse, GetOwnerCrmProfileResponse } from "@workspace/api-zod";
import { crmTimeMinutes, crmPropertyCheckout, sendCrmHistory, sendCrmProfile } from "./customer-history";

const ownerId = `crm-page-${randomUUID()}`;
const phone = "0500000000";
const ids: number[] = [];
const providerIds: number[] = [];

async function request(handler: typeof sendCrmHistory, query: Record<string, unknown>, user = ownerId) {
  let status = 200;
  let body: any;
  const res = {
    status(value: number) { status = value; return this; },
    setHeader() {},
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  await handler({ query: { phone, ...query }, user: { id: user } } as unknown as Request, res);
  return { status, body };
}

before(async () => {
  const rows = await db.insert(ownerBookingsTable).values(Array.from({ length: 33 }, (_, index) => ({
    ownerId, clientName: "CRM pagination fixture", clientPhone: phone,
    bookingDate: index < 5 ? "2099-01-01" : `2020-01-${String(1 + index % 20).padStart(2, "0")}`,
    durationDays: 1, period: "morning", totalPrice: "100.00",
    contractSigned: true, insuranceFee: "50.00", insuranceReceived: true,
    cancelledAt: index === 0 ? new Date() : null,
  }))).returning({ id: ownerBookingsTable.id });
  ids.push(...rows.map(row => row.id));
  const providers = await db.insert(serviceProvidersTable).values([
    { ownerId, businessName: "CRM fixture", category: "test", city: "test", whatsappNumber: phone },
    { ownerId: `${ownerId}-other`, businessName: "CRM other", category: "test", city: "test", whatsappNumber: phone },
  ]).returning({ id: serviceProvidersTable.id });
  providerIds.push(...providers.map(row => row.id));
  await db.insert(serviceAppointmentsTable).values(Array.from({ length: 24 }, (_, index) => ({
    ownerId, providerId: providerIds[0], clientName: "CRM service fixture", clientPhone: phone,
    dateStr: index < 2 ? "2099-01-01" : "2020-01-01", amount: "100", contractSigned: true,
    insuranceAmount: "50", status: index === 0 ? "cancelled" : "confirmed",
  })));
});
after(async () => {
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, ownerId));
  await db.delete(serviceAppointmentsTable).where(eq(serviceAppointmentsTable.ownerId, ownerId));
  if (providerIds.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  await pool.end();
});

test("summary contains full totals but never an unbounded bookings array", async () => {
  const { status, body } = await request(sendCrmProfile, {});
  assert.equal(status, 200);
  assert.equal(body.totalBookings, 33);
  assert.equal(body.totalRevenue, 3300);
  assert.equal(body.contractCount, 33);
  assert.equal(body.insuranceCount, 33);
  assert.equal(body.lastBookingDate, "2099-01-01");
  assert.equal(body.bookings, undefined);
  assert.equal(GetOwnerCrmProfileResponse.safeParse(body).success, true);
});
test("all tabs have bounded, stable, non-overlapping pages; pinning applies only to bookings", async () => {
  for (const tab of ["bookings", "contracts", "insurance"]) {
    const seen: number[] = [];
    for (let page = 1; page <= 4; page++) {
      const { status, body } = await request(sendCrmHistory, { tab, page: String(page) });
      assert.equal(status, 200);
      assert.equal(body.total, 33);
      assert.equal(body.items.length, page === 4 ? 3 : 10);
      assert.equal(body.page, page);
      assert.equal(body.pageSize, 10);
      assert.equal(body.totalPages, 4);
      assert.equal(GetOwnerCrmHistoryResponse.safeParse(body).success, true);
      const sorted = [...body.items].sort((a, b) =>
        (tab === "bookings" ? Number(b.is_active) - Number(a.is_active) : 0)
        || b.booking_date.localeCompare(a.booking_date) || b.id - a.id);
      assert.deepEqual(body.items, sorted);
      seen.push(...body.items.map((row: any) => row.id));
    }
    assert.equal(new Set(seen).size, 33);
    if (tab === "bookings") assert(!seen.slice(0, 4).includes(ids[0]), "cancelled future booking cannot be pinned");
  }
});
test("search covers records outside the first page and normalizes Arabic digits", async () => {
  const id = ids[6];
  const arabic = String(id).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const { body } = await request(sendCrmHistory, { search: `#${arabic}` });
  assert(body.items.some((row: any) => row.id === id));
  const date = await request(sendCrmHistory, { search: "٢٠٢٠-٠١-٠٧" });
  assert.equal(date.body.total, 2);
  assert(date.body.items.every((row: any) => row.booking_date === "2020-01-07"));
});
test("state, tab and date filters apply before pagination, including empty and excessive pages", async () => {
  assert.equal((await request(sendCrmHistory, { status: "active" })).body.total, 4);
  assert.equal((await request(sendCrmHistory, { status: "completed" })).body.total, 28);
  assert.equal((await request(sendCrmHistory, { status: "cancelled" })).body.total, 1);
  const clamped = await request(sendCrmHistory, { tab: "insurance", page: "99999" });
  assert.equal(clamped.body.page, 4);
  const range = await request(sendCrmHistory, { from: "2099-01-01", to: "2099-01-01" });
  assert.equal(range.body.total, 5);
  const empty = await request(sendCrmHistory, { search: "no-such-booking" });
  assert.equal(empty.body.total, 0);
  assert.equal(empty.body.page, 1);
  assert.deepEqual(empty.body.items, []);
});
test("invalid filters are rejected, and owner/provider/customer scopes cannot leak", async () => {
  for (const query of [{ page: "0" }, { tab: "bad" }, { from: "2026-02-30" }, { from: "2026-10-20", to: "2026-10-10" }]) {
    assert.equal((await request(sendCrmHistory, query)).status, 400);
  }
  assert.equal((await request(sendCrmHistory, {}, `${ownerId}-other`)).body.total, 0);
  assert.equal((await request(sendCrmProfile, {}, `${ownerId}-other`)).status, 404);
  assert.equal((await request(sendCrmHistory, { providerId: String(providerIds[1]) })).status, 404);
  assert.equal((await request(sendCrmHistory, { phone: "0599999999" })).body.total, 0);
});
test("service histories are paginated and contract/insurance records stay provider-scoped", async () => {
  for (const tab of ["bookings", "contracts", "insurance"]) {
    const { body } = await request(sendCrmHistory, { providerId: String(providerIds[0]), tab, page: "3" });
    assert.equal(body.total, 24);
    assert.equal(body.items.length, 4);
  }
  const active = await request(sendCrmHistory, { providerId: String(providerIds[0]), status: "active" });
  assert.equal(active.body.total, 1);
  const summary = await request(sendCrmProfile, { providerId: String(providerIds[0]) });
  assert.equal(summary.body.totalRevenue, 2300);
  const cancelled = await request(sendCrmHistory, { providerId: String(providerIds[0]), status: "cancelled" });
  assert.equal(cancelled.body.items[0].cancelled, true);
});
test("SQL stored-time parsing agrees with the authoritative JavaScript parser", async () => {
  for (const value of ["٦ ص", "٠٥:٣٠ م", "12:00 am", "12:00 pm", "23:59", "bad", "24:00", "0 ص", "12:60", "١٨:١٥", "۹:۰۵ am", "١٢ م"]) {
    const result = await db.execute(sql`SELECT ${crmTimeMinutes(sql`${value}::text`)} AS minutes`);
    assert.equal(result.rows[0].minutes, timeMinutes(value), value);
  }
});
test("SQL pinning uses the same checkout boundary as the existing completion rules", async () => {
  const cases = [
    { period: "morning", durationDays: 1, times: { morningCheckIn: "٦ ص", morningCheckOut: "٤ م" } },
    { period: "evening", durationDays: 2, times: { eveningCheckIn: "٤ م", eveningCheckOut: "٦ ص" } },
    { period: "full_day", durationDays: 1, times: { checkInTime: "٤ م", checkOutTime: "٤ م" } },
    { period: null, durationDays: 1, times: {} },
  ];
  for (const fixture of cases) {
    const columns = (live: boolean) => sql`SELECT ${live ? 1 : null}::int AS id, 1 AS submission_id,
      ${fixture.times.morningCheckIn ?? null}::text AS morning_check_in, ${fixture.times.morningCheckOut ?? null}::text AS morning_check_out,
      ${fixture.times.eveningCheckIn ?? null}::text AS evening_check_in, ${fixture.times.eveningCheckOut ?? null}::text AS evening_check_out,
      NULL::text AS full_day_check_in, NULL::text AS full_day_check_out,
      ${fixture.times.checkInTime ?? null}::text AS check_in_time, ${fixture.times.checkOutTime ?? null}::text AS check_out_time`;
    const now = new Date("2026-10-17T12:00:00Z");
    const result = await db.execute(sql`WITH b AS (SELECT '2026-10-17'::text AS booking_date, 1 AS submission_id,
      ${fixture.period}::text AS period, ${fixture.durationDays}::int AS duration_days),
      chalets AS (${columns(true)}), chalet_submissions AS (${columns(false)})
      SELECT extract(epoch FROM stay.checkout_at)::float8 * 1000 AS checkout FROM b ${crmPropertyCheckout(now)}`);
    assert.equal(result.rows[0].checkout, bookingCheckoutAt({ bookingDate: "2026-10-17", ...fixture }, fixture.times));
  }
});
