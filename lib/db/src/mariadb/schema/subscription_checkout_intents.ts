// Generated native MariaDB schema; not wired into the PostgreSQL API.
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
  termsSnapshot: m.json("terms_snapshot"),
  invoiceLines: m.json("invoice_lines").notNull().default(sql.raw("'[]'")),
  autoRenewConsent: m.boolean("auto_renew_consent").notNull().default(sql.raw("0")),
  quotedBaseExpiresAt: m.datetime("quoted_base_expires_at", { mode: "date", fsp: 6 }),
  recurringAddonSnapshot: m.json("recurring_addon_snapshot").notNull().default(sql.raw("'[]'")),
  freeAccessBlockedAt: m.datetime("free_access_blocked_at", { mode: "date", fsp: 6 }),
  accountDiscountSnapshot: m.json("account_discount_snapshot"),
  paymentMethod: m.longtext("payment_method").notNull().default(sql.raw("'card'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_checkout_intents_auto_renew_consent_bool", sql.raw("`auto_renew_consent` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
