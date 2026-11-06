// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerBookingsTable } from "./owner_bookings";

export const ownerRefundsTable = m.mysqlTable("owner_refunds", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  bookingId: m.int("booking_id"),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: m.longtext("type").notNull().default(sql.raw("'partial'")),
  reason: m.longtext("reason"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "owner_refunds_booking_id_fkey", columns: [table.bookingId], foreignColumns: [ownerBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
