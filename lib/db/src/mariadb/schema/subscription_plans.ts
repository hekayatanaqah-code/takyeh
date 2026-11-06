// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionPlansTable = m.mysqlTable("subscription_plans", {
  id: m.int("id").notNull().autoincrement(),
  slug: m.varchar("slug", { length: 191 }).notNull(),
  nameAr: m.longtext("name_ar").notNull(),
  price: m.decimal("price", { precision: 10, scale: 2 }).notNull(),
  durationDays: m.int("duration_days").notNull(),
  trialDays: m.int("trial_days").notNull().default(sql.raw("0")),
  features: m.json("features").notNull().default(sql.raw("'[]'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  sortOrder: m.int("sort_order").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  scope: m.longtext("scope"),
  chaletLimit: m.int("chalet_limit"),
  serviceLimit: m.int("service_limit"),
  extraChaletPrice: m.decimal("extra_chalet_price", { precision: 10, scale: 2 }),
  extraServicePrice: m.decimal("extra_service_price", { precision: 10, scale: 2 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_plans_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("subscription_plans_slug_unique").on(table.slug),
]);
