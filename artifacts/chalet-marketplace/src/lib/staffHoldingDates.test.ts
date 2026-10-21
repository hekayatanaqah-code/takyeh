import assert from "node:assert/strict";
import { test } from "node:test";
import { formatHoldingSettlementDate } from "./staffHoldingDates";

test("settlement shows Hijri first, then Gregorian, with Eastern digits and both eras", () => {
  assert.equal(
    formatHoldingSettlementDate("2026-10-21"),
    "١٠ جمادى الأولى ١٤٤٨ هـ (٢١ أكتوبر ٢٠٢٦ م)",
  );
});

test("settlement retains the stored calendar day when passed a timestamp", () => {
  assert.equal(
    formatHoldingSettlementDate("2026-10-21T23:45:00Z"),
    formatHoldingSettlementDate("2026-10-21"),
  );
});

test("missing or invalid settlement dates do not show an invented date", () => {
  for (const value of [null, "", "not-a-date"]) {
    assert.equal(formatHoldingSettlementDate(value), "—");
  }
});
