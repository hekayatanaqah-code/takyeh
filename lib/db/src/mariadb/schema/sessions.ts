// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const sessionsTable = m.mysqlTable("sessions", {
  sid: m.varchar("sid", { length: 191 }).notNull(),
  sess: m.json("sess").notNull(),
  expire: m.datetime("expire", { mode: "date", fsp: 6 }).notNull(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("IDX_session_expire").on(table.expire),
  m.primaryKey({ columns: [table.sid] }),
]);
