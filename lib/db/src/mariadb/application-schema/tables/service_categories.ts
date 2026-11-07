
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const serviceCategoriesTable = m.mysqlTable("service_categories", {
  id: m.int("id").notNull().autoincrement(),
  key: m.varchar("key", { length: 191 }).notNull(),
  labelAr: m.longtext("label_ar").notNull(),
  emoji: m.longtext("emoji").notNull().default(sql.raw("'✨'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  sortOrder: m.int("sort_order").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_categories_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.uniqueIndex("service_categories_key_unique").on(table.key),
  m.primaryKey({ columns: [table.id] }),
]);
