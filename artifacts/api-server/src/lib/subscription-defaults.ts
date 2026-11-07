import { writeRecords } from "@workspace/db/mutations";
import { db } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { siteSettingsTable, subscriptionPlansTable } from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const LEGACY_PLAN_SLUGS = [
  "monthly", "yearly", "chalet_basic", "chalet_pro",
  "chalet_unlimited", "service_basic", "service_pro", "bundle",
] as const;

export function isArchivedSubscriptionPlan(plan: { slug: string; nameAr: string }): boolean {
  return LEGACY_PLAN_SLUGS.some((slug) => slug === plan.slug) || plan.nameAr.includes("سابق");
}

// Starting prices only. The administrative plan editor is the source of truth
// after this one-time seed; never overwrite an administrator's changes.
const DEFAULT_PLANS = [
  {
    slug: "property-monthly", nameAr: "إدارة العقار — شهري",
    price: "99.00", durationDays: 30, trialDays: 0,
    scope: "property", chaletLimit: 1, serviceLimit: 0,
    extraChaletPrice: "50.00", extraServicePrice: "50.00",
    features: ["إدارة عقار واحد", "إدارة الحجوزات والعملاء", "إضافة عقار آخر برسوم تُدفع مرة واحدة"],
    isActive: true, sortOrder: 1,
  },
  {
    slug: "full-monthly", nameAr: "إدارة شاملة — شهري",
    price: "149.00", durationDays: 30, trialDays: 0,
    scope: "full", chaletLimit: 1, serviceLimit: 1,
    extraChaletPrice: "50.00", extraServicePrice: "50.00",
    features: ["إدارة العقارات والخدمات", "النظام المالي والإداري", "إدارة الحجوزات والعملاء", "التقارير"],
    isActive: true, sortOrder: 2,
  },
  {
    slug: "trial", nameAr: "تجربة مجانية",
    price: "0.00", durationDays: 30, trialDays: 30,
    scope: "full", chaletLimit: 1, serviceLimit: 1,
    extraChaletPrice: null, extraServicePrice: null,
    features: ["جميع أقسام المنصة", "عقار واحد", "خدمة واحدة"],
    isActive: true, sortOrder: 0,
  },
];

export async function seedSubscriptionPlansOnce() {
  await db.transaction(async (tx) => {
    await lockResource(tx, 1735699031, 2);
    const [marker] = await tx.select({ key: siteSettingsTable.key })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "subscription_plan_defaults_seeded"));
    if (!marker) {
      for (const plan of DEFAULT_PLANS) {
        await writeRecords(tx, subscriptionPlansTable, plan, { conflict: { action: "ignore", target: subscriptionPlansTable.slug } });
      }
      await writeRecords(tx, siteSettingsTable, { key: "subscription_plan_defaults_seeded", value: "1" }, { conflict: { action: "ignore", target: siteSettingsTable.key } });
    }

    // Keep the grantable trial row present, even when the original catalog seed
    // marker predates it or an administrator has disabled the plan.
    const trialPlan = DEFAULT_PLANS.find((plan) => plan.slug === "trial");
    if (trialPlan) {
      await writeRecords(tx, subscriptionPlansTable, trialPlan, { conflict: { action: "ignore", target: subscriptionPlansTable.slug } });
    }

    // One-time migration for the fixed 30-day, free trial. Do not touch
    // administrator-managed add-on prices, or reset later admin toggles/edits.
    const [trialTermsMarker] = await tx.select({ key: siteSettingsTable.key })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "fixed_trial_terms_migrated"));
    if (!trialTermsMarker) {
      await tx.update(subscriptionPlansTable).set({
        price: "0.00",
        durationDays: 30,
        trialDays: 30,
        isActive: true,
      }).where(eq(subscriptionPlansTable.slug, "trial"));
      await writeRecords(tx, siteSettingsTable, { key: "fixed_trial_terms_migrated", value: "1" }, { conflict: { action: "ignore", target: siteSettingsTable.key } });
    }

    // Enable cross-category one-time slots for untouched first-generation
    // defaults. Run once so an admin can subsequently disable or reprice them.
    const [addonMarker] = await tx.select({ key: siteSettingsTable.key })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "subscription_cross_category_addons_seeded"));
    if (!addonMarker) {
      await tx.update(subscriptionPlansTable).set({ extraServicePrice: "50.00" })
        .where(and(
          eq(subscriptionPlansTable.slug, "property-monthly"),
          eq(subscriptionPlansTable.price, "99.00"),
          eq(subscriptionPlansTable.chaletLimit, 1),
          eq(subscriptionPlansTable.serviceLimit, 0),
          isNull(subscriptionPlansTable.extraServicePrice),
        ));
      await writeRecords(tx, siteSettingsTable, { key: "subscription_cross_category_addons_seeded", value: "1" }, { conflict: { action: "ignore", target: siteSettingsTable.key } });
    }

    const [cleanupMarker] = await tx.select({ key: siteSettingsTable.key })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "legacy_subscription_plans_cleaned"));
    if (!cleanupMarker) {
      // Keep an archived row if historic purchases, quotes, or subscriptions
      // still refer to it; otherwise remove only the known old/test catalog.
      const archived = sql`(${subscriptionPlansTable.slug} IN
        ('monthly', 'yearly', 'chalet_basic', 'chalet_pro', 'chalet_unlimited',
         'service_basic', 'service_pro', 'bundle')
        OR ${subscriptionPlansTable.nameAr} LIKE ${"%سابق%"})`;
      await tx.execute(sql`
        DELETE FROM subscription_plans AS p
        WHERE (p.slug IN ('monthly', 'yearly', 'chalet_basic', 'chalet_pro',
                         'chalet_unlimited', 'service_basic', 'service_pro', 'bundle')
               OR p.name_ar LIKE ${"%سابق%"})
          AND p.slug NOT IN ('trial', 'property-monthly', 'full-monthly')
          AND NOT EXISTS (SELECT 1 FROM owner_subscriptions s WHERE s.plan = p.slug)
          AND NOT EXISTS (SELECT 1 FROM subscription_checkout_intents i WHERE i.plan = p.slug)
          AND NOT EXISTS (SELECT 1 FROM subscription_payments pay WHERE pay.plan = p.slug)
      `);
      await tx.update(subscriptionPlansTable).set({ isActive: false }).where(archived);
      await writeRecords(tx, siteSettingsTable, { key: "legacy_subscription_plans_cleaned", value: "1" }, { conflict: { action: "ignore", target: siteSettingsTable.key } });
    }
  });
}