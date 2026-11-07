
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerReportArchiveTable = m.mysqlTable("owner_report_archive", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  reportType: m.longtext("report_type").notNull(),
  reportPeriod: m.longtext("report_period").notNull(),
  submissionId: m.int("submission_id"),
  propertyName: m.longtext("property_name"),
  data: m.json("data").$type<Record<string, unknown>>(),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  pdfUrl: m.longtext("pdf_url"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.primaryKey({ columns: [table.id] }),
]);
