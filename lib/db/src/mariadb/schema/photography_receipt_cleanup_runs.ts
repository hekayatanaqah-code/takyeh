// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const photographyReceiptCleanupRunsTable = m.mysqlTable("photography_receipt_cleanup_runs", {
  id: m.varchar("id", { length: 191 }).notNull(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  retentionDays: m.int("retention_days").notNull(),
  report: m.json("report").notNull(),
  approvedBy: m.longtext("approved_by"),
  approvedAt: m.datetime("approved_at", { mode: "date", fsp: 6 }),
  events: m.json("events").notNull().default(sql.raw("'[]'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_receipt_cleanup_runs_retention_days_check", sql.raw("(((retention_days >= 1) AND (retention_days <= 3650)))")),
  m.primaryKey({ columns: [table.id] }),
]);
