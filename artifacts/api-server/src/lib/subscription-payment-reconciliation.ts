import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  subscriptionPaymentReconciliationsTable,
} from "@workspace/db/schema";

const RETRY_LIMIT = 25;
const LOCK_LEASE_MS = 5 * 60 * 1000;

interface ProviderRefund {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
}

interface ProviderPayment {
  id?: string;
  amount?: number;
  currency?: string;
  description?: string;
  status?: string;
  refunds?: ProviderRefund[];
}

interface ReconciliationRow {
  id: number;
  paymentId: string;
  intentId: string;
  amountHalala: number;
  refundEligible: boolean;
  refundRequestedAt: Date | null;
  refundAttemptNumber: number;
  refundAttemptKey: string | null;
  lockedAt: Date | null;
}

export function isPaymentForReconciliation(
  payment: ProviderPayment,
  reconciliation: Pick<ReconciliationRow, "paymentId" | "intentId" | "amountHalala">,
): boolean {
  return payment.id === reconciliation.paymentId &&
    payment.amount === reconciliation.amountHalala &&
    payment.currency === "SAR" &&
    typeof payment.description === "string" &&
    payment.description.includes(reconciliation.intentId);
}

export function verifiedFullRefundId(
  refunds: ProviderRefund[] | undefined,
  paymentId: string,
  amountHalala: number,
): string | null {
  const matching = (refunds ?? []).filter((refund) =>
    typeof refund.id === "string" && refund.id.length > 0 &&
    refund.payment_id === paymentId &&
    refund.status === "refunded" &&
    Number.isSafeInteger(refund.amount) && (refund.amount ?? 0) > 0,
  );
  const uniqueRefunds = [...new Map(matching.map((refund) => [refund.id!, refund])).values()];
  const refundedAmount = uniqueRefunds.reduce((sum, refund) => sum + (refund.amount ?? 0), 0);
  if (refundedAmount !== amountHalala) return null;
  return uniqueRefunds.map((refund) => refund.id!).join(",");
}

export function shouldSubmitRefundRequest(input: {
  refundEligible: boolean;
  refundRequestedAt: Date | null;
  refundAttemptKey: string | null;
  paymentStatus: string | undefined;
}): boolean {
  return input.refundEligible && input.paymentStatus === "paid" &&
    (input.refundRequestedAt === null || !!input.refundAttemptKey);
}

function retryDelay(attemptCount: number): number {
  return Math.min(60, 2 ** Math.min(Math.max(attemptCount, 1), 6)) * 60 * 1000;
}

function logUnresolved(reconciliationId: number, paymentId: string, status: string, reason: string) {
  console.error("Subscription payment refund reconciliation remains unresolved", {
    reconciliationId,
    paymentId,
    status,
    reason,
  });
}

async function releaseClaim(input: {
  row: ReconciliationRow & { attemptCount: number };
  status: "required" | "refund_pending" | "manual_review";
  reason: string;
  refundId?: string | null;
  clearRefundRequest?: boolean;
  clearRefundAttemptKey?: boolean;
}): Promise<void> {
  const now = new Date();
  await db.update(subscriptionPaymentReconciliationsTable).set({
    status: input.status,
    nextAttemptAt: new Date(now.getTime() + retryDelay(input.row.attemptCount)),
    lockedAt: null,
    lastError: input.reason,
    ...(input.refundId !== undefined ? { refundId: input.refundId } : {}),
    ...(input.clearRefundRequest ? { refundRequestedAt: null } : {}),
    ...(input.clearRefundAttemptKey ? { refundAttemptKey: null } : {}),
    updatedAt: now,
  }).where(and(
    eq(subscriptionPaymentReconciliationsTable.id, input.row.id),
    inArray(subscriptionPaymentReconciliationsTable.status, ["processing", "refund_pending"]),
    eq(subscriptionPaymentReconciliationsTable.lockedAt, input.row.lockedAt!),
  ));
  logUnresolved(input.row.id, input.row.paymentId, input.status, input.reason);
}

async function markRefunded(input: {
  row: ReconciliationRow & { attemptCount: number };
  refundId: string;
}): Promise<void> {
  const now = new Date();
  await db.update(subscriptionPaymentReconciliationsTable).set({
    status: "refunded",
    refundId: input.refundId,
    lockedAt: null,
    lastError: null,
    updatedAt: now,
  }).where(and(
    eq(subscriptionPaymentReconciliationsTable.id, input.row.id),
    inArray(subscriptionPaymentReconciliationsTable.status, ["processing", "refund_pending"]),
    eq(subscriptionPaymentReconciliationsTable.lockedAt, input.row.lockedAt!),
  ));
}

