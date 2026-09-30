import assert from "node:assert/strict";
import test from "node:test";
import { quoteAddonCheckout, quoteUpcomingInvoice } from "./subscription-billing-math";
import {
  accountDiscountHalala,
  latestDiscountForDisplay,
  discountInvoiceLines,
  discountIsActive,
  latestStartedDiscount,
  saudiCalendarDate,
} from "./subscription-discounts";

test("account discounts calculate percentages and fixed halala without exceeding the invoice", () => {
  assert.equal(accountDiscountHalala("percent", 25, 1_000), 250);
  assert.equal(accountDiscountHalala("fixed", 325, 1_000), 325);
  assert.equal(accountDiscountHalala("fixed", 1_500, 1_000), 1_000);
});

test("one discount is allocated exactly across mixed base and add-on lines", () => {
  const result = discountInvoiceLines([
    { kind: "base" as const, label: "Plan", amountHalala: 10_000 },
    { kind: "addon" as const, label: "Extra", amountHalala: 2_000, addonPurchaseId: 4 },
  ], {
    kind: "percent", value: 25, startDate: null, endDate: null, reason: "test", active: true,
  }, new Date("2025-02-01T08:00:00Z"));
  assert.equal(result.discountHalala, 3_000);
  assert.deepEqual(result.lineItems.map((line) => line.amountHalala), [7_500, 1_500]);
  assert.equal(result.lineItems.reduce((sum, line) => sum + line.amountHalala, 0), 9_000);
  assert.equal(result.snapshot?.discountHalala, 3_000);
});

test("combined renewal quote snapshots discount the base and recurring add-on as one invoice", () => {
  const invoice = quoteUpcomingInvoice({
    baseLabel: "Plan",
    baseAmountHalala: 10_000,
    planDays: 30,
    periodStartAt: new Date("2025-06-01T00:00:00Z"),
    recurringAddons: [{
      id: 9,
      addonType: "service",
      quantity: 2,
      monthlyUnitPriceHalala: 500,
      recurring: true,
      paidThroughAt: new Date("2025-06-01T00:00:00Z"),
    }],
  });
  const discounted = discountInvoiceLines(invoice, {
    kind: "percent", value: 10, startDate: null, endDate: null, reason: "renewal promotion", active: true,
  });
  assert.deepEqual(discounted.lineItems.map((line) => line.amountHalala), [9_000, 900]);
  assert.equal(discounted.discountHalala, 1_100);
  assert.equal(discounted.lineItems.reduce((sum, line) => sum + line.amountHalala, 0), 9_900);
  assert.deepEqual(discounted.snapshot, {
    kind: "percent",
    value: 10,
    startDate: null,
    endDate: null,
    reason: "renewal promotion",
    active: true,
    discountHalala: 1_100,
  });
});

test("future discount is allocated across the real lines in a recurring add-on's next quote", () => {
  const periodStartAt = new Date("2025-06-30T00:00:00Z");
  const quote = quoteAddonCheckout({
    addonType: "service",
    quantity: 1,
    monthlyUnitPriceHalala: 1_000,
    cycleDays: 30,
    periodStartAt: new Date("2025-06-01T00:00:00Z"),
    periodEndAt: periodStartAt,
    baseLabel: "Plan",
    baseAmountHalala: 10_000,
    recurringAddons: [{
      id: 9,
      addonType: "chalet",
      quantity: 1,
      monthlyUnitPriceHalala: 500,
      recurring: true,
      paidThroughAt: periodStartAt,
      cancelAtPeriodEnd: false,
    }],
  });
  const discounted = discountInvoiceLines(quote.nextInvoiceLines, {
    kind: "percent", value: 10, startDate: null, endDate: null, reason: "next invoice", active: true,
  }, periodStartAt);
  assert.deepEqual(quote.nextInvoiceLines.map((line) => line.amountHalala), [10_000, 500, 1_000]);
  assert.deepEqual(discounted.lineItems.map((line) => line.amountHalala), [9_000, 450, 900]);
  assert.equal(discounted.lineItems.reduce((sum, line) => sum + line.amountHalala, 0), 10_350);
});

test("discount floor retains one halala for a paid checkout", () => {
  const result = discountInvoiceLines([
    { kind: "base" as const, label: "Plan", amountHalala: 100 },
    { kind: "addon" as const, label: "Extra", amountHalala: 1 },
  ], { kind: "fixed", value: 5_000, startDate: null, endDate: null, reason: "test", active: true });
  assert.equal(result.discountHalala, 100);
  assert.equal(result.lineItems.reduce((sum, line) => sum + line.amountHalala, 0), 1);
});

test("Saudi calendar discount bounds are inclusive and latest-started aliases are deterministic", () => {
  assert.equal(saudiCalendarDate(new Date("2025-05-31T20:59:00Z")), "2025-05-31");
  assert.equal(saudiCalendarDate(new Date("2025-05-31T21:00:00Z")), "2025-06-01");
  assert.equal(discountIsActive(
    { startDate: "2025-06-01", endDate: "2025-06-03" },
    new Date("2025-06-03T20:00:00Z"),
  ), true);
  assert.equal(discountIsActive(
    { startDate: "2025-06-01", endDate: "2025-06-03" },
    new Date("2025-06-03T21:00:00Z"),
  ), false);
  const rows = [
    { id: 2, createdAt: new Date("2025-01-01T00:00:00Z"), startDate: null, ownerId: "owner_1" },
    { id: 3, createdAt: new Date("2025-01-01T00:00:00Z"), startDate: "2025-06-05", ownerId: "user-1" },
  ];
  assert.equal(latestStartedDiscount(rows, new Date("2025-06-04T12:00:00Z"))?.id, 2);
  assert.equal(latestStartedDiscount(rows, new Date("2025-06-05T12:00:00Z"))?.id, 3);
  const futureOnly = [rows[1]!];
  assert.equal(latestStartedDiscount(futureOnly, new Date("2025-06-04T12:00:00Z")), undefined);
  assert.equal(latestDiscountForDisplay(futureOnly, new Date("2025-06-04T12:00:00Z"))?.id, 3);
  const futureAdminOrder = [
    rows[1]!,
    { id: 4, createdAt: new Date("2025-01-02T00:00:00Z"), startDate: "2025-06-15", ownerId: "owner_1" },
  ];
  assert.equal(latestDiscountForDisplay(futureAdminOrder, new Date("2025-06-04T12:00:00Z"))?.id, 4);
});