// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerRescheduleLogsTable = m.mysqlTable("owner_reschedule_logs", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  bookingId: m.int("booking_id").notNull(),
  clientName: m.longtext("client_name").notNull().default(sql.raw("''")),
  oldDate: m.longtext("old_date").notNull(),
  newDate: m.longtext("new_date").notNull(),
  oldDuration: m.int("old_duration").notNull().default(sql.raw("1")),
  newDuration: m.int("new_duration").notNull().default(sql.raw("1")),
  oldPeriod: m.longtext("old_period"),
  newPeriod: m.longtext("new_period"),
  reason: m.longtext("reason").notNull().default(sql.raw("''")),
  rescheduledAt: m.datetime("rescheduled_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  clientPhone: m.longtext("client_phone"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("owner_reschedule_logs_customer_history_idx").on(table.ownerId, table.bookingId, desc(table.rescheduledAt), desc(table.id)),
  m.primaryKey({ columns: [table.id] }),
]);
