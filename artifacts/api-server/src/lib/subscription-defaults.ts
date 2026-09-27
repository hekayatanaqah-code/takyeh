import { db } from "@workspace/db";
import { siteSettingsTable, subscriptionPlansTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

// Starting prices only. The administrative plan editor is the source of truth
// after this one-time seed; never overwrite an administrator's changes.
const DEFAULT_PLANS = [
  {
    slug: "property-monthly", nameAr: "إدارة العقار — شهري",
    price: "99.00", durationDays: 30, trialDays: 0,
    scope: "property", chaletLimit: 1, serviceLimit: 0,
    extraChaletPrice: "50.00", extraServicePrice: null,
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
    isActive: false, sortOrder: 0,
  },
  // Historical subscriptions retain their entitlements and are editable by the
  // administrator. Inactive legacy plans aren't offered to new purchasers.
  ...([
    ["monthly", "شهري سابق", "99.00", 30, "full", 1, 1],
    ["yearly", "سنوي سابق", "799.00", 365, "full", 3, 3],
    ["chalet_basic", "عقار أساسي سابق", "149.00", 30, "property", 1, 0],
    ["chalet_pro", "عقار احترافي سابق", "299.00", 30, "full", 5, 0],
    ["chalet_unlimited", "عقارات غير محدودة سابقة", "499.00", 30, "full", null, 0],
    ["service_basic", "خدمة أساسية سابقة", "99.00", 30, "property", 0, 1],
    ["service_pro", "خدمات احترافية سابقة", "249.00", 30, "full", 0, null],
    ["bundle", "حزمة سابقة", "599.00", 30, "full", null, null],
  ] as const).map(([slug, nameAr, price, durationDays, scope, chaletLimit, serviceLimit], index) => ({
    slug, nameAr, price, durationDays, trialDays: 0, scope,
    chaletLimit, serviceLimit,
    extraChaletPrice: chaletLimit === 0 ? null : "50.00",
    extraServicePrice: serviceLimit === 0 ? null : "50.00",
    features: [] as string[],
    isActive: false, sortOrder: 100 + index,
  })),
];

export async function seedSubscriptionPlansOnce() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1735699031, 2)`);
    const [marker] = await tx.select({ key: siteSettingsTable.key })
      .from(siteSettingsTable).where(eq(siteSettingsTable.key, "subscription_plan_defaults_seeded"));
    if (marker) return;
    for (const plan of DEFAULT_PLANS) {
      await tx.insert(subscriptionPlansTable).values(plan)
        .onConflictDoNothing({ target: subscriptionPlansTable.slug });
    }
    await tx.insert(siteSettingsTable)
      .values({ key: "subscription_plan_defaults_seeded", value: "1" })
      .onConflictDoNothing({ target: siteSettingsTable.key });
  });
}