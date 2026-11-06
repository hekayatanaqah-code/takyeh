// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { adminStaffTable } from "./admin_staff";

export const adminSessionsTable = m.mysqlTable("admin_sessions", {
  id: m.int("id").notNull().autoincrement(),
  sid: m.varchar("sid", { length: 191 }).notNull(),
  adminStaffId: m.int("admin_staff_id").notNull(),
  expire: m.datetime("expire", { mode: "date", fsp: 6 }).notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  impersonatedOwnerId: m.longtext("impersonated_owner_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("admin_sessions_sid_key").on(table.sid),
  m.uniqueIndex("admin_sessions_sid_unique").on(table.sid),
  m.foreignKey({ name: "admin_sessions_admin_staff_id_fkey", columns: [table.adminStaffId], foreignColumns: [adminStaffTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
