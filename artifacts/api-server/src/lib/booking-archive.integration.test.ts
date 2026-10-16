import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import express from "express";
import { inArray } from "drizzle-orm";
import { db, ownerBookingsTable, ownerRescheduleLogsTable, pool } from "@workspace/db";
import { archiveQuerySchema, normalizeArchiveSearch, sendBookingArchive } from "./booking-archive";

const ownerId = `archive-test-${randomUUID()}`;
const otherOwner = `archive-test-${randomUUID()}`;
const owners = [ownerId, otherOwner];
let server: Server | undefined;
let base: string;
let cancelledIds: number[] = [];
let completedIds: number[] = [];

async function request(query: string) {
  const response = await fetch(`${base}/archive?${query}`);
  return { status: response.status, body: await response.json() as any, response };
}

before(async () => {
  const cancelled = await db.insert(ownerBookingsTable).values(Array.from({ length: 25 }, (_, i) => ({
    ownerId, clientName: i === 0 ? "عميل البحث المميز" : `عميل الأرشيف ${i}`,
    clientPhone: i === 0 ? "+966 50 123 4567" : `050000${String(i).padStart(4, "0")}`,
    bookingDate: "2020-05-15", durationDays: 1, cancelledAt: new Date(),
    totalPrice: "250.50", depositPaid: "100", cancelRefundAmount: "50", cancelIncome: "50",
  }))).returning({ id: ownerBookingsTable.id });
  cancelledIds = cancelled.map(row => row.id);
  const completed = await db.insert(ownerBookingsTable).values(Array.from({ length: 15 }, (_, i) => ({
    ownerId, clientName: `عميل مكتمل ${i}`, clientPhone: "0509999999",
    bookingDate: "2020-06-15", durationDays: 1, totalPrice: "200",
  }))).returning({ id: ownerBookingsTable.id });
  completedIds = completed.map(row => row.id);
  const today = new Date(Date.now() + 10800000).toISOString().slice(0, 10);
  await db.insert(ownerBookingsTable).values([
    { ownerId, clientName: "إقامة اليوم لم تنته", bookingDate: today, durationDays: 1 },
    { ownerId, clientName: "إقامة مستقبلية", bookingDate: "2099-01-01", durationDays: 1 },
    { ownerId: otherOwner, clientName: "عميل مالك آخر", bookingDate: "2020-05-15", durationDays: 1, cancelledAt: new Date() },
    { ownerId: otherOwner, clientName: "عميل مالك آخر", bookingDate: "2020-06-15", durationDays: 1 },
  ]);
  await db.insert(ownerRescheduleLogsTable).values([
    ...Array.from({ length: 23 }, (_, i) => ({
      ownerId, bookingId: completedIds[i % completedIds.length],
      clientName: `سجل تعديل ${i}`, clientPhone: "+966501234567",
      oldDate: "2020-01-01", newDate: i === 0 ? "2021-04-01" : "2020-06-15",
      oldDuration: 1, newDuration: 1, reason: "اختبار",
    })),
    { ownerId: otherOwner, bookingId: 1, clientName: "سجل مالك آخر", oldDate: "2020-01-01", newDate: "2020-06-15", reason: "اختبار" },
  ]);
  const app = express();
  app.get("/archive", async (req, res) => sendBookingArchive(req, res, [ownerId]));
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
  try {
    await db.transaction(async transaction => {
      await transaction.delete(ownerRescheduleLogsTable).where(inArray(ownerRescheduleLogsTable.ownerId, owners));
      await transaction.delete(ownerBookingsTable).where(inArray(ownerBookingsTable.ownerId, owners));
    });
    const remaining = await db.select({ id: ownerBookingsTable.id }).from(ownerBookingsTable).where(inArray(ownerBookingsTable.ownerId, owners));
    assert.equal(remaining.length, 0);
  } finally {
    await pool.end();
  }
});

