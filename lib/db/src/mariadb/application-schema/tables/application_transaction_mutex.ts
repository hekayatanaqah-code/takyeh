
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const applicationTransactionMutexTable = m.mysqlTable("application_transaction_mutex", {
  id: m.int("id").notNull(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
]);
