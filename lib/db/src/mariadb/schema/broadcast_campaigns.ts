// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const broadcastCampaignsTable = m.mysqlTable("broadcast_campaigns", {
  id: m.int("id").notNull().autoincrement(),
  title: m.longtext("title").notNull(),
  body: m.longtext("body").notNull(),
  audience: m.longtext("audience").notNull(),
  channels: m.json("channels").$type<string[]>().notNull(),
  idempotencyKey: m.varchar("idempotency_key", { length: 191 }),
  createdBy: m.longtext("created_by").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("broadcast_campaigns_channels_array", sql.raw("JSON_TYPE(`channels`) = 'ARRAY'")),
  m.check("broadcast_campaigns_audience_check", sql.raw("((audience IN ('all', 'active', 'providers')))")),
  m.uniqueIndex("broadcast_campaigns_idempotency_key_key").on(table.idempotencyKey),
  m.primaryKey({ columns: [table.id] }),
]);
