import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceRevenueBookings, serviceRevenueTotals } from "./serviceRevenue";
import { revenueMonthKey } from "./revenuePeriod";

const all = { type: "all" } as const;
const period = { calendar: "gregorian", year: "2026", month: "2026-10" } as const;
const appointments = [
  { id: 1, providerId: 167, dateStr: "2026-10-15", amount: "100", deposit: "100" },
  { id: 2, providerId: 167, dateStr: "2026-10-20", amount: "150", deposit: "100" },
  { id: 3, providerId: 167, dateStr: "2026-10-25", amount: "150", deposit: "150" },
  { id: 4, providerId: 168, dateStr: "2026-10-25", amount: "200", deposit: "50" },
  { id: 5, providerId: 167, dateStr: "2026-09-20", amount: "500", deposit: "200" },
  { id: 6, providerId: 167, dateStr: "2026-10-22", amount: "900", deposit: "900", status: "cancelled" },
];

test("all activities includes service bookings; single-service scope excludes other providers", () => {
  const scoped = serviceRevenueBookings(appointments, { type: "service", id: 167, name: "خدمة" }, period);
  assert.deepEqual(scoped.map(a => a.id), [1, 2, 3]);
  assert.deepEqual(serviceRevenueTotals(scoped), { sales: 400, collected: 350, pending: 50 });
  assert.deepEqual(serviceRevenueBookings(appointments, all, period).map(a => a.id), [1, 2, 3, 4]);
  assert.deepEqual(serviceRevenueBookings(appointments, { type: "chalet", id: 167, name: "عقار" }, period), []);
});

test("Hijri service periods follow booking dates, not the same-numbered Gregorian month", () => {
  const month = revenueMonthKey("2026-10-15", "hijri");
  const result = serviceRevenueBookings(appointments, all, { calendar: "hijri", year: month.slice(0, 4), month });
  assert.ok(result.some(a => a.id === 1));
  assert.ok(!result.some(a => a.id === 5 || a.id === 6));
});

test("annual and all-time totals retain services without duplicating records or including cancellations", () => {
  const annual = serviceRevenueBookings(appointments, all, { ...period, month: "" });
  assert.deepEqual(annual.map(a => a.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(serviceRevenueTotals(annual), { sales: 1100, collected: 600, pending: 500 });
  assert.deepEqual(serviceRevenueBookings(appointments, all, { ...period, year: "", month: "" }), annual);
});

test("payment and cancellation changes immediately change computed revenue", () => {
  const activity = { type: "service", id: 167, name: "خدمة" } as const;
  const updated = appointments.map(a => a.id === 2 ? { ...a, deposit: "150" } : a);
  assert.deepEqual(serviceRevenueTotals(serviceRevenueBookings(updated, activity, period)),
    { sales: 400, collected: 400, pending: 0 });
  const cancelled = updated.map(a => a.id === 2 ? { ...a, status: "cancelled" } : a);
  assert.deepEqual(serviceRevenueTotals(serviceRevenueBookings(cancelled, activity, period)),
    { sales: 250, collected: 250, pending: 0 });
});

test("overpayments do not inflate sales or create negative pending amounts", () => {
  assert.deepEqual(serviceRevenueTotals([{ id: 1, providerId: 1, amount: "10.50", deposit: "12" }]),
    { sales: 10.5, collected: 12, pending: 0 });
});

test("all months scopes to the chosen year and all years includes the full service history in either calendar", () => {
  const activity = { type: "service", id: 167, name: "خدمة" } as const;
  const history = [
    ...appointments,
    { id: 7, providerId: 167, dateStr: "2025-01-10", amount: "70", deposit: "20" },
  ];
  for (const calendar of ["gregorian", "hijri"] as const) {
    const year = revenueMonthKey("2026-10-15", calendar).slice(0, 4);
    const annual = serviceRevenueBookings(history, activity, { calendar, year, month: "" });
    assert.deepEqual(annual.map(a => a.id), [1, 2, 3, 5]);
    assert.deepEqual(serviceRevenueTotals(annual), { sales: 900, collected: 550, pending: 350 });
    const allTime = serviceRevenueBookings(history, activity, { calendar, year: "", month: "" });
    assert.deepEqual(allTime.map(a => a.id), [1, 2, 3, 5, 7]);
    assert.deepEqual(serviceRevenueTotals(allTime), { sales: 970, collected: 570, pending: 400 });
  }
});
