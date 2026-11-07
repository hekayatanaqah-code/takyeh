
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerCustomersTable = m.mysqlTable("owner_customers", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  phoneNormalized: m.varchar("phone_normalized", { length: 191 }).notNull(),
  phone: m.longtext("phone").notNull(),
  name: m.longtext("name").notNull(),
  serviceAddress: m.longtext("service_address"),
  serviceDeliveryMethod: m.longtext("service_delivery_method"),
  clientIdNumber: m.longtext("client_id_number"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.uniqueIndex("owner_customers_owner_phone_unique").on(table.ownerId, table.phoneNormalized),
  m.primaryKey({ columns: [table.id] }),
]);
