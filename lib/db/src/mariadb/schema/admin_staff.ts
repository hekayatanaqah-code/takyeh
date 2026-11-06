// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const adminStaffTable = m.mysqlTable("admin_staff", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  username: m.varchar("username", { length: 191 }).notNull(),
  passwordHash: m.longtext("password_hash").notNull(),
  permissions: m.json("permissions").notNull().default(sql.raw("'{}'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  isSuperAdmin: m.boolean("is_super_admin").notNull().default(sql.raw("0")),
  email: m.longtext("email"),
  mobile: m.longtext("mobile"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("admin_staff_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.check("admin_staff_is_super_admin_bool", sql.raw("`is_super_admin` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("admin_staff_username_key").on(table.username),
  m.uniqueIndex("admin_staff_username_unique").on(table.username),
]);
