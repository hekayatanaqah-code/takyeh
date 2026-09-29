import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { subscriptionPaymentReconciliationsTable } from "@workspace/db/schema";
import { retrySubscriptionPaymentReconciliation } from "./subscription-payment-reconciliation";

test("reconciliation verifies a mocked refund and polls legacy unknown requests without resubmitting", {
  timeout: 30_000,
}, async () => {
  const suffix = randomUUID();
  const oldSecret = process.env.MOYASAR_SECRET_KEY;
  const firstPaymentId = `reconcile_${suffix}`;
  const secondPaymentId = `reconcile_pending_${suffix}`;
  const firstIntentId = `checkout_${suffix}`;
  const secondIntentId = `checkout_pending_${suffix}`;
  process.env.MOYASAR_SECRET_KEY = "test-secret-not-for-provider";
  let requestCount = 0;
  const paymentFetch = async (paymentId: string, intentId: string, init?: RequestInit) => {
    requestCount++;
    assert.equal(new Headers(init?.headers).get("Authorization"),
      `Basic ${Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString("base64")}`);
    if (init?.method === "POST") {
      assert.equal(new Headers(init.headers).get("Idempotency-Key")?.startsWith("subscription-reconciliation-"), true);
      return new Response(JSON.stringify({
        id: `refund_${paymentId}`,
        payment_id: paymentId,
        amount: 2500,
        status: "refunded",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: paymentId,
      amount: 2500,
      currency: "SAR",
      description: `subscription checkout ${intentId}`,
      status: "paid",
      refunds: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const match = String(input).match(/\/payments\/([^/]+)(\/refund)?$/);
    assert.ok(match, "expected a Moyasar payment verification or refund URL");
    const paymentId = decodeURIComponent(match![1]!);
    if (match![2]) assert.equal(init?.method, "POST");
    const intentId = paymentId === firstPaymentId ? firstIntentId : secondIntentId;
    return paymentFetch(paymentId, intentId, init);
  }) as typeof fetch;

  try {
    const [first] = await db.insert(subscriptionPaymentReconciliationsTable).values({
      paymentId: firstPaymentId,
      ownerId: `reconciliation_test_${suffix}`,
      intentId: firstIntentId,
      amountHalala: 2500,
      reason: "integration test",
      status: "required",
      nextAttemptAt: new Date(Date.now() - 1000),
    }).returning();
    assert.ok(first);
    assert.equal(await retrySubscriptionPaymentReconciliation(first.id, fetcher), "refunded");
    const [verified] = await db.select().from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, first.id)).limit(1);
    assert.equal(verified?.status, "refunded");
    assert.equal(verified?.refundId, `refund_${firstPaymentId}`);
    assert.equal(requestCount, 2, "one verification and one refund submission");

    const [pending] = await db.insert(subscriptionPaymentReconciliationsTable).values({
      paymentId: secondPaymentId,
      ownerId: `reconciliation_test_${suffix}`,
      intentId: secondIntentId,
      amountHalala: 2500,
      reason: "ambiguous earlier submission",
      status: "refund_pending",
      refundRequestedAt: new Date(Date.now() - 60_000),
      nextAttemptAt: new Date(Date.now() - 1000),
    }).returning();
    assert.ok(pending);
    requestCount = 0;
    assert.equal(await retrySubscriptionPaymentReconciliation(pending.id, fetcher), "refund_pending");
    const [stillPending] = await db.select().from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, pending.id)).limit(1);
    assert.equal(stillPending?.status, "refund_pending");
    assert.equal(requestCount, 1, "a legacy request without a persisted idempotency key is only polled");
  } finally {
    if (oldSecret === undefined) delete process.env.MOYASAR_SECRET_KEY;
    else process.env.MOYASAR_SECRET_KEY = oldSecret;
    await db.delete(subscriptionPaymentReconciliationsTable).where(
      eq(subscriptionPaymentReconciliationsTable.ownerId, `reconciliation_test_${suffix}`),
    );
  }
});

