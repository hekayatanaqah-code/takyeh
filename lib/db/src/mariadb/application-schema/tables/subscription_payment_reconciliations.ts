
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionPaymentReconciliationsTable = m.mysqlTable("subscription_payment_reconciliations", {
  id: m.int("id").notNull().autoincrement(),
  paymentId: m.varchar("payment_id", { length: 191 }).notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  intentId: m.longtext("intent_id").notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  reason: m.longtext("reason").notNull(),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'required'")),
  refundId: m.longtext("refund_id"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  refundEligible: m.boolean("refund_eligible").notNull().default(sql.raw("1")),
  attemptCount: m.int("attempt_count").notNull().default(sql.raw("0")),
  nextAttemptAt: m.datetime("next_attempt_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  lockedAt: m.datetime("locked_at", { mode: "date", fsp: 6 }),
  refundRequestedAt: m.datetime("refund_requested_at", { mode: "date", fsp: 6 }),
  lastAttemptAt: m.datetime("last_attempt_at", { mode: "date", fsp: 6 }),
  lastError: m.longtext("last_error"),
  refundAttemptNumber: m.int("refund_attempt_number").notNull().default(sql.raw("0")),
  refundAttemptKey: m.longtext("refund_attempt_key"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_payment_reconciliations_refund_eligible_bool", sql.raw("`refund_eligible` IN (0,1)")),
  m.uniqueIndex("subscription_payment_reconciliations_payment_id_key").on(table.paymentId),
  m.primaryKey({ columns: [table.id] }),
  m.index("subscription_payment_reconciliations_retry_idx").on(table.status, table.nextAttemptAt, table.lockedAt),
]);
