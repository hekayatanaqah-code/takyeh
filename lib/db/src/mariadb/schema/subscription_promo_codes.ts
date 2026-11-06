// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const subscriptionPromoCodesTable = m.mysqlTable("subscription_promo_codes", {
  id: m.int("id").notNull().autoincrement(),
  code: m.varchar("code", { length: 191 }).notNull(),
  kind: m.longtext("kind").notNull(),
  value: m.decimal("value", { precision: 10, scale: 2 }).notNull(),
  usageLimit: m.int("usage_limit"),
  usedCount: m.int("used_count").notNull().default(sql.raw("0")),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("subscription_promo_codes_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.uniqueIndex("subscription_promo_codes_code_key").on(table.code),
  m.primaryKey({ columns: [table.id] }),
]);
