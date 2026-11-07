
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographersTable } from "./photographers";

export const photographerSessionsTable = m.mysqlTable("photographer_sessions", {
  hash: m.varchar("hash", { length: 191 }).notNull(),
  photographerId: m.int("photographer_id").notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.hash] }),
  m.foreignKey({ name: "photographer_sessions_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
