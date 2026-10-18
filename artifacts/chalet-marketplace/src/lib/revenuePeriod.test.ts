import assert from "node:assert/strict";
import { test } from "node:test";
import { isInRevenuePeriod, revenueMonthKey, revenueSalesTitle } from "./revenuePeriod";
import { getHijriMonthGregorianRange } from "./hijri";

test("Gregorian month, full year, and all years use distinct date scopes", () => {
  const bookings = ["2025-10-01", "2026-01-01", "2026-10-01", "2026-10-31", "2027-01-01"];
  const period = { calendar: "gregorian" as const, year: "2026", month: "2026-10" };
  assert.deepEqual(bookings.filter(d => isInRevenuePeriod(d, period)), bookings.slice(2, 4));
  assert.deepEqual(bookings.filter(d => isInRevenuePeriod(d, { ...period, month: "" })), bookings.slice(1, 4));
  assert.deepEqual(bookings.filter(d => isInRevenuePeriod(d, { ...period, year: "", month: "" })), bookings);
  assert.equal(isInRevenuePeriod(null, period), false);
});

test("Hijri month and year include exact Umm al-Qura boundaries, even far in the past", () => {
  const { start, end } = getHijriMonthGregorianRange(1440, 12);
  assert.ok(start && end);
  const period = { calendar: "hijri" as const, year: "1440", month: "1440-12" };
  assert.equal(revenueMonthKey(start, "hijri"), "1440-12");
  assert.equal(isInRevenuePeriod(start, period), true);
  assert.equal(isInRevenuePeriod(end, period), true);
  const next = new Date(`${end}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const nextDay = next.toISOString().slice(0, 10);
  assert.equal(isInRevenuePeriod(nextDay, period), false);
  assert.equal(isInRevenuePeriod(nextDay, { ...period, month: "" }), false);
  assert.equal(isInRevenuePeriod(start, { ...period, month: "" }), true);
  assert.equal(isInRevenuePeriod(nextDay, { ...period, year: "", month: "" }), true);
});

test("sales titles match the requested month, year, and all-time wording", () => {
  assert.equal(revenueSalesTitle({ calendar: "gregorian", year: "2026", month: "2026-10" }), "إجمالي مبيعات أكتوبر");
  assert.equal(revenueSalesTitle({ calendar: "hijri", year: "1448", month: "1448-05" }), "إجمالي مبيعات جمادى الأولى");
  assert.equal(revenueSalesTitle({ calendar: "gregorian", year: "2026", month: "" }), "إجمالي مبيعات عام ٢٠٢٦ م");
  assert.equal(revenueSalesTitle({ calendar: "hijri", year: "1448", month: "" }), "إجمالي مبيعات عام ١٤٤٨ هـ");
  for (const calendar of ["gregorian", "hijri"] as const) {
    assert.equal(revenueSalesTitle({ calendar, year: "", month: "" }), "إجمالي المبيعات العام");
  }
});
