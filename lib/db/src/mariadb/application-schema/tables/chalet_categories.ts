
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const chaletCategoriesTable = m.mysqlTable("chalet_categories", {
  id: m.int("id").notNull().autoincrement(),
  nameAr: m.longtext("name_ar").notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  showSectionFilter: m.boolean("show_section_filter").notNull().default(sql.raw("0")),
  emoji: m.longtext("emoji").notNull().default(sql.raw("'🏠'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("chalet_categories_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.check("chalet_categories_show_section_filter_bool", sql.raw("`show_section_filter` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
