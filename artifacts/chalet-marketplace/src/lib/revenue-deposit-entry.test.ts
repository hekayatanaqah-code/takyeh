import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const revenue = readFileSync(new URL("../components/owner/RevenueTab.tsx", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../components/owner/BookingCalendarTab.tsx", import.meta.url), "utf8");

test("revenue no longer renders collection-channel panels or the general cash-deposit action", () => {
  assert.doesNotMatch(revenue, /توزيع قنوات التحصيل|ServiceCollectionChannels/);
  assert.doesNotMatch(revenue, /depositCashOpen|\/owner\/mark-cash-deposited/);
});

test("booking calendar retains its booking-linked deposit and financial cache refreshes", () => {
  assert.match(calendar, /تسجيل إيداع بالبنك/);
  assert.match(calendar, /apiFetch\("\/owner\/mark-cash-deposited",/);
  assert.match(calendar, /bookingId: bookingDepositTarget\.bookingId/);
  assert.match(calendar, /submissionId: bookingDepositTarget\.submissionId/);
  assert.match(calendar, /amt > bookingDepositTarget\.maxAmount/);
  for (const key of ["bookings", "cash-deposit-logs", "cash-deposit-logs-ledger",
    "financial-summary-rev", "financial-summary"]) {
    assert.ok(calendar.includes(`qc.invalidateQueries({ queryKey: ["owner", "${key}"] })`), key);
  }
});
