// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerAccountLinksTable = m.mysqlTable("owner_account_links", {
  userId: m.varchar("user_id", { length: 191 }).notNull(),
  ownerApplicationId: m.int("owner_application_id").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("owner_account_links_owner_application_id_key").on(table.ownerApplicationId),
  m.primaryKey({ columns: [table.userId] }),
]);
