import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSubscriptionRenewalDue,
  checkoutSnapshotStillCurrent,
  addonPurchaseBillingTerms,
  makeRecurringAddonSnapshot,
  proratedAddonAmountHalala,
  quoteUpcomingInvoice,
  quoteAddonCheckout,
  selectRenewalAttemptGivenId,
} from "./subscription-billing-math";

const DAY = 24 * 60 * 60 * 1000;

test("add-on proration rounds integer halala and honors cycle boundaries", () => {
  assert.equal(proratedAddonAmountHalala(1001, 1, 30 * DAY, 30), 1001);
  assert.equal(proratedAddonAmountHalala(1001, 1, 15 * DAY, 30), 501);
  assert.equal(proratedAddonAmountHalala(1001, 2, 15 * DAY, 30), 1001);
  assert.equal(proratedAddonAmountHalala(1001, 1, DAY, 30), 33);
  assert.equal(proratedAddonAmountHalala(1001, 1, 100 * DAY, 30), 1001);
  assert.equal(proratedAddonAmountHalala(1000, 1, 45 * DAY, 90), 500);
  assert.equal(proratedAddonAmountHalala(1000, 1, 14 * DAY + 1, 30), 500);
  assert.equal(proratedAddonAmountHalala(1, 1, 1, 30), 1);
  assert.equal(proratedAddonAmountHalala(0, 1, DAY, 30), 0);
});

test("combined invoice quotes base and due recurring add-ons once, never legacy slots", () => {
  const periodStartAt = new Date("2032-01-01T00:00:00.000Z");
  const rows = [
    { id: 1, addonType: "chalet" as const, quantity: 2, monthlyUnitPriceHalala: 5000, recurring: true, paidThroughAt: new Date(periodStartAt) },
    { id: 2, addonType: "service" as const, quantity: 3, monthlyUnitPriceHalala: 2500, recurring: false, paidThroughAt: null },
    { id: 3, addonType: "service" as const, quantity: 1, monthlyUnitPriceHalala: 1000, recurring: true, paidThroughAt: new Date("2032-02-01T00:00:00.000Z") },
    { id: 4, addonType: "service" as const, quantity: 1, monthlyUnitPriceHalala: 1000, recurring: true, paidThroughAt: new Date(periodStartAt), cancelAtPeriodEnd: true },
  ];
  const quote = quoteUpcomingInvoice({
    baseLabel: "باقة شهرية",
    baseAmountHalala: 30000,
    planDays: 30,
    periodStartAt,
    recurringAddons: rows,
  });
  assert.deepEqual(quote.map(({ kind, amountHalala, addonPurchaseId }) => ({ kind, amountHalala, addonPurchaseId })), [
    { kind: "base", amountHalala: 30000, addonPurchaseId: undefined },
    { kind: "addon", amountHalala: 10000, addonPurchaseId: 1 },
  ]);
  const retry = quoteUpcomingInvoice({
    baseLabel: "باقة شهرية",
    baseAmountHalala: 30000,
    planDays: 30,
    periodStartAt,
    recurringAddons: rows,
  });
  assert.deepEqual(retry, quote, "retried quote construction remains deterministic for a stable checkout snapshot");
  assert.equal(quote.reduce((sum, line) => sum + line.amountHalala, 0), 40000);
});

test("renewal due window is anchored to the saved expiry", () => {
  const now = new Date("2032-01-01T00:00:00.000Z");
  assert.equal(isSubscriptionRenewalDue(new Date(now.getTime() + DAY), now, 1), true);
  assert.equal(isSubscriptionRenewalDue(new Date(now.getTime() + DAY + 1), now, 1), false);
  assert.equal(isSubscriptionRenewalDue(new Date(now.getTime() - DAY), now, 1), true);
});

test("ambiguous renewal retries keep the same given_id; only a definitive failure rotates it", () => {
  const invoiceGivenId = "invoice-stable-uuid";
  assert.equal(selectRenewalAttemptGivenId(invoiceGivenId, undefined, "unused-new-id"), invoiceGivenId);
  assert.equal(
    selectRenewalAttemptGivenId(invoiceGivenId, { status: "initiated", givenId: "attempt-stable-uuid" }, "new-id"),
    "attempt-stable-uuid",
  );
  assert.equal(
    selectRenewalAttemptGivenId(invoiceGivenId, { status: "pending", givenId: "attempt-stable-uuid" }, "new-id"),
    "attempt-stable-uuid",
  );
  assert.equal(
    selectRenewalAttemptGivenId(invoiceGivenId, { status: "failed", givenId: "old-failed-id" }, "new-retry-id"),
    "new-retry-id",
  );
});

