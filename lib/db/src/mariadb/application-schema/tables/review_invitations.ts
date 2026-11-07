
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerBookingsTable } from "./owner_bookings";
import { chaletsTable } from "./chalets";

export const reviewInvitationsTable = m.mysqlTable("review_invitations", {
  id: m.int("id").notNull().autoincrement(),
  token: m.varchar("token", { length: 191 }).notNull(),
  chaletId: m.int("chalet_id").notNull(),
  used: m.boolean("used").notNull().default(sql.raw("0")),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  guestName: m.longtext("guest_name"),
  bookingId: m.int("booking_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("review_invitations_used_bool", sql.raw("`used` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("review_invitations_token_unique").on(table.token),
  m.foreignKey({ name: "review_invitations_booking_id_owner_bookings_id_fk", columns: [table.bookingId], foreignColumns: [ownerBookingsTable.id] }).onDelete("set null").onUpdate("restrict"),
  m.foreignKey({ name: "review_invitations_chalet_id_chalets_id_fk", columns: [table.chaletId], foreignColumns: [chaletsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
