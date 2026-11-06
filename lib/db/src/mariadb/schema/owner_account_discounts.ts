// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerAccountDiscountsTable = m.mysqlTable("owner_account_discounts", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  actorId: m.longtext("actor_id").notNull(),
  kind: m.longtext("kind").notNull(),
  value: m.decimal("value", { precision: 15, scale: 2 }).notNull(),
  startDate: m.date("start_date"),
  endDate: m.date("end_date"),
  reason: m.longtext("reason").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("owner_account_discounts_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
  m.primaryKey({ columns: [table.id] }),
]);
