// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerBroadcastPreferencesTable = m.mysqlTable("owner_broadcast_preferences", {
  ownerKey: m.varchar("owner_key", { length: 191 }).notNull(),
  inApp: m.boolean("in_app").notNull().default(sql.raw("1")),
  inbox: m.boolean("inbox").notNull().default(sql.raw("0")),
  email: m.boolean("email").notNull().default(sql.raw("0")),
  whatsapp: m.boolean("whatsapp").notNull().default(sql.raw("0")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_broadcast_preferences_in_app_bool", sql.raw("`in_app` IN (0,1)")),
  m.check("owner_broadcast_preferences_inbox_bool", sql.raw("`inbox` IN (0,1)")),
  m.check("owner_broadcast_preferences_email_bool", sql.raw("`email` IN (0,1)")),
  m.check("owner_broadcast_preferences_whatsapp_bool", sql.raw("`whatsapp` IN (0,1)")),
  m.primaryKey({ columns: [table.ownerKey] }),
]);
