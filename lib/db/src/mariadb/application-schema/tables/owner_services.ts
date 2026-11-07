
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerServicesTable = m.mysqlTable("owner_services", {
  id: m.int("id").notNull().autoincrement(),
  key: m.varchar("key", { length: 191 }).notNull(),
  title: m.longtext("title").notNull(),
  description: m.longtext("description").notNull().default(sql.raw("''")),
  icon: m.longtext("icon").notNull().default(sql.raw("'briefcase'")),
  kind: m.varchar("kind", { length: 191 }).notNull().default(sql.raw("'link'")),
  state: m.longtext("state").notNull().default(sql.raw("'coming_soon'")),
  actionUrl: m.longtext("action_url"),
  sortOrder: m.int("sort_order").notNull().default(sql.raw("0")),
  deletedAt: m.datetime("deleted_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  coverageCityIds: m.json("coverage_city_ids").$type<number[]>().notNull().default(sql.raw("'[]'")),
  Partial_3beff6802352cabd: m.varchar("_partial_3beff6802352cabd", { length: 191 }).generatedAlwaysAs(sql.raw("CASE WHEN (kind = 'photography') THEN `kind` ELSE NULL END"), { mode: "stored" }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_services_kind_check", sql.raw("((kind IN ('photography', 'link')))")),
  m.check("owner_services_state_check", sql.raw("((state IN ('available', 'coming_soon', 'hidden')))")),
  m.uniqueIndex("owner_services_key_key").on(table.key),
  m.uniqueIndex("owner_services_photography_unique").on(table.Partial_3beff6802352cabd),
  m.primaryKey({ columns: [table.id] }),
]);
