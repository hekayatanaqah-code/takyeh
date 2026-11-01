import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { revenueFilterPeriod } from "./revenueFilterPeriod";
import { isInRevenuePeriod, revenueSalesTitle } from "./revenuePeriod";
import { serviceRevenueBookings } from "./serviceRevenue";
import { quickSalesForPeriod } from "./quickSalesRevenue";

test("period modes retain month, annual and all-history scope and inclusive custom bounds", () => {
  const dates = ["2025-10-01", "2026-01-01", "2026-10-01", "2026-10-31", "2026-11-01"];
  const expected = { monthly: dates.slice(2, 4), yearly: dates.slice(1), all: dates, custom: dates.slice(2, 4) };
  for (const mode of ["monthly", "yearly", "all", "custom"] as const) {
    const period = revenueFilterPeriod(mode, "gregorian", "2026", "2026-10", "2026-10-01", "2026-10-31");
    assert.deepEqual(dates.filter(date => isInRevenuePeriod(date, period)), expected[mode]);
  }
  assert.equal(revenueSalesTitle(revenueFilterPeriod("custom", "hijri", "1448", "1448-05", "2026-10-01", "2026-10-31")),
    "إجمالي المبيعات خلال الفترة المحددة");
});

test("custom selection applies identical boundaries to service bookings and quick sales in either calendar", () => {
  const dates = ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"];
  const activity = { type: "service" as const, id: 13, name: "خدمة" };
  const bookings = dates.map((dateStr, i) => ({ id: i + 1, providerId: 13, dateStr, status: "confirmed" }));
  const sales = dates.map((dateStr, i) => ({ id: i + 10, providerId: 13, dateStr, status: "completed" }));
  for (const calendar of ["hijri", "gregorian"] as const) {
    const period = revenueFilterPeriod("custom", calendar, "1448", "1448-05", "2026-10-01", "2026-10-31");
    assert.deepEqual(serviceRevenueBookings(bookings, activity, period).map(b => b.dateStr), dates.slice(1, 3));
    assert.deepEqual(quickSalesForPeriod(sales as any, activity, period).map(s => s.dateStr), dates.slice(1, 3));
    for (const [from, to] of [["", ""], ["2026-11-01", "2026-10-01"]]) {
      const incomplete = revenueFilterPeriod("custom", calendar, "", "", from, to);
      assert.equal(dates.some(date => isInRevenuePeriod(date, incomplete)), false);
    }
  }
});

test("both revenue surfaces use one grouped filter bar and no incomplete range is presented as zero totals", () => {
  const dashboard = readFileSync(new URL("../components/owner/RevenueTab.tsx", import.meta.url), "utf8");
  const revenue = dashboard.slice(dashboard.indexOf("function RevenueTab()"), dashboard.indexOf("function RevenueTab()") + 110000);
  assert.ok(revenue.includes("const revenueHeader"));
  assert.equal((revenue.match(/<RevenueFilterBar/g) ?? []).length, 1);
  assert.ok((revenue.match(/\{revenueHeader\}/g) ?? []).length >= 3);
  assert.ok(revenue.includes("اختر تاريخ البداية والنهاية لعرض إيرادات الفترة المحددة."));
  assert.ok(revenue.includes("servicePeriod = selectedServicePeriod"));
  assert.ok(!revenue.includes("<RevenueSourceFilter"));
  const component = readFileSync(new URL("../components/owner/RevenueFilterBar.tsx", import.meta.url), "utf8");
  assert.ok(component.includes("space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5"));
  assert.ok(component.includes("text-base font-medium leading-8 text-foreground"));
  assert.equal((component.match(/selectOnOpen=\{false\}/g) ?? []).length, 2);
  assert.ok(component.includes("<RevenueMonthItem"));
});

test("all-history mode hides calendar controls and ignores retained period selections", () => {
  const component = readFileSync(new URL("../components/owner/RevenueFilterBar.tsx", import.meta.url), "utf8");
  assert.ok(component.includes('["all", "جميع الفترات"]'));
  assert.ok(!component.includes("كل الفترات"));
  assert.match(component, /\{mode !== "all" && \(\s*<div className="grid min-w-0 gap-2 sm:gap-4"/);
  for (const calendar of ["hijri", "gregorian"] as const) {
    const period = revenueFilterPeriod("all", calendar, "2026", "2026-10", "2026-10-01", "2026-10-31");
    assert.equal(isInRevenuePeriod("2024-01-01", period), true);
    assert.equal(isInRevenuePeriod("2026-11-01", period), true);
    assert.equal(period.year, "");
    assert.equal(period.month, "");
    assert.equal(period.range, undefined);
  }
});

test("property revenue omits the source field and its empty grid column entirely", () => {
  const component = readFileSync(new URL("../components/owner/RevenueFilterBar.tsx", import.meta.url), "utf8");
  assert.ok(component.includes("const showSource = !props.propertyOnly"));
  assert.ok(component.includes("{showSource && ("));
  assert.ok(component.includes('showSource ? "lg:grid-cols-2" : ""'));
  assert.ok(!component.includes("تشمل قيمة الحجز والإضافات العقارية التابعة له."));
  assert.ok(component.includes('props.propertyOnly ? "تشمل الفترة يوم البداية ويوم النهاية."'));
});
