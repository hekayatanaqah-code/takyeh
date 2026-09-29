import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerSubscriptionsTable,
  subscriptionCheckoutIntentsTable,
  subscriptionPlansTable,
  subscriptionPromoCodesTable,
} from "@workspace/db/schema";
import { previewSubscriptionCheckout } from "./subscription-checkout";

test("subscription preview does not create subscription intents or consume promo usages", {
  timeout: 30_000,
}, async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ownerId = `preview_test_${suffix}`;
  const planSlug = `preview-plan-${suffix}`;
  const promoCode = `PREVIEW_${suffix.slice(0, 16)}`.toUpperCase();
  const originalFetch = globalThis.fetch;
  try {
    await db.insert(subscriptionPlansTable).values({
      slug: planSlug,
      nameAr: "باقة معاينة اختبارية",
      price: "20.00",
      durationDays: 60,
      trialDays: 30,
      features: ["اختبار"],
      scope: "property",
      chaletLimit: 1,
      serviceLimit: 0,
      extraChaletPrice: "25.00",
      extraServicePrice: "0.00",
      isActive: true,
      sortOrder: 9999,
    });
    await db.insert(subscriptionPromoCodesTable).values({
      code: promoCode,
      kind: "fixed",
      value: "2.00",
      usageLimit: 10,
      usedCount: 0,
      isActive: true,
    });
    globalThis.fetch = (async () => {
      throw new Error("preview must not call the payment provider");
    }) as typeof fetch;

    const preview = await previewSubscriptionCheckout({ ownerId, plan: planSlug, promoCode });
    assert.equal(preview.amountHalala, 1800);
    assert.equal(preview.discountHalala, 200);
    assert.equal(preview.durationDays, 60);
    assert.equal(preview.lineItems[0]?.amountHalala, 1800);
    assert.equal(preview.nextChargeHalala, 2000);
    assert.equal(preview.recurring, false);

    const [intentCount] = await db.select({ value: count() }).from(subscriptionCheckoutIntentsTable)
      .where(eq(subscriptionCheckoutIntentsTable.ownerId, ownerId));
    const [subscriptionCount] = await db.select({ value: count() }).from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    const [promo] = await db.select().from(subscriptionPromoCodesTable)
      .where(eq(subscriptionPromoCodesTable.code, promoCode)).limit(1);
    assert.equal(Number(intentCount?.value ?? 0), 0);
    assert.equal(Number(subscriptionCount?.value ?? 0), 0);
    assert.equal(promo?.usedCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await db.delete(subscriptionCheckoutIntentsTable)
      .where(eq(subscriptionCheckoutIntentsTable.ownerId, ownerId));
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    await db.delete(subscriptionPromoCodesTable).where(eq(subscriptionPromoCodesTable.code, promoCode));
    await db.delete(subscriptionPlansTable).where(and(
      eq(subscriptionPlansTable.slug, planSlug),
      eq(subscriptionPlansTable.nameAr, "باقة معاينة اختبارية"),
    ));
  }
});