import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  chaletSubmissionsTable,
  ownerSubscriptionsTable,
  subscriptionAddonCheckoutIntentsTable,
  subscriptionAddonPurchasesTable,
  subscriptionPaymentsTable,
  subscriptionPlansTable,
} from "@workspace/db/schema";
import {
  confirmAddonCheckout,
  createAddonCheckout,
  redeemFreeAddonCheckout,
  SubscriptionAddonCheckoutError,
} from "./subscription-addon-checkout";
import { ownerPlanAccess } from "./subscription-access";

test("add-on checkout grants exactly quoted, paid capacity", { timeout: 30_000 }, async () => {
  const suffix = randomUUID();
  const ownerId = `addon_test_${suffix}`;
  const otherOwnerId = `addon_test_other_${suffix}`;
  const planSlug = `addon-test-${suffix}`;
  const originalFetch = globalThis.fetch;
  const oldPublishable = process.env.MOYASAR_PUBLISHABLE_KEY;
  const oldSecret = process.env.MOYASAR_SECRET_KEY;
  const fakePublishable = "test-publishable-key-not-for-provider";
  const fakeSecret = "test-secret-key-not-for-provider";
  let providerReply: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    description: string;
    created_at: string;
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
    await db.insert(subscriptionPlansTable).values({
      slug: planSlug,
      nameAr: "باقة تكامل اختبارية",
      price: "0.00",
      durationDays: 30,
      trialDays: 0,
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
      paymentStatus: "manual",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // A zero-priced property slot is redeemable without a payment provider and
    // the same redemption is idempotent, even when requested again.
    const freeQuote = await createAddonCheckout({ ownerId, addonType: "chalet" });
    assert.equal(freeQuote.amountHalala, 0);
    const freeResult = await redeemFreeAddonCheckout({ ownerId, checkoutId: freeQuote.checkoutId });
    assert.equal(freeResult.purchase.amountHalala, 0);
    const repeatedFreeResult = await redeemFreeAddonCheckout({ ownerId, checkoutId: freeQuote.checkoutId });
    assert.equal(repeatedFreeResult.purchase.id, freeResult.purchase.id);

    const afterFree = await ownerPlanAccess(ownerId);
    assert.equal(afterFree.baseChaletLimit, 0);
    assert.equal(afterFree.purchasedChaletSlots, 1);
    assert.equal(afterFree.chaletLimit, 1);
    assert.equal(afterFree.chaletCount, 0);
    await assert.rejects(
      createAddonCheckout({ ownerId, addonType: "chalet" }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 409,
      "must not sell another slot while the purchased one remains unused",
    );
    await assert.rejects(
      redeemFreeAddonCheckout({ ownerId: otherOwnerId, checkoutId: freeQuote.checkoutId }),
      (error: unknown) => error instanceof SubscriptionAddonCheckoutError && error.statusCode === 404,
      "another account cannot redeem this quote",
    );

    // Consume the granted property slot so the test owner is eligible to quote
    // the next one.
    await db.insert(chaletSubmissionsTable).values({
      ownerId,
      nameAr: `اختبار إضافة ${suffix}`,
      whatsappNumber: "0500000000",
      location: "اختبار",
      descriptionAr: "عقار اصطناعي لأجل اختبار تكامل الفوترة فقط",
      pricePerNight: "1.00",
    });

    // An administrator's price edit is picked up by subsequent quotes.
    await db.update(subscriptionPlansTable).set({ extraServicePrice: "51.25" })
      .where(eq(subscriptionPlansTable.slug, planSlug));
    const editedServicePrice = await ownerPlanAccess(ownerId);
    assert.equal(editedServicePrice.extraServicePrice, "51.25");
    await db.update(subscriptionPlansTable).set({ extraServicePrice: "50.00" })
      .where(eq(subscriptionPlansTable.slug, planSlug));

    const paidQuote = await createAddonCheckout({ ownerId, addonType: "service" });
    const reusedPaidQuote = await createAddonCheckout({ ownerId, addonType: "service" });
    assert.equal((await ownerPlanAccess(ownerId)).scope, "property", "service slots may be added without buying a full plan");
    assert.equal(paidQuote.amountHalala, 5000);
    assert.equal(reusedPaidQuote.checkoutId, paidQuote.checkoutId, "an open quote is reused, not double-sold");
    assert.equal(reusedPaidQuote.amountHalala, paidQuote.amountHalala);

    const paymentId = `synthetic_${suffix}`;
    const paidAt = new Date().toISOString();
    providerReply = {
      id: paymentId,
      status: "paid",
      amount: paidQuote.amountHalala,
      currency: "SAR",
      description: `اختبار تكامل [${paidQuote.checkoutId}]`,
      created_at: paidAt,
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
    assert.equal(paidResult.purchase.amountHalala, paidQuote.amountHalala);
    assert.equal(paidResult.invoice.amount, 50);
    assert.equal(paidResult.invoice.currency, "SAR");

    // Editing the current catalogue price after quoting cannot alter the
    // already-reserved amount or the recorded one-time entitlement.
    await db.update(subscriptionPlansTable).set({ extraServicePrice: "99.00" })
      .where(eq(subscriptionPlansTable.slug, planSlug));
    const repeatedPaidResult = await confirmAddonCheckout({
      ownerId, checkoutId: paidQuote.checkoutId, paymentId,
    });
    assert.equal(repeatedPaidResult.purchase.id, paidResult.purchase.id);
    assert.equal(repeatedPaidResult.purchase.amountHalala, 5000);
    assert.equal(fetchCalls, 4, "three rejected provider responses, then one successful response; retry is local");

    const afterPaid = await ownerPlanAccess(ownerId);
    assert.equal(afterPaid.purchasedServiceSlots, 1);
    assert.equal(afterPaid.serviceLimit, 1);
    assert.equal(afterPaid.extraServicePrice, "99.00");
    assert.equal(process.env.MOYASAR_PUBLISHABLE_KEY, fakePublishable);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("MOYASAR_PUBLISHABLE_KEY", oldPublishable);
    restoreEnv("MOYASAR_SECRET_KEY", oldSecret);

    // Every cleanup predicate is scoped to the synthetic UUID-backed owner or
    // plan created by this test; no unrelated account/data is touched.
    await db.delete(subscriptionPaymentsTable).where(eq(subscriptionPaymentsTable.ownerId, ownerId));
    await db.delete(subscriptionAddonPurchasesTable).where(eq(subscriptionAddonPurchasesTable.ownerId, ownerId));
    await db.delete(subscriptionAddonCheckoutIntentsTable).where(eq(subscriptionAddonCheckoutIntentsTable.ownerId, ownerId));
    await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, ownerId));
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    await db.delete(subscriptionPlansTable).where(and(
      eq(subscriptionPlansTable.slug, planSlug),
      eq(subscriptionPlansTable.nameAr, "باقة تكامل اختبارية"),
    ));
  }
});