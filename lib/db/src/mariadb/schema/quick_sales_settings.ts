// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const quickSalesSettingsTable = m.mysqlTable("quick_sales_settings", {
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  enabled: m.boolean("enabled").notNull().default(sql.raw("0")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("quick_sales_settings_enabled_bool", sql.raw("`enabled` IN (0,1)")),
  m.primaryKey({ columns: [table.ownerId] }),
]);
