
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const phoneOtpTokensTable = m.mysqlTable("phone_otp_tokens", {
  id: m.int("id").notNull().autoincrement(),
  phone: m.longtext("phone").notNull(),
  codeHash: m.longtext("code_hash").notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  usedAt: m.datetime("used_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
]);
