
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceProvidersTable } from "./service_providers";

export const providerCatalogItemsTable = m.mysqlTable("provider_catalog_items", {
  id: m.int("id").notNull().autoincrement(),
  providerId: m.int("provider_id").notNull(),
  name: m.longtext("name").notNull(),
  kind: m.longtext("kind").$type<"service" | "product">().notNull(),
  description: m.longtext("description").notNull().default(sql.raw("''")),
  price: m.decimal("price", { precision: 12, scale: 2 }).notNull(),
  pricingUnit: m.longtext("pricing_unit").$type<"per_request" | "per_hour" | "per_day" | "per_piece">().notNull(),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  deletedAt: m.datetime("deleted_at", { mode: "date", fsp: 6 }),
  thumbnailUrl: m.longtext("thumbnail_url"),
  galleryPhotos: m.json("gallery_photos").$type<string[]>().notNull().default(sql.raw("'[]'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("provider_catalog_items_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.check("provider_catalog_items_gallery_photos_array", sql.raw("JSON_TYPE(`gallery_photos`) = 'ARRAY'")),
  m.check("provider_catalog_items_kind_check", sql.raw("((kind IN ('service', 'product')))")),
  m.check("provider_catalog_items_price_check", sql.raw("(((price > (0)) AND (price <= (1000000))))")),
  m.check("provider_catalog_items_pricing_unit_check", sql.raw("((pricing_unit IN ('per_request', 'per_hour', 'per_day', 'per_piece')))")),
  m.primaryKey({ columns: [table.id] }),
  m.index("provider_catalog_items_provider_idx").on(table.providerId),
  m.foreignKey({ name: "provider_catalog_items_provider_id_fkey", columns: [table.providerId], foreignColumns: [serviceProvidersTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
