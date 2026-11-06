// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceProvidersTable } from "./service_providers";

export const serviceReviewInvitationsTable = m.mysqlTable("service_review_invitations", {
  id: m.int("id").notNull().autoincrement(),
  token: m.varchar("token", { length: 191 }).notNull(),
  providerId: m.int("provider_id").notNull(),
  guestName: m.longtext("guest_name"),
  used: m.boolean("used").notNull().default(sql.raw("0")),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_review_invitations_used_bool", sql.raw("`used` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("service_review_invitations_token_key").on(table.token),
  m.foreignKey({ name: "service_review_invitations_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
