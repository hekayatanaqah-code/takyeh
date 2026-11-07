
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceRegionsCatalogTable } from "./service_regions_catalog";

export const serviceCitiesCatalogTable = m.mysqlTable("service_cities_catalog", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  regionId: m.int("region_id").notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_cities_catalog_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "service_cities_catalog_region_id_fkey", columns: [table.regionId], foreignColumns: [serviceRegionsCatalogTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
