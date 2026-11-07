
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const contactInquiriesTable = m.mysqlTable("contact_inquiries", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  phone: m.longtext("phone"),
  email: m.longtext("email"),
  message: m.longtext("message").notNull(),
  status: m.varchar("status", { length: 191 }).notNull().default(sql.raw("'new'")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  adminNotes: m.longtext("admin_notes"),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")).$onUpdate(() => new Date()),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("contact_inquiries_created_at_idx").on(table.createdAt),
  m.primaryKey({ columns: [table.id] }),
  m.index("contact_inquiries_status_updated_idx").on(table.status, table.updatedAt),
]);