test("terminal failures rotate refund keys while ambiguous retries reuse the persisted key", {
  timeout: 30_000,
}, async () => {
  const suffix = randomUUID();
  const ownerId = `reconciliation_key_test_${suffix}`;
  const terminalPaymentId = `terminal_${suffix}`;
  const terminalIntentId = `terminal_checkout_${suffix}`;
  const ambiguousPaymentId = `ambiguous_${suffix}`;
  const ambiguousIntentId = `ambiguous_checkout_${suffix}`;
  const oldSecret = process.env.MOYASAR_SECRET_KEY;
  process.env.MOYASAR_SECRET_KEY = "test-secret-not-for-provider";
  const terminalKeys: string[] = [];
  let terminalRefundCount = 0;
  const terminalFetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      terminalKeys.push(new Headers(init.headers).get("Idempotency-Key") ?? "");
      terminalRefundCount++;
      return new Response(JSON.stringify({
        id: `terminal_refund_${terminalRefundCount}`,
        payment_id: terminalPaymentId,
        amount: 2500,
        status: "failed",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: terminalPaymentId,
      amount: 2500,
      currency: "SAR",
      description: terminalIntentId,
      status: "paid",
      refunds: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const ambiguousKeys: string[] = [];
  let ambiguousRefundCount = 0;
  const ambiguousFetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      ambiguousKeys.push(new Headers(init.headers).get("Idempotency-Key") ?? "");
      ambiguousRefundCount++;
      if (ambiguousRefundCount === 1) {
        return new Response(JSON.stringify({ status: "processing" }), { status: 502 });
      }
      return new Response(JSON.stringify({
        id: `ambiguous_refund_${suffix}`,
        payment_id: ambiguousPaymentId,
        amount: 2500,
        status: "refunded",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: ambiguousPaymentId,
      amount: 2500,
      currency: "SAR",
      description: ambiguousIntentId,
      status: "paid",
      refunds: [],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    const [terminal] = await db.insert(subscriptionPaymentReconciliationsTable).values({
      paymentId: terminalPaymentId,
      ownerId,
      intentId: terminalIntentId,
      amountHalala: 2500,
      reason: "terminal provider failures",
      status: "required",
      nextAttemptAt: new Date(Date.now() - 1000),
    }).returning();
    assert.ok(terminal);
    assert.equal(await retrySubscriptionPaymentReconciliation(terminal.id, terminalFetcher), "required");
    await db.update(subscriptionPaymentReconciliationsTable)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(subscriptionPaymentReconciliationsTable.id, terminal.id));
    assert.equal(await retrySubscriptionPaymentReconciliation(terminal.id, terminalFetcher), "required");
    assert.equal(terminalKeys.length, 2);
    assert.ok(terminalKeys[0]);
    assert.notEqual(terminalKeys[0], terminalKeys[1], "verified terminal failure advances the persisted attempt key");
    const [terminalResult] = await db.select().from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, terminal.id)).limit(1);
    assert.equal(terminalResult?.refundAttemptNumber, 2);
    assert.equal(terminalResult?.refundAttemptKey, null);

    const [ambiguous] = await db.insert(subscriptionPaymentReconciliationsTable).values({
      paymentId: ambiguousPaymentId,
      ownerId,
      intentId: ambiguousIntentId,
      amountHalala: 2500,
      reason: "ambiguous provider response",
      status: "required",
      nextAttemptAt: new Date(Date.now() - 1000),
    }).returning();
    assert.ok(ambiguous);
    assert.equal(await retrySubscriptionPaymentReconciliation(ambiguous.id, ambiguousFetcher), "refund_pending");
    const [firstAmbiguousState] = await db.select().from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, ambiguous.id)).limit(1);
    assert.ok(firstAmbiguousState?.refundAttemptKey);
    await db.update(subscriptionPaymentReconciliationsTable)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(subscriptionPaymentReconciliationsTable.id, ambiguous.id));
    assert.equal(await retrySubscriptionPaymentReconciliation(ambiguous.id, ambiguousFetcher), "refunded");
    assert.equal(ambiguousKeys.length, 2);
    assert.equal(ambiguousKeys[0], firstAmbiguousState?.refundAttemptKey);
    assert.equal(ambiguousKeys[1], ambiguousKeys[0], "ambiguous retries reuse the exact persisted key");
    const [ambiguousResult] = await db.select().from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, ambiguous.id)).limit(1);
    assert.equal(ambiguousResult?.status, "refunded");
    assert.equal(ambiguousResult?.refundAttemptNumber, 1);
  } finally {
    if (oldSecret === undefined) delete process.env.MOYASAR_SECRET_KEY;
    else process.env.MOYASAR_SECRET_KEY = oldSecret;
    await db.delete(subscriptionPaymentReconciliationsTable).where(eq(
      subscriptionPaymentReconciliationsTable.ownerId,
      ownerId,
    ));
  }
});