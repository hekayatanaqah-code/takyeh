// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerSupportRequestsTable = m.mysqlTable("owner_support_requests", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  ownerName: m.longtext("owner_name"),
  subject: m.longtext("subject").notNull(),
  message: m.longtext("message").notNull(),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'new'")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  adminReply: m.longtext("admin_reply"),
  adminReplyAt: m.datetime("admin_reply_at", { mode: "date", fsp: 6 }),
  isReadByOwner: m.boolean("is_read_by_owner").notNull().default(sql.raw("0")),
  attachmentUrl: m.longtext("attachment_url"),
  adminAttachmentUrl: m.longtext("admin_attachment_url"),
  attachmentUrls: m.json("attachment_urls").$type<string[]>().default(sql.raw("'[]'")),
  adminAttachmentUrls: m.json("admin_attachment_urls").$type<string[]>().default(sql.raw("'[]'")),
  source: m.longtext("source").notNull().default(sql.raw("'owner_request'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_support_requests_is_read_by_owner_bool", sql.raw("`is_read_by_owner` IN (0,1)")),
  m.check("owner_support_requests_attachment_urls_array", sql.raw("JSON_TYPE(`attachment_urls`) = 'ARRAY'")),
  m.check("owner_support_requests_admin_attachment_urls_array", sql.raw("JSON_TYPE(`admin_attachment_urls`) = 'ARRAY'")),
  m.index("owner_support_requests_owner_created_idx").on(table.ownerId, table.createdAt),
  m.primaryKey({ columns: [table.id] }),
  m.index("owner_support_requests_status_created_idx").on(table.status, table.createdAt),
]);
