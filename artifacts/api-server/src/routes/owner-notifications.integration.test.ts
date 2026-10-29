import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, ownerNotificationsTable, ownerBookingsTable, sessionsTable, chaletSubmissionsTable, ownerSubscriptionsTable, serviceProvidersTable, serviceAppointmentsTable, quickSalesTable, ownerExpensesTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { GetOwnerServiceRevenueSummaryResponse, GetOwnerFinancialPeriodsResponse } from "@workspace/api-zod";

const owner = `notification-search-test-${randomUUID()}`;
const other = `notification-search-test-${randomUUID()}`;
const server = createServer(app);
const sessions: string[] = [];
let base: string;
let session: string;
let bookingId: number;

before(async () => {
  session = await createSession({ user: { id: owner, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test" });
  sessions.push(session);
  await db.insert(ownerSubscriptionsTable).values([
    { ownerId: owner, plan: "monthly", status: "active", expiresAt: new Date("2030-01-01") },
    { ownerId: other, plan: "chalet_basic", status: "active", expiresAt: new Date("2030-01-01") },
  ]);
  const [booking] = await db.insert(ownerBookingsTable).values({
    ownerId: owner, clientName: "عميل اختبار الإشعارات", bookingDate: "2026-10-23", period: "morning",
  }).returning();
  bookingId = booking.id;
  await db.insert(ownerNotificationsTable).values([
    ...Array.from({ length: 55 }, (_, i) => ({
      ownerId: owner, type: "booking_reminder", bookingId,
      message: `تذكير اختباري ${i}`, isRead: i % 2 === 0,
    })),
    { ownerId: other, type: "new_booking", message: "إشعار مالك آخر", isRead: false },
  ]);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}/api/owner/notifications`;
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.delete(ownerNotificationsTable).where(inArray(ownerNotificationsTable.ownerId, [owner, other]));
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, owner));
  await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, owner));
  await db.delete(serviceAppointmentsTable).where(inArray(serviceAppointmentsTable.ownerId, [owner, other]));
  await db.delete(quickSalesTable).where(inArray(quickSalesTable.ownerId, [owner, other]));
  await db.delete(ownerExpensesTable).where(inArray(ownerExpensesTable.ownerId, [owner, other]));
  await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.ownerId, [owner, other]));
  await db.delete(ownerSubscriptionsTable).where(inArray(ownerSubscriptionsTable.ownerId, [owner, other]));
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  await pool.end();
});

it("returns complete authorized history and booking search metadata without changing live alert limits", async () => {
  const headers = { Cookie: `sid=${session}` };
  const latest = await fetch(base, { headers });
  assert.equal(latest.status, 200);
  const latestRows = await latest.json();
  assert(Array.isArray(latestRows));
  assert.equal(latestRows.length, 50);
  const history = await fetch(`${base}?history=true`, { headers });
  assert.equal(history.status, 200);
  const rows = await history.json();
  assert(Array.isArray(rows));
  assert.equal(rows.length, 55);
  assert(rows.every((n: any) => n.ownerId === owner && n.bookingId === bookingId && n.clientName === "عميل اختبار الإشعارات"));
  assert(rows.every((n: any, i: number) => i === 0 || rows[i - 1].id > n.id));
});

it("requires authentication and rejects invalid history queries", async () => {
  assert.equal((await fetch(`${base}?history=true`)).status, 401);
  assert.equal((await fetch(`${base}?history=invalid`, { headers: { Cookie: `sid=${session}` } })).status, 400);
});

it("uses exact Umm al-Qura month boundaries for service reports without including other owners or cancelled bookings", async () => {
  const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", timeZone: "Asia/Riyadh" });
  const dates = Array.from({ length: 90 }, (_, index) => new Date(Date.UTC(2026, 1, 1 + index, 12)).toISOString().slice(0, 10))
    .filter(date => {
      const parts = formatter.formatToParts(new Date(`${date}T12:00:00Z`));
      return parts.find(part => part.type === "year")?.value === "1447" && parts.find(part => part.type === "month")?.value === "9";
    });
  assert(dates.length >= 29 && dates[0].slice(0, 7) !== dates.at(-1)!.slice(0, 7));
  const first = dates[0], last = dates.at(-1)!;
  const adjacentDate = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
  const providers = await db.insert(serviceProvidersTable).values([owner, other].map(ownerId => ({
    ownerId, businessName: "اختبار فترة التقرير", category: "test", city: "الرياض", whatsappNumber: "0500000000",
    galleryPhotos: [], coverageTags: [], customFeatureTags: [], photoCaptions: [], isActive: true,
  }))).returning();
  const appointment = (providerIndex: number, dateStr: string, deposit: string, status = "confirmed") => ({
    providerId: providers[providerIndex].id, ownerId: providerIndex === 0 ? owner : other,
    clientName: "عميل اختبار التقرير", dateStr, deposit, amount: deposit, status,
  });
  await db.insert(serviceAppointmentsTable).values([
    appointment(0, first, "100"), appointment(0, last, "200"),
    appointment(0, adjacentDate(first, -1), "400"), appointment(0, adjacentDate(last, 1), "800"),
    appointment(0, first, "10000", "cancelled"), appointment(1, first, "50000"),
    appointment(0, "2023-01-10", "1000", "cancelled"),
    appointment(0, "2020-01-10", "0"), appointment(0, "2045-01-10", "1000"),
    appointment(1, "2019-01-10", "1000"),
  ]);
  const url = base.replace(/\/notifications$/, "/service-revenue-summary");
  const headers = { Cookie: `sid=${session}` };
  const response = await fetch(`${url}?hijriYear=1447&hijriMonth=9`, { headers });
  assert.equal(response.status, 200);
  const summary = GetOwnerServiceRevenueSummaryResponse.parse(await response.json());
  assert.equal(summary.totalRevenue, 300);
  assert.equal(summary.totalDeposits, 300);
  assert.equal(summary.byProvider.length, 1);
  assert.equal(summary.byProvider[0].id, providers[0].id);
  const gregorian = await fetch(`${url}?month=${first.slice(0, 7)}`, { headers });
  assert.equal(gregorian.status, 200);
  assert.equal(GetOwnerServiceRevenueSummaryResponse.parse(await gregorian.json()).totalRevenue, 500);
  const periodsUrl = base.replace(/\/notifications$/, "/report-years");
  const periodsResponse = await fetch(`${periodsUrl}?activity=services&providerId=${providers[0].id}`, { headers });
  assert.equal(periodsResponse.status, 200);
  const periods = await periodsResponse.json() as { gregorianMonths: string[]; gregorianYears: number[]; hijriMonths: string[]; hijriYears: number[] };
  assert.deepEqual(periods.gregorianMonths, ["2026-03", "2026-02"]);
  assert.deepEqual(periods.gregorianYears, [2026]);
  assert.deepEqual(periods.hijriMonths, ["1447-10", "1447-09", "1447-08"]);
  assert.deepEqual(periods.hijriYears, [1447]);
  const foreign = await fetch(`${periodsUrl}?activity=services&providerId=${providers[1].id}`, { headers });
  assert.deepEqual((await foreign.json() as typeof periods).gregorianMonths, []);
  assert.equal((await fetch(`${periodsUrl}?activity=invalid`, { headers })).status, 400);
  assert.equal((await fetch(`${periodsUrl}?providerId=bad`, { headers })).status, 400);
  assert.equal((await fetch(periodsUrl)).status, 401);
  for (const query of ["hijriYear=1447", "hijriYear=1447&hijriMonth=13", "hijriYear=1447&hijriMonth=9&month=2026-02", "month=2026-13"])
    assert.equal((await fetch(`${url}?${query}`, { headers })).status, 400, query);
  assert.equal((await fetch(url)).status, 401);
});

it("marks only the selected property's notifications read, and never treats a service as all properties", async () => {
  const data = { ownerId: owner, nameAr: "اختبار نطاق الإشعارات", whatsappNumber: "0500000000", location: "اختبار", descriptionAr: "اختبار معزول", pricePerNight: "1000", status: "approved" as const };
  const properties = await db.insert(chaletSubmissionsTable).values([data, { ...data, nameAr: "اختبار النطاق الآخر" }]).returning();
  const bookings = await db.insert(ownerBookingsTable).values(properties.map(property => ({
    ownerId: owner, submissionId: property.id, clientName: "عميل اختبار", bookingDate: "2026-10-24", period: "morning",
  }))).returning();
  const notices = await db.insert(ownerNotificationsTable).values(bookings.map(booking => ({
    ownerId: owner, bookingId: booking.id, type: "booking_reminder", message: "اختبار النطاق", isRead: false,
  }))).returning();
  const headers = { Cookie: `sid=${session}`, "content-type": "application/json" };
  const response = await fetch(`${base}/read-all`, { method: "PATCH", headers, body: JSON.stringify({ submissionId: properties[0].id }) });
  assert.equal(response.status, 200);
  const rows = await db.select().from(ownerNotificationsTable).where(inArray(ownerNotificationsTable.id, notices.map(n => n.id)));
  assert.equal(rows.find(n => n.id === notices[0].id)?.isRead, true);
  assert.equal(rows.find(n => n.id === notices[1].id)?.isRead, false);
  assert.equal((await fetch(`${base}/read-all`, { method: "PATCH", headers, body: JSON.stringify({ providerId: 999 }) })).status, 200);
  const [otherNotice] = await db.select().from(ownerNotificationsTable).where(eq(ownerNotificationsTable.id, notices[1].id));
  assert.equal(otherNotice.isRead, false);
  assert.equal((await fetch(`${base}/read-all`, { method: "PATCH", headers, body: JSON.stringify({ providerId: 999, submissionId: properties[0].id }) })).status, 400);
});

it("includes expense-only service periods and scopes expenses without distributing owner-wide costs", async () => {
  const [provider, otherProvider] = await db.insert(serviceProvidersTable).values([
    { ownerId: owner, businessName: "خدمة مصروفات اختبارية", category: "catering", city: "الرياض", whatsappNumber: "0500000000" },
    { ownerId: other, businessName: "خدمة أخرى", category: "catering", city: "الرياض", whatsappNumber: "0500000000" },
  ]).returning();
  await db.insert(ownerExpensesTable).values([
    { ownerId: owner, providerId: provider.id, dateStr: "2021-04-05", category: "مواد", amount: "35.90" },
    { ownerId: other, providerId: otherProvider.id, dateStr: "2020-05-05", category: "مواد", amount: "999" },
    { ownerId: owner, dateStr: "2019-06-05", category: "عام غير موزع", amount: "500" },
  ]);
  const headers = { Cookie: `sid=${session}` };
  const root = base.replace(/\/notifications$/, "");
  const periodsResponse = await fetch(`${root}/report-years?activity=services&providerId=${provider.id}`, { headers });
  assert.equal(periodsResponse.status, 200);
  const periods = GetOwnerFinancialPeriodsResponse.parse(await periodsResponse.json());
  assert.deepEqual(periods.gregorianMonths, ["2021-04"]);
  assert.equal(periods.hijriMonths.length, 1);
  const expensesResponse = await fetch(`${root}/expenses?providerId=${provider.id}`, { headers });
  assert.equal(expensesResponse.status, 200);
  const expenseRows = await expensesResponse.json() as { providerId: number; amount: string }[];
  assert.equal(expenseRows.length, 1);
  assert.equal(expenseRows[0].providerId, provider.id);
  assert.equal(Number(expenseRows[0].amount), 35.9);
  const inaccessible = GetOwnerFinancialPeriodsResponse.parse(await (await fetch(
    `${root}/report-years?activity=services&providerId=${otherProvider.id}`, { headers })).json());
  assert.deepEqual(inaccessible.gregorianMonths, []);
});

it("includes quick-sale-only financial periods without leaking other providers, cancellations or owners", async () => {
  const [provider, otherProvider] = await db.insert(serviceProvidersTable).values([
    { ownerId: owner, businessName: "نشاط بيع سريع اختباري", category: "catering", city: "الرياض", whatsappNumber: "0500000000" },
    { ownerId: other, businessName: "نشاط مالك آخر", category: "catering", city: "الرياض", whatsappNumber: "0500000000" },
  ]).returning();
  await db.insert(quickSalesTable).values([
    { ownerId: owner, providerId: provider.id, providerName: "نشاط بيع سريع اختباري", dateStr: "2024-02-03",
      items: [{ name: "منتج اختبار", quantity: 2, unitPrice: 12.75 }], total: "25.50", paymentMethod: "cash", idempotencyKey: randomUUID(), requestHash: "test" },
    { ownerId: owner, providerId: provider.id, providerName: "نشاط بيع سريع اختباري", dateStr: "2023-03-03", status: "cancelled",
      items: [], total: "99", paymentMethod: "bank", idempotencyKey: randomUUID(), requestHash: "test" },
    { ownerId: other, providerId: otherProvider.id, providerName: "نشاط مالك آخر", dateStr: "2022-01-01",
      items: [], total: "88", paymentMethod: "bank", idempotencyKey: randomUUID(), requestHash: "test" },
  ]);
  const headers = { Cookie: `sid=${session}` };
  const url = base.replace(/\/notifications$/, "/report-years");
  const scopedResponse = await fetch(`${url}?activity=services&providerId=${provider.id}`, { headers });
  assert.equal(scopedResponse.status, 200);
  const scoped = GetOwnerFinancialPeriodsResponse.parse(await scopedResponse.json());
  assert.deepEqual(scoped.gregorianMonths, ["2024-02"]);
  assert.equal(scoped.hijriMonths.length, 1);
  for (const activity of ["services", "unified"]) {
    const result = await fetch(`${url}?activity=${activity}`, { headers });
    assert.equal(result.status, 200);
    const periods = GetOwnerFinancialPeriodsResponse.parse(await result.json());
    assert.ok(periods.gregorianMonths.includes("2024-02"));
    assert.ok(!periods.gregorianMonths.includes("2023-03"));
    assert.ok(!periods.gregorianMonths.includes("2022-01"));
  }
  const otherPeriods = GetOwnerFinancialPeriodsResponse.parse(await (await fetch(`${url}?activity=services&providerId=${otherProvider.id}`, { headers })).json());
  assert.deepEqual(otherPeriods.gregorianMonths, []);
});

it("keeps property tools available on property-only plans while protecting finance APIs", async () => {
  const otherSession = await createSession({ user: { id: other, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "integration-test" });
  sessions.push(otherSession);
  const root = base.replace(/\/notifications$/, "");
  const headers = { Cookie: `sid=${otherSession}` };
  assert.equal((await fetch(`${root}/expenses`, { headers })).status, 403);
  assert.equal((await fetch(`${root}/financial-summary`, { headers })).status, 403);
  for (const route of ["yearly-summary", "yearly-summary-hijri", "service-revenue-summary", "transaction-history", "reports"])
    assert.equal((await fetch(`${root}/${route}`, { headers })).status, 403, route);
  assert.equal((await fetch(`${root}/message-settings`, { headers })).status, 200);
  assert.equal((await fetch(`${root}/bookings`, { headers })).status, 200);
  assert.equal((await fetch(`${root}/cash-deposit-logs`, { headers })).status, 200);
  await db.update(ownerSubscriptionsTable).set({ plan: "monthly", expiresAt: new Date("2020-01-01") })
    .where(eq(ownerSubscriptionsTable.ownerId, other));
  assert.equal((await fetch(`${root}/expenses`, { headers })).status, 403);
});
