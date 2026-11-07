
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const regionsCatalogTable = m.mysqlTable("regions_catalog", {
  id: m.int("id").notNull().autoincrement(),
  name: m.varchar("name", { length: 191 }).notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("regions_catalog_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.uniqueIndex("regions_catalog_name_key").on(table.name),
  m.primaryKey({ columns: [table.id] }),
]);