describe("owner booking archive", () => {
  it("returns ten records with stable, disjoint numeric pages and clamps deleted/out-of-range pages", async () => {
    const first = await request("tab=cancelled&page=1");
    const second = await request("tab=cancelled&page=2");
    const last = await request("tab=cancelled&page=999");
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 25);
    assert.equal(first.body.bookings.length, 10);
    assert.equal(second.body.bookings.length, 10);
    assert.equal(last.body.page, 3);
    assert.equal(last.body.bookings.length, 5);
    assert.equal(first.response.headers.get("cache-control"), "private, no-store");
    assert(!first.body.bookings.some((row: any) => second.body.bookings.some((other: any) => other.id === row.id)));
    assert.deepEqual(first.body.bookings.map((row: any) => row.id), cancelledIds.slice().reverse().slice(0, 10));
    assert(first.body.bookings.every((row: any) => row.ownerId === ownerId));
  });

  it("searches names, local/international mobile and Arabic/Persian booking numbers", async () => {
    for (const search of ["عميل البحث المميز", "٠٥٠١٢٣٤٥٦٧", "+966501234567", `#${String(cancelledIds[0]).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}`]) {
      const { body, status } = await request(`tab=cancelled&search=${encodeURIComponent(search)}`);
      assert.equal(status, 200);
      assert.equal(body.total, 1, search);
      assert.equal(body.bookings[0].id, cancelledIds[0]);
    }
  });

  it("applies inclusive stay-date ranges, combined search, empty results and stable year metadata", async () => {
    const matching = await request("tab=cancelled&from=2020-05-15&to=2020-05-15&search=" + encodeURIComponent("المميز"));
    assert.equal(matching.body.total, 1);
    const empty = await request("tab=cancelled&from=2021-01-01&to=2021-12-31");
    assert.equal(empty.body.total, 0);
    assert.deepEqual(empty.body.bookings, []);
    assert(empty.body.years.includes("2020"));
  });

  it("rejects invalid dates, reversed bounds, invalid tabs and malformed pages", async () => {
    for (const query of ["from=2020-02-30", "from=2021-02-01&to=2020-01-01", "page=0", "page=1.5", "page=abc", "tab=unknown"]) {
      assert.equal((await request(query)).status, 400, query);
    }
    assert(archiveQuerySchema.safeParse({ from: "2020-02-29" }).success);
    assert.equal(normalizeArchiveSearch("  رقم ١۲۳  "), "رقم 123");
  });

  it("exports all and only filtered records across pages without crossing owners", async () => {
    const all = await request("tab=cancelled&export=1");
    assert.equal(all.body.bookings.length, 25);
    const one = await request("tab=cancelled&export=1&search=" + encodeURIComponent("المميز"));
    assert.equal(one.body.bookings.length, 1);
    assert.equal(one.body.bookings[0].totalPrice, "250.50");
    assert(!("contractSignatureDataUrl" in one.body.bookings[0]));
  });

  it("archives only completed stays, not future, cancelled or unfinished current-day bookings", async () => {
    const completed = await request("tab=completed");
    assert.equal(completed.body.total, 15);
    assert.equal(completed.body.bookings.length, 10);
    assert(completed.body.bookings.every((row: any) => completedIds.includes(row.id)));
    const all = await request("tab=completed&export=1");
    assert.equal(all.body.bookings.length, 15);
    assert(all.body.bookings.some((row: any) => row.isRescheduled));
    assert.equal((await request("tab=completed&from=2099-01-01")).body.total, 0);
  });

  it("paginates, searches and exports reschedule logs by booking ID and new stay start date", async () => {
    const first = await request("tab=rescheduled");
    assert.equal(first.body.total, 23);
    assert.equal(first.body.rescheduleLog.length, 10);
    const id = await request(`tab=rescheduled&search=%23${completedIds[0]}`);
    assert(id.body.rescheduleLog.every((row: any) => String(row.bookingId).includes(String(completedIds[0]))));
    const range = await request("tab=rescheduled&from=2021-01-01&to=2021-12-31&export=1");
    assert.equal(range.body.total, 1);
    assert.equal(range.body.rescheduleLog[0].newDate, "2021-04-01");
    assert(range.body.rescheduleLog.every((row: any) => row.ownerId === ownerId));
    assert.equal((await request("tab=rescheduled&export=1")).body.rescheduleLog.length, 23);
  });
});
