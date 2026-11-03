import assert from "node:assert/strict";
import test from "node:test";
import { normalizePropertyBookingPeriod, propertyBookingPeriodName } from "./propertyBookingPeriod";

test("selected search periods resolve to Arabic WhatsApp labels", () => {
  for (const [period, label] of [
    ["morning", "صباحي"], ["evening", "مسائي"],
    ["full_day", "يوم كامل"], ["fullday", "يوم كامل"],
  ]) {
    const message = "الفترة: {period_name}".replace(/{period_name}/g, propertyBookingPeriodName(period));
    const url = `https://wa.me/966500000000?text=${encodeURIComponent(message)}`;
    assert.equal(new URL(url).searchParams.get("text"), `الفترة: ${label}`);
  }
});

test("full-day search and details identifiers select the same slot", () => {
  assert.equal(normalizePropertyBookingPeriod("full_day"), "fullday");
  assert.equal(normalizePropertyBookingPeriod("fullday"), "fullday");
  assert.equal(normalizePropertyBookingPeriod(" evening "), "evening");
});

test("missing or unsupported periods never produce blank labels or technical text", () => {
  for (const value of [null, undefined, "", "all", "unknown_period"]) {
    assert.equal(normalizePropertyBookingPeriod(value), null);
    assert.equal(propertyBookingPeriodName(value), "غير محددة");
  }
});
