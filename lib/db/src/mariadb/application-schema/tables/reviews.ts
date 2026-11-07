
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { chaletsTable } from "./chalets";
import { reviewInvitationsTable } from "./review_invitations";

export const reviewsTable = m.mysqlTable("reviews", {
  id: m.int("id").notNull().autoincrement(),
  chaletId: m.int("chalet_id").notNull(),
  invitationId: m.int("invitation_id"),
  rating: m.int("rating").notNull(),
  comment: m.longtext("comment"),
  photoUrls: m.json("photo_urls").$type<string[]>().notNull().default(sql.raw("'[]'")),
  isVerified: m.boolean("is_verified").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  isHidden: m.boolean("is_hidden").notNull().default(sql.raw("0")),
  ownerReply: m.longtext("owner_reply"),
  ownerReplyAt: m.datetime("owner_reply_at", { mode: "date", fsp: 6 }),
  reportedBy: m.longtext("reported_by"),
  reportedAt: m.datetime("reported_at", { mode: "date", fsp: 6 }),
  reportReason: m.longtext("report_reason"),
  guestName: m.longtext("guest_name"),
  isAnonymous: m.boolean("is_anonymous").notNull().default(sql.raw("0")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("reviews_photo_urls_array", sql.raw("JSON_TYPE(`photo_urls`) = 'ARRAY'")),
  m.check("reviews_is_verified_bool", sql.raw("`is_verified` IN (0,1)")),
  m.check("reviews_is_hidden_bool", sql.raw("`is_hidden` IN (0,1)")),
  m.check("reviews_is_anonymous_bool", sql.raw("`is_anonymous` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "reviews_chalet_id_chalets_id_fk", columns: [table.chaletId], foreignColumns: [chaletsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "reviews_invitation_id_review_invitations_id_fk", columns: [table.invitationId], foreignColumns: [reviewInvitationsTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
