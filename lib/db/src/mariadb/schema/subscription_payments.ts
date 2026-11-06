// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionPaymentsTable = m.mysqlTable("subscription_payments", {
  paymentId: m.varchar("payment_id", { length: 191 }).notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  intentId: m.varchar("intent_id", { length: 191 }).notNull(),
  plan: m.longtext("plan").notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("subscription_payments_intent_id_key").on(table.intentId),
  m.primaryKey({ columns: [table.paymentId] }),
]);
