import type { SubscriptionTerms } from "../chalets";
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerSubscriptionsTable = m.mysqlTable("owner_subscriptions", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  plan: m.longtext("plan").notNull().default(sql.raw("'monthly'")),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'active'")),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }),
  paymentStatus: m.longtext("payment_status").notNull().default(sql.raw("'paid'")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  termsSnapshot: m.json("terms_snapshot").$type<SubscriptionTerms>(),
  billingCycleDays: m.int("billing_cycle_days"),
  renewalPriceHalala: m.int("renewal_price_halala"),
  autoRenewEnabled: m.boolean("auto_renew_enabled").notNull().default(sql.raw("0")),
  trialStartedAt: m.datetime("trial_started_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_subscriptions_auto_renew_enabled_bool", sql.raw("`auto_renew_enabled` IN (0,1)")),
  m.index("owner_subscriptions_expires_status_idx").on(table.expiresAt, table.status),
  m.uniqueIndex("owner_subscriptions_owner_id_unique").on(table.ownerId),
  m.primaryKey({ columns: [table.id] }),
]);
