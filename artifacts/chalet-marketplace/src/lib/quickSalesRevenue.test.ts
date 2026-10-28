import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuickSale } from "@workspace/api-client-react";
import { quickSalesForPeriod, quickSalesTotal } from "./quickSalesRevenue";
import { revenueMonthKey } from "./revenuePeriod";

const sales = [
  { id: 1, providerId: 10, dateStr: "2026-10-28", status: "completed", total: 30.45 },
  { id: 2, providerId: 20, dateStr: "2026-10-29", status: "completed", total: 20.1 },
  { id: 3, providerId: 10, dateStr: "2026-09-02", status: "completed", total: 10.5 },
  { id: 4, providerId: 10, dateStr: "2025-01-02", status: "completed", total: 10 },
  { id: 5, providerId: 10, dateStr: "2026-10-28", status: "cancelled", total: 999 },
] as QuickSale[];
test("direct sales respect activity, cancellation and exact decimal totals", () => {
  const period = { calendar: "gregorian", year: "2026", month: "2026-10" } as const;
  assert.equal(quickSalesTotal(quickSalesForPeriod(sales, { type: "all" }, period)), 50.55);
  assert.equal(quickSalesTotal(quickSalesForPeriod(sales, { type: "service", id: 10, name: "خدمة" }, period)), 30.45);
  assert.deepEqual(quickSalesForPeriod(sales, { type: "chalet", id: 10, name: "عقار" }, period), []);
});
test("annual, all-time and Hijri sales filters preserve date boundaries", () => {
  const all = { type: "all" } as const;
  assert.equal(quickSalesTotal(quickSalesForPeriod(sales, all, { calendar: "gregorian", year: "2026", month: "" })), 61.05);
  assert.equal(quickSalesTotal(quickSalesForPeriod(sales, all, { calendar: "gregorian", year: "", month: "" })), 71.05);
  const key = revenueMonthKey("2026-10-28", "hijri");
  assert.deepEqual(quickSalesForPeriod(sales, all, { calendar: "hijri", year: key.slice(0, 4), month: key }).map(sale => sale.id), [1, 2]);
});
