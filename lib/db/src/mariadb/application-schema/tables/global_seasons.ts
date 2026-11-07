
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const globalSeasonsTable = m.mysqlTable("global_seasons", {
  id: m.int("id").notNull().autoincrement(),
  nameAr: m.longtext("name_ar").notNull(),
  startDate: m.longtext("start_date").notNull(),
  endDate: m.longtext("end_date").notNull(),
  color: m.longtext("color").notNull().default(sql.raw("'#D97706'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")).$onUpdate(() => new Date()),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("global_seasons_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
