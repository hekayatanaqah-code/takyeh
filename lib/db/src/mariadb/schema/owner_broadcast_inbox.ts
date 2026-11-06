// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { broadcastCampaignsTable } from "./broadcast_campaigns";

export const ownerBroadcastInboxTable = m.mysqlTable("owner_broadcast_inbox", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  ownerName: m.longtext("owner_name"),
  subject: m.longtext("subject").notNull(),
  message: m.longtext("message").notNull(),
  campaignId: m.int("campaign_id").notNull(),
  recipientKey: m.varchar("recipient_key", { length: 191 }).notNull(),
  isRead: m.boolean("is_read").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_broadcast_inbox_is_read_bool", sql.raw("`is_read` IN (0,1)")),
  m.uniqueIndex("owner_broadcast_inbox_campaign_recipient_uq").on(table.campaignId, table.recipientKey),
  m.index("owner_broadcast_inbox_owner_created_idx").on(table.ownerId, table.createdAt),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "owner_broadcast_inbox_campaign_id_fkey", columns: [table.campaignId], foreignColumns: [broadcastCampaignsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
