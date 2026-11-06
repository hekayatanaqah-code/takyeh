// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerStaffTable } from "./owner_staff";

export const staffSessionsTable = m.mysqlTable("staff_sessions", {
  sid: m.varchar("sid", { length: 191 }).notNull(),
  staffId: m.int("staff_id").notNull(),
  ownerId: m.longtext("owner_id").notNull(),
  expire: m.datetime("expire", { mode: "date", fsp: 6 }).notNull(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.sid] }),
  m.foreignKey({ name: "staff_sessions_staff_id_fkey", columns: [table.staffId], foreignColumns: [ownerStaffTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
