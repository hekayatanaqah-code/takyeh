
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyBookingsTable } from "./photography_bookings";
import { photographersTable } from "./photographers";

export const photographyReviewsTable = m.mysqlTable("photography_reviews", {
  id: m.int("id").notNull().autoincrement(),
  bookingId: m.int("booking_id").notNull(),
  photographerId: m.int("photographer_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  stars: m.int("stars").notNull(),
  comment: m.longtext("comment").notNull().default(sql.raw("''")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_rating_range", sql.raw("(((stars >= 1) AND (stars <= 5)))")),
  m.uniqueIndex("photography_review_booking_unique").on(table.bookingId),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "photography_reviews_booking_id_fkey", columns: [table.bookingId], foreignColumns: [photographyBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "photography_reviews_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
