// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const expenseCategoriesTable = m.mysqlTable("expense_categories", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  emoji: m.longtext("emoji").notNull().default(sql.raw("'✨'")),
  color: m.longtext("color").notNull().default(sql.raw("'slate'")),
  isOther: m.boolean("is_other").notNull().default(sql.raw("0")),
  sortOrder: m.int("sort_order").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("expense_categories_is_other_bool", sql.raw("`is_other` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
