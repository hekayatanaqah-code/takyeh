// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const usersTable = m.mysqlTable("users", {
  id: m.varchar("id", { length: 191 }).notNull().default(sql.raw("(UUID())")),
  email: m.varchar("email", { length: 191 }),
  firstName: m.varchar("first_name", { length: 191 }),
  lastName: m.varchar("last_name", { length: 191 }),
  profileImageUrl: m.varchar("profile_image_url", { length: 191 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("users_email_unique").on(table.email),
  m.primaryKey({ columns: [table.id] }),
]);
