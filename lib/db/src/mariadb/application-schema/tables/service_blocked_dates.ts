
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceProvidersTable } from "./service_providers";

export const serviceBlockedDatesTable = m.mysqlTable("service_blocked_dates", {
  id: m.int("id").notNull().autoincrement(),
  providerId: m.int("provider_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  dateStr: m.longtext("date_str").notNull(),
  reason: m.longtext("reason"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "service_blocked_dates_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
