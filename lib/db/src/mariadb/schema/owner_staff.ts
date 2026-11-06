// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerStaffTable = m.mysqlTable("owner_staff", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  name: m.longtext("name").notNull(),
  baseSalary: m.decimal("base_salary", { precision: 10, scale: 2 }).notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  username: m.varchar("username", { length: 191 }),
  passwordHash: m.longtext("password_hash"),
  permissions: m.json("permissions").notNull().default(sql.raw("'{}'")),
  assignedToType: m.longtext("assigned_to_type").notNull().default(sql.raw("'all'")),
  assignedToId: m.int("assigned_to_id"),
  nationalId: m.longtext("national_id"),
  phoneNum: m.longtext("phone_num"),
  birthDate: m.longtext("birth_date"),
  hireDate: m.longtext("hire_date"),
  jobTitle: m.longtext("job_title"),
  email: m.longtext("email"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_staff_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("owner_staff_username_unique").on(table.username),
]);
