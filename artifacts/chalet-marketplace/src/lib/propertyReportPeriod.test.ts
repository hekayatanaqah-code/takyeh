import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { propertyReportAllPeriodBounds } from "./propertyReportPeriod";

test("all periods follow the selected property's actual dates, including future records", () => {
  const bookings = [
    { submissionId: 3, bookingDate: "2024-01-01" },
    { submissionId: 3, bookingDate: "2027-02-14" },
    { submissionId: 4, bookingDate: "2020-01-01" },
    { submissionId: 3, bookingDate: "2019-01-01", cancelledAt: "2020-01-01" },
  ];
  const expenses = [
    { submissionId: 3, dateStr: "2023-12-01" },
    { submissionId: 4, dateStr: "2030-01-01" },
  ];
  assert.deepEqual(propertyReportAllPeriodBounds(bookings, expenses, "3", "2026-10-31"),
    { from: "2020-01-01", to: "2027-02-14" });
  assert.deepEqual(propertyReportAllPeriodBounds(bookings, expenses, "all", "2026-10-31"),
    { from: "2020-01-01", to: "2030-01-01" });
});

test("expense-only periods and existing shared-expense treatment are retained", () => {
  assert.deepEqual(propertyReportAllPeriodBounds([], [
    { submissionId: 3, dateStr: "2025-01-01" },
    { submissionId: null, dateStr: "2026-01-01" },
  ], "3", "2026-10-31"), { from: "2025-01-01", to: "2026-01-01" });
  assert.deepEqual(propertyReportAllPeriodBounds([], [], "3", "2026-10-31"),
    { from: "2026-10-31", to: "2026-10-31" });
});

test("properties and services share controls; all-period selection does not overwrite custom dates", () => {
  const dashboard = readFileSync(new URL("../components/owner/ReportsTab.tsx", import.meta.url), "utf8");
  const reports = dashboard.slice(dashboard.indexOf("function ReportsTab("));
  assert.equal((reports.match(/<ServiceReportPeriodControls/g) ?? []).length, 1);
  assert.ok(reports.includes('allPeriods={!isActivitySummary && allPropertyPeriods}'));
  assert.ok(reports.includes('allPropertyPeriods ? allPropertyBounds.from : customFromInput'));
  assert.ok(reports.includes('allPropertyPeriods ? allPropertyBounds.to : customToInput'));
  assert.ok(reports.includes("!allPropertyDataLoading && !allPropertyDataError"));
  assert.ok(!reports.includes('className="h-9 w-[120px] shrink-0 text-sm"'));
  const controls = readFileSync(new URL("../components/owner/ServiceReportPeriodControls.tsx", import.meta.url), "utf8");
  assert.ok(controls.includes('data-testid="service-report-period-all"'));
  assert.ok(controls.includes('{!all && <div'));
  assert.ok(controls.includes('{!all && props.mode === "custom"'));
  assert.ok(controls.includes("prominent inline"));
  assert.ok(controls.includes("text-base font-medium leading-8 text-foreground"));
  assert.ok(controls.indexOf("فترة التقرير") < controls.indexOf(">التقويم<"));
});
