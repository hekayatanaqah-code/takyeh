import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerSubscriptionsTable,
  ownerBillingProfilesTable,
  subscriptionAddonCheckoutIntentsTable,
  subscriptionAddonPurchasesTable,
  subscriptionPaymentsTable,
  subscriptionPlansTable,
} from "@workspace/db/schema";
import {
  confirmAddonCheckout,
  createAddonCheckout,
  readAddonCheckoutQuote,
  redeemFreeAddonCheckout,
  SubscriptionAddonCheckoutError,
} from "./subscription-addon-checkout";
import { ownerPlanAccess } from "./subscription-access";
import { proratedAddonAmountHalala } from "./subscription-billing-math";

test("add-on checkout grants exactly quoted, paid capacity", { timeout: 30_000 }, async () => {
  const suffix = randomUUID();
  const ownerId = `addon_test_${suffix}`;
  const otherOwnerId = `addon_test_other_${suffix}`;
  const planSlug = `addon-test-${suffix}`;
  const originalFetch = globalThis.fetch;
  const oldPublishable = process.env.MOYASAR_PUBLISHABLE_KEY;
  const oldSecret = process.env.MOYASAR_SECRET_KEY;
  const oldSessionSecret = process.env.SESSION_SECRET;
  const fakePublishable = "test-publishable-key-not-for-provider";
  const fakeSecret = "test-secret-key-not-for-provider";
  let providerReply: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    description: string;
    created_at: string;
    source?: { token?: string };
  } | null = null;
  let fetchCalls = 0;
  let rejectedByUnexpectedFetch = false;

  const restoreEnv = (key: "MOYASAR_PUBLISHABLE_KEY" | "MOYASAR_SECRET_KEY", value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  try {
    process.env.MOYASAR_PUBLISHABLE_KEY = fakePublishable;
    process.env.MOYASAR_SECRET_KEY = fakeSecret;
    process.env.SESSION_SECRET = "integration-test-session-secret";
    await db.insert(subscriptionPlansTable).values({
      slug: planSlug,
      nameAr: "باقة تكامل اختبارية",
      price: "0.00",
      durationDays: 30,
      trialDays: 30,
      features: ["اختبار معزول"],
      scope: "property",
      chaletLimit: 0,
      serviceLimit: 0,
      extraChaletPrice: "0.00",
      extraServicePrice: "50.00",
      isActive: true,
      sortOrder: 9999,
    });
    await db.insert(ownerSubscriptionsTable).values({
      ownerId,
      plan: planSlug,
      status: "active",
      paymentStatus: "free",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // A zero-priced property slot is redeemable without a payment provider and
    // the same redemption is idempotent, even when requested again.
    const freeQuote = await createAddonCheckout({ ownerId, addonType: "chalet", quantity: 3 });
    assert.equal(freeQuote.amountHalala, 0);
    assert.equal(freeQuote.quantity, 3);
    assert.equal(freeQuote.unitPriceHalala, 0);
    await assert.rejects(
      readAddonCheckoutQuote({ ownerId, checkoutId: freeQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError,
      "the payment-page quote reader rejects free checkouts",
    );
    const pendingSecondFreeQuote = await createAddonCheckout({ ownerId, addonType: "chalet", quantity: 2 });
    await db.update(subscriptionAddonCheckoutIntentsTable)
      .set({ quoteVersion: 1, autoRenewConsent: true })
      .where(eq(subscriptionAddonCheckoutIntentsTable.id, freeQuote.checkoutId));
    const freeResult = await redeemFreeAddonCheckout({ ownerId, checkoutId: freeQuote.checkoutId });
    assert.equal(freeResult.purchase.amountHalala, 0);
    assert.equal(freeResult.purchase.quantity, 3);
    assert.equal(freeResult.purchase.recurring, false, "a quote without recorded consent remains one-time");
    const repeatedFreeResult = await redeemFreeAddonCheckout({ ownerId, checkoutId: freeQuote.checkoutId });
    assert.equal(repeatedFreeResult.purchase.id, freeResult.purchase.id);

    const afterFree = await ownerPlanAccess(ownerId);
    assert.equal(afterFree.baseChaletLimit, 0);
    assert.equal(afterFree.purchasedChaletSlots, 3);
    assert.equal(afterFree.chaletLimit, 3);
    assert.equal(afterFree.chaletCount, 0);
    await assert.rejects(
      redeemFreeAddonCheckout({ ownerId, checkoutId: pendingSecondFreeQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 409,
      "a pending free quote cannot grant more capacity while existing slots are unused",
    );
    await assert.rejects(
      createAddonCheckout({ ownerId, addonType: "chalet", quantity: 1 }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 409,
      "a new free quote is rejected while purchased slots remain unused",
    );
    await assert.rejects(
      redeemFreeAddonCheckout({ ownerId: otherOwnerId, checkoutId: freeQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 404,
      "another account cannot redeem this quote",
    );

    // Add-ons can be purchased proactively, and quote totals are unit price
    // multiplied by the requested quantity.
    await assert.rejects(
      createAddonCheckout({ ownerId, addonType: "service", quantity: 3 }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 400,
      "a new paid recurring add-on quote requires explicit consent",
    );
    const paidQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 3, autoRenewConsent: true,
    });
    const expectedPaidAmount = proratedAddonAmountHalala(
      5000, 3,
      Date.parse(paidQuote.periodEndAt) - Date.parse(paidQuote.periodStartAt),
      paidQuote.cycleDays,
    );
    await db.update(subscriptionPlansTable).set({ extraServicePrice: "51.25" })
      .where(eq(subscriptionPlansTable.slug, planSlug));
    const rereadPaidQuote = await readAddonCheckoutQuote({ ownerId, checkoutId: paidQuote.checkoutId });
    assert.equal(rereadPaidQuote.amountHalala, expectedPaidAmount);
    assert.equal(rereadPaidQuote.unitPriceHalala, 5000);
    assert.equal(rereadPaidQuote.autoRenewConsent, true);
    assert.equal(rereadPaidQuote.recurring, true);
    assert.equal(rereadPaidQuote.publishableKey, fakePublishable);
    assert.equal(rereadPaidQuote.nextChargeHalala, paidQuote.nextChargeHalala);
    await assert.rejects(
      readAddonCheckoutQuote({ ownerId: otherOwnerId, checkoutId: paidQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 404,
      "another account cannot read this quote",
    );
    const expiredQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 4, autoRenewConsent: true,
    });
    await db.update(subscriptionAddonCheckoutIntentsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(subscriptionAddonCheckoutIntentsTable.id, expiredQuote.checkoutId));
    await assert.rejects(
      readAddonCheckoutQuote({ ownerId, checkoutId: expiredQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 410,
      "expired quotes are unavailable to the payment page",
    );
    const editedServicePrice = await ownerPlanAccess(ownerId);
    assert.equal(editedServicePrice.extraServicePrice, "51.25");
    const differentQuantityQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 2, autoRenewConsent: true,
    });
    const expectedDifferentAmount = proratedAddonAmountHalala(
      5125, 2,
      Date.parse(differentQuantityQuote.periodEndAt) - Date.parse(differentQuantityQuote.periodStartAt),
      differentQuantityQuote.cycleDays,
    );
    const reusedPaidQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 3, autoRenewConsent: true,
    });
    assert.equal((await ownerPlanAccess(ownerId)).scope, "property", "service slots may be added without buying a full plan");
    assert.equal(paidQuote.amountHalala, expectedPaidAmount);
    assert.equal(paidQuote.quantity, 3);
    assert.equal(paidQuote.unitPriceHalala, 5000);
    assert.equal(differentQuantityQuote.amountHalala, expectedDifferentAmount);
    assert.equal(differentQuantityQuote.quantity, 2);
    assert.notEqual(differentQuantityQuote.checkoutId, paidQuote.checkoutId);
    assert.equal(reusedPaidQuote.checkoutId, paidQuote.checkoutId, "an open quote is reused, not double-sold");
    assert.equal(reusedPaidQuote.amountHalala, paidQuote.amountHalala);
    assert.equal(reusedPaidQuote.unitPriceHalala, 5000, "reuse keeps original price after catalogue edits");
    await assert.rejects(
      confirmAddonCheckout({ ownerId: otherOwnerId, checkoutId: paidQuote.checkoutId, paymentId: `foreign_${suffix}` }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 404,
      "another account cannot confirm this quote",
    );

    const paymentId = `synthetic_${suffix}`;
    const paidAt = new Date().toISOString();
    providerReply = {
      id: paymentId,
      status: "paid",
      amount: paidQuote.amountHalala,
      currency: "SAR",
      description: `اختبار تكامل [${paidQuote.checkoutId}]`,
      created_at: new Date().toISOString(),
      source: { token: "test-moyasar-token" },
    };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls += 1;
      assert.match(String(input), /^https:\/\/api\.moyasar\.com\/v1\/payments\//);
      const authorization = new Headers(init?.headers).get("Authorization");
      assert.equal(authorization, `Basic ${Buffer.from(`${fakeSecret}:`).toString("base64")}`);
      if (rejectedByUnexpectedFetch) throw new Error("a retry should be served idempotently without a provider request");
      if (!providerReply) throw new Error("test attempted an unexpected provider request");
      return new Response(JSON.stringify(providerReply), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const staleQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 4, autoRenewConsent: true,
    });
    const [originalSubscription] = await db.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId)).limit(1);
    assert.ok(originalSubscription?.expiresAt);
    await db.update(ownerSubscriptionsTable)
      .set({ expiresAt: new Date(originalSubscription.expiresAt.getTime() + 1) })
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    const stalePaymentId = `synthetic_stale_${suffix}`;
    providerReply = {
      id: stalePaymentId,
      status: "paid",
      amount: staleQuote.amountHalala,
      currency: "SAR",
      description: `stale quote [${staleQuote.checkoutId}]`,
      created_at: paidAt,
      source: { token: "test-moyasar-token" },
    };
    await assert.rejects(
      confirmAddonCheckout({ ownerId, checkoutId: staleQuote.checkoutId, paymentId: stalePaymentId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 409,
      "a quote cannot confirm after the underlying base expiry changes",
    );
    await db.update(ownerSubscriptionsTable)
      .set({ expiresAt: originalSubscription.expiresAt })
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    providerReply = {
      id: paymentId,
      status: "paid",
      amount: paidQuote.amountHalala,
      currency: "SAR",
      description: `اختبار تكامل [${paidQuote.checkoutId}]`,
      created_at: paidAt,
      source: { token: "test-moyasar-token" },
    };

    // Every material field verified from the provider response is exercised
    // with a rejected response before the successful mocked response.
    providerReply = { ...providerReply, amount: paidQuote.amountHalala - 1 };
    await assert.rejects(
      confirmAddonCheckout({ ownerId, checkoutId: paidQuote.checkoutId, paymentId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && /المبلغ|العملة/.test(error.message),
    );
    providerReply = { ...providerReply, amount: paidQuote.amountHalala, currency: "USD" };
    await assert.rejects(
      confirmAddonCheckout({ ownerId, checkoutId: paidQuote.checkoutId, paymentId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && /المبلغ|العملة/.test(error.message),
    );
    providerReply = { ...providerReply, currency: "SAR", description: "طلب غير مرتبط" };
    await assert.rejects(
      confirmAddonCheckout({ ownerId, checkoutId: paidQuote.checkoutId, paymentId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && /مرتبطة/.test(error.message),
    );
    providerReply = {
      ...providerReply,
      description: `شراء خدمة اختبارية [${paidQuote.checkoutId}]`,
    };

    const paidResult = await confirmAddonCheckout({
      ownerId, checkoutId: paidQuote.checkoutId, paymentId,
    });
    await assert.rejects(
      readAddonCheckoutQuote({ ownerId, checkoutId: paidQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 409,
      "consumed quotes cannot be read as pending payment quotes",
    );
    assert.equal(paidResult.purchase.amountHalala, paidQuote.amountHalala);
    assert.equal(paidResult.purchase.quantity, 3);
    assert.equal(paidResult.invoice.amount, expectedPaidAmount / 100);
    assert.equal(paidResult.invoice.currency, "SAR");

    // Editing the current catalogue price after quoting cannot alter the
    // already-reserved amount or the recorded one-time entitlement.
    await db.update(subscriptionPlansTable).set({ extraServicePrice: "99.00" })
      .where(eq(subscriptionPlansTable.slug, planSlug));
    const repeatedPaidResult = await confirmAddonCheckout({
      ownerId, checkoutId: paidQuote.checkoutId, paymentId,
    });
    assert.equal(repeatedPaidResult.purchase.id, paidResult.purchase.id);
    assert.equal(repeatedPaidResult.purchase.amountHalala, expectedPaidAmount);
    assert.equal(repeatedPaidResult.purchase.quantity, 3);
    assert.equal(fetchCalls, 5, "three rejected provider responses and two verification requests; retry is local");

    const secondPaymentId = `synthetic_second_${suffix}`;
    providerReply = {
      id: secondPaymentId,
      status: "paid",
      amount: differentQuantityQuote.amountHalala,
      currency: "SAR",
      description: `شراء خدمة اختبارية [${differentQuantityQuote.checkoutId}]`,
      created_at: paidAt,
      source: { token: "test-moyasar-token" },
    };
    const secondPaidResult = await confirmAddonCheckout({
      ownerId, checkoutId: differentQuantityQuote.checkoutId, paymentId: secondPaymentId,
    });
    assert.equal(secondPaidResult.purchase.quantity, 2);
    assert.equal(secondPaidResult.purchase.amountHalala, expectedDifferentAmount);

    // A completed purchase does not block a new purchase; the new quote picks
    // up the current catalogue price and grants its full requested quantity.
    const afterPaid = await ownerPlanAccess(ownerId);
    assert.equal(afterPaid.purchasedServiceSlots, 5);
    assert.equal(afterPaid.serviceLimit, 5);
    assert.equal(afterPaid.extraServicePrice, "99.00");
    const repurchaseQuote = await createAddonCheckout({
      ownerId, addonType: "service", quantity: 1, autoRenewConsent: true,
    });
    const expectedRepurchaseAmount = proratedAddonAmountHalala(
      9900, 1,
      Date.parse(repurchaseQuote.periodEndAt) - Date.parse(repurchaseQuote.periodStartAt),
      repurchaseQuote.cycleDays,
    );
    assert.equal(repurchaseQuote.amountHalala, expectedRepurchaseAmount);
    assert.equal(repurchaseQuote.unitPriceHalala, 9900);
    const repurchasePaymentId = `synthetic_repurchase_${suffix}`;
    providerReply = {
      id: repurchasePaymentId,
      status: "paid",
      amount: repurchaseQuote.amountHalala,
      currency: "SAR",
      description: `شراء خدمة اختبارية [${repurchaseQuote.checkoutId}]`,
      created_at: paidAt,
      source: { token: "test-moyasar-token" },
    };
    const repurchase = await confirmAddonCheckout({
      ownerId, checkoutId: repurchaseQuote.checkoutId, paymentId: repurchasePaymentId,
    });
    assert.equal(repurchase.purchase.quantity, 1);
    assert.equal((await ownerPlanAccess(ownerId)).purchasedServiceSlots, 6);
    assert.equal(process.env.MOYASAR_PUBLISHABLE_KEY, fakePublishable);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("MOYASAR_PUBLISHABLE_KEY", oldPublishable);
    restoreEnv("MOYASAR_SECRET_KEY", oldSecret);
    if (oldSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSessionSecret;

    // Every cleanup predicate is scoped to the synthetic UUID-backed owner or
    // plan created by this test; no unrelated account/data is touched.
    await db.delete(subscriptionPaymentsTable).where(eq(subscriptionPaymentsTable.ownerId, ownerId));
    await db.delete(subscriptionAddonPurchasesTable).where(eq(subscriptionAddonPurchasesTable.ownerId, ownerId));
    await db.delete(ownerBillingProfilesTable).where(eq(ownerBillingProfilesTable.ownerId, ownerId));
    await db.delete(subscriptionAddonCheckoutIntentsTable).where(eq(subscriptionAddonCheckoutIntentsTable.ownerId, ownerId));
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    await db.delete(subscriptionPlansTable).where(and(
      eq(subscriptionPlansTable.slug, planSlug),
      eq(subscriptionPlansTable.nameAr, "باقة تكامل اختبارية"),
    ));
  }
});