// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerBookingsTable } from "./owner_bookings";

export const bookingPaymentsTable = m.mysqlTable("booking_payments", {
  id: m.int("id").notNull().autoincrement(),
  bookingId: m.int("booking_id").notNull(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: m.longtext("payment_date").notNull(),
  method: m.longtext("method").notNull().default(sql.raw("'cash'")),
  cashDeposited: m.boolean("cash_deposited").notNull().default(sql.raw("0")),
  receiptUrl: m.longtext("receipt_url"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("booking_payments_cash_deposited_bool", sql.raw("`cash_deposited` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.index("idx_booking_payments_booking_id").on(table.bookingId),
  m.index("idx_booking_payments_owner_id").on(table.ownerId),
  m.foreignKey({ name: "booking_payments_booking_id_fkey", columns: [table.bookingId], foreignColumns: [ownerBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
