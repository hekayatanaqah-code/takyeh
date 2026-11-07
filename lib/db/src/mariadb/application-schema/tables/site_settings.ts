
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const siteSettingsTable = m.mysqlTable("site_settings", {
  key: m.varchar("key", { length: 191 }).notNull(),
  value: m.longtext("value").notNull().default(sql.raw("''")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.key] }),
]);
