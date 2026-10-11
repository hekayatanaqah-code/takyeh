import assert from "node:assert/strict";
import { test } from "node:test";
import { byWeekday, flattenWeek, monthCells, riyadhToday, toggleDate, isSupportedDuration } from "./availability";

test("weekday grouping keeps multiple intervals and round trips", () => {
  const v = [{ weekday: 0, start: "09:00", end: "12:00" }, { weekday: 0, start: "14:00", end: "18:00" }, { weekday: 5, start: "10:00", end: "11:00" }];
  const rows = byWeekday(v);
  assert.equal(rows[0].length, 2); assert.equal(rows[1].length, 0);
  assert.deepEqual(flattenWeek(rows), v);
});

test("calendar helpers", () => {
  const c = monthCells(2025, 1); // Feb 2025 starts Saturday
  assert.equal(c.filter((x) => x === null).length, 6);
  assert.equal(c[c.length - 1], "2025-02-28");
  assert.equal(riyadhToday(new Date("2025-03-01T22:30:00Z")), "2025-03-02");
  assert.deepEqual(toggleDate(["2025-05-03"], "2025-05-01"), ["2025-05-01", "2025-05-03"]);
  assert.deepEqual(toggleDate(["2025-05-01"], "2025-05-01"), []);
  assert.ok(isSupportedDuration(90)); assert.ok(!isSupportedDuration(45));
});
