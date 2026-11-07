
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { broadcastCampaignsTable } from "./broadcast_campaigns";

export const broadcastDeliveriesTable = m.mysqlTable("broadcast_deliveries", {
  id: m.int("id").notNull().autoincrement(),
  campaignId: m.int("campaign_id").notNull(),
  recipientKey: m.varchar("recipient_key", { length: 191 }).notNull(),
  channel: m.varchar("channel", { length: 191 }).notNull(),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'pending'")),
  errorCode: m.longtext("error_code"),
  deliveredAt: m.datetime("delivered_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  recipientOwnerId: m.longtext("recipient_owner_id").notNull(),
  recipientEmail: m.longtext("recipient_email"),
  recipientWhatsappPhone: m.longtext("recipient_whatsapp_phone"),
  recipientName: m.longtext("recipient_name"),
  attempts: m.int("attempts").notNull().default(sql.raw("0")),
  startedAt: m.datetime("started_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("broadcast_deliveries_channel_check", sql.raw("((channel IN ('inApp', 'inbox', 'email', 'whatsapp')))")),
  m.check("broadcast_deliveries_status_check", sql.raw("((status IN ('pending', 'sending', 'delivered', 'failed')))")),
  m.uniqueIndex("broadcast_deliveries_campaign_recipient_channel_uq").on(table.campaignId, table.recipientKey, table.channel),
  m.index("broadcast_deliveries_campaign_status_idx").on(table.campaignId, table.status),
  m.primaryKey({ columns: [table.id] }),
  m.index("broadcast_deliveries_status_id_idx").on(table.status, table.id),
  m.foreignKey({ name: "broadcast_deliveries_campaign_id_fkey", columns: [table.campaignId], foreignColumns: [broadcastCampaignsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
