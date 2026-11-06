// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerBillingProfilesTable = m.mysqlTable("owner_billing_profiles", {
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  encryptedPaymentToken: m.longtext("encrypted_payment_token"),
  tokenPaymentId: m.longtext("token_payment_id"),
  autoRenewEnabled: m.boolean("auto_renew_enabled").notNull().default(sql.raw("0")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_billing_profiles_auto_renew_enabled_bool", sql.raw("`auto_renew_enabled` IN (0,1)")),
  m.primaryKey({ columns: [table.ownerId] }),
]);
