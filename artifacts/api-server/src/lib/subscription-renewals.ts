import { insertRecords, updateRecords } from "@workspace/db/mutations";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerBillingProfilesTable,
  ownerSubscriptionsTable,
  ownerFreeAccessGrantsTable,
  ownerAccountDiscountsTable,
  subscriptionAddonPurchasesTable,
  subscriptionCheckoutIntentsTable,
  subscriptionPaymentReconciliationsTable,
  subscriptionPaymentsTable,
  subscriptionRenewalAttemptsTable,
  subscriptionRenewalInvoicesTable,
} from "@workspace/db/schema";
import { logger } from "./logger";
import {
  getOwnerFreeAccess,
  isOwnerFreeAccessGrantActive,
  latestOwnerFreeAccess,
  subscriptionOwnerKeys,
} from "./subscription-access";
import { decryptMoyasarToken, isMoyasarTokenVaultAvailable } from "./subscription-token-vault";
import { retrySubscriptionPaymentReconciliation } from "./subscription-payment-reconciliation";
import {
  accountDiscountView,
  discountInvoiceLines,
  latestStartedDiscount,
} from "./subscription-discounts";
import {
  isSubscriptionRenewalDue,
  quoteUpcomingInvoice,
  selectRenewalAttemptGivenId,
} from "./subscription-billing-math";

const DAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 20_000;

type MoyasarPayment = {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  given_id?: string;
  created_at?: string;
};

function retryAt(attemptNumber: number) {
  const delayMs = Math.min(24 * 60 * 60 * 1000, 5 * 60 * 1000 * (2 ** Math.min(attemptNumber - 1, 8)));
  return new Date(Date.now() + delayMs);
}

async function createOrReadDueInvoice(ownerId: string, now: Date) {
  return db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId))
      .for("update")
      .limit(1);
    const ownerKeys = await subscriptionOwnerKeys(ownerId);
    const grants = await tx.select({
      id: ownerFreeAccessGrantsTable.id,
      expiresAt: ownerFreeAccessGrantsTable.expiresAt,
      startDate: ownerFreeAccessGrantsTable.startDate,
      endDate: ownerFreeAccessGrantsTable.endDate,
      createdAt: ownerFreeAccessGrantsTable.createdAt,
    }).from(ownerFreeAccessGrantsTable)
      .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
    const latestGrant = latestOwnerFreeAccess(grants);
    if (isOwnerFreeAccessGrantActive(latestGrant, now)) return null;
    if (!subscription || subscription.plan === "trial" || subscription.paymentStatus !== "paid" ||
        !subscription.autoRenewEnabled || !subscription.expiresAt || !subscription.renewalPriceHalala ||
        subscription.renewalPriceHalala < 0 || !isSubscriptionRenewalDue(subscription.expiresAt, now, 1)) {
      return null;
    }
    const [billingProfile] = await tx.select().from(ownerBillingProfilesTable)
      .where(eq(ownerBillingProfilesTable.ownerId, ownerId)).limit(1);
    if (!billingProfile?.autoRenewEnabled || !billingProfile.encryptedPaymentToken ||
        !decryptMoyasarToken(billingProfile.encryptedPaymentToken)) return null;

    const [pendingManualCheckout] = await tx.select({ id: subscriptionCheckoutIntentsTable.id })
      .from(subscriptionCheckoutIntentsTable)
      .where(and(
        inArray(subscriptionCheckoutIntentsTable.ownerId, ownerKeys),
        isNull(subscriptionCheckoutIntentsTable.consumedAt),
        gt(subscriptionCheckoutIntentsTable.expiresAt, now),
      )).limit(1);
    // Do not race a browser checkout against the scheduled token charge.
    if (pendingManualCheckout) return null;

    const periodStartAt = subscription.expiresAt;
    const [existing] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(and(
        eq(subscriptionRenewalInvoicesTable.ownerId, ownerId),
        eq(subscriptionRenewalInvoicesTable.periodStartAt, periodStartAt),
      )).limit(1);
    if (existing) {
      if (existing.status === "cancelled" &&
          existing.lastError?.startsWith("Account discount updated; undispatched renewal invoice invalidated")) {
        const priorAttempts = await tx.select().from(subscriptionRenewalAttemptsTable)
          .where(eq(subscriptionRenewalAttemptsTable.invoiceId, existing.id));
        const safeToRequote = priorAttempts.every((attempt) =>
          attempt.status === "failed" || (attempt.status === "cancelled" && !attempt.paymentId),
        );
        if (safeToRequote) {
          const cycleDays = subscription.billingCycleDays ?? 30;
          const addonPurchases = await tx.select().from(subscriptionAddonPurchasesTable)
            .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
          const periodEndAt = new Date(periodStartAt.getTime() + cycleDays * DAY_MS);
          const quotedLines = quoteUpcomingInvoice({
            baseLabel: subscription.termsSnapshot?.nameAr ?? subscription.plan,
            baseAmountHalala: subscription.renewalPriceHalala,
            planDays: cycleDays,
            periodStartAt,
            recurringAddons: addonPurchases,
          });
          const discountRows = await tx.select().from(ownerAccountDiscountsTable)
            .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
          const accountDiscount = accountDiscountView(latestStartedDiscount(discountRows, now), now);
          const discounted = discountInvoiceLines(quotedLines, accountDiscount, now);
          const amountHalala = discounted.lineItems.reduce((sum, line) => sum + line.amountHalala, 0);
          if (amountHalala > 0 && amountHalala <= 2_147_483_647) {
            const [updated] = await updateRecords(tx, subscriptionRenewalInvoicesTable, {
              givenId: randomUUID(),
              periodEndAt,
              cycleDays,
              amountHalala,
              lineItems: discounted.lineItems,
              accountDiscountSnapshot: discounted.snapshot,
              status: "pending",
              paymentId: null,
              attempts: 0,
              nextAttemptAt: now,
              lastError: null,
            }, eq(subscriptionRenewalInvoicesTable.id, existing.id));
            return updated ?? existing;
          }
        }
      }
      return existing;
    }

    const cycleDays = subscription.billingCycleDays ?? 30;
    if (!Number.isSafeInteger(cycleDays) || cycleDays < 1) return null;
    const addonPurchases = await tx.select().from(subscriptionAddonPurchasesTable)
      .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
    const periodEndAt = new Date(periodStartAt.getTime() + cycleDays * DAY_MS);
    const quotedLines = quoteUpcomingInvoice({
      baseLabel: subscription.termsSnapshot?.nameAr ?? subscription.plan,
      baseAmountHalala: subscription.renewalPriceHalala,
      planDays: cycleDays,
      periodStartAt,
      recurringAddons: addonPurchases,
    });
    const discountRows = await tx.select().from(ownerAccountDiscountsTable)
      .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
    const accountDiscount = accountDiscountView(latestStartedDiscount(discountRows, now), now);
    const discounted = discountInvoiceLines(quotedLines, accountDiscount, now);
    const lineItems = discounted.lineItems;
    const amountHalala = lineItems.reduce((sum, line) => sum + line.amountHalala, 0);
    if (!Number.isSafeInteger(amountHalala) || amountHalala <= 0 || amountHalala > 2_147_483_647) return null;
    const givenId = randomUUID();
    const [created] = await insertRecords(tx, subscriptionRenewalInvoicesTable, {
      ownerId,
      periodStartAt,
      periodEndAt,
      givenId,
      basePlan: subscription.plan,
      cycleDays,
      basePriceHalala: subscription.renewalPriceHalala,
      amountHalala,
      lineItems,
      accountDiscountSnapshot: discounted.snapshot,
      status: "pending",
      nextAttemptAt: now,
    }, { conflict: { action: "ignore", ...{
      target: [subscriptionRenewalInvoicesTable.ownerId, subscriptionRenewalInvoicesTable.periodStartAt],
    } } });
    if (created) return created;
    const [raced] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(and(
        eq(subscriptionRenewalInvoicesTable.ownerId, ownerId),
        eq(subscriptionRenewalInvoicesTable.periodStartAt, periodStartAt),
      )).limit(1);
    return raced ?? null;
  });
}

