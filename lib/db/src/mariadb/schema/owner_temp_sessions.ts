// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerTempSessionsTable = m.mysqlTable("owner_temp_sessions", {
  id: m.int("id").notNull().autoincrement(),
  token: m.varchar("token", { length: 191 }).notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  adminLabel: m.longtext("admin_label"),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  createdByReplitId: m.longtext("created_by_replit_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("owner_temp_sessions_token_key").on(table.token),
  m.uniqueIndex("owner_temp_sessions_token_unique").on(table.token),
]);
