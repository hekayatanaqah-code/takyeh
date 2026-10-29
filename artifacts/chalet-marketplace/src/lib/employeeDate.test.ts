import assert from "node:assert/strict";
import { test } from "node:test";
import { employeeDateBounds } from "./employeeDate";
import { calendarSwitchDate } from "./calendarOpeningDate";
import { getHijriMonthDays, toGregorianStr, toHijriComponents } from "./hijri";

const today = new Date("2026-10-29T12:00:00");

test("employee year bounds are historical and stop today in both eras", () => {
  for (const kind of ["birth", "hire"] as const) {
    const bounds = employeeDateBounds(kind, today);
    assert.equal(bounds.maxDate, "2026-10-29");
    assert.equal(bounds.minDate, kind === "birth" ? "1906-01-01" : "1926-01-01");
    assert.ok(bounds.initialDate >= bounds.minDate && bounds.initialDate <= bounds.maxDate);
    assert.equal(toHijriComponents(new Date(bounds.maxDate + "T12:00:00")).year, 1448);
    assert.ok(toHijriComponents(new Date(bounds.minDate + "T12:00:00")).year < 1400);
  }
});

test("default hiring date remains selectable at Saudi midnight and year rollover", () => {
  for (const [instant, day] of [
    ["2026-10-29T21:01:00Z", "2026-10-30"],
    ["2026-12-31T21:01:00Z", "2027-01-01"],
  ]) {
    const bounds = employeeDateBounds("hire", new Date(instant));
    assert.equal(bounds.maxDate, day);
    assert.equal(bounds.initialDate, day);
    assert.ok(bounds.minDate < day);
  }
});

test("known Umm al-Qura dates map to actual Gregorian dates without year mixing", () => {
  assert.deepEqual(toHijriComponents(new Date("2024-03-11T12:00:00")), { year: 1445, month: 9, day: 1 });
  assert.equal(toGregorianStr(getHijriMonthDays(1445, 9)[0].date), "2024-03-11");
  assert.deepEqual(toHijriComponents(new Date("2023-07-19T12:00:00")), { year: 1445, month: 1, day: 1 });
});

test("historical employee dates round-trip exactly through Hijri month grids", () => {
  for (let year = 1906; year <= 2026; year += 5) {
    for (const month of [0, 3, 6, 9]) {
      const greg = new Date(year, month, 15, 12);
      const hijri = toHijriComponents(greg);
      const grid = getHijriMonthDays(hijri.year, hijri.month);
      assert.ok(grid.length === 29 || grid.length === 30);
      assert.equal(toGregorianStr(grid.find(day => day.hijriDay === hijri.day)!.date), toGregorianStr(greg));
    }
  }
});

test("switching calendar after navigating uses the visible real date, not the old year", () => {
  assert.equal(calendarSwitchDate("", ["1985-06-01", "1985-06-02"], "2026-10-29"), "1985-06-01");
  assert.equal(calendarSwitchDate("1985-06-02", ["1985-06-01", "1985-06-02"], "2026-10-29"), "1985-06-02");
  assert.equal(calendarSwitchDate("2026-10-29", ["1985-06-01"], "2026-10-29"), "1985-06-01");
  assert.equal(calendarSwitchDate("", ["2026-10-01"], "2026-10-29", "2026-10-15", "2026-10-29"), "2026-10-15");
});
