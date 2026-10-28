import assert from "node:assert/strict";
import { it } from "node:test";
import { serviceBookingPage, sortServiceBookings } from "./serviceBookingList";

it("orders by actual service date: upcoming nearest then past newest, not creation/id", () => {
  const bookings = [
    { id: 1, dateStr: "2026-12-01" },
    { id: 50, dateStr: "2026-10-26" },
    { id: 100, dateStr: "2026-10-28" },
    { id: 200, dateStr: "2026-01-01" },
    { id: 2, dateStr: "2026-10-29" },
  ];
  const before = JSON.stringify(bookings);
  assert.deepEqual(sortServiceBookings(bookings, "2026-10-28").map(b => b.id), [100, 2, 1, 50, 200]);
  assert.equal(JSON.stringify(bookings), before);
});

it("sorts matching days by appointment time and keeps unspecified times last with stable id ties", () => {
  const bookings = [
    { id: 1, dateStr: "2026-10-28", startTime: null },
    { id: 2, dateStr: "2026-10-28", startTime: "18:00" },
    { id: 3, dateStr: "2026-10-28", startTime: "09:00" },
    { id: 4, dateStr: "2026-10-28", startTime: "09:00" },
    { id: 5, dateStr: "2026-10-27", startTime: "09:00" },
    { id: 6, dateStr: "2026-10-27", startTime: "18:00" },
  ];
  assert.deepEqual(sortServiceBookings(bookings, "2026-10-28").map(b => b.id), [4, 3, 2, 1, 6, 5]);
});

it("safely places missing historical dates last", () => {
  const items = [{ id: 1, dateStr: "" }, { id: 2, dateStr: "2026-10-28" }, { id: 3, dateStr: "" }];
  assert.deepEqual(sortServiceBookings(items, "2026-10-28").map(b => b.id), [2, 3, 1]);
});

it("paginates 25 records in 10/10/5 without duplicate or missing bookings", () => {
  const records = Array.from({ length: 25 }, (_, id) => ({ id }));
  const pages = [1, 2, 3].map(page => serviceBookingPage(records, page));
  assert.deepEqual(pages.map(p => p.items.length), [10, 10, 5]);
  assert.deepEqual(pages.flatMap(p => p.items), records);
  assert.equal(pages[0].totalPages, 3);
});

it("clamps empty and shortened lists instead of showing an empty last page", () => {
  assert.deepEqual(serviceBookingPage([], 4), { page: 1, totalPages: 1, items: [] });
  assert.equal(serviceBookingPage(Array.from({ length: 20 }), 3).page, 2);
  assert.equal(serviceBookingPage([1], 0).page, 1);
  assert.equal(serviceBookingPage([1], NaN).page, 1);
  assert.equal(serviceBookingPage(Array.from({ length: 10 }), 1).totalPages, 1);
});
