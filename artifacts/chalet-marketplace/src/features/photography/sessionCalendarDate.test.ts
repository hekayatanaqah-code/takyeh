import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSessionCalendarDate } from "./sessionCalendarDate";

test("Hijri selection puts Hijri first with a single weekday and explicit eras", () => {
  const display = formatSessionCalendarDate("2026-10-06", "hijri");
  assert.equal(display.weekday, "الثلاثاء");
  assert.equal(display.primary, "٢٥ ربيع الآخر ١٤٤٨ هـ");
  assert.equal(display.secondary, "٦ أكتوبر ٢٠٢٦ م");
  assert.equal(display.primary.match(/هـ/g)?.length, 1);
});

test("Gregorian selection reverses only the date order, not the selected date", () => {
  for (const date of ["2026-10-06", "2026-10-19", "2026-12-31", "2027-01-01", "2028-02-29"]) {
    const h = formatSessionCalendarDate(date, "hijri");
    const g = formatSessionCalendarDate(date, "gregorian");
    assert.equal(g.weekday, h.weekday);
    assert.equal(g.primary, h.secondary);
    assert.equal(g.secondary, h.primary);
    assert.match(h.primary, / هـ$/);
    assert.match(g.primary, / م$/);
    assert.doesNotMatch(h.primary + g.primary, /[0-9]/);
  }
});