async function claimAttempt(invoiceId: number) {
  return db.transaction(async (tx) => {
    const [preview] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId)).limit(1);
    if (!preview) return null;
    const [subscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, preview.ownerId))
      .for("update").limit(1);
    const [invoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId)).for("update").limit(1);
    if (!invoice || !subscription || invoice.status === "paid" || invoice.status === "cancelled" ||
        invoice.nextAttemptAt > new Date()) return null;
    const [latest] = await tx.select().from(subscriptionRenewalAttemptsTable)
      .where(eq(subscriptionRenewalAttemptsTable.invoiceId, invoiceId))
      .orderBy(desc(subscriptionRenewalAttemptsTable.attemptNumber))
      .limit(1);
    const ownerKeys = await subscriptionOwnerKeys(invoice.ownerId);
    const grants = await tx.select({
      id: ownerFreeAccessGrantsTable.id,
      expiresAt: ownerFreeAccessGrantsTable.expiresAt,
      startDate: ownerFreeAccessGrantsTable.startDate,
      endDate: ownerFreeAccessGrantsTable.endDate,
      createdAt: ownerFreeAccessGrantsTable.createdAt,
    }).from(ownerFreeAccessGrantsTable)
      .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
    const latestGrant = latestOwnerFreeAccess(grants);
    if (isOwnerFreeAccessGrantActive(latestGrant)) {
      await tx.update(ownerSubscriptionsTable)
        .set({ autoRenewEnabled: false })
        .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId));
      await tx.update(ownerBillingProfilesTable)
        .set({ autoRenewEnabled: false, updatedAt: new Date() })
        .where(eq(ownerBillingProfilesTable.ownerId, invoice.ownerId));
      const possiblyDispatched = latest && latest.status !== "failed" && latest.status !== "cancelled";
      if (possiblyDispatched) {
        const [reconciling] = await updateRecords(tx, subscriptionRenewalAttemptsTable, {
          status: "reconciling",
          nextAttemptAt: new Date(),
          updatedAt: new Date(),
          lastError: "Free access active; look up any prior provider payment without issuing a new charge",
        }, eq(subscriptionRenewalAttemptsTable.id, latest.id));
        await tx.update(subscriptionRenewalInvoicesTable).set({
          status: "processing",
          nextAttemptAt: new Date(),
          lastError: "Free access active; reconciling by payment ID or idempotency key without charging",
        }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
        return reconciling
          ? { invoice, attempt: reconciling, allowNewCharge: false, lookupBeforeCharge: true }
          : null;
      }
      if (latest) {
        await tx.update(subscriptionRenewalAttemptsTable).set({
          status: "cancelled",
          lastError: "Owner has active superadmin free access",
          updatedAt: new Date(),
        }).where(eq(subscriptionRenewalAttemptsTable.id, latest.id));
      }
      await tx.update(subscriptionRenewalInvoicesTable)
        .set({ status: "cancelled", lastError: "Owner has active superadmin free access" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    const discounts = await tx.select().from(ownerAccountDiscountsTable)
      .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
    const currentDiscount = accountDiscountView(latestStartedDiscount(discounts, new Date()), new Date());
    const termsKey = (discount: { active: boolean; kind: string; value: number; startDate: string | null; endDate: string | null; reason: string } | null) =>
      discount?.active
        ? JSON.stringify([discount.kind, discount.value, discount.startDate, discount.endDate, discount.reason])
        : null;
    const invoiceDiscount = invoice.accountDiscountSnapshot
      ? { ...invoice.accountDiscountSnapshot, active: true }
      : null;
    const unresolvedAttempt = latest && latest.status !== "failed" && latest.status !== "cancelled";
    if (termsKey(currentDiscount) !== termsKey(invoiceDiscount)) {
      const mayHaveReachedProvider = latest && (
        ["dispatched", "initiated", "reconciling"].includes(latest.status) ||
        (!!latest.paymentId && latest.status !== "failed" && latest.status !== "cancelled")
      );
      if (mayHaveReachedProvider) {
        const [reconciling] = await updateRecords(tx, subscriptionRenewalAttemptsTable, {
          status: "reconciling",
          nextAttemptAt: new Date(),
          updatedAt: new Date(),
          lastError: "Account discount changed; reconcile provider state by payment ID or idempotency key using GET only",
        }, eq(subscriptionRenewalAttemptsTable.id, latest.id));
        await tx.update(subscriptionRenewalInvoicesTable).set({
          status: "processing",
          nextAttemptAt: new Date(),
          lastError: "Account discount changed; reconcile dispatched payment using GET only",
        }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
        return reconciling
          ? { invoice, attempt: reconciling, allowNewCharge: false, lookupBeforeCharge: true }
          : null;
      }
      if (latest && unresolvedAttempt) {
        await tx.update(subscriptionRenewalAttemptsTable).set({
          status: "cancelled",
          updatedAt: new Date(),
          lastError: "Account discount changed before provider dispatch; renewal attempt cancelled",
        }).where(eq(subscriptionRenewalAttemptsTable.id, latest.id));
      }
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "cancelled",
        nextAttemptAt: new Date(),
        lastError: "Account discount updated; undispatched renewal invoice invalidated",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    const hasUnresolvedAttempt = latest && latest.status !== "failed";
    if ((!subscription.autoRenewEnabled || subscription.plan === "trial" ||
        subscription.expiresAt?.getTime() !== invoice.periodStartAt.getTime()) && !hasUnresolvedAttempt) {
      await tx.update(subscriptionRenewalInvoicesTable)
        .set({ status: "cancelled", lastError: "Automatic renewal consent or period is no longer active" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    if (!hasUnresolvedAttempt) {
      const ownerKeys = await subscriptionOwnerKeys(invoice.ownerId);
      const [pendingCheckout] = await tx.select({ id: subscriptionCheckoutIntentsTable.id })
        .from(subscriptionCheckoutIntentsTable)
        .where(and(
          inArray(subscriptionCheckoutIntentsTable.ownerId, ownerKeys),
          isNull(subscriptionCheckoutIntentsTable.consumedAt),
          gt(subscriptionCheckoutIntentsTable.expiresAt, new Date()),
        )).limit(1);
      if (pendingCheckout) {
        await tx.update(subscriptionRenewalInvoicesTable)
          .set({ status: "cancelled", lastError: "A manual checkout is in progress for this period" })
          .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
        return null;
      }
    }
    // A non-terminal prior request must be reconciled with its original idempotency key.
    if (latest && latest.status !== "failed") {
      if (latest.nextAttemptAt > new Date()) return null;
      const [claimed] = await updateRecords(tx, subscriptionRenewalAttemptsTable, {
        status: "processing",
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
        updatedAt: new Date(),
      }, eq(subscriptionRenewalAttemptsTable.id, latest.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({ status: "processing" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return claimed ? {
        invoice,
        attempt: claimed,
        allowNewCharge: subscription.autoRenewEnabled,
        lookupBeforeCharge: true,
      } : null;
    }
    const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
    const givenId = selectRenewalAttemptGivenId(
      invoice.givenId,
      latest ? { status: latest.status, givenId: latest.givenId } : undefined,
      randomUUID(),
    );
    const [attempt] = await insertRecords(tx, subscriptionRenewalAttemptsTable, {
      invoiceId,
      attemptNumber,
      givenId,
      status: "processing",
      nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    await tx.update(subscriptionRenewalInvoicesTable).set({
      status: "processing",
      givenId,
      attempts: attemptNumber,
      nextAttemptAt: attempt.nextAttemptAt,
      paymentId: null,
      lastError: null,
    }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
    return attempt ? {
      invoice,
      attempt,
      allowNewCharge: subscription.autoRenewEnabled,
      lookupBeforeCharge: false,
    } : null;
  });
}

async function authorizeRenewalAttemptDispatch(invoiceId: number, attemptId: number): Promise<boolean | null> {
  return db.transaction(async (tx) => {
    const [invoicePreview] = await tx.select({ ownerId: subscriptionRenewalInvoicesTable.ownerId })
      .from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId)).limit(1);
    if (!invoicePreview) return null;
    const [subscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, invoicePreview.ownerId))
      .for("update").limit(1);
    const [invoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId))
      .for("update").limit(1);
    const [attempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
      .where(eq(subscriptionRenewalAttemptsTable.id, attemptId))
      .for("update").limit(1);
    if (!invoice || !attempt || !subscription) return null;
    const ownerKeys = await subscriptionOwnerKeys(invoice.ownerId);
    const grants = await tx.select({
      id: ownerFreeAccessGrantsTable.id,
      expiresAt: ownerFreeAccessGrantsTable.expiresAt,
      startDate: ownerFreeAccessGrantsTable.startDate,
      endDate: ownerFreeAccessGrantsTable.endDate,
      createdAt: ownerFreeAccessGrantsTable.createdAt,
    }).from(ownerFreeAccessGrantsTable)
      .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
    const freeAccessActive = isOwnerFreeAccessGrantActive(latestOwnerFreeAccess(grants));
    const possiblyDispatched = attempt.status === "dispatched" || attempt.status === "initiated" ||
      attempt.status === "reconciling" || !!attempt.paymentId;
    if (freeAccessActive || invoice.status === "cancelled" || !subscription.autoRenewEnabled) {
      if (possiblyDispatched) return false;
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: "cancelled",
        lastError: "Renewal dispatch blocked by free access or disabled renewal",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attemptId));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "cancelled",
        lastError: "Renewal dispatch blocked by free access or disabled renewal",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    const [profile] = await tx.select().from(ownerBillingProfilesTable)
      .where(eq(ownerBillingProfilesTable.ownerId, invoice.ownerId)).for("update").limit(1);
    if (!profile?.autoRenewEnabled || !profile.encryptedPaymentToken) {
      if (possiblyDispatched) return false;
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: "cancelled",
        lastError: "Renewal dispatch blocked because automatic renewal is disabled",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attemptId));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "cancelled",
        lastError: "Renewal dispatch blocked because automatic renewal is disabled",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    return true;
  });
}

async function providerRequest<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data?: T }> {
  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) throw new Error("Moyasar API is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.moyasar.com/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const data = await response.json().catch(() => undefined) as T | undefined;
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupRenewalPayment(
  attempt: typeof subscriptionRenewalAttemptsTable.$inferSelect,
): Promise<MoyasarPayment | null> {
  if (attempt.paymentId) {
    const existing = await providerRequest<MoyasarPayment>(`/payments/${encodeURIComponent(attempt.paymentId)}`);
    if (existing.ok && existing.data?.id) return existing.data;
    if (existing.status !== 404) throw new Error("Could not reconcile the previous Moyasar request");
  }
  const result = await providerRequest<unknown>(
    `/payments?given_id=${encodeURIComponent(attempt.givenId)}`,
  );
  if (!result.ok && result.status !== 404) {
    throw new Error("Could not look up the previous renewal by its idempotency key");
  }
  if (!result.ok || !result.data) return null;
  const payload = result.data as {
    id?: string;
    given_id?: string;
    data?: MoyasarPayment[];
    payments?: MoyasarPayment[];
  } | MoyasarPayment[];
  const candidates = Array.isArray(payload)
    ? payload
    : "data" in payload && Array.isArray(payload.data)
      ? payload.data
      : "payments" in payload && Array.isArray(payload.payments)
        ? payload.payments
        : "id" in payload ? [payload] : [];
  const payment = candidates.find((candidate) =>
    typeof candidate.id === "string" && candidate.id.length > 0 &&
    candidate.given_id === attempt.givenId &&
    (!attempt.paymentId || candidate.id === attempt.paymentId),
  );
  if (!payment) return null;
  if (payment.given_id !== attempt.givenId) {
    throw new Error("Moyasar renewal lookup returned a different idempotency key");
  }
  return payment;
}

type RenewalDispatchResult =
  | { kind: "payment"; payment: MoyasarPayment }
  | { kind: "ambiguous" }
  | { kind: "blocked" };

async function dispatchRenewalCharge(
  invoice: typeof subscriptionRenewalInvoicesTable.$inferSelect,
  attempt: typeof subscriptionRenewalAttemptsTable.$inferSelect,
  token: string,
): Promise<RenewalDispatchResult> {
  if (!process.env.MOYASAR_SECRET_KEY) throw new Error("Moyasar API is not configured");
  return db.transaction(async (tx) => {
    const [subscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
    const [lockedInvoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
    const [lockedAttempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
      .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
    if (!subscription || !lockedInvoice || !lockedAttempt) return { kind: "blocked" };
    const ownerKeys = await subscriptionOwnerKeys(invoice.ownerId);
    const grants = await tx.select({
      id: ownerFreeAccessGrantsTable.id,
      expiresAt: ownerFreeAccessGrantsTable.expiresAt,
      startDate: ownerFreeAccessGrantsTable.startDate,
      endDate: ownerFreeAccessGrantsTable.endDate,
      createdAt: ownerFreeAccessGrantsTable.createdAt,
    }).from(ownerFreeAccessGrantsTable)
      .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
    const grantActive = isOwnerFreeAccessGrantActive(latestOwnerFreeAccess(grants));
    const [profile] = await tx.select().from(ownerBillingProfilesTable)
      .where(eq(ownerBillingProfilesTable.ownerId, invoice.ownerId)).for("update").limit(1);
    if (grantActive || lockedInvoice.status === "cancelled" || !subscription.autoRenewEnabled ||
        !profile?.autoRenewEnabled || !profile.encryptedPaymentToken ||
        lockedAttempt.status === "cancelled" || lockedAttempt.status === "reconciling") {
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: "cancelled",
        lastError: "Renewal POST blocked by free access or disabled renewal",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "cancelled",
        lastError: "Renewal POST blocked by free access or disabled renewal",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
      return { kind: "blocked" };
    }

    let requestInvoked = false;
    try {
      // Hold the subscription lock through invocation and response handling. A
      // grant cannot commit after this live check but before the provider call.
      requestInvoked = true;
      const result = await providerRequest<MoyasarPayment>("/payments", {
        method: "POST",
        body: JSON.stringify({
          amount: invoice.amountHalala,
          currency: "SAR",
          description: `Unified subscription renewal invoice ${invoice.id} (renewal:${invoice.id})`,
          source: { type: "token", token },
          given_id: attempt.givenId,
        }),
      });
      if (!result.data?.id || (result.data.given_id && result.data.given_id !== attempt.givenId)) {
        throw new Error("Moyasar renewal charge response did not contain the expected payment");
      }
      const nextAttemptAt = new Date(Date.now() + 5 * 60 * 1000);
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: "dispatched",
        paymentId: result.data.id,
        nextAttemptAt,
        updatedAt: new Date(),
        lastError: result.ok ? null : "Provider returned a non-success response with a payment identity",
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "processing",
        paymentId: result.data.id,
        nextAttemptAt,
        lastError: null,
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
      return { kind: "payment", payment: result.data };
    } catch (error) {
      if (!requestInvoked) throw error;
      const nextAttemptAt = retryAt(attempt.attemptNumber);
      await tx.update(subscriptionRenewalAttemptsTable).set({
        // The provider call was invoked, but its result is ambiguous. Future
        // work must query by given_id and must not issue a fresh POST after grant.
        status: "dispatched",
        nextAttemptAt,
        lastError: "Provider dispatch result is ambiguous; reconciliation must use GET only",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "processing",
        nextAttemptAt,
        lastError: "Provider dispatch result is ambiguous; reconciliation must use GET only",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
      return { kind: "ambiguous" };
    }
  });
}

async function recordAttemptResult(
  invoice: typeof subscriptionRenewalInvoicesTable.$inferSelect,
  attempt: typeof subscriptionRenewalAttemptsTable.$inferSelect,
  payment: MoyasarPayment,
) {
  if (payment.id && (payment.amount !== invoice.amountHalala || payment.currency !== "SAR" ||
      (payment.given_id && payment.given_id !== attempt.givenId))) {
    throw new Error("Moyasar renewal payment did not match its invoice");
  }
  if (payment.status === "paid" && payment.id) {
    const paidPaymentId = payment.id;
    const reconciliationId = await db.transaction(async (tx) => {
      const [subscription] = await tx.select().from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
      const [lockedInvoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
        .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
      const [lockedAttempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
        .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
      if (!lockedInvoice || !lockedAttempt || !subscription) throw new Error("Renewal records disappeared");
      if (lockedInvoice.status === "paid") return null;
      if (subscription.expiresAt?.getTime() !== invoice.periodStartAt.getTime() ||
          subscription.plan === "trial") {
        throw new Error("Renewal period changed before payment confirmation");
      }
      const now = new Date();
      const paymentCreatedAt = payment.created_at ? new Date(payment.created_at) : now;
      const hasProviderPaidAt = !!payment.created_at && !Number.isNaN(paymentCreatedAt.getTime());
      const providerPaidAt = hasProviderPaidAt ? paymentCreatedAt : now;
      const ownerKeys = await subscriptionOwnerKeys(invoice.ownerId);
      const freeGrants = await tx.select({
        id: ownerFreeAccessGrantsTable.id,
        expiresAt: ownerFreeAccessGrantsTable.expiresAt,
        startDate: ownerFreeAccessGrantsTable.startDate,
        endDate: ownerFreeAccessGrantsTable.endDate,
        createdAt: ownerFreeAccessGrantsTable.createdAt,
      }).from(ownerFreeAccessGrantsTable)
        .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
      const latestFreeGrant = latestOwnerFreeAccess(freeGrants);
      const freeAccessActive = isOwnerFreeAccessGrantActive(latestFreeGrant, now);

      const receipt = await insertRecords(tx, subscriptionPaymentsTable, {
        paymentId: paidPaymentId,
        ownerId: invoice.ownerId,
        intentId: `renewal:${invoice.id}`,
        plan: `renewal:${invoice.basePlan}`,
        amountHalala: invoice.amountHalala,
      }, { conflict: { action: "ignore" }, returning: { paymentId: subscriptionPaymentsTable.paymentId } });
      if (!receipt.length) {
        const [existingReceipt] = await tx.select().from(subscriptionPaymentsTable)
          .where(eq(subscriptionPaymentsTable.paymentId, paidPaymentId)).limit(1);
        if (!existingReceipt || existingReceipt.ownerId !== invoice.ownerId ||
            existingReceipt.intentId !== `renewal:${invoice.id}` ||
            existingReceipt.amountHalala !== invoice.amountHalala) {
          throw new Error("Renewal payment receipt conflicts with a different payment");
        }
      }
      const grantAtPayment = hasProviderPaidAt ? freeGrants
        .filter((grant) => grant.createdAt <= providerPaidAt &&
          (!grant.startDate || isOwnerFreeAccessGrantActive(grant, providerPaidAt)))
        .sort((left, right) =>
          left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id,
        )
        .at(-1) : undefined;
      const grantTimestampUnknown = !hasProviderPaidAt && freeGrants.length > 0;
      if (grantAtPayment || grantTimestampUnknown) {
        const [reconciliation] = await insertRecords(tx, subscriptionPaymentReconciliationsTable, {
          paymentId: paidPaymentId,
          ownerId: invoice.ownerId,
          intentId: String(invoice.id),
          amountHalala: invoice.amountHalala,
          reason: grantTimestampUnknown
            ? "Renewal payment timestamp is missing while free access exists; manual review required without activation"
            : "Renewal payment was captured after superadmin free access; do not activate the paid renewal",
          status: "required",
          refundEligible: !!grantAtPayment,
        }, { conflict: { action: "ignore" }, returning: { id: subscriptionPaymentReconciliationsTable.id } });
        const [existingReconciliation] = reconciliation ? [] : await tx.select({
          id: subscriptionPaymentReconciliationsTable.id,
        }).from(subscriptionPaymentReconciliationsTable)
          .where(eq(subscriptionPaymentReconciliationsTable.paymentId, paidPaymentId)).limit(1);
        await tx.update(subscriptionRenewalAttemptsTable).set({
          paymentId: paidPaymentId,
          status: "paid",
          updatedAt: now,
          lastError: "Paid after free-access grant; queued for refund reconciliation",
        }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
        await tx.update(subscriptionRenewalInvoicesTable).set({
          paymentId: paidPaymentId,
          status: "cancelled",
          paidAt: providerPaidAt,
          lastError: "Paid after free-access grant; queued for refund reconciliation",
        }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
        return reconciliation?.id ?? existingReconciliation?.id ?? null;
      }

      await tx.update(ownerSubscriptionsTable).set({
        status: "active",
        paymentStatus: "paid",
        expiresAt: invoice.periodEndAt,
        billingCycleDays: invoice.cycleDays,
        renewalPriceHalala: invoice.basePriceHalala,
        autoRenewEnabled: freeAccessActive ? false : subscription.autoRenewEnabled,
      }).where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId));
      for (const line of invoice.lineItems) {
        if (line.kind !== "addon" || line.addonPurchaseId == null || !line.periodEndAt) continue;
        await tx.update(subscriptionAddonPurchasesTable).set({
          periodStartAt: line.periodStartAt ? new Date(line.periodStartAt) : invoice.periodStartAt,
          paidThroughAt: new Date(line.periodEndAt),
          revision: sql`${subscriptionAddonPurchasesTable.revision} + 1`,
        }).where(and(
          eq(subscriptionAddonPurchasesTable.id, line.addonPurchaseId),
          eq(subscriptionAddonPurchasesTable.recurring, true),
          eq(subscriptionAddonPurchasesTable.cancelAtPeriodEnd, false),
        ));
      }
      await tx.update(subscriptionRenewalAttemptsTable).set({
        paymentId: paidPaymentId,
        status: "paid",
        updatedAt: now,
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        paymentId: payment.id,
        status: "paid",
        paidAt: providerPaidAt,
        lastError: null,
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
      return null;
    });
    if (reconciliationId) {
      await retrySubscriptionPaymentReconciliation(reconciliationId);
    }
    return;
  }

  const paymentId = payment.id ?? attempt.paymentId ?? null;
  if (payment.status === "failed" || payment.status === "cancelled") {
    const nextAttemptAt = retryAt(attempt.attemptNumber);
    await db.transaction(async (tx) => {
      await tx.select({ ownerId: ownerSubscriptionsTable.ownerId }).from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
      await tx.select({ id: subscriptionRenewalInvoicesTable.id }).from(subscriptionRenewalInvoicesTable)
        .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
      await tx.select({ id: subscriptionRenewalAttemptsTable.id }).from(subscriptionRenewalAttemptsTable)
        .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
      await tx.update(subscriptionRenewalAttemptsTable).set({
        paymentId,
        status: "failed",
        nextAttemptAt,
        lastError: "Payment was declined by the payment provider",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        paymentId,
        status: "failed",
        nextAttemptAt,
        lastError: "Payment was declined by the payment provider",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    });
    return;
  }
  // Initiated/pending statuses are reconciled by payment id before any retry.
  const next = new Date(Date.now() + 5 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.select({ ownerId: ownerSubscriptionsTable.ownerId }).from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
    await tx.select({ id: subscriptionRenewalInvoicesTable.id }).from(subscriptionRenewalInvoicesTable)
      .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
    await tx.select({ id: subscriptionRenewalAttemptsTable.id }).from(subscriptionRenewalAttemptsTable)
      .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
    await tx.update(subscriptionRenewalAttemptsTable).set({
      paymentId,
      status: "initiated",
      nextAttemptAt: next,
      updatedAt: new Date(),
    }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
    await tx.update(subscriptionRenewalInvoicesTable).set({
      paymentId,
      status: "pending",
      nextAttemptAt: next,
    }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
  });
}

type RenewalJobHooks = {
  beforeProviderDispatch?: (invoiceId: number, attemptId: number) => Promise<void>;
};

async function processInvoice(invoiceId: number, hooks?: RenewalJobHooks) {
  const [previewInvoice] = await db.select().from(subscriptionRenewalInvoicesTable)
    .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId)).limit(1);
  if (!previewInvoice || previewInvoice.status === "paid" || previewInvoice.status === "cancelled") return;
  const [subscription] = await db.select().from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, previewInvoice.ownerId)).limit(1);
  const [latestAttempt] = await db.select().from(subscriptionRenewalAttemptsTable)
    .where(eq(subscriptionRenewalAttemptsTable.invoiceId, invoiceId))
    .orderBy(desc(subscriptionRenewalAttemptsTable.attemptNumber)).limit(1);
  const unresolvedAttempt = latestAttempt && latestAttempt.status !== "failed";
  if (!unresolvedAttempt) {
    const ownerKeys = await subscriptionOwnerKeys(previewInvoice.ownerId);
    const [pendingCheckout] = await db.select({ id: subscriptionCheckoutIntentsTable.id })
      .from(subscriptionCheckoutIntentsTable)
      .where(and(
        inArray(subscriptionCheckoutIntentsTable.ownerId, ownerKeys),
        isNull(subscriptionCheckoutIntentsTable.consumedAt),
        gt(subscriptionCheckoutIntentsTable.expiresAt, new Date()),
      )).limit(1);
    if (pendingCheckout) {
      await db.update(subscriptionRenewalInvoicesTable)
        .set({ status: "cancelled", lastError: "A manual checkout is in progress for this period" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return;
    }
  }
  if ((!subscription?.autoRenewEnabled || subscription.plan === "trial" ||
      subscription.expiresAt?.getTime() !== previewInvoice.periodStartAt.getTime()) && !unresolvedAttempt) {
    await db.update(subscriptionRenewalInvoicesTable)
      .set({ status: "cancelled", lastError: "Automatic renewal consent or period is no longer active" })
      .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
    return;
  }
  const [profilePreview] = await db.select().from(ownerBillingProfilesTable)
    .where(eq(ownerBillingProfilesTable.ownerId, previewInvoice.ownerId)).limit(1);
  if ((!profilePreview?.autoRenewEnabled || !profilePreview.encryptedPaymentToken ||
      !decryptMoyasarToken(profilePreview.encryptedPaymentToken)) && !unresolvedAttempt) {
    const next = retryAt((latestAttempt?.attemptNumber ?? 0) + 1);
    await db.update(subscriptionRenewalInvoicesTable).set({
      status: "failed",
      lastError: "No verified encrypted payment method is available",
      nextAttemptAt: next,
    }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
    return;
  }
  const claimed = await claimAttempt(invoiceId);
  if (!claimed) return;
  const { invoice, attempt, allowNewCharge, lookupBeforeCharge } = claimed;
  const [profile] = await db.select().from(ownerBillingProfilesTable)
    .where(eq(ownerBillingProfilesTable.ownerId, invoice.ownerId)).limit(1);
  const token = profile?.encryptedPaymentToken
    ? decryptMoyasarToken(profile.encryptedPaymentToken) : null;
  try {
    const permittedToCharge = allowNewCharge;
    if (lookupBeforeCharge) {
      const payment = await lookupRenewalPayment(attempt);
      if (payment) {
        await recordAttemptResult(invoice, attempt, payment);
        return;
      }
      if (!permittedToCharge) {
        const nextAttemptAt = retryAt(attempt.attemptNumber);
        await db.transaction(async (tx) => {
          await tx.select({ ownerId: ownerSubscriptionsTable.ownerId }).from(ownerSubscriptionsTable)
            .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
          await tx.select({ id: subscriptionRenewalInvoicesTable.id }).from(subscriptionRenewalInvoicesTable)
            .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
          await tx.select({ id: subscriptionRenewalAttemptsTable.id }).from(subscriptionRenewalAttemptsTable)
            .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
          await tx.update(subscriptionRenewalAttemptsTable).set({
            status: "reconciling",
            nextAttemptAt,
            lastError: "No provider payment found; continue GET-only reconciliation while renewal is blocked",
            updatedAt: new Date(),
          }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
          await tx.update(subscriptionRenewalInvoicesTable).set({
            status: "processing",
            nextAttemptAt,
            lastError: "No provider payment found; continue GET-only reconciliation while renewal is blocked",
          }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
        });
        return;
      }
    }

    if (permittedToCharge) {
      const authorization = await authorizeRenewalAttemptDispatch(invoice.id, attempt.id);
      if (authorization === null) return;
      if (!authorization) {
        // A grant or renewal cancellation landed after claim/lookup. Never turn
        // an authorization into a charge; the next pass performs GET-only lookup.
        return;
      }
      await hooks?.beforeProviderDispatch?.(invoice.id, attempt.id);
      if (!token) throw new Error("No verified encrypted payment token is available");
      const dispatch = await dispatchRenewalCharge(invoice, attempt, token);
      if (dispatch.kind === "payment") {
        await recordAttemptResult(invoice, attempt, dispatch.payment);
      }
    }
  } catch {
    const next = retryAt(attempt.attemptNumber);
    await db.transaction(async (tx) => {
      await tx.select({ ownerId: ownerSubscriptionsTable.ownerId }).from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
      await tx.select({ id: subscriptionRenewalInvoicesTable.id }).from(subscriptionRenewalInvoicesTable)
        .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
      await tx.select({ id: subscriptionRenewalAttemptsTable.id }).from(subscriptionRenewalAttemptsTable)
        .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: attempt.paymentId ? "initiated" : lookupBeforeCharge ? "reconciling" : "pending",
        nextAttemptAt: next,
        lastError: "Provider request or reconciliation failed; retry using GET before any new dispatch",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: lookupBeforeCharge ? "processing" : "pending",
        nextAttemptAt: next,
        lastError: "Provider request or reconciliation failed",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    });
  }
}

export async function runSubscriptionRenewalJob(now = new Date(), hooks?: RenewalJobHooks) {
  try {
    const due = await db.select({ id: ownerSubscriptionsTable.id, ownerId: ownerSubscriptionsTable.ownerId })
      .from(ownerSubscriptionsTable)
      .where(and(
        eq(ownerSubscriptionsTable.paymentStatus, "paid"),
        eq(ownerSubscriptionsTable.autoRenewEnabled, true),
        lte(ownerSubscriptionsTable.expiresAt, new Date(now.getTime() + RENEWAL_WINDOW_MS)),
      ));
    for (const subscription of due) {
      try {
        const invoice = await createOrReadDueInvoice(subscription.ownerId, now);
        if (!invoice || invoice.status === "paid" || invoice.nextAttemptAt > now) continue;
        await processInvoice(invoice.id, hooks);
      } catch (error) {
        logger.error({ err: error, ownerId: subscription.ownerId }, "Owner subscription renewal failed");
      }
    }

    const retryable = await db.select({ id: subscriptionRenewalInvoicesTable.id })
      .from(subscriptionRenewalInvoicesTable)
      .where(and(
        or(
          eq(subscriptionRenewalInvoicesTable.status, "pending"),
          eq(subscriptionRenewalInvoicesTable.status, "failed"),
          eq(subscriptionRenewalInvoicesTable.status, "processing"),
        ),
        lte(subscriptionRenewalInvoicesTable.nextAttemptAt, now),
      ));
    for (const invoice of retryable) {
      try {
        await processInvoice(invoice.id, hooks);
      } catch (error) {
        logger.error({ err: error, invoiceId: invoice.id }, "Subscription renewal retry failed");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Subscription renewal job failed");
  }
}

export async function getSubscriptionBillingReadiness(ownerId: string) {
  const [subscription] = await db.select().from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, ownerId)).limit(1);
  const [profile] = await db.select().from(ownerBillingProfilesTable)
    .where(eq(ownerBillingProfilesTable.ownerId, ownerId)).limit(1);
  const tokenAvailable = !!profile?.encryptedPaymentToken &&
    !!decryptMoyasarToken(profile.encryptedPaymentToken);
  const basePrice = subscription?.renewalPriceHalala ?? 0;
  const cycleDays = subscription?.billingCycleDays ?? 30;
  const nextBillingAt = subscription?.expiresAt?.toISOString() ?? null;
  const ownerKeys = await subscriptionOwnerKeys(ownerId);
  const addons = await db.select().from(subscriptionAddonPurchasesTable)
    .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
  const now = new Date();
  const nextPeriodStartAt = subscription?.expiresAt ?? now;
  const quoteCycleDays = Number.isSafeInteger(cycleDays) && cycleDays > 0 ? cycleDays : 30;
  const upcomingLines = subscription
    ? quoteUpcomingInvoice({
      baseLabel: subscription.termsSnapshot?.nameAr ?? subscription.plan,
      baseAmountHalala: basePrice,
      planDays: quoteCycleDays,
      periodStartAt: nextPeriodStartAt,
      recurringAddons: addons,
    })
    : [{ kind: "base" as const, label: "Subscription", amountHalala: basePrice }];
  const accountDiscountRows = await db.select().from(ownerAccountDiscountsTable)
    .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
  const chargeDate = subscription?.expiresAt ?? now;
  const accountDiscount = accountDiscountView(
    latestStartedDiscount(accountDiscountRows, chargeDate),
    chargeDate,
  );
  const discountedUpcomingLines = discountInvoiceLines(upcomingLines, accountDiscount, chargeDate).lineItems;
  const upcomingChargeHalala = discountedUpcomingLines.reduce((sum, line) => sum + line.amountHalala, 0);
  const activeRecurringAddons = addons.filter((addon) =>
    addon.recurring && !addon.cancelAtPeriodEnd && !!addon.paidThroughAt && addon.paidThroughAt > now,
  );
  const recurringChaletSlots = activeRecurringAddons
    .filter((addon) => addon.addonType === "chalet")
    .reduce((sum, addon) => sum + addon.quantity, 0);
  const recurringServiceSlots = activeRecurringAddons
    .filter((addon) => addon.addonType === "service")
    .reduce((sum, addon) => sum + addon.quantity, 0);
  const autoRenewEnabled = !!subscription?.autoRenewEnabled && !!profile?.autoRenewEnabled && tokenAvailable;
  const freeAccess = await getOwnerFreeAccess(ownerId);
  return {
    autoRenewAvailable: isMoyasarTokenVaultAvailable() &&
      !!process.env.MOYASAR_SECRET_KEY && !!process.env.MOYASAR_PUBLISHABLE_KEY,
    autoRenewEnabled: freeAccess?.active ? false : autoRenewEnabled,
    recurring: freeAccess?.active ? false : autoRenewEnabled,
    nextBillingAt: freeAccess?.active ? null : nextBillingAt,
    nextChargeHalala: freeAccess?.active ? 0 : upcomingChargeHalala,
    paidNextBillingAt: nextBillingAt,
    paidNextChargeHalala: upcomingChargeHalala,
    baseRenewalPriceHalala: basePrice,
    baseMonthlyHalala: cycleDays > 0 ? Math.round(basePrice * 30 / cycleDays) : 0,
    recurringAddonCount: recurringChaletSlots + recurringServiceSlots,
    recurringChaletSlots,
    recurringServiceSlots,
    billingCycleDays: cycleDays,
    billingCycleLabel: cycleDays === 30 ? "monthly" : `every ${cycleDays} days`,
    recurringConfigured: isMoyasarTokenVaultAvailable() &&
      !!process.env.MOYASAR_SECRET_KEY && !!process.env.MOYASAR_PUBLISHABLE_KEY,
    savedPaymentMethodAvailable: tokenAvailable,
  };
}