test("base checkout snapshot rejects expiry, add-on quantity, cancellation, and version changes", () => {
  const expiry = new Date("2032-01-01T00:00:00.000Z");
  const addons = [{
    id: 11,
    quantity: 2,
    monthlyUnitPriceHalala: 1500,
    paidThroughAt: new Date(expiry),
    cancelAtPeriodEnd: false,
    recurring: true,
    revision: 4,
  }];
  const snapshot = makeRecurringAddonSnapshot(addons);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: new Date(expiry),
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot(addons),
  }), true);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: new Date(expiry.getTime() + 1),
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot(addons),
  }), false);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: expiry,
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot([{ ...addons[0], quantity: 3 }]),
  }), false);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: expiry,
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot([{ ...addons[0], revision: 5 }]),
  }), false);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: expiry,
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot([{
      ...addons[0],
      cancelAtPeriodEnd: true,
      monthlyUnitPriceHalala: 1750,
      paidThroughAt: new Date(expiry.getTime() + 1),
    }]),
  }), false);
  assert.equal(checkoutSnapshotStillCurrent({
    quotedBaseExpiresAt: expiry,
    currentBaseExpiresAt: expiry,
    quotedAddons: snapshot,
    currentAddons: makeRecurringAddonSnapshot([{ ...addons[0], id: 12 }]),
  }), false);
});

test("unconsented legacy add-on intents stay one-time and cannot become recurring", () => {
  assert.deepEqual(addonPurchaseBillingTerms({
    explicitConsent: false,
    monthlyUnitPriceHalala: 5000,
    paidThroughAt: new Date("2032-02-01T00:00:00.000Z"),
  }), {
    recurring: false,
    monthlyUnitPriceHalala: 0,
    paidThroughAt: null,
  });
  assert.deepEqual(addonPurchaseBillingTerms({
    explicitConsent: true,
    monthlyUnitPriceHalala: 5000,
    paidThroughAt: new Date("2032-02-01T00:00:00.000Z"),
  }), {
    recurring: true,
    monthlyUnitPriceHalala: 5000,
    paidThroughAt: new Date("2032-02-01T00:00:00.000Z"),
  });
});

test("a consented trial add-on is due at the first paid-plan period after trial expiry", () => {
  const trialEnds = new Date("2032-01-31T00:00:00.000Z");
  const quote = quoteUpcomingInvoice({
    baseLabel: "الباقة المدفوعة",
    baseAmountHalala: 9900,
    planDays: 30,
    periodStartAt: trialEnds,
    recurringAddons: [{
      id: 91,
      addonType: "chalet",
      quantity: 2,
      monthlyUnitPriceHalala: 1500,
      recurring: true,
      paidThroughAt: trialEnds,
    }],
  });
  assert.deepEqual(quote.map(({ kind, amountHalala, addonPurchaseId }) =>
    ({ kind, amountHalala, addonPurchaseId })), [
    { kind: "base", amountHalala: 9900, addonPurchaseId: undefined },
    { kind: "addon", amountHalala: 3000, addonPurchaseId: 91 },
  ]);
});

test("preview and initiate share exact prorated and next-cycle add-on quote math", () => {
  const now = new Date("2032-01-01T00:00:00.000Z");
  const periodEnd = new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000);
  const quote = quoteAddonCheckout({
    addonType: "service",
    quantity: 2,
    monthlyUnitPriceHalala: 1500,
    cycleDays: 60,
    periodStartAt: now,
    periodEndAt: periodEnd,
    baseLabel: "خطة 60 يوماً",
    baseAmountHalala: 19800,
    recurringAddons: [{
      id: 17,
      addonType: "chalet",
      quantity: 1,
      monthlyUnitPriceHalala: 500,
      recurring: true,
      paidThroughAt: periodEnd,
      cancelAtPeriodEnd: false,
    }],
  });
  assert.deepEqual(quote, {
    amountHalala: 1200,
    remainingDays: 24,
    nextChargeHalala: 26800,
    baseMonthlyHalala: 9900,
  });
});