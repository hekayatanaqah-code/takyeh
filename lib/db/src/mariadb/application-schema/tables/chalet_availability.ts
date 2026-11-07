
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const chaletAvailabilityTable = m.mysqlTable("chalet_availability", {
  id: m.int("id").notNull().autoincrement(),
  chaletId: m.int("chalet_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  dateStr: m.longtext("date_str").notNull(),
  periodMorning: m.boolean("period_morning").notNull().default(sql.raw("0")),
  periodEvening: m.boolean("period_evening").notNull().default(sql.raw("0")),
  periodFullDay: m.boolean("period_full_day").notNull().default(sql.raw("0")),
  notes: m.longtext("notes"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("chalet_availability_period_morning_bool", sql.raw("`period_morning` IN (0,1)")),
  m.check("chalet_availability_period_evening_bool", sql.raw("`period_evening` IN (0,1)")),
  m.check("chalet_availability_period_full_day_bool", sql.raw("`period_full_day` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
