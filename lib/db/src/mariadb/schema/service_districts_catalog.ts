// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceCitiesCatalogTable } from "./service_cities_catalog";

export const serviceDistrictsCatalogTable = m.mysqlTable("service_districts_catalog", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  cityId: m.int("city_id").notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_districts_catalog_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "service_districts_catalog_city_id_fkey", columns: [table.cityId], foreignColumns: [serviceCitiesCatalogTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
