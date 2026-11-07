
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyBookingsTable } from "./photography_bookings";
import { photographersTable } from "./photographers";

export const photographyDeliveriesTable = m.mysqlTable("photography_deliveries", {
  id: m.int("id").notNull().autoincrement(),
  dedupeKey: m.varchar("dedupe_key", { length: 191 }).notNull(),
  bookingId: m.int("booking_id"),
  photographerId: m.int("photographer_id"),
  recipient: m.longtext("recipient").notNull(),
  kind: m.longtext("kind").notNull(),
  parameters: m.json("parameters").$type<string[]>().notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'pending'")),
  error: m.longtext("error"),
  providerMessageId: m.longtext("provider_message_id"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  internalReadAt: m.datetime("internal_read_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("photography_deliveries_dedupe_key_key").on(table.dedupeKey),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "photography_deliveries_booking_id_fkey", columns: [table.bookingId], foreignColumns: [photographyBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "photography_deliveries_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
