// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyBookingsTable } from "./photography_bookings";

export const photographyRefundsTable = m.mysqlTable("photography_refunds", {
  id: m.int("id").notNull().autoincrement(),
  requestKey: m.varchar("request_key", { length: 191 }).notNull(),
  bookingId: m.int("booking_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  amountHalalas: m.int("amount_halalas").notNull(),
  destination: m.longtext("destination").notNull(),
  reason: m.longtext("reason").notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'pending'")),
  providerRefundId: m.longtext("provider_refund_id"),
  attemptedAt: m.datetime("attempted_at", { mode: "date", fsp: 6 }),
  error: m.longtext("error"),
  requestedBy: m.longtext("requested_by").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  completedAt: m.datetime("completed_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_refund_positive", sql.raw("((amount_halalas > 0))")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photography_refunds_request_key_key").on(table.requestKey),
  m.foreignKey({ name: "photography_refunds_booking_id_fkey", columns: [table.bookingId], foreignColumns: [photographyBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
