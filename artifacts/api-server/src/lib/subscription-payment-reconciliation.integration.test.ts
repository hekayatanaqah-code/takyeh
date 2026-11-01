import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { subscriptionPaymentReconciliationsTable as table } from "@workspace/db/schema";
import { retrySubscriptionPaymentReconciliation } from "./subscription-payment-reconciliation";

// This process never uses a real provider credential or network request.
process.env.MOYASAR_SECRET_KEY = "fake-subscription-refund-test-key";

type Payment = {
  id: string; amount: number; currency: string; description: string; status: string;
  refunded?: number; refunds?: { id: string; payment_id: string; amount: number; status: string }[];
};
type Step = { method: "GET" | "POST"; body?: unknown; status?: number; error?: string; invalidJson?: boolean };

async function fixture(run: (f: {
  row: typeof table.$inferSelect;
  payment: Payment;
  fetcher: typeof fetch;
  steps: Step[];
  calls: { method: string; key: string | null }[];
  retry: () => Promise<string>;
  read: () => Promise<typeof table.$inferSelect>;
}) => Promise<void>, pending = false) {
  const suffix = randomUUID();
  const ownerId = `refund_contract_test_${suffix}`;
  const [row] = await db.insert(table).values({
    ownerId, paymentId: `pay_${suffix}`, intentId: `checkout_${suffix}`, amountHalala: 2500,
    reason: "fake provider contract test", status: pending ? "refund_pending" : "required",
    refundRequestedAt: pending ? new Date() : null,
    refundAttemptKey: pending ? `existing_${suffix}` : null,
    refundAttemptNumber: pending ? 1 : 0,
    nextAttemptAt: new Date(Date.now() + 86_400_000),
  }).returning();
  assert.ok(row);
  const payment: Payment = {
    id: row.paymentId, amount: 2500, currency: "SAR",
    description: `Subscription checkout ${row.intentId}`, status: "paid", refunded: 0,
  };
  const steps: Step[] = [];
  const calls: { method: string; key: string | null }[] = [];
  const fetcher = (async (input, init) => {
    const method = init?.method ?? "GET";
    const step = steps.shift();
    assert.ok(step, `unexpected ${method}; no real network requests are allowed`);
    assert.equal(method, step.method);
    assert.equal(String(input), `https://api.moyasar.com/v1/payments/${row.paymentId}${method === "POST" ? "/refund" : ""}`);
    const key = new Headers(init?.headers).get("Idempotency-Key");
    calls.push({ method, key });
    if (method === "POST") {
      assert.ok(key);
      assert.deepEqual(JSON.parse(String(init?.body)), { amount: 2500 });
      const reserved = await read();
      assert.equal(reserved.refundAttemptKey, key);
      assert.ok(reserved.refundRequestedAt, "reservation must precede sending money");
    }
    if (step.error) throw new Error(step.error);
    return new Response(step.invalidJson ? "invalid-json" : JSON.stringify("body" in step ? step.body : payment),
      { status: step.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  async function read() {
    const [current] = await db.select().from(table).where(eq(table.id, row!.id));
    assert.ok(current);
    return current;
  }
  async function retry() {
    await db.update(table).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(table.id, row!.id));
    return retrySubscriptionPaymentReconciliation(row!.id, fetcher);
  }
  try {
    await run({ row, payment, fetcher, steps, calls, retry, read });
    assert.equal(steps.length, 0, "all expected fake provider requests were consumed");
  } finally {
    await db.delete(table).where(eq(table.ownerId, ownerId));
  }
}

test("documented POST payment confirms a full refund, persists no false refund ID, and is not repeated", async () => {
  await fixture(async ({ payment, steps, calls, retry, read }) => {
    steps.push({ method: "GET" }, { method: "POST", body: { ...payment, refunded: 2500, status: "refunded" } });
    assert.equal(await retry(), "refunded");
    const result = await read();
    assert.equal(result.refundId, null, "payment.id is not a refund ID");
    assert.ok(result.refundAttemptKey);
    assert.equal(result.refundAttemptNumber, 1);
    assert.equal(await retry(), "refunded");
    assert.equal(calls.length, 2);
  });
});

test("concurrent workers can reserve and submit only one refund", async () => {
  await fixture(async ({ row, payment, steps, calls, fetcher, read }) => {
    steps.push({ method: "GET" }, { method: "POST", body: { ...payment, refunded: 2500 } });
    await db.update(table).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(table.id, row.id));
    const results = await Promise.all([
      retrySubscriptionPaymentReconciliation(row.id, fetcher),
      retrySubscriptionPaymentReconciliation(row.id, fetcher),
    ]);
    assert.ok(results.includes("refunded"));
    assert.equal((await read()).status, "refunded");
    assert.equal((await read()).refundAttemptNumber, 1);
    assert.equal(calls.filter(c => c.method === "POST").length, 1);
  });
});

test("partial POST is not mistaken for full amount; polling cumulative completion never posts twice", async () => {
  await fixture(async ({ payment, steps, calls, retry, read }) => {
    steps.push({ method: "GET" }, { method: "POST", body: { ...payment, refunded: 1000 } });
    assert.equal(await retry(), "refund_pending");
    const reserved = await read();
    steps.push({ method: "GET", body: { ...payment, refunded: 1000 } });
    assert.equal(await retry(), "refund_pending");
    steps.push({ method: "GET", body: { ...payment, refunded: 2500 } });
    assert.equal(await retry(), "refunded");
    assert.equal(calls.filter(c => c.method === "POST").length, 1);
    assert.equal((await read()).refundAttemptKey, reserved.refundAttemptKey);
  });
});

test("ambiguous POST and later failed, malformed or stale GETs preserve the attempt without another POST", async () => {
  for (const outcome of [
    { error: "simulated timeout after provider accepted money" },
    { status: 502, body: { status: "processing" } },
    { invalidJson: true },
  ]) {
    await fixture(async ({ payment, steps, calls, retry, read }) => {
      steps.push({ method: "GET" }, { method: "POST", ...outcome });
      assert.equal(await retry(), "refund_pending");
      const reserved = await read();
      for (const get of [{ status: 401 }, { error: "GET timeout" }, { invalidJson: true }, {}]) {
        steps.push({ method: "GET", ...get });
        assert.equal(await retry(), "refund_pending");
        const current = await read();
        assert.equal(current.refundAttemptKey, reserved.refundAttemptKey);
        assert.equal(current.refundRequestedAt?.getTime(), reserved.refundRequestedAt?.getTime());
        assert.equal(current.refundAttemptNumber, 1);
      }
      steps.push({ method: "GET", body: { ...payment, refunded: 2500 } });
      assert.equal(await retry(), "refunded");
      assert.equal(calls.filter(c => c.method === "POST").length, 1);
    });
  }
});

test("legacy standalone success needs a complete linked payment read, including summed partial refund objects", async () => {
  await fixture(async ({ payment, steps, retry, read }) => {
    const first = { id: "refund_first", payment_id: payment.id, amount: 1000, status: "refunded" };
    const second = { ...first, id: "refund_second", amount: 1500 };
    steps.push({ method: "GET" },
      { method: "POST", body: { ...first, amount: 2500 } },
      { method: "GET", body: { ...payment, refunded: undefined, refunds: [first, second], status: "refunded" } });
    assert.equal(await retry(), "refunded");
    assert.equal((await read()).refundId, "refund_first,refund_second");
  });
});

test("legacy POST with failed verification GET stays reserved and never creates another attempt", async () => {
  await fixture(async ({ payment, steps, calls, retry, read }) => {
    steps.push({ method: "GET" }, { method: "POST", body: {
      id: "legacy_refund", payment_id: payment.id, amount: 2500, status: "refunded",
    } }, { method: "GET", status: 403 });
    assert.equal(await retry(), "refund_pending");
    const reserved = await read();
    assert.equal(reserved.refundId, null);
    steps.push({ method: "GET" });
    assert.equal(await retry(), "refund_pending");
    assert.equal((await read()).refundAttemptKey, reserved.refundAttemptKey);
    assert.equal(calls.filter(c => c.method === "POST").length, 1);
  });
});

test("mismatched POST confirmation or legacy failure cannot mark success or clear a reserved attempt", async () => {
  for (const change of [
    { id: "wrong" }, { amount: 1200 }, { currency: "USD" }, { description: "other_checkout" },
    { refunded: 2501 }, { refunded: 1200 }, { status: "failed" },
    { id: "legacy_failed_refund", payment_id: "filled-below", status: "failed" },
  ]) {
    await fixture(async ({ payment, steps, calls, retry, read }) => {
      const body = { ...payment, refunded: 2500, ...change };
      if ("payment_id" in body) body.payment_id = payment.id;
      steps.push({ method: "GET" }, { method: "POST", body });
      assert.equal(await retry(), "refund_pending");
      const reserved = await read();
      assert.equal(reserved.refundId, null);
      steps.push({ method: "GET" });
      assert.equal(await retry(), "refund_pending");
      assert.equal((await read()).refundAttemptKey, reserved.refundAttemptKey);
      assert.equal(calls.filter(c => c.method === "POST").length, 1);
    });
  }
});

test("preexisting full refunds resolve by GET; partial or unverifiable totals never trigger a full POST", async () => {
  for (const refunded of [0, 1200, 2500, 2501, -1, null, "2500"]) {
    await fixture(async ({ payment, steps, calls, retry }) => {
      steps.push({ method: "GET", body: { ...payment, refunded } });
      assert.equal(await retry(), refunded === 2500 ? "refunded" : "refund_pending");
      assert.equal(calls.length, 1);
    }, true);
  }
  await fixture(async ({ payment, steps, calls, retry }) => {
    steps.push({ method: "GET", body: { ...payment, refunded: 1200 } });
    assert.equal(await retry(), "manual_review");
    assert.equal(calls.length, 1);
  });
});

test("legacy pending attempts without keys are polled only, and malformed payment bodies cannot release reservations", async () => {
  await fixture(async ({ row, steps, calls, retry, read }) => {
    await db.update(table).set({ refundAttemptKey: null }).where(eq(table.id, row.id));
    steps.push({ method: "GET" });
    assert.equal(await retry(), "refund_pending");
    steps.push({ method: "GET", body: null });
    assert.equal(await retry(), "manual_review");
    assert.ok((await read()).refundRequestedAt);
    assert.equal((await read()).refundAttemptKey, null);
    assert.equal(calls.filter(c => c.method === "POST").length, 0);
  }, true);
});
