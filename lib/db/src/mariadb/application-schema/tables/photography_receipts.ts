
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const photographyReceiptsTable = m.mysqlTable("photography_receipts", {
  id: m.int("id").notNull().autoincrement(),
  objectPath: m.varchar("object_path", { length: 191 }).notNull(),
  name: m.longtext("name").notNull(),
  contentType: m.longtext("content_type").notNull(),
  size: m.int("size").notNull(),
  uploadedBy: m.longtext("uploaded_by").notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  sourcePath: m.varchar("source_path", { length: 191 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("photography_receipts_object_path_key").on(table.objectPath),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photography_receipts_source_path_key").on(table.sourcePath),
]);
