// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionAddonPurchasesTable = m.mysqlTable("subscription_addon_purchases", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  addonType: m.longtext("addon_type").notNull(),
  paymentId: m.varchar("payment_id", { length: 191 }).notNull(),
  intentId: m.varchar("intent_id", { length: 191 }).notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  quantity: m.int("quantity").notNull().default(sql.raw("1")),
  recurring: m.boolean("recurring").notNull().default(sql.raw("0")),
  monthlyUnitPriceHalala: m.int("monthly_unit_price_halala").notNull().default(sql.raw("0")),
  periodStartAt: m.datetime("period_start_at", { mode: "date", fsp: 6 }),
  paidThroughAt: m.datetime("paid_through_at", { mode: "date", fsp: 6 }),
  cancelAtPeriodEnd: m.boolean("cancel_at_period_end").notNull().default(sql.raw("0")),
  revision: m.int("revision").notNull().default(sql.raw("1")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_addon_purchases_recurring_bool", sql.raw("`recurring` IN (0,1)")),
  m.check("subscription_addon_purchases_cancel_at_period_end_bool", sql.raw("`cancel_at_period_end` IN (0,1)")),
  m.check("subscription_addon_purchases_quantity_check", sql.raw("(((quantity >= 1) AND (quantity <= 50)))")),
  m.uniqueIndex("subscription_addon_purchases_intent_id_key").on(table.intentId),
  m.uniqueIndex("subscription_addon_purchases_payment_id_key").on(table.paymentId),
  m.primaryKey({ columns: [table.id] }),
]);
