// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerSupportRequestsTable } from "./owner_support_requests";

export const ownerSupportMessagesTable = m.mysqlTable("owner_support_messages", {
  id: m.int("id").notNull().autoincrement(),
  ticketId: m.int("ticket_id").notNull(),
  authorRole: m.longtext("author_role").notNull(),
  authorId: m.longtext("author_id"),
  authorName: m.longtext("author_name"),
  body: m.longtext("body").notNull(),
  attachmentUrls: m.json("attachment_urls").$type<string[]>().notNull().default(sql.raw("'[]'")),
  legacyReply: m.boolean("legacy_reply").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).default(sql.raw("CURRENT_TIMESTAMP(6)")),
  Partial_9cc0de46c9b16a9b: m.int("_partial_9cc0de46c9b16a9b").generatedAlwaysAs(sql.raw("CASE WHEN (legacy_reply = 1) THEN `ticket_id` ELSE NULL END"), { mode: "stored" }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_support_messages_attachment_urls_array", sql.raw("JSON_TYPE(`attachment_urls`) = 'ARRAY'")),
  m.check("owner_support_messages_legacy_reply_bool", sql.raw("`legacy_reply` IN (0,1)")),
  m.check("owner_support_messages_author_role_check", sql.raw("((author_role IN ('owner', 'admin')))")),
  m.uniqueIndex("owner_support_messages_legacy_reply_idx").on(table.Partial_9cc0de46c9b16a9b),
  m.primaryKey({ columns: [table.id] }),
  m.index("owner_support_messages_ticket_order_idx").on(table.ticketId, table.id),
  m.foreignKey({ name: "owner_support_messages_ticket_id_fkey", columns: [table.ticketId], foreignColumns: [ownerSupportRequestsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
