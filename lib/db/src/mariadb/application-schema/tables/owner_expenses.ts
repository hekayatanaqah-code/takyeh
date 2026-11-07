
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { chaletSubmissionsTable } from "./chalet_submissions";

export const ownerExpensesTable = m.mysqlTable("owner_expenses", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  submissionId: m.int("submission_id"),
  dateStr: m.longtext("date_str").notNull(),
  category: m.longtext("category").notNull().default(sql.raw("'other'")),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull(),
  notes: m.longtext("notes"),
  receiptUrl: m.longtext("receipt_url"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  customCategory: m.longtext("custom_category"),
  providerId: m.int("provider_id"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "owner_expenses_submission_id_chalet_submissions_id_fk", columns: [table.submissionId], foreignColumns: [chaletSubmissionsTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
