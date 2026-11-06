// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { globalSeasonsTable } from "./global_seasons";
import { serviceProvidersTable } from "./service_providers";

export const serviceSeasonsTable = m.mysqlTable("service_seasons", {
  id: m.int("id").notNull().autoincrement(),
  providerId: m.int("provider_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  name: m.longtext("name").notNull(),
  startDate: m.longtext("start_date").notNull(),
  endDate: m.longtext("end_date").notNull(),
  priceLabel: m.longtext("price_label"),
  multiplier: m.decimal("multiplier", { precision: 4, scale: 2 }).notNull().default(sql.raw("1.00")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  globalSeasonId: m.int("global_season_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_seasons_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("service_seasons_provider_global_unique").on(table.providerId, table.globalSeasonId),
  m.foreignKey({ name: "service_seasons_global_season_id_fkey", columns: [table.globalSeasonId], foreignColumns: [globalSeasonsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "service_seasons_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
