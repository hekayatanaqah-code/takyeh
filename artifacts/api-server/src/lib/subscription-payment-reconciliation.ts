import { updateRecords } from "@workspace/db/mutations";
import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  subscriptionPaymentReconciliationsTable,
} from "@workspace/db/schema";
import { logger } from "./logger";

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
  refunded?: number;
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
  return !!payment && Number.isSafeInteger(reconciliation.amountHalala) &&
    reconciliation.amountHalala > 0 && reconciliation.intentId.length > 0 &&
    payment.id === reconciliation.paymentId &&
    payment.amount === reconciliation.amountHalala &&
    payment.currency === "SAR" &&
    typeof payment.description === "string" &&
    payment.description.split(/[^A-Za-z0-9_-]+/).includes(reconciliation.intentId);
}

function legacyRefundSummary(refunds: ProviderRefund[] | undefined, paymentId: string) {
  if (!Array.isArray(refunds)) return null;
  const unique = new Map<string, ProviderRefund>();
  for (const refund of refunds) {
    if (!refund || typeof refund.id !== "string" || !refund.id.length ||
        refund.id === paymentId || refund.payment_id !== paymentId ||
        refund.status !== "refunded" || !Number.isSafeInteger(refund.amount) ||
        (refund.amount ?? 0) <= 0) return null;
    const previous = unique.get(refund.id);
    if (previous && previous.amount !== refund.amount) return null;
    unique.set(refund.id, refund);
  }
  const amount = [...unique.values()].reduce((sum, refund) => sum + refund.amount!, 0);
  return Number.isSafeInteger(amount) ? { amount, ids: [...unique.keys()].join(",") } : null;
}

export function verifiedFullRefundId(
  refunds: ProviderRefund[] | undefined,
  paymentId: string,
  amountHalala: number,
): string | null {
  const summary = legacyRefundSummary(refunds, paymentId);
  return summary && summary.amount === amountHalala && summary.ids ? summary.ids : null;
}

// These reconciliations return the entire original subscription charge. A
// partial provider refund is not completion, even when payment.amount is full.
export function verifiedSubscriptionRefund(
  payment: ProviderPayment,
  reconciliation: Pick<ReconciliationRow, "paymentId" | "intentId" | "amountHalala">,
): { refundId: string | null } | null {
  if (!isPaymentForReconciliation(payment, reconciliation) ||
      !["paid", "captured", "refunded"].includes(payment.status ?? "")) return null;
  if (payment.refunded !== undefined) {
    if (!Number.isSafeInteger(payment.refunded) ||
        payment.refunded !== reconciliation.amountHalala) return null;
    // Moyasar returns the original payment, not a separately identified refund.
    return { refundId: null };
  }
  const refundId = verifiedFullRefundId(payment.refunds, reconciliation.paymentId, reconciliation.amountHalala);
  return refundId ? { refundId } : null;
}

export function shouldSubmitRefundRequest(input: {
  refundEligible: boolean;
  refundRequestedAt: Date | null;
  refundAttemptKey: string | null;
  paymentStatus: string | undefined;
}): boolean {
  return input.refundEligible && input.paymentStatus === "paid" &&
    input.refundRequestedAt === null && input.refundAttemptKey === null;
}

function retryDelay(attemptCount: number): number {
  return Math.min(60, 2 ** Math.min(Math.max(attemptCount, 1), 6)) * 60 * 1000;
}

function logUnresolved(reconciliationId: number, paymentId: string, status: string, reason: string) {
  logger.error({
    reconciliationId,
    paymentId,
    status,
    reason,
  }, "Subscription payment refund reconciliation remains unresolved");
}

