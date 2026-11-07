
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const broadcastSmtpSettingsTable = m.mysqlTable("broadcast_smtp_settings", {
  id: m.int("id").notNull(),
  host: m.longtext("host"),
  port: m.int("port"),
  secure: m.boolean("secure").notNull().default(sql.raw("0")),
  username: m.longtext("username"),
  fromAddress: m.longtext("from_address"),
  encryptedPassword: m.longtext("encrypted_password"),
  enabled: m.boolean("enabled").notNull().default(sql.raw("1")),
  updatedBy: m.longtext("updated_by"),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("broadcast_smtp_settings_secure_bool", sql.raw("`secure` IN (0,1)")),
  m.check("broadcast_smtp_settings_enabled_bool", sql.raw("`enabled` IN (0,1)")),
  m.check("broadcast_smtp_settings_id_check", sql.raw("((id = 1))")),
  m.check("broadcast_smtp_settings_port_check", sql.raw("(((port >= 1) AND (port <= 65535)))")),
  m.primaryKey({ columns: [table.id] }),
]);
