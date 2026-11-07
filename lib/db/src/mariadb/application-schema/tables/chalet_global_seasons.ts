
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { globalSeasonsTable } from "./global_seasons";
import { chaletSubmissionsTable } from "./chalet_submissions";

export const chaletGlobalSeasonsTable = m.mysqlTable("chalet_global_seasons", {
  id: m.int("id").notNull().autoincrement(),
  submissionId: m.int("submission_id").notNull(),
  globalSeasonId: m.int("global_season_id").notNull(),
  enabled: m.boolean("enabled").notNull().default(sql.raw("1")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")).$onUpdate(() => new Date()),
  priceMorning: m.decimal("price_morning", { precision: 10, scale: 2 }),
  priceEvening: m.decimal("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: m.decimal("price_full_day", { precision: 10, scale: 2 }),
  dailyPrices: m.json("daily_prices"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("chalet_global_seasons_enabled_bool", sql.raw("`enabled` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("chalet_global_seasons_submission_global_season_unique").on(table.submissionId, table.globalSeasonId),
  m.foreignKey({ name: "chalet_global_seasons_global_season_id_fkey", columns: [table.globalSeasonId], foreignColumns: [globalSeasonsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "chalet_global_seasons_submission_id_fkey", columns: [table.submissionId], foreignColumns: [chaletSubmissionsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
