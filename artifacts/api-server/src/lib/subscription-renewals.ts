import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerBillingProfilesTable,
  ownerSubscriptionsTable,
  subscriptionAddonPurchasesTable,
  subscriptionCheckoutIntentsTable,
  subscriptionPaymentsTable,
  subscriptionRenewalAttemptsTable,
  subscriptionRenewalInvoicesTable,
} from "@workspace/db/schema";
import { logger } from "./logger";
import { subscriptionOwnerKeys } from "./subscription-access";
import { decryptMoyasarToken, isMoyasarTokenVaultAvailable } from "./subscription-token-vault";
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
    if (!subscription || subscription.plan === "trial" || subscription.paymentStatus !== "paid" ||
        !subscription.autoRenewEnabled || !subscription.expiresAt || !subscription.renewalPriceHalala ||
        subscription.renewalPriceHalala < 0 || !isSubscriptionRenewalDue(subscription.expiresAt, now, 1)) {
      return null;
    }
    const [billingProfile] = await tx.select().from(ownerBillingProfilesTable)
      .where(eq(ownerBillingProfilesTable.ownerId, ownerId)).limit(1);
    if (!billingProfile?.autoRenewEnabled || !billingProfile.encryptedPaymentToken ||
        !decryptMoyasarToken(billingProfile.encryptedPaymentToken)) return null;

    const ownerKeys = await subscriptionOwnerKeys(ownerId);
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
    if (existing) return existing;

    const cycleDays = subscription.billingCycleDays ?? 30;
    if (!Number.isSafeInteger(cycleDays) || cycleDays < 1) return null;
    const addonPurchases = await tx.select().from(subscriptionAddonPurchasesTable)
      .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
    const periodEndAt = new Date(periodStartAt.getTime() + cycleDays * DAY_MS);
    const lineItems = quoteUpcomingInvoice({
      baseLabel: subscription.termsSnapshot?.nameAr ?? subscription.plan,
      baseAmountHalala: subscription.renewalPriceHalala,
      planDays: cycleDays,
      periodStartAt,
      recurringAddons: addonPurchases,
    });
    const amountHalala = lineItems.reduce((sum, line) => sum + line.amountHalala, 0);
    if (!Number.isSafeInteger(amountHalala) || amountHalala <= 0 || amountHalala > 2_147_483_647) return null;
    const givenId = randomUUID();
    const [created] = await tx.insert(subscriptionRenewalInvoicesTable).values({
      ownerId,
      periodStartAt,
      periodEndAt,
      givenId,
      basePlan: subscription.plan,
      cycleDays,
      basePriceHalala: subscription.renewalPriceHalala,
      amountHalala,
      lineItems,
      status: "pending",
      nextAttemptAt: now,
    }).onConflictDoNothing({
      target: [subscriptionRenewalInvoicesTable.ownerId, subscriptionRenewalInvoicesTable.periodStartAt],
    }).returning();
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
    const unresolvedAttempt = latest && latest.status !== "failed";
    if ((!subscription.autoRenewEnabled || subscription.plan === "trial" ||
        subscription.expiresAt?.getTime() !== invoice.periodStartAt.getTime()) && !unresolvedAttempt) {
      await tx.update(subscriptionRenewalInvoicesTable)
        .set({ status: "cancelled", lastError: "Automatic renewal consent or period is no longer active" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return null;
    }
    if (!unresolvedAttempt) {
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
      const [claimed] = await tx.update(subscriptionRenewalAttemptsTable).set({
        status: "processing",
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, latest.id)).returning();
      await tx.update(subscriptionRenewalInvoicesTable).set({ status: "processing" })
        .where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
      return claimed ? { invoice, attempt: claimed } : null;
    }
    const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
    const givenId = selectRenewalAttemptGivenId(
      invoice.givenId,
      latest ? { status: latest.status, givenId: latest.givenId } : undefined,
      randomUUID(),
    );
    const [attempt] = await tx.insert(subscriptionRenewalAttemptsTable).values({
      invoiceId,
      attemptNumber,
      givenId,
      status: "processing",
      nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
    }).returning();
    await tx.update(subscriptionRenewalInvoicesTable).set({
      status: "processing",
      givenId,
      attempts: attemptNumber,
      nextAttemptAt: attempt.nextAttemptAt,
      paymentId: null,
      lastError: null,
    }).where(eq(subscriptionRenewalInvoicesTable.id, invoiceId));
    return attempt ? { invoice, attempt } : null;
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

async function reconcileOrCharge(
  invoice: typeof subscriptionRenewalInvoicesTable.$inferSelect,
  attempt: typeof subscriptionRenewalAttemptsTable.$inferSelect,
  token: string,
): Promise<MoyasarPayment> {
  if (attempt.paymentId) {
    const existing = await providerRequest<MoyasarPayment>(`/payments/${encodeURIComponent(attempt.paymentId)}`);
    if (existing.ok && existing.data?.id) return existing.data;
    if (existing.status !== 404) throw new Error("Could not reconcile the previous Moyasar request");
  }
  const result = await providerRequest<MoyasarPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: invoice.amountHalala,
      currency: "SAR",
      description: `Unified subscription renewal invoice ${invoice.id}`,
      source: { type: "token", token },
      given_id: attempt.givenId,
    }),
  });
  if (!result.ok || !result.data?.id) throw new Error("Moyasar renewal charge request failed");
  if (result.data.given_id && result.data.given_id !== attempt.givenId) {
    throw new Error("Moyasar response idempotency key did not match");
  }
  return result.data;
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
    await db.transaction(async (tx) => {
      const [lockedInvoice] = await tx.select().from(subscriptionRenewalInvoicesTable)
        .where(eq(subscriptionRenewalInvoicesTable.id, invoice.id)).for("update").limit(1);
      const [lockedAttempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
        .where(eq(subscriptionRenewalAttemptsTable.id, attempt.id)).for("update").limit(1);
      const [subscription] = await tx.select().from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, invoice.ownerId)).for("update").limit(1);
      if (!lockedInvoice || !lockedAttempt || !subscription) throw new Error("Renewal records disappeared");
      if (lockedInvoice.status === "paid") return;
      if (subscription.expiresAt?.getTime() !== invoice.periodStartAt.getTime() ||
          subscription.plan === "trial") {
        throw new Error("Renewal period changed before payment confirmation");
      }
      const now = new Date();
      await tx.update(ownerSubscriptionsTable).set({
        status: "active",
        paymentStatus: "paid",
        expiresAt: invoice.periodEndAt,
        billingCycleDays: invoice.cycleDays,
        renewalPriceHalala: invoice.basePriceHalala,
        autoRenewEnabled: subscription.autoRenewEnabled,
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
      const receipt = await tx.insert(subscriptionPaymentsTable).values({
        paymentId: paidPaymentId,
        ownerId: invoice.ownerId,
        intentId: `renewal:${invoice.id}`,
        plan: `renewal:${invoice.basePlan}`,
        amountHalala: invoice.amountHalala,
      }).onConflictDoNothing().returning({ paymentId: subscriptionPaymentsTable.paymentId });
      if (!receipt.length) {
        const [existingReceipt] = await tx.select().from(subscriptionPaymentsTable)
          .where(eq(subscriptionPaymentsTable.paymentId, paidPaymentId)).limit(1);
        if (!existingReceipt || existingReceipt.ownerId !== invoice.ownerId ||
            existingReceipt.intentId !== `renewal:${invoice.id}` ||
            existingReceipt.amountHalala !== invoice.amountHalala) {
          throw new Error("Renewal payment receipt conflicts with a different payment");
        }
      }
      await tx.update(subscriptionRenewalAttemptsTable).set({
        paymentId: paidPaymentId,
        status: "paid",
        updatedAt: now,
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        paymentId: payment.id,
        status: "paid",
        paidAt: now,
        lastError: null,
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    });
    return;
  }

  const paymentId = payment.id ?? attempt.paymentId ?? null;
  if (payment.status === "failed" || payment.status === "cancelled") {
    const nextAttemptAt = retryAt(attempt.attemptNumber);
    await db.transaction(async (tx) => {
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

async function processInvoice(invoiceId: number) {
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
  const { invoice, attempt } = claimed;
  const [profile] = await db.select().from(ownerBillingProfilesTable)
    .where(eq(ownerBillingProfilesTable.ownerId, invoice.ownerId)).limit(1);
  const token = profile?.autoRenewEnabled && profile.encryptedPaymentToken
    ? decryptMoyasarToken(profile.encryptedPaymentToken) : null;
  if (!token) {
    await db.update(subscriptionRenewalAttemptsTable).set({
      status: "failed",
      lastError: "No verified encrypted payment method is available",
      nextAttemptAt: retryAt(attempt.attemptNumber),
      updatedAt: new Date(),
    }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
    await db.update(subscriptionRenewalInvoicesTable).set({
      status: "failed",
      lastError: "No verified encrypted payment method is available",
      nextAttemptAt: retryAt(attempt.attemptNumber),
    }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    return;
  }
  try {
    const payment = await reconcileOrCharge(invoice, attempt, token);
    await recordAttemptResult(invoice, attempt, payment);
  } catch {
    const next = retryAt(attempt.attemptNumber);
    await db.transaction(async (tx) => {
      await tx.update(subscriptionRenewalAttemptsTable).set({
        status: attempt.paymentId ? "initiated" : "pending",
        nextAttemptAt: next,
        lastError: "Provider request could not be completed or reconciled; retrying with the same idempotency key",
        updatedAt: new Date(),
      }).where(eq(subscriptionRenewalAttemptsTable.id, attempt.id));
      await tx.update(subscriptionRenewalInvoicesTable).set({
        status: "pending",
        nextAttemptAt: next,
        lastError: "Provider request could not be completed or reconciled",
      }).where(eq(subscriptionRenewalInvoicesTable.id, invoice.id));
    });
  }
}

export async function runSubscriptionRenewalJob(now = new Date()) {
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
        await processInvoice(invoice.id);
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
        await processInvoice(invoice.id);
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
  const addonTotal = addons.filter((addon) =>
    addon.recurring && !addon.cancelAtPeriodEnd &&
    (!nextBillingAt || !addon.paidThroughAt || addon.paidThroughAt <= new Date(nextBillingAt)),
  )
    .reduce((sum, addon) =>
      sum + Math.round(addon.monthlyUnitPriceHalala * addon.quantity * cycleDays / 30), 0);
  const now = new Date();
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
  return {
    autoRenewAvailable: isMoyasarTokenVaultAvailable() &&
      !!process.env.MOYASAR_SECRET_KEY && !!process.env.MOYASAR_PUBLISHABLE_KEY,
    autoRenewEnabled,
    recurring: autoRenewEnabled,
    nextBillingAt,
    nextChargeHalala: basePrice + addonTotal,
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