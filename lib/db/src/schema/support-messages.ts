import { boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { ownerSupportRequestsTable } from "./chalets";

export const supportMessagesTable = pgTable("owner_support_messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull().references(() => ownerSupportRequestsTable.id, { onDelete: "cascade" }),
  authorRole: text("author_role").notNull(),
  authorId: text("author_id"),
  authorName: text("author_name"),
  body: text("body").notNull(),
  attachmentUrls: text("attachment_urls").array().notNull().default(sql`'{}'::text[]`),
  legacyReply: boolean("legacy_reply").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, table => ({
  ticketOrderIdx: index("owner_support_messages_ticket_order_idx").on(table.ticketId, table.id),
  legacyReplyIdx: uniqueIndex("owner_support_messages_legacy_reply_idx").on(table.ticketId).where(sql`${table.legacyReply} = true`),
}));
