// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const customerNotesTable = m.mysqlTable("customer_notes", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  clientPhone: m.varchar("client_phone", { length: 191 }).notNull(),
  notes: m.longtext("notes").notNull().default(sql.raw("''")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("customer_notes_owner_id_client_phone_key").on(table.ownerId, table.clientPhone),
  m.primaryKey({ columns: [table.id] }),
]);
