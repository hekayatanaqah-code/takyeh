// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const photographyReceiptUploadsTable = m.mysqlTable("photography_receipt_uploads", {
  id: m.varchar("id", { length: 191 }).notNull(),
  sourcePath: m.varchar("source_path", { length: 191 }).notNull(),
  preparedPath: m.varchar("prepared_path", { length: 191 }).notNull(),
  uploadedBy: m.longtext("uploaded_by").notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  state: m.longtext("state").notNull().default(sql.raw("'requested'")),
  receiptId: m.int("receipt_id"),
  error: m.longtext("error"),
  deletedAt: m.datetime("deleted_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_receipt_uploads_state_check", sql.raw("((state IN ('requested', 'ready', 'invalid', 'deleting', 'deleted')))")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photography_receipt_uploads_prepared_path_key").on(table.preparedPath),
  m.uniqueIndex("photography_receipt_uploads_receipt_id_key").on(table.receiptId),
  m.uniqueIndex("photography_receipt_uploads_source_path_key").on(table.sourcePath),
]);
