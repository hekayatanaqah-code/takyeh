
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionRenewalAttemptsTable = m.mysqlTable("subscription_renewal_attempts", {
  id: m.int("id").notNull().autoincrement(),
  invoiceId: m.int("invoice_id").notNull(),
  attemptNumber: m.int("attempt_number").notNull(),
  givenId: m.varchar("given_id", { length: 191 }).notNull(),
  paymentId: m.longtext("payment_id"),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'pending'")),
  nextAttemptAt: m.datetime("next_attempt_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  lastError: m.longtext("last_error"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("subscription_renewal_attempt_due_idx").on(table.status, table.nextAttemptAt),
  m.uniqueIndex("subscription_renewal_attempts_given_id_key").on(table.givenId),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("subscription_renewal_invoice_attempt_unique").on(table.invoiceId, table.attemptNumber),
]);
