import assert from "node:assert/strict";
import { it } from "node:test";
import { submissionDualDate } from "./submissionDate";

it("shows both explicit calendars using Eastern digits and exactly one era label", () => {
  const dates = submissionDualDate("2026-01-01T09:00:00Z")!;
  assert.equal(dates.gregorian, "١ يناير ٢٠٢٦ م");
  assert(dates.hijri.includes("رجب"));
  assert(dates.hijri.includes("١٤٤٧"));
  assert.equal(dates.hijri.match(/هـ/g)?.length, 1);
  assert(!/[0-9]/.test(dates.gregorian + dates.hijri));
});

it("uses the Saudi date across UTC midnight rather than slicing the timestamp", () => {
  assert.deepEqual(submissionDualDate("2025-12-31T22:30:00Z"), submissionDualDate("2026-01-01"));
  assert.deepEqual(submissionDualDate("2026-01-01T01:30:00+03:00"), submissionDualDate("2026-01-01"));
});

it("preserves date-only inputs and omits absent or invalid dates", () => {
  assert.equal(submissionDualDate("2026-01-01")?.gregorian, "١ يناير ٢٠٢٦ م");
  for (const value of [null, undefined, "", " ", "invalid"]) assert.equal(submissionDualDate(value), null);
});
