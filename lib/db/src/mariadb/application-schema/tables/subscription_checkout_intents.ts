import type { SubscriptionTerms } from "../chalets";
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionCheckoutIntentsTable = m.mysqlTable("subscription_checkout_intents", {
  id: m.varchar("id", { length: 191 }).notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  plan: m.longtext("plan").notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  discountCode: m.longtext("discount_code"),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  consumedAt: m.datetime("consumed_at", { mode: "date", fsp: 6 }),
  listPriceHalala: m.int("list_price_halala").notNull().default(sql.raw("0")),
  durationDays: m.int("duration_days").notNull().default(sql.raw("0")),
  planLabel: m.longtext("plan_label").notNull().default(sql.raw("''")),
  termsSnapshot: m.json("terms_snapshot").$type<SubscriptionTerms>(),
  invoiceLines: m.json("invoice_lines").$type<Array<{
    kind: "base" | "addon";
    label: string;
    amountHalala: number;
    addonPurchaseId?: number;
    quantity?: number;
    unitPriceHalala?: number;
    periodStartAt?: string;
    periodEndAt?: string;
  }>>().notNull().default(sql.raw("'[]'")),
  autoRenewConsent: m.boolean("auto_renew_consent").notNull().default(sql.raw("0")),
  quotedBaseExpiresAt: m.datetime("quoted_base_expires_at", { mode: "date", fsp: 6 }),
  recurringAddonSnapshot: m.json("recurring_addon_snapshot").$type<Array<{
    id: number;
    quantity: number;
    monthlyUnitPriceHalala: number;
    paidThroughAt: string | null;
    cancelAtPeriodEnd: boolean;
    revision: number;
  }>>().notNull().default(sql.raw("'[]'")),
  freeAccessBlockedAt: m.datetime("free_access_blocked_at", { mode: "date", fsp: 6 }),
  accountDiscountSnapshot: m.json("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
  paymentMethod: m.longtext("payment_method").notNull().default(sql.raw("'card'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_checkout_intents_auto_renew_consent_bool", sql.raw("`auto_renew_consent` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
