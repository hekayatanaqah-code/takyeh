import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPaymentForReconciliation,
  shouldSubmitRefundRequest,
  verifiedFullRefundId,
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

test("ambiguous refund retries reuse their key; legacy unknown attempts are not resubmitted", () => {
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
  }), true, "an ambiguous retry may resubmit only with the same persisted idempotency key");
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