
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographersTable } from "./photographers";
import { photographyReceiptsTable } from "./photography_receipts";

export const photographyTransfersTable = m.mysqlTable("photography_transfers", {
  id: m.int("id").notNull().autoincrement(),
  photographerId: m.int("photographer_id").notNull(),
  amountHalalas: m.int("amount_halalas").notNull(),
  reference: m.varchar("reference", { length: 191 }).notNull(),
  transferredAt: m.datetime("transferred_at", { mode: "date", fsp: 6 }).notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  receiptId: m.int("receipt_id"),
  recordedBy: m.longtext("recorded_by"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_transfers_amount_halalas_check", sql.raw("((amount_halalas > 0))")),
  m.uniqueIndex("photography_transfer_receipt_unique").on(table.receiptId),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photography_transfers_reference_key").on(table.reference),
  m.foreignKey({ name: "photography_transfers_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
  m.foreignKey({ name: "photography_transfers_receipt_id_fkey", columns: [table.receiptId], foreignColumns: [photographyReceiptsTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
