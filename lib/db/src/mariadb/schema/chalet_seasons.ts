// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { chaletSubmissionsTable } from "./chalet_submissions";

export const chaletSeasonsTable = m.mysqlTable("chalet_seasons", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  submissionId: m.int("submission_id").notNull(),
  nameAr: m.longtext("name_ar").notNull(),
  startDate: m.longtext("start_date").notNull(),
  endDate: m.longtext("end_date").notNull(),
  price: m.decimal("price", { precision: 10, scale: 2 }).notNull(),
  period: m.longtext("period"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  priceMorning: m.decimal("price_morning", { precision: 10, scale: 2 }),
  priceEvening: m.decimal("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: m.decimal("price_full_day", { precision: 10, scale: 2 }),
  dailyPrices: m.json("daily_prices"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "chalet_seasons_submission_id_chalet_submissions_id_fk", columns: [table.submissionId], foreignColumns: [chaletSubmissionsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
