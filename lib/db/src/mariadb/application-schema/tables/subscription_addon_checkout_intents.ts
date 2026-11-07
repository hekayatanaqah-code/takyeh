
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionAddonCheckoutIntentsTable = m.mysqlTable("subscription_addon_checkout_intents", {
  id: m.varchar("id", { length: 191 }).notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  addonType: m.longtext("addon_type").$type<"chalet" | "service">().notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  consumedAt: m.datetime("consumed_at", { mode: "date", fsp: 6 }),
  quantity: m.int("quantity").notNull().default(sql.raw("1")),
  monthlyUnitPriceHalala: m.int("monthly_unit_price_halala").notNull().default(sql.raw("0")),
  nextChargeHalala: m.int("next_charge_halala").notNull().default(sql.raw("0")),
  baseMonthlyHalala: m.int("base_monthly_halala").notNull().default(sql.raw("0")),
  remainingDays: m.int("remaining_days").notNull().default(sql.raw("0")),
  nextBillingAt: m.datetime("next_billing_at", { mode: "date", fsp: 6 }),
  cycleDays: m.int("cycle_days").notNull().default(sql.raw("30")),
  quotedBaseExpiresAt: m.datetime("quoted_base_expires_at", { mode: "date", fsp: 6 }),
  periodStartAt: m.datetime("period_start_at", { mode: "date", fsp: 6 }),
  periodEndAt: m.datetime("period_end_at", { mode: "date", fsp: 6 }),
  autoRenewConsent: m.boolean("auto_renew_consent").notNull().default(sql.raw("0")),
  quoteVersion: m.int("quote_version").notNull().default(sql.raw("1")),
  freeAccessBlockedAt: m.datetime("free_access_blocked_at", { mode: "date", fsp: 6 }),
  accountDiscountSnapshot: m.json("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_addon_checkout_intents_auto_renew_consent_bool", sql.raw("`auto_renew_consent` IN (0,1)")),
  m.check("subscription_addon_checkout_intents_quantity_check", sql.raw("(((quantity >= 1) AND (quantity <= 50)))")),
  m.primaryKey({ columns: [table.id] }),
]);
