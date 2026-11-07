
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerBookingsTable } from "./owner_bookings";
import { chaletsTable } from "./chalets";
import { reviewsTable } from "./reviews";

export const ownerNotificationsTable = m.mysqlTable("owner_notifications", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  type: m.longtext("type").notNull(),
  chaletId: m.int("chalet_id"),
  reviewId: m.int("review_id"),
  message: m.longtext("message").notNull(),
  isRead: m.boolean("is_read").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  bookingId: m.int("booking_id"),
  broadcastCampaignId: m.int("broadcast_campaign_id"),
  broadcastRecipientKey: m.varchar("broadcast_recipient_key", { length: 191 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_notifications_is_read_bool", sql.raw("`is_read` IN (0,1)")),
  m.uniqueIndex("owner_notifications_broadcast_recipient_uq").on(table.broadcastCampaignId, table.broadcastRecipientKey),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "owner_notifications_booking_id_fkey", columns: [table.bookingId], foreignColumns: [ownerBookingsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "owner_notifications_chalet_id_chalets_id_fk", columns: [table.chaletId], foreignColumns: [chaletsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "owner_notifications_review_id_reviews_id_fk", columns: [table.reviewId], foreignColumns: [reviewsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
