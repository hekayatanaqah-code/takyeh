import { boolean, date, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { serviceProvidersTable } from "./chalets";

export const providerCatalogItemsTable = pgTable("provider_catalog_items", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<"service" | "product">().notNull(),
  description: text("description").notNull().default(""),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  pricingUnit: text("pricing_unit").$type<"per_request" | "per_hour" | "per_day" | "per_piece">().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [index("provider_catalog_items_provider_idx").on(t.providerId)]);

export const providerOffersTable = pgTable("provider_offers", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => providerCatalogItemsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  discountType: text("discount_type").$type<"percentage" | "fixed">().notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
}, t => [index("provider_offers_provider_idx").on(t.providerId)]);

export const insertProviderCatalogItemSchema = createInsertSchema(providerCatalogItemsTable).omit({ id: true, deletedAt: true });
export const insertProviderOfferSchema = createInsertSchema(providerOffersTable).omit({ id: true });
export type ProviderCatalogRecord = typeof providerCatalogItemsTable.$inferSelect;
export type ProviderOfferRecord = typeof providerOffersTable.$inferSelect;
