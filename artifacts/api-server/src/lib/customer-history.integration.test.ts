import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool, ownerBookingsTable, serviceAppointmentsTable, serviceProvidersTable } from "@workspace/db";
import { timeMinutes, bookingCheckoutAt, bookingCalendarEndAt } from "@workspace/booking-time";
import { GetOwnerCrmHistoryResponse, GetOwnerCrmProfileResponse, GetOwnerCrmCustomersResponse } from "@workspace/api-zod";
import { crmTimeMinutes, crmPropertyCheckout, sendCrmHistory, sendCrmProfile } from "./customer-history";
import { sendCrmCustomers } from "./customer-directory";

const ownerId = `crm-page-${randomUUID()}`;
const directoryOwner = `${ownerId}-directory`;
const directoryPhone = (index: number) => `050${String(index).padStart(7, "0")}`;
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
  await db.insert(ownerBookingsTable).values([
    ...Array.from({ length: 47 }, (_, index) => ({
      ownerId: directoryOwner, clientName: `عميل قائمة ${index}`, clientPhone: directoryPhone(index),
      bookingDate: index >= 1 && index <= 3 ? "2099-01-01" : `2020-01-${String(1 + index % 20).padStart(2, "0")}`,
      totalPrice: index === 0 ? "5000" : String(100 + index), period: "morning", durationDays: 1,
      cancelledAt: index === 3 ? new Date() : null,
    })),
    ...Array.from({ length: 3 }, () => ({
      ownerId: directoryOwner, clientName: "عميل قائمة 0", clientPhone: directoryPhone(0),
      bookingDate: "2019-01-01", totalPrice: "100", period: "morning", durationDays: 1, cancelledAt: null,
    })),
  ]);
  const directoryProviders = await db.insert(serviceProvidersTable).values([
    { ownerId: directoryOwner, businessName: "CRM directory A", category: "test", city: "test", whatsappNumber: phone },
    { ownerId: directoryOwner, businessName: "CRM directory B", category: "test", city: "test", whatsappNumber: phone },
  ]).returning({ id: serviceProvidersTable.id });
  providerIds.push(...directoryProviders.map(row => row.id));
  await db.insert(serviceAppointmentsTable).values([
    { ownerId: directoryOwner, providerId: providerIds[2], clientName: "عميل قائمة 1", clientPhone: directoryPhone(1), dateStr: "2098-01-01", amount: "600", status: "confirmed" },
    { ownerId: directoryOwner, providerId: providerIds[2], clientName: "عميل خدمة 99", clientPhone: directoryPhone(99), dateStr: "2020-01-01", amount: "400", status: "completed" },
    { ownerId: directoryOwner, providerId: providerIds[3], clientName: "عميل خدمة 98", clientPhone: directoryPhone(98), dateStr: "2099-12-31", amount: "800", status: "confirmed" },
  ]);
});
after(async () => {
  await db.delete(ownerBookingsTable).where(inArray(ownerBookingsTable.ownerId, [ownerId, directoryOwner]));
  await db.delete(serviceAppointmentsTable).where(inArray(serviceAppointmentsTable.ownerId, [ownerId, directoryOwner]));
  if (providerIds.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  await pool.end();
});

const directory = (query: Record<string, unknown> = {}, user = directoryOwner) => request(sendCrmCustomers, query, user);

test("directory returns twenty customers per page with no duplicates and globally ordered activity", async () => {
  const all: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const { status, body } = await directory({ page: String(page) });
    assert.equal(status, 200);
    assert.equal(GetOwnerCrmCustomersResponse.safeParse(body).success, true);
    assert.equal(body.pageSize, 20);
    assert.equal(body.total, 48);
    assert.equal(body.totalCustomers, 48);
    assert.equal(body.totalPages, 3);
    assert.equal(body.items.length, page === 3 ? 8 : 20);
    all.push(...body.items);
  }
  assert.equal(new Set(all.map(row => row.client_phone)).size, 48);
  const sorted = [...all].sort((a, b) => Number(b.has_active) - Number(a.has_active)
    || b.last_booking_date.localeCompare(a.last_booking_date) || a.client_phone.localeCompare(b.client_phone));
  assert.deepEqual(all, sorted);
  assert.equal(all[0].client_phone, directoryPhone(98));
  assert.equal(all.filter(row => row.has_active).length, 3);
  assert(!all.some(row => row.client_phone === directoryPhone(3)), "cancelled property bookings do not introduce directory customers");
});
test("directory applies numeric booking/revenue sorts globally and combines shared customers only once", async () => {
  for (const sort of ["bookings", "revenue"]) {
    const { body } = await directory({ sort });
    assert.equal(body.items[0].client_phone, directoryPhone(0));
    assert.equal(body.items[0].total_bookings, 4);
    assert.equal(body.items[0].total_revenue, 5300);
  }
  const shared = await directory({ search: directoryPhone(1) });
  assert.equal(shared.body.total, 1);
  assert.equal(shared.body.items[0].source, "both");
  assert.equal(shared.body.items[0].total_bookings, 2);
  assert.equal(shared.body.items[0].total_revenue, 701);
  assert.deepEqual(shared.body.items[0].providers, ["CRM directory A"]);
});
test("directory searches across all pages by name and formatted Arabic phone, not SQL wildcard patterns", async () => {
  const arabic = directoryPhone(46).replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  for (const search of ["عميل قائمة 46", arabic, `${arabic.slice(0, 3)} ${arabic.slice(3)}`]) {
    const { body } = await directory({ search });
    assert.equal(body.total, 1);
    assert.equal(body.items[0].client_phone, directoryPhone(46));
  }
  const empty = await directory({ search: "%", page: "100" });
  assert.equal(empty.body.total, 0);
  assert.equal(empty.body.page, 1);
  assert.equal(empty.body.totalCustomers, 48);
  assert.deepEqual(empty.body.items, []);
  assert.equal((await directory({ page: "99999" })).body.page, 3);
});
test("directory source, product and provider isolation happen before aggregation and paging", async () => {
  assert.equal((await directory({ scope: "chalet" })).body.total, 46);
  assert.equal((await directory({ scope: "service" })).body.total, 3);
  assert.equal((await directory({ source: "service" })).body.total, 3);
  assert.equal((await directory({ source: "chalet" })).body.total, 46);
  const scoped = await directory({ scope: "service", providerId: String(providerIds[3]) });
  assert.equal(scoped.body.total, 1);
  assert.equal(scoped.body.items[0].client_phone, directoryPhone(98));
  assert.equal((await directory({ scope: "service", providerId: String(providerIds[1]) })).status, 404);
  assert.equal((await directory({}, `${directoryOwner}-unrelated`)).body.total, 0);
});
test("directory rejects malformed filters without exposing another product's customer list", async () => {
  for (const query of [{ page: "0" }, { sort: "bad" }, { scope: "bad" }, { source: "bad" },
    { scope: "service", providerId: "-1" }, { providerId: String(providerIds[2]) }, { search: "a".repeat(101) }]) {
    assert.equal((await directory(query)).status, 400);
  }
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
test("SQL uses pinned checkout or calendar-end fallback, never current property timings", async () => {
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
      ${fixture.period === "morning" ? "2026-10-17T16:00:00+03:00" : null}::timestamptz AS checkout_at,
      ${fixture.period}::text AS period, ${fixture.durationDays}::int AS duration_days),
      chalets AS (${columns(true)}), chalet_submissions AS (${columns(false)})
      SELECT extract(epoch FROM stay.checkout_at)::float8 * 1000 AS checkout FROM b ${crmPropertyCheckout(now)}`);
    assert.equal(result.rows[0].checkout, bookingCheckoutAt({
      bookingDate: "2026-10-17", ...fixture,
      checkoutAt: fixture.period === "morning" ? "2026-10-17T16:00:00+03:00" : null,
    }, fixture.times));
  }
});

test("SQL legacy calendar fallback rejects malformed dates without raising or completing", async () => {
  for (const bookingDate of ["invalid", "", "2026-02-30", "2026-02-29", "2026-00-15", "2026-13-01",
    "2026-04-31", "2026-01-00", "2026-01-32", "2026-2-01", "2024-02-29", "2026-02-28"]) {
    const result = await db.execute(sql`WITH b AS (
      SELECT ${bookingDate}::text AS booking_date, NULL::int AS submission_id,
        NULL::timestamptz AS checkout_at, 2 AS duration_days)
      SELECT extract(epoch FROM stay.checkout_at)::float8 * 1000 AS checkout FROM b
      ${crmPropertyCheckout(new Date("2026-10-17T12:00:00Z"))}`);
    assert.equal(result.rows[0].checkout, bookingCalendarEndAt({ bookingDate, durationDays: 2 }), bookingDate);
  }
});

test("malformed legacy bookings left null by migration keep customer directory and history readable", async () => {
  const legacyOwner = `${ownerId}-malformed`;
  const dates = ["not-a-date", "2026-02-30", "2026-13-01", "2026-01-00"];
  try {
    // Exact persisted state asserted by migrate-booking-checkout.test.ts:
    // malformed dates survive migration, with no fabricated departure instant.
    const migratedRows = await db.insert(ownerBookingsTable).values(dates.map((bookingDate, index) => ({
      ownerId: legacyOwner, clientName: `عميل تاريخ قديم ${index}`, clientPhone: phone,
      bookingDate, checkoutAt: null, durationDays: 1, totalPrice: "100",
      insuranceFee: "50", insuranceReceived: true,
    }))).returning();
    assert(migratedRows.every(row => row.checkoutAt === null));
    const customers = await directory({ scope: "chalet" }, legacyOwner);
    assert.equal(customers.status, 200);
    assert.equal(GetOwnerCrmCustomersResponse.safeParse(customers.body).success, true);
    assert.equal(customers.body.total, 1);
    assert.equal(customers.body.items[0].has_active, true);
    const history = await request(sendCrmHistory, {}, legacyOwner);
    assert.equal(history.status, 200);
    assert.equal(GetOwnerCrmHistoryResponse.safeParse(history.body).success, true);
    assert.equal(history.body.total, dates.length);
    assert(history.body.items.every((row: any) => row.is_active === true));
    assert.equal((await request(sendCrmHistory, { status: "completed" }, legacyOwner)).body.total, 0);
    assert.equal((await request(sendCrmProfile, {}, legacyOwner)).status, 200);
  } finally {
    await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, legacyOwner));
  }
});
