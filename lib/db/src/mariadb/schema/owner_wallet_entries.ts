// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerWalletEntriesTable = m.mysqlTable("owner_wallet_entries", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  sourceKey: m.varchar("source_key", { length: 191 }).notNull(),
  kind: m.longtext("kind").notNull(),
  amountHalalas: m.int("amount_halalas").notNull(),
  description: m.longtext("description").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_wallet_nonzero", sql.raw("((amount_halalas <> 0))")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("owner_wallet_entries_source_key_key").on(table.sourceKey),
  m.index("owner_wallet_owner_idx").on(table.ownerId),
]);
