
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyBookingsTable } from "./photography_bookings";
import { photographersTable } from "./photographers";

export const photographyCancellationsTable = m.mysqlTable("photography_cancellations", {
  id: m.int("id").notNull().autoincrement(),
  bookingId: m.int("booking_id").notNull(),
  photographerId: m.int("photographer_id").notNull(),
  reason: m.longtext("reason").notNull(),
  details: m.longtext("details").notNull().default(sql.raw("''")),
  replacementPhotographerId: m.int("replacement_photographer_id"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_decline_reason", sql.raw("((reason IN ('emergency', 'equipment', 'personal', 'other')))")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photography_decline_booking_photographer_unique").on(table.bookingId, table.photographerId),
  m.index("photography_decline_recent_idx").on(table.photographerId, table.createdAt),
  m.foreignKey({ name: "photography_cancellations_booking_id_fkey", columns: [table.bookingId], foreignColumns: [photographyBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "photography_cancellations_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
  m.foreignKey({ name: "photography_cancellations_replacement_photographer_id_fkey", columns: [table.replacementPhotographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
