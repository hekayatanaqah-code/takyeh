// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { regionsCatalogTable } from "./regions_catalog";

export const citiesCatalogTable = m.mysqlTable("cities_catalog", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  regionId: m.int("region_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("cities_catalog_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "cities_catalog_region_id_fkey", columns: [table.regionId], foreignColumns: [regionsCatalogTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