async function claimReconciliation(id: number) {
  const now = new Date();
  const leaseExpiredBefore = new Date(now.getTime() - LOCK_LEASE_MS);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(subscriptionPaymentReconciliationsTable)
      .where(and(
        eq(subscriptionPaymentReconciliationsTable.id, id),
        inArray(subscriptionPaymentReconciliationsTable.status, ["required", "refund_pending", "processing"]),
        lte(subscriptionPaymentReconciliationsTable.nextAttemptAt, now),
        or(
          isNull(subscriptionPaymentReconciliationsTable.lockedAt),
          lt(subscriptionPaymentReconciliationsTable.lockedAt, leaseExpiredBefore),
        ),
      ))
      .for("update").limit(1);
    if (!row) return null;
    const [claimed] = await tx.update(subscriptionPaymentReconciliationsTable).set({
      status: "processing",
      lockedAt: now,
      lastAttemptAt: now,
      attemptCount: row.attemptCount + 1,
      updatedAt: now,
    }).where(eq(subscriptionPaymentReconciliationsTable.id, id)).returning();
    return claimed ?? null;
  });
}

function providerAuthorization(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

export async function retrySubscriptionPaymentReconciliation(
  id: number,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<string> {
  const row = await claimReconciliation(id);
  if (!row) {
    const [current] = await db.select({ status: subscriptionPaymentReconciliationsTable.status })
      .from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.id, id)).limit(1);
    return current?.status ?? "missing";
  }
  const reconciliation = row as ReconciliationRow & { attemptCount: number };
  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) {
    await releaseClaim({
      row: reconciliation,
      status: reconciliation.refundRequestedAt ? "refund_pending" : "required",
      reason: "MOYASAR_SECRET_KEY is not configured; refund reconciliation is queued for retry",
    });
    return reconciliation.refundRequestedAt ? "refund_pending" : "required";
  }

  let payment: ProviderPayment;
  try {
    const response = await fetcher(
      `https://api.moyasar.com/v1/payments/${encodeURIComponent(reconciliation.paymentId)}`,
      { headers: { Authorization: providerAuthorization(secretKey) } },
    );
    if (!response.ok) {
      await releaseClaim({
        row: reconciliation,
        status: reconciliation.refundRequestedAt ? "refund_pending" : "required",
        reason: `Payment verification returned HTTP ${response.status}`,
      });
      return reconciliation.refundRequestedAt ? "refund_pending" : "required";
    }
    payment = await response.json() as ProviderPayment;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Payment verification request failed";
    await releaseClaim({
      row: reconciliation,
      status: reconciliation.refundRequestedAt ? "refund_pending" : "required",
      reason,
    });
    return reconciliation.refundRequestedAt ? "refund_pending" : "required";
  }

  if (!isPaymentForReconciliation(payment, reconciliation)) {
    await releaseClaim({
      row: reconciliation,
      status: "manual_review",
      reason: "Provider payment identity, amount, currency, or checkout description did not match",
    });
    return "manual_review";
  }
  const verifiedRefundId = verifiedFullRefundId(
    payment.refunds,
    reconciliation.paymentId,
    reconciliation.amountHalala,
  );
  if (verifiedRefundId) {
    await markRefunded({ row: reconciliation, refundId: verifiedRefundId });
    return "refunded";
  }
  if (payment.status !== "paid") {
    await releaseClaim({
      row: reconciliation,
      status: "manual_review",
      reason: `Provider payment status is ${payment.status ?? "unknown"} without a verifiable full refund`,
    });
    return "manual_review";
  }
  if (!reconciliation.refundEligible) {
    await releaseClaim({
      row: reconciliation,
      status: "manual_review",
      reason: "The captured amount could not be verified safely for an automatic refund",
    });
    return "manual_review";
  }

  // A request is reserved durably before contacting Moyasar. After an ambiguous
  // result, retries only inspect provider state and never submit a second refund.
  if (!shouldSubmitRefundRequest({
    refundEligible: reconciliation.refundEligible,
    refundRequestedAt: reconciliation.refundRequestedAt,
    refundAttemptKey: reconciliation.refundAttemptKey,
    paymentStatus: payment.status,
  })) {
    await releaseClaim({
      row: reconciliation,
      status: "refund_pending",
      reason: "A legacy refund request has no persisted idempotency key; polling provider state without resubmitting",
    });
    return "refund_pending";
  }
  let refundAttemptKey = reconciliation.refundAttemptKey;
  if (!reconciliation.refundRequestedAt) {
    const requestedAt = new Date();
    const refundAttemptNumber = reconciliation.refundAttemptNumber + 1;
    refundAttemptKey = `subscription-reconciliation-${id}-${refundAttemptNumber}`;
    const [reserved] = await db.update(subscriptionPaymentReconciliationsTable).set({
      refundRequestedAt: requestedAt,
      refundAttemptNumber,
      refundAttemptKey,
      status: "refund_pending",
      updatedAt: requestedAt,
    }).where(and(
      eq(subscriptionPaymentReconciliationsTable.id, id),
      isNull(subscriptionPaymentReconciliationsTable.refundRequestedAt),
      eq(subscriptionPaymentReconciliationsTable.status, "processing"),
      eq(subscriptionPaymentReconciliationsTable.lockedAt, reconciliation.lockedAt!),
    )).returning({ id: subscriptionPaymentReconciliationsTable.id });
    if (!reserved) {
      await releaseClaim({
        row: reconciliation,
        status: "refund_pending",
        reason: "Another worker reserved the refund request; no duplicate was submitted",
      });
      return "refund_pending";
    }
  }

  try {
    const response = await fetcher(
      `https://api.moyasar.com/v1/payments/${encodeURIComponent(reconciliation.paymentId)}/refund`,
      {
        method: "POST",
        headers: {
          Authorization: providerAuthorization(secretKey),
          "Content-Type": "application/json",
          "Idempotency-Key": refundAttemptKey!,
        },
        body: JSON.stringify({ amount: reconciliation.amountHalala }),
      },
    );
    const refund = await response.json().catch(() => null) as ProviderRefund | null;
    if (response.ok && refund?.id && refund.payment_id === reconciliation.paymentId &&
        refund.amount === reconciliation.amountHalala && refund.status === "refunded") {
      await markRefunded({ row: reconciliation, refundId: refund.id });
      return "refunded";
    }
    if (response.ok && refund?.id && refund.payment_id === reconciliation.paymentId &&
        refund.amount === reconciliation.amountHalala && refund.status === "failed") {
      await releaseClaim({
        row: reconciliation,
        status: "required",
        reason: "Provider confirmed the refund request failed; a fresh idempotent attempt may be made",
        clearRefundRequest: true,
        clearRefundAttemptKey: true,
      });
      return "required";
    }
    await releaseClaim({
      row: reconciliation,
      status: "refund_pending",
      refundId: refund?.id ?? null,
      reason: response.ok
        ? "Provider response did not verify a full refund; retry will inspect payment state without resubmitting"
        : `Refund request returned HTTP ${response.status}; retry will inspect provider state without resubmitting`,
    });
    return "refund_pending";
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Refund submission outcome is unknown";
    await releaseClaim({
      row: reconciliation,
      status: "refund_pending",
      reason: `Refund submission outcome is ambiguous: ${reason}`,
    });
    return "refund_pending";
  }
}

export async function runSubscriptionPaymentReconciliationJob(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<{ checked: number; refunded: number; unresolved: number }> {
  const now = new Date();
  const leaseExpiredBefore = new Date(now.getTime() - LOCK_LEASE_MS);
  const due = await db.select({ id: subscriptionPaymentReconciliationsTable.id })
    .from(subscriptionPaymentReconciliationsTable)
    .where(and(
      inArray(subscriptionPaymentReconciliationsTable.status, ["required", "refund_pending", "processing"]),
      lte(subscriptionPaymentReconciliationsTable.nextAttemptAt, now),
      or(
        isNull(subscriptionPaymentReconciliationsTable.lockedAt),
        lt(subscriptionPaymentReconciliationsTable.lockedAt, leaseExpiredBefore),
      ),
    ))
    .limit(RETRY_LIMIT);
  let refunded = 0;
  for (const item of due) {
    if (await retrySubscriptionPaymentReconciliation(item.id, fetcher) === "refunded") refunded++;
  }
  return { checked: due.length, refunded, unresolved: due.length - refunded };
}