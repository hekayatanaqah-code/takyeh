import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPaymentForReconciliation,
  shouldSubmitRefundRequest,
  verifiedFullRefundId,
  verifiedSubscriptionRefund,
} from "./subscription-payment-reconciliation";

test("reconciliation only accepts the exact captured payment and linked checkout", () => {
  const reconciliation = {
    paymentId: "pay_123",
    intentId: "checkout_123",
    amountHalala: 2500,
  };
  assert.equal(isPaymentForReconciliation({
    id: "pay_123",
    amount: 2500,
    currency: "SAR",
    description: "Subscription checkout checkout_123",
  }, reconciliation), true);
  assert.equal(isPaymentForReconciliation({
    id: "pay_other",
    amount: 2500,
    currency: "SAR",
    description: "Subscription checkout checkout_123",
  }, reconciliation), false);
  assert.equal(isPaymentForReconciliation({
    ...reconciliation,
    currency: "USD",
    description: "Subscription checkout checkout_123",
  }, reconciliation), false);
});

test("refund reconciliation requires matching provider refund identity and amount", () => {
  assert.equal(verifiedFullRefundId([{
    id: "refund_123",
    payment_id: "pay_123",
    amount: 2500,
    status: "refunded",
  }], "pay_123", 2500), "refund_123");
  assert.equal(verifiedFullRefundId([{
    id: "refund_wrong",
    payment_id: "other_payment",
    amount: 2500,
    status: "refunded",
  }], "pay_123", 2500), null);
  assert.equal(verifiedFullRefundId([{
    id: "refund_partial",
    payment_id: "pay_123",
    amount: 1200,
    status: "refunded",
  }], "pay_123", 2500), null);
});

test("ambiguous refund retries never resubmit, including attempts with persisted keys", () => {
  assert.equal(shouldSubmitRefundRequest({
    refundEligible: true,
    refundRequestedAt: null,
    refundAttemptKey: null,
    paymentStatus: "paid",
  }), true);
  assert.equal(shouldSubmitRefundRequest({
    refundEligible: true,
    refundRequestedAt: new Date("2032-01-01T00:00:00Z"),
    refundAttemptKey: "persisted-attempt-key",
    paymentStatus: "paid",
  }), false, "a persisted key must not permit another POST after an unknown outcome");
  assert.equal(shouldSubmitRefundRequest({
    refundEligible: false,
    refundRequestedAt: null,
    refundAttemptKey: null,
    paymentStatus: "paid",
  }), false);
  assert.equal(shouldSubmitRefundRequest({
    refundEligible: true,
    refundRequestedAt: new Date("2032-01-01T00:00:00Z"),
    refundAttemptKey: null,
    paymentStatus: "paid",
  }), false, "legacy ambiguous requests without a stored key must not be blindly resubmitted");
});

const reconciliation = { paymentId: "pay_123", intentId: "checkout_123", amountHalala: 2500 };
const payment = {
  id: "pay_123", amount: 2500, currency: "SAR",
  description: "Subscription checkout checkout_123", status: "paid", refunded: 2500,
};

test("documented payment responses confirm the exact cumulative refund without inventing a refund ID", () => {
  for (const status of ["paid", "captured", "refunded"]) {
    assert.deepEqual(verifiedSubscriptionRefund({ ...payment, status }, reconciliation), { refundId: null });
  }
  for (const refunded of [0, 1200, 2499, 2501, -1, 2500.5, NaN, "2500", null]) {
    assert.equal(verifiedSubscriptionRefund({ ...payment, refunded } as typeof payment, reconciliation), null);
  }
});

test("confirmation rejects mismatched payment identity, currency, original charge, checkout and status", () => {
  for (const change of [
    { id: "other" }, { currency: "USD" }, { amount: 1200 }, { amount: "2500" },
    { description: "checkout_1234" }, { description: "other_checkout_123" },
    { description: "" }, { status: "failed" }, { status: "initiated" },
  ]) {
    assert.equal(verifiedSubscriptionRefund({ ...payment, ...change } as typeof payment, reconciliation), null);
  }
  assert.equal(verifiedSubscriptionRefund(null as unknown as typeof payment, reconciliation), null);
  assert.equal(isPaymentForReconciliation({
    ...payment, description: "Unified subscription renewal invoice 112 (renewal:112)",
  }, { ...reconciliation, intentId: "12" }), false);
  assert.equal(isPaymentForReconciliation({
    ...payment, description: "Unified subscription renewal invoice 12 (renewal:12)",
  }, { ...reconciliation, intentId: "12" }), true);
});

test("legacy cumulative evidence is verified against the full linked payment and cannot override a conflicting current total", () => {
  const first = { id: "refund_1", payment_id: payment.id, amount: 1000, status: "refunded" };
  const second = { ...first, id: "refund_2", amount: 1500 };
  const legacy = { ...payment, refunded: undefined, refunds: [first, second] };
  assert.deepEqual(verifiedSubscriptionRefund(legacy, reconciliation), { refundId: "refund_1,refund_2" });
  assert.deepEqual(verifiedSubscriptionRefund({ ...legacy, refunds: [first, first, second] }, reconciliation),
    { refundId: "refund_1,refund_2" });
  for (const refunds of [
    [first], [first, { ...first, amount: 1500 }], [{ ...first, id: payment.id, amount: 2500 }],
    [first, { ...second, payment_id: "other" }], [first, { ...second, status: "failed" }],
  ]) {
    assert.equal(verifiedSubscriptionRefund({ ...legacy, refunds }, reconciliation), null);
  }
  assert.equal(verifiedSubscriptionRefund({ ...legacy, currency: "USD" }, reconciliation), null);
  assert.equal(verifiedSubscriptionRefund({ ...legacy, refunded: 1200 }, reconciliation), null);
  assert.equal(verifiedSubscriptionRefund({ ...legacy, refunds: {} as never }, reconciliation), null);
});