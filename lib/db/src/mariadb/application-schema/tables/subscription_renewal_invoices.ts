
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionRenewalInvoicesTable = m.mysqlTable("subscription_renewal_invoices", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  periodStartAt: m.datetime("period_start_at", { mode: "date", fsp: 6 }).notNull(),
  periodEndAt: m.datetime("period_end_at", { mode: "date", fsp: 6 }).notNull(),
  givenId: m.varchar("given_id", { length: 191 }).notNull(),
  basePlan: m.longtext("base_plan").notNull(),
  cycleDays: m.int("cycle_days").notNull(),
  basePriceHalala: m.int("base_price_halala").notNull(),
  amountHalala: m.int("amount_halala").notNull(),
  lineItems: m.json("line_items").$type<Array<{
    kind: "base" | "addon";
    label: string;
    amountHalala: number;
    addonPurchaseId?: number;
    quantity?: number;
    unitPriceHalala?: number;
    periodStartAt?: string;
    periodEndAt?: string;
  }>>().notNull(),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'pending'")),
  paymentId: m.longtext("payment_id"),
  attempts: m.int("attempts").notNull().default(sql.raw("0")),
  nextAttemptAt: m.datetime("next_attempt_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  lastError: m.longtext("last_error"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  paidAt: m.datetime("paid_at", { mode: "date", fsp: 6 }),
  accountDiscountSnapshot: m.json("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("subscription_renewal_due_idx").on(table.status, table.nextAttemptAt),
  m.uniqueIndex("subscription_renewal_invoices_given_id_key").on(table.givenId),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("subscription_renewal_owner_period_unique").on(table.ownerId, table.periodStartAt),
]);
