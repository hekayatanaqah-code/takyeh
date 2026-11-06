// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceProvidersTable } from "./service_providers";

export const serviceInsurancesTable = m.mysqlTable("service_insurances", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  providerId: m.int("provider_id"),
  policyName: m.longtext("policy_name").notNull(),
  insurerName: m.longtext("insurer_name"),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull().default(sql.raw("0")),
  renewalDate: m.longtext("renewal_date"),
  notes: m.longtext("notes"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  refundAmount: m.decimal("refund_amount", { precision: 10, scale: 2 }).default(sql.raw("0")),
  refundNote: m.longtext("refund_note"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "service_insurances_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
