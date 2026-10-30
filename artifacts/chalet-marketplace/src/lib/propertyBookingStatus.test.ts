import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { matchesPropertyPaymentFilter, propertyBookingArrival, propertyBookingPaymentStatus } from "./propertyBookingStatus";
import { PropertyBookingArrivalBadge, PropertyBookingPaymentFilters } from "../components/PropertyBookingStatus";

it("classifies unpaid, partially paid and settled rent without including insurance", () => {
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "330", depositPaid: "100" }), "unpaid");
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "330", depositPaid: null }), "unpaid");
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "330", depositPaid: "330" }), "paid");
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "330", depositPaid: "100", balanceCollected: true }), "paid");
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "0", depositPaid: "0" }), "paid");
  assert.equal(propertyBookingPaymentStatus({ totalPrice: "0.30", depositPaid: 0.1 + 0.2 }), "paid");
});

it("never treats unknown or invalid amounts as zero-priced fully paid bookings", () => {
  for (const totalPrice of [null, undefined, "", "invalid", "-1"]) {
    const booking = { totalPrice, depositPaid: "0" };
    assert.equal(propertyBookingPaymentStatus(booking), "unknown");
    assert.equal(matchesPropertyPaymentFilter(booking, "paid"), false);
    assert.equal(matchesPropertyPaymentFilter(booking, "unpaid"), false);
    assert.equal(matchesPropertyPaymentFilter(booking, "all"), true);
  }
});

it("payment filters respond to settlement changes without modifying the booking", () => {
  const partial = Object.freeze({ totalPrice: "500", depositPaid: "50", balanceCollected: false });
  assert.equal(matchesPropertyPaymentFilter(partial, "unpaid"), true);
  assert.equal(matchesPropertyPaymentFilter(partial, "paid"), false);
  assert.equal(matchesPropertyPaymentFilter({ ...partial, balanceCollected: true }, "paid"), true);
  assert.equal(matchesPropertyPaymentFilter({ ...partial, balanceCollected: true }, "unpaid"), false);
});

it("shows today and tomorrow by Saudi date, including midnight and month/year boundaries", () => {
  const beforeMidnight = Date.parse("2026-10-31T23:59:59+03:00");
  assert.equal(propertyBookingArrival("2026-10-31", beforeMidnight), "today");
  assert.equal(propertyBookingArrival("2026-11-01", beforeMidnight), "tomorrow");
  assert.equal(propertyBookingArrival("2026-10-30", beforeMidnight), null);
  assert.equal(propertyBookingArrival("2026-11-02", beforeMidnight), null);
  const midnight = Date.parse("2026-11-01T00:00:00+03:00");
  assert.equal(propertyBookingArrival("2026-10-31", midnight), null);
  assert.equal(propertyBookingArrival("2026-11-01", midnight), "today");
  assert.equal(propertyBookingArrival("2027-01-01", Date.parse("2026-12-31T12:00:00+03:00")), "tomorrow");
  assert.equal(propertyBookingArrival("invalid", midnight), null);
});

it("renders accessible payment controls and arrival alerts, and wires them before pagination", () => {
  const filters = renderToStaticMarkup(React.createElement(PropertyBookingPaymentFilters, { value: "unpaid", onChange() {} }));
  assert.equal((filters.match(/<button/g) ?? []).length, 3);
  assert.equal((filters.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(filters, /متبقي عليه مبالغ/);
  const now = Date.parse("2026-10-31T12:00:00+03:00");
  assert.match(renderToStaticMarkup(React.createElement(PropertyBookingArrivalBadge, { bookingDate: "2026-10-31", now })), /الوصول اليوم/);
  assert.match(renderToStaticMarkup(React.createElement(PropertyBookingArrivalBadge, { bookingDate: "2026-11-01", now })), /الوصول غداً/);
  assert.equal(renderToStaticMarkup(React.createElement(PropertyBookingArrivalBadge, { bookingDate: "2026-11-02", now })), "");
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("return result.filter(booking => matchesPropertyPaymentFilter(booking, bookingPaymentFilter));"));
  assert.ok(source.includes("setBookingPaymentFilter(filter); setBookingPage(0);"));
  assert.ok(source.includes("<PropertyBookingArrivalBadge bookingDate={b.bookingDate} now={stayClock} />"));
});
