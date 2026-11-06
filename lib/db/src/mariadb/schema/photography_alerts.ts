// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyBookingsTable } from "./photography_bookings";
import { photographersTable } from "./photographers";

export const photographyAlertsTable = m.mysqlTable("photography_alerts", {
  id: m.int("id").notNull().autoincrement(),
  dedupeKey: m.varchar("dedupe_key", { length: 191 }).notNull(),
  kind: m.longtext("kind").notNull(),
  photographerId: m.int("photographer_id").notNull(),
  bookingId: m.int("booking_id"),
  message: m.longtext("message").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  readAt: m.datetime("read_at", { mode: "date", fsp: 6 }),
  resolvedAt: m.datetime("resolved_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("photography_alerts_dedupe_key_key").on(table.dedupeKey),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "photography_alerts_booking_id_fkey", columns: [table.bookingId], foreignColumns: [photographyBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "photography_alerts_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
