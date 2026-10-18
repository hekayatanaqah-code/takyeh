import assert from "node:assert/strict";
import { test } from "node:test";
import { currentSalaryMonth, hasStaffPlatformAccess, paidPayrollPeriods, paidPayrollRecords, payrollPeriod, payrollPeriodLabel } from "./payrollPeriods";
import { toHijriComponents } from "./hijri";

const records = [
  { id: 1, month: "2023-12", paidAt: "2024-01-03" },
  { id: 2, month: "2026-01", paidAt: "2026-02-01" },
  { id: 3, month: "2026-01", paidAt: "2026-02-02" },
  { id: 4, month: "2026-05", paidAt: null },
  { id: -1, month: "2026-06", paidAt: "2026-07-01" },
  { id: 5, month: "2026-13", paidAt: "2026-07-01" },
];

test("bulk payroll offers only real paid salary periods, deduplicated and including old years", () => {
  assert.deepEqual(paidPayrollPeriods(records, "gregorian"), [
    { year: 2026, month: 1 }, { year: 2023, month: 12 },
  ]);
  assert.deepEqual(paidPayrollRecords(records).map(record => record.id), [1, 2, 3]);
  assert.deepEqual(paidPayrollPeriods([], "gregorian"), []);
});

test("Hijri options and report selection share the same stored salary month mapping", () => {
  const expected = toHijriComponents(new Date("2026-01-15T12:00:00"));
  assert.deepEqual(payrollPeriod("2026-01", "hijri"), { year: expected.year, month: expected.month });
  const options = paidPayrollPeriods(records, "hijri");
  assert.ok(options.some(option => option.year === expected.year && option.month === expected.month));
  assert.equal(options.length, 2);
});

test("pay opening defaults are recalculated in Saudi time across month and year boundaries", () => {
  assert.equal(currentSalaryMonth(new Date("2026-10-18T12:00:00Z")), "2026-10");
  assert.equal(currentSalaryMonth(new Date("2026-12-31T21:30:00Z")), "2027-01");
  assert.equal(currentSalaryMonth(new Date("2026-01-31T20:59:00Z")), "2026-01");
  assert.equal(currentSalaryMonth(new Date("2026-01-31T21:00:00Z")), "2026-02");
});

test("platform badge needs active login identity, not a permission flag", () => {
  assert.equal(hasStaffPlatformAccess({ username: "worker", isActive: true }), true);
  assert.equal(hasStaffPlatformAccess({ username: "worker", isActive: false }), false);
  assert.equal(hasStaffPlatformAccess({ username: null, isActive: true }), false);
  assert.equal(hasStaffPlatformAccess({ username: "", isActive: true }), false);
});

test("Gregorian payroll report labels never inherit ar-SA's default Hijri calendar", () => {
  assert.equal(payrollPeriodLabel("2025-02", "gregorian"), "فبراير ٢٠٢٥");
  assert.equal(payrollPeriodLabel("2026-10", "gregorian"), "أكتوبر ٢٠٢٦");
  assert.match(payrollPeriodLabel("2025-02", "hijri"), /١٤٤٦ هـ$/);
});
