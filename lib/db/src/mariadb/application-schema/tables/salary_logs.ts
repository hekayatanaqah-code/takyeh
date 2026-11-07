
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerStaffTable } from "./owner_staff";

export const salaryLogsTable = m.mysqlTable("salary_logs", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  staffId: m.int("staff_id").notNull(),
  month: m.longtext("month").notNull(),
  bonus: m.decimal("bonus", { precision: 10, scale: 2 }).notNull().default(sql.raw("'0'")),
  deduction: m.decimal("deduction", { precision: 10, scale: 2 }).notNull().default(sql.raw("'0'")),
  notes: m.longtext("notes"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  paidAt: m.datetime("paid_at", { mode: "date", fsp: 6 }),
  expenseId: m.int("expense_id"),
  bonusNotes: m.longtext("bonus_notes"),
  deductionNotes: m.longtext("deduction_notes"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "salary_logs_staff_id_owner_staff_id_fk", columns: [table.staffId], foreignColumns: [ownerStaffTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
