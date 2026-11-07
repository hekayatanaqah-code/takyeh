/**
 * Query-only mappings for historical SQL-managed tables. These are intentionally
 * outside schema/: they must not cause drizzle-kit to alter the source database.
 * MariaDB uses the complete catalog-generated models via the package condition.
 */
import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const ownerApplicationsQueryTable = pgTable("owner_applications", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  businessName: text("business_name").notNull(),
  businessType: text("business_type").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull(),
  emailVerified: boolean("email_verified").notNull(),
});
export const passwordResetTokensQueryTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
});
export const supportRequestsQueryTable = pgTable("owner_support_requests", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  source: text("source").notNull().default("owner_request"),
  attachmentUrls: text("attachment_urls").array(),
  adminReply: text("admin_reply"),
  adminReplyAt: timestamp("admin_reply_at", { withTimezone: true }),
  adminAttachmentUrl: text("admin_attachment_url"),
  adminAttachmentUrls: text("admin_attachment_urls").array(),
  isReadByOwner: boolean("is_read_by_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const supportMessagesQueryTable = pgTable("owner_support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  authorRole: text("author_role").notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  body: text("body").notNull(),
  attachmentUrls: text("attachment_urls").array().notNull(),
  legacyReply: boolean("legacy_reply").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const ownerNotificationsQueryTable = pgTable("owner_notifications", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  broadcastCampaignId: integer("broadcast_campaign_id"),
  broadcastRecipientKey: text("broadcast_recipient_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
