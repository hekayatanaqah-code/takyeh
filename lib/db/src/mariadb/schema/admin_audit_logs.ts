// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const adminAuditLogsTable = m.mysqlTable("admin_audit_logs", {
  id: m.int("id").notNull().autoincrement(),
  adminId: m.varchar("admin_id", { length: 191 }),
  adminName: m.longtext("admin_name"),
  action: m.varchar("action", { length: 191 }).notNull(),
  targetOwnerId: m.longtext("target_owner_id"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  method: m.longtext("method"),
  path: m.longtext("path"),
  entity: m.varchar("entity", { length: 191 }),
  entityId: m.varchar("entity_id", { length: 191 }),
  metadata: m.json("metadata").notNull().default(sql.raw("'{}'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.index("admin_audit_logs_action_idx").on(table.action),
  m.index("admin_audit_logs_actor_idx").on(table.adminId),
  m.index("admin_audit_logs_created_at_idx").on(table.createdAt),
  m.index("admin_audit_logs_entity_idx").on(table.entity, table.entityId),
  m.primaryKey({ columns: [table.id] }),
]);
