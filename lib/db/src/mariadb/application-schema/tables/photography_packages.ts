
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const photographyPackagesTable = m.mysqlTable("photography_packages", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  priceHalalas: m.int("price_halalas").notNull(),
  platformPercent: m.decimal("platform_percent", { precision: 5, scale: 2 }).notNull(),
  active: m.boolean("active").notNull().default(sql.raw("1")),
  propertyTypes: m.json("property_types").$type<string[]>().notNull().default(sql.raw("'[]'")),
  specialties: m.json("specialties").$type<string[]>().notNull().default(sql.raw("'[]'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_packages_active_bool", sql.raw("`active` IN (0,1)")),
  m.check("photography_packages_platform_percent_check", sql.raw("(((platform_percent >= (0)) AND (platform_percent <= (100))))")),
  m.check("photography_packages_price_halalas_check", sql.raw("((price_halalas >= 100))")),
  m.primaryKey({ columns: [table.id] }),
]);
