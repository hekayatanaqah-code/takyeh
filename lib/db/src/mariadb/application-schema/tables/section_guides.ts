
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const sectionGuidesTable = m.mysqlTable("section_guides", {
  id: m.int("id").notNull().autoincrement(),
  sectionKey: m.varchar("section_key", { length: 100 }).notNull(),
  title: m.varchar("title", { length: 255 }).notNull(),
  videoUrl: m.varchar("video_url", { length: 500 }).notNull(),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("idx_section_guides_key").on(table.sectionKey),
  m.primaryKey({ columns: [table.id] }),
]);
