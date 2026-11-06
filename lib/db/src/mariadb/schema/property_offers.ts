// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { chaletSubmissionsTable } from "./chalet_submissions";

export const propertyOffersTable = m.mysqlTable("property_offers", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  submissionId: m.int("submission_id").notNull(),
  nameAr: m.longtext("name_ar").notNull(),
  startDate: m.date("start_date").notNull(),
  endDate: m.date("end_date").notNull(),
  weekdays: m.json("weekdays").notNull(),
  discountType: m.longtext("discount_type").notNull(),
  value: m.decimal("value", { precision: 12, scale: 2 }).notNull(),
  enabled: m.boolean("enabled").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("property_offers_enabled_bool", sql.raw("`enabled` IN (0,1)")),
  m.check("property_offers_check", sql.raw("((end_date >= start_date))")),
  m.check("property_offers_check1", sql.raw("(((value > (0)) AND ((discount_type <> 'percent') OR (value <= (100)))))")),
  m.check("property_offers_discount_type_check", sql.raw("((discount_type IN ('percent', 'fixed', 'night_price')))")),
  m.check("property_offers_name_ar_check", sql.raw("(((CHAR_LENGTH(TRIM(BOTH FROM name_ar)) >= 1) AND (CHAR_LENGTH(TRIM(BOTH FROM name_ar)) <= 120)))")),
  m.primaryKey({ columns: [table.id] }),
  m.index("property_offers_submission_idx").on(table.submissionId, table.enabled),
  m.foreignKey({ name: "property_offers_submission_id_fkey", columns: [table.submissionId], foreignColumns: [chaletSubmissionsTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
