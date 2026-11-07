
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerBookingsTable } from "./owner_bookings";

export const cashDepositLogsTable = m.mysqlTable("cash_deposit_logs", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  submissionId: m.int("submission_id"),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull(),
  note: m.longtext("note"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  bookingId: m.int("booking_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "cash_deposit_logs_booking_id_fkey", columns: [table.bookingId], foreignColumns: [ownerBookingsTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
