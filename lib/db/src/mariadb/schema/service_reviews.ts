// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceReviewInvitationsTable } from "./service_review_invitations";
import { serviceProvidersTable } from "./service_providers";

export const serviceReviewsTable = m.mysqlTable("service_reviews", {
  id: m.int("id").notNull().autoincrement(),
  providerId: m.int("provider_id").notNull(),
  invitationId: m.int("invitation_id"),
  rating: m.int("rating").notNull(),
  comment: m.longtext("comment"),
  photoUrls: m.json("photo_urls").$type<string[]>().notNull().default(sql.raw("'[]'")),
  guestName: m.longtext("guest_name"),
  isAnonymous: m.boolean("is_anonymous").notNull().default(sql.raw("0")),
  isVerified: m.boolean("is_verified").notNull().default(sql.raw("1")),
  isHidden: m.boolean("is_hidden").notNull().default(sql.raw("0")),
  ownerReply: m.longtext("owner_reply"),
  ownerReplyAt: m.datetime("owner_reply_at", { mode: "date", fsp: 6 }),
  reportedBy: m.longtext("reported_by"),
  reportedAt: m.datetime("reported_at", { mode: "date", fsp: 6 }),
  reportReason: m.longtext("report_reason"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_reviews_photo_urls_array", sql.raw("JSON_TYPE(`photo_urls`) = 'ARRAY'")),
  m.check("service_reviews_is_anonymous_bool", sql.raw("`is_anonymous` IN (0,1)")),
  m.check("service_reviews_is_verified_bool", sql.raw("`is_verified` IN (0,1)")),
  m.check("service_reviews_is_hidden_bool", sql.raw("`is_hidden` IN (0,1)")),
  m.uniqueIndex("service_reviews_invitation_id_unique").on(table.invitationId),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "service_reviews_invitation_id_fkey", columns: [table.invitationId], foreignColumns: [serviceReviewInvitationsTable.id] }).onDelete("set null").onUpdate("restrict"),
  m.foreignKey({ name: "service_reviews_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
