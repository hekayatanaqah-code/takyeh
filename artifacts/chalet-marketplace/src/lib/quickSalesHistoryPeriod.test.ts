import assert from "node:assert/strict";
import { test } from "node:test";
import { isInRevenuePeriod, revenueMonthKey, type RevenuePeriod } from "./revenuePeriod";
import { quickSalesHistoryMonths, reconcileQuickSalesHistoryPeriod, switchQuickSalesHistoryCalendar } from "./quickSalesHistoryPeriod";
import { revenueMonthLabel } from "./revenueMonthLabel";

const dates = ["2026-10-28", "2026-10-29", "2026-09-02", "2025-01-02"];

test("history offers deduplicated, descending years and months in either calendar", () => {
  assert.deepEqual(quickSalesHistoryMonths(dates, "gregorian"), ["2026-10", "2026-09", "2025-01"]);
  const hijri = quickSalesHistoryMonths(dates, "hijri");
  assert.ok(hijri.includes(revenueMonthKey(dates[0], "hijri")));
  assert.deepEqual(hijri, [...new Set(hijri)].sort().reverse());
  assert.deepEqual(quickSalesHistoryMonths([], "hijri"), []);
});

test("all-year, annual and monthly history use the same revenue boundaries", () => {
  for (const calendar of ["gregorian", "hijri"] as const) {
    const month = revenueMonthKey(dates[0], calendar);
    const year = month.slice(0, 4);
    const all = { calendar, year: "", month: "" };
    const annual = { calendar, year, month: "" };
    const monthly = { calendar, year, month };
    assert.equal(dates.filter(date => isInRevenuePeriod(date, all)).length, 4);
    assert.deepEqual(dates.filter(date => isInRevenuePeriod(date, monthly)), dates.slice(0, 2));
    assert.ok(dates.filter(date => isInRevenuePeriod(date, annual)).length >= 3);
  }
});

test("calendar switches preserve all-time, annual or monthly granularity without stale month keys", () => {
  for (const month of ["", "2026-10"]) {
    const next = switchQuickSalesHistoryCalendar({ calendar: "gregorian", year: "2026", month }, "hijri", dates);
    assert.equal(Boolean(next.month), Boolean(month));
    assert.ok(next.year && quickSalesHistoryMonths(dates, "hijri").some(key => key.startsWith(`${next.year}-`)));
    if (next.month) assert.ok(next.month.startsWith(`${next.year}-`));
  }
  assert.deepEqual(switchQuickSalesHistoryCalendar({ calendar: "hijri", year: "", month: "" }, "gregorian", dates),
    { calendar: "gregorian", year: "", month: "" });
});

test("reconciliation preserves annual/all-time selections and safely resolves unavailable periods", () => {
  const months = quickSalesHistoryMonths(dates, "gregorian");
  const annual: RevenuePeriod = { calendar: "gregorian", year: "2025", month: "" };
  assert.deepEqual(reconcileQuickSalesHistoryPeriod(annual, months), annual);
  assert.deepEqual(reconcileQuickSalesHistoryPeriod({ ...annual, year: "", month: "2025-01" }, months), { ...annual, year: "", month: "" });
  assert.deepEqual(reconcileQuickSalesHistoryPeriod({ ...annual, year: "2024", month: "2024-01" }, months),
    { ...annual, year: "2026", month: "2026-10" });
  assert.deepEqual(reconcileQuickSalesHistoryPeriod(annual, []), { ...annual, year: "", month: "" });
});

test("history month options display primary and secondary calendar labels like revenue", () => {
  const gregorian = revenueMonthLabel("2026-10", "gregorian");
  assert.equal(gregorian.primary, "أكتوبر");
  assert.ok(gregorian.secondary.endsWith("هـ"));
  const hijri = revenueMonthLabel(revenueMonthKey(dates[0], "hijri"), "hijri");
  assert.ok(hijri.primary.endsWith("هـ"));
  assert.ok(hijri.secondary.length > 0);
});
