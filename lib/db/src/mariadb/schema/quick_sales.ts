// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceProvidersTable } from "./service_providers";

export const quickSalesTable = m.mysqlTable("quick_sales", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  providerId: m.int("provider_id").notNull(),
  providerName: m.longtext("provider_name").notNull(),
  dateStr: m.date("date_str", { mode: "string" }).notNull(),
  clientName: m.longtext("client_name").notNull().default(sql.raw("''")),
  items: m.json("items").notNull(),
  total: m.decimal("total", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: m.longtext("payment_method").notNull(),
  notes: m.longtext("notes").notNull().default(sql.raw("''")),
  status: m.longtext("status").notNull().default(sql.raw("'completed'")),
  idempotencyKey: m.varchar("idempotency_key", { length: 191 }).notNull(),
  requestHash: m.longtext("request_hash").notNull(),
  cancellationReason: m.longtext("cancellation_reason"),
  cancelledAt: m.datetime("cancelled_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  clientPhone: m.varchar("client_phone", { length: 191 }).notNull().default(sql.raw("''")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("quick_sales_payment_method_check", sql.raw("((payment_method IN ('cash', 'bank')))")),
  m.check("quick_sales_status_check", sql.raw("((status IN ('completed', 'cancelled')))")),
  m.check("quick_sales_total_check", sql.raw("((total > (0)))")),
  m.index("quick_sales_owner_date_idx").on(table.ownerId, table.dateStr),
  m.index("quick_sales_owner_phone_idx").on(table.ownerId, table.clientPhone),
  m.uniqueIndex("quick_sales_owner_request_idx").on(table.ownerId, table.idempotencyKey),
  m.primaryKey({ columns: [table.id] }),
  m.index("quick_sales_provider_idx").on(table.providerId),
  m.foreignKey({ name: "quick_sales_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