async function releaseClaim(input: {
  row: ReconciliationRow & { attemptCount: number };
  status: "required" | "refund_pending" | "manual_review";
  reason: string;
}): Promise<void> {
  const now = new Date();
  await db.update(subscriptionPaymentReconciliationsTable).set({
    status: input.status,
    nextAttemptAt: new Date(now.getTime() + retryDelay(input.row.attemptCount)),
    lockedAt: null,
    lastError: input.reason,
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
  refundId: string | null;
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
    const [claimed] = await updateRecords(tx, subscriptionPaymentReconciliationsTable, {
      status: "processing",
      lockedAt: now,
      lastAttemptAt: now,
      attemptCount: row.attemptCount + 1,
      updatedAt: now,
    }, eq(subscriptionPaymentReconciliationsTable.id, id));
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
  const verifiedRefund = verifiedSubscriptionRefund(payment, reconciliation);
  if (verifiedRefund) {
    await markRefunded({ row: reconciliation, refundId: verifiedRefund.refundId });
    return "refunded";
  }
  // An earlier POST can have succeeded even if a later GET is stale or fails.
  // Keep its reservation and key; idempotency is not permission to POST again.
  if (reconciliation.refundRequestedAt || reconciliation.refundAttemptKey) {
    await releaseClaim({
      row: reconciliation,
      status: "refund_pending",
      reason: "An earlier refund outcome is unconfirmed; polling provider state without resubmitting",
    });
    return "refund_pending";
  }
  const refundedAmount = payment.refunded !== undefined
    ? payment.refunded
    : legacyRefundSummary(payment.refunds, reconciliation.paymentId)?.amount;
  if (refundedAmount !== 0) {
    await releaseClaim({
      row: reconciliation,
      status: "manual_review",
      reason: "Provider refund total is partial, invalid, or unknown; no full refund request was submitted",
    });
    return "manual_review";
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
      reason: "A refund attempt is already reserved; polling provider state without resubmitting",
    });
    return "refund_pending";
  }
  let refundAttemptKey = reconciliation.refundAttemptKey;
  if (!reconciliation.refundRequestedAt) {
    const requestedAt = new Date();
    const refundAttemptNumber = reconciliation.refundAttemptNumber + 1;
    refundAttemptKey = `subscription-reconciliation-${id}-${refundAttemptNumber}`;
    const [reserved] = await updateRecords(db, subscriptionPaymentReconciliationsTable, {
      refundRequestedAt: requestedAt,
      refundAttemptNumber,
      refundAttemptKey,
      status: "refund_pending",
      updatedAt: requestedAt,
    }, and(
      eq(subscriptionPaymentReconciliationsTable.id, id),
      isNull(subscriptionPaymentReconciliationsTable.refundRequestedAt),
      eq(subscriptionPaymentReconciliationsTable.status, "processing"),
      eq(subscriptionPaymentReconciliationsTable.lockedAt, reconciliation.lockedAt!),
    ), { id: subscriptionPaymentReconciliationsTable.id });
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
    const refund = await response.json().catch(() => null) as (ProviderPayment & ProviderRefund) | null;
    const confirmation = response.ok && refund
      ? verifiedSubscriptionRefund(refund, reconciliation) : null;
    if (confirmation) {
      await markRefunded({ row: reconciliation, refundId: confirmation.refundId });
      return "refunded";
    }
    // Legacy standalone refund objects lack currency, original amount and
    // checkout linkage. Require a fresh authenticated payment read as evidence.
    if (response.ok && refund?.id && refund.id !== reconciliation.paymentId &&
        refund.payment_id === reconciliation.paymentId &&
        refund.amount === reconciliation.amountHalala && refund.status === "refunded") {
      const verification = await fetcher(
        `https://api.moyasar.com/v1/payments/${encodeURIComponent(reconciliation.paymentId)}`,
        { headers: { Authorization: providerAuthorization(secretKey) } },
      );
      const verified = verification.ok
        ? verifiedSubscriptionRefund(await verification.json() as ProviderPayment, reconciliation) : null;
      if (verified) {
        await markRefunded({ row: reconciliation, refundId: verified.refundId });
        return "refunded";
      }
    }
    await releaseClaim({
      row: reconciliation,
      status: "refund_pending",
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