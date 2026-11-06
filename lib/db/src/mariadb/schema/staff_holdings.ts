// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { ownerStaffTable } from "./owner_staff";

export const staffHoldingsTable = m.mysqlTable("staff_holdings", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  staffId: m.int("staff_id").notNull(),
  kind: m.longtext("kind").notNull(),
  description: m.longtext("description").notNull(),
  amount: m.decimal("amount", { precision: 10, scale: 2 }).notNull(),
  recordedOn: m.date("recorded_on").notNull(),
  notes: m.longtext("notes").notNull().default(sql.raw("''")),
  requestId: m.varchar("request_id", { length: 191 }).notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'open'")),
  settledOn: m.date("settled_on"),
  settlementNotes: m.longtext("settlement_notes"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("staff_holdings_check", sql.raw("(((amount >= (0)) AND ((kind = 'custody') OR (amount > (0)))))")),
  m.check("staff_holdings_check1", sql.raw("((((status = 'open') AND (settled_on IS NULL) AND (settlement_notes IS NULL)) OR ((status = 'settled') AND (settled_on >= recorded_on) AND (CHAR_LENGTH(TRIM(BOTH FROM settlement_notes)) > 0))))")),
  m.check("staff_holdings_kind_check", sql.raw("((kind IN ('custody', 'withheld', 'emergency', 'deposit')))")),
  m.check("staff_holdings_status_check", sql.raw("((status IN ('open', 'settled')))")),
  m.uniqueIndex("staff_holdings_owner_request").on(table.ownerId, table.requestId),
  m.index("staff_holdings_owner_staff").on(table.ownerId, table.staffId),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "staff_holdings_staff_id_fkey", columns: [table.staffId], foreignColumns: [ownerStaffTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
