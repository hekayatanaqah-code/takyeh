import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingCheckoutAt, isStayComplete, timeMinutes, bookingCalendarEndAt, isBookingCalendarComplete } from "@workspace/booking-time";

test("pinned departure ignores later property edits in both eligibility directions", () => {
  const booking = { bookingDate: "2026-10-16", period: "morning", checkoutAt: "2026-10-16T16:00:00+03:00" };
  for (const times of [
    { morningCheckIn: "٦ ص", morningCheckOut: "٨ ص" },
    { morningCheckIn: "٦ ص", morningCheckOut: "١١ م" },
    {},
  ]) {
    assert.equal(bookingCheckoutAt(booking, times), Date.parse(booking.checkoutAt));
    assert.equal(isStayComplete(booking, times, Date.parse("2026-10-16T15:00:00+03:00")), false);
    assert.equal(isStayComplete(booking, times, Date.parse("2026-10-16T17:00:00+03:00")), true);
    assert.equal(isBookingCalendarComplete(booking, Date.parse("2026-10-16T17:00:00+03:00")), false);
  }
  assert.equal(bookingCheckoutAt({ ...booking, checkoutAt: new Date(booking.checkoutAt) }), Date.parse(booking.checkoutAt));
});

test("null legacy pins never adopt live times; invalid pins fail closed", () => {
  const booking = { bookingDate: "2026-10-16", durationDays: 2, checkoutAt: null };
  assert.equal(bookingCheckoutAt(booking, { checkOutTime: "٨ ص" }), Date.parse("2026-10-18T00:00:00+03:00"));
  assert.equal(isStayComplete({ ...booking, checkoutAt: "broken" }), false);
  assert.equal(isStayComplete({ ...booking, bookingDate: "2026-02-30" }), false);
});

test("active list archives only after the final Saudi calendar day ends", () => {
  const booking = { bookingDate: "2026-10-30", durationDays: 1, period: "morning" };
  const end = Date.parse("2026-10-31T00:00:00+03:00");
  assert.equal(bookingCalendarEndAt(booking), end);
  assert.equal(isBookingCalendarComplete(booking, end - 1), false);
  assert.equal(isBookingCalendarComplete(booking, end), true);
  // A morning departure must not remove today's booking from the list early.
  const afternoon = Date.parse("2026-10-30T17:00:00+03:00");
  assert.equal(isStayComplete(booking, { morningCheckIn: "٦ ص", morningCheckOut: "٤ م" }, afternoon), true);
  assert.equal(isBookingCalendarComplete(booking, afternoon), false);
  // Conversely, yesterday's overnight stay leaves the list even before its settlement time.
  const afterMidnight = Date.parse("2026-10-31T00:30:00+03:00");
  const evening = { ...booking, period: "evening" };
  assert.equal(isStayComplete(evening, { eveningCheckIn: "٦ م", eveningCheckOut: "٢ ص" }, afterMidnight), false);
  assert.equal(isBookingCalendarComplete(evening, afterMidnight), true);
});

test("calendar completion respects multiple days, leap dates, month/year rollover and invalid dates", () => {
  for (const [bookingDate, durationDays, expectedEnd] of [
    ["2026-10-30", 3, "2026-11-02"],
    ["2026-12-31", 2, "2027-01-02"],
    ["2024-02-28", 2, "2024-03-01"],
  ] as const) {
    const booking = { bookingDate, durationDays };
    const end = Date.parse(`${expectedEnd}T00:00:00+03:00`);
    assert.equal(bookingCalendarEndAt(booking), end);
    assert.equal(isBookingCalendarComplete(booking, end - 1), false);
    assert.equal(isBookingCalendarComplete(booking, end), true);
  }
  for (const bookingDate of ["invalid", "2026-02-30", ""]) {
    assert.equal(isBookingCalendarComplete({ bookingDate }), false);
  }
  assert.equal(bookingCalendarEndAt({ bookingDate: "2026-10-30" }), bookingCalendarEndAt({ bookingDate: "2026-10-30", durationDays: 1 }));
});

test("stored Arabic, Persian, 12-hour and 24-hour times", () => {
  assert.equal(timeMinutes("٦ ص"), 360);
  assert.equal(timeMinutes(" ٤:٣٠م "), 990);
  assert.equal(timeMinutes("۱۲ م"), 720);
  assert.equal(timeMinutes("12 AM"), 0);
  assert.equal(timeMinutes("23:59"), 1439);
  assert.equal(timeMinutes("25:00"), null);
  assert.equal(timeMinutes("invalid"), null);
});
test("morning check-out uses the last occupied day in Saudi Arabia", () => {
  const booking = { bookingDate: "2026-10-16", period: "morning", durationDays: 1 };
  const times = { morningCheckIn: "٦ ص", morningCheckOut: "٤ م" };
  const end = Date.parse("2026-10-16T16:00:00+03:00");
  assert.equal(bookingCheckoutAt(booking, times), end);
  assert.equal(isStayComplete(booking, times, end - 1), false);
  assert.equal(isStayComplete(booking, times, end), true);
});
test("evening stays stay active after midnight until next-day departure", () => {
  const booking = { bookingDate: "2026-10-16", period: "evening", durationDays: 1 };
  const times = { eveningCheckIn: "٦ م", eveningCheckOut: "٢ ص" };
  assert.equal(bookingCheckoutAt(booking, times), Date.parse("2026-10-17T02:00:00+03:00"));
  assert.equal(isStayComplete(booking, times, Date.parse("2026-10-17T01:59:59+03:00")), false);
});
test("multi-day and full aliases respect duration and overnight departure", () => {
  const times = { fullDayCheckIn: "٢ م", fullDayCheckOut: "١١ ص" };
  for (const period of ["full", "full_day", null]) {
    assert.equal(bookingCheckoutAt({ bookingDate: "2026-10-16", durationDays: 3, period }, times),
      Date.parse("2026-10-19T11:00:00+03:00"));
  }
});
test("missing schedules use final occupied day's midnight, not server timezone", () => {
  assert.equal(bookingCheckoutAt({ bookingDate: "2026-10-16", durationDays: 2 }),
    Date.parse("2026-10-18T00:00:00+03:00"));
  assert.equal(isStayComplete({ bookingDate: "invalid" }), false);
});
test("legacy general arrival/departure times are honored when period times are absent", () => {
  assert.equal(bookingCheckoutAt(
    { bookingDate: "2026-10-16", period: "full_day" },
    { checkInTime: "١٤:٠٠", checkOutTime: "١١:٠٠" },
  ), Date.parse("2026-10-17T11:00:00+03:00"));
});
