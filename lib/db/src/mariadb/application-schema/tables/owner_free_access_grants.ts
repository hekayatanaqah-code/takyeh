
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerFreeAccessGrantsTable = m.mysqlTable("owner_free_access_grants", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  actorId: m.longtext("actor_id").notNull(),
  reason: m.longtext("reason").notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  startDate: m.date("start_date", { mode: "string" }),
  endDate: m.date("end_date", { mode: "string" }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("owner_free_access_grants_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
  m.primaryKey({ columns: [table.id] }),
]);
