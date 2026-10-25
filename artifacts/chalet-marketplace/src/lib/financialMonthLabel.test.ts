import assert from "node:assert/strict";
import { it } from "node:test";
import { financialMonthCounterpart } from "./financialMonthLabel";

it("shows Hijri months and the correct era for a Gregorian period", () => {
  const text = financialMonthCounterpart("2026-01", false);
  assert(text.startsWith("يوافق: "));
  assert(text.includes("رجب ١٤٤٧ هـ"));
  assert(text.includes("شعبان ١٤٤٧ هـ"));
  assert(!text.includes(" م"));
});

it("shows Gregorian counterparts across years for a Hijri period", () => {
  const text = financialMonthCounterpart("1447-07", true);
  assert(text.includes("ديسمبر ٢٠٢٥ م"));
  assert(text.includes("يناير ٢٠٢٦ م"));
  assert(!text.includes("هـ"));
});

it("keeps all overlapping months, even when a Gregorian month touches three Hijri months", () => {
  const text = financialMonthCounterpart("2024-03", false);
  assert(text.includes("شعبان ١٤٤٥ هـ"));
  assert(text.includes("رمضان ١٤٤٥ هـ"));
  const threeMonths = financialMonthCounterpart("2022-05", false);
  assert.equal(threeMonths.split(" / ").length, 3);
  assert(threeMonths.includes("رمضان ١٤٤٣ هـ"));
  assert(threeMonths.includes("شوال ١٤٤٣ هـ"));
  assert(threeMonths.includes("ذو القعدة ١٤٤٣ هـ"));
});

it("rejects incomplete or invalid selections without showing an invented month", () => {
  assert.equal(financialMonthCounterpart("", false), "");
  assert.equal(financialMonthCounterpart("2026-13", false), "");
});
