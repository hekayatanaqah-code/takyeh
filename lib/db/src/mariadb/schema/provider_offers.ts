// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { providerCatalogItemsTable } from "./provider_catalog_items";
import { serviceProvidersTable } from "./service_providers";

export const providerOffersTable = m.mysqlTable("provider_offers", {
  id: m.int("id").notNull().autoincrement(),
  providerId: m.int("provider_id").notNull(),
  itemId: m.int("item_id"),
  name: m.longtext("name").notNull(),
  discountType: m.longtext("discount_type").notNull(),
  value: m.decimal("value", { precision: 12, scale: 2 }).notNull(),
  startDate: m.date("start_date", { mode: "string" }).notNull(),
  endDate: m.date("end_date", { mode: "string" }).notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("provider_offers_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.check("provider_offers_check", sql.raw("(((value > (0)) AND (value <= (1000000)) AND ((discount_type <> 'percentage') OR (value <= (100)))))")),
  m.check("provider_offers_check1", sql.raw("((start_date <= end_date))")),
  m.check("provider_offers_discount_type_check", sql.raw("((discount_type IN ('percentage', 'fixed')))")),
  m.primaryKey({ columns: [table.id] }),
  m.index("provider_offers_provider_idx").on(table.providerId),
  m.foreignKey({ name: "provider_offers_item_id_fkey", columns: [table.itemId], foreignColumns: [providerCatalogItemsTable.id] }).onDelete("cascade").onUpdate("restrict"),
  m.foreignKey({ name: "provider_offers_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
