// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const passwordResetTokensTable = m.mysqlTable("password_reset_tokens", {
  id: m.int("id").notNull().autoincrement(),
  targetType: m.longtext("target_type").notNull(),
  targetId: m.longtext("target_id").notNull(),
  token: m.varchar("token", { length: 191 }).notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  used: m.boolean("used").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("password_reset_tokens_used_bool", sql.raw("`used` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("password_reset_tokens_token_key").on(table.token),
]);
