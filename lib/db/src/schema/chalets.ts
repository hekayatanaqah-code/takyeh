import { pgTable, text, serial, integer, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chaletsTable = pgTable("chalets", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar").notNull(),
  location: text("location").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  maxGuests: integer("max_guests").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  amenities: text("amenities").array().notNull().default([]),
  photos: text("photos").array().notNull().default([]),
  whatsappNumber: text("whatsapp_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChaletSchema = createInsertSchema(chaletsTable).omit({ id: true, createdAt: true });
export type InsertChalet = z.infer<typeof insertChaletSchema>;
export type Chalet = typeof chaletsTable.$inferSelect;

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected"]);

export const chaletSubmissionsTable = pgTable("chalet_submissions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  nameAr: text("name_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  location: text("location").notNull(),
  district: text("district"),
  websiteUrl: text("website_url"),
  descriptionAr: text("description_ar").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  amenities: text("amenities").array().notNull().default([]),
  mapsUrl: text("maps_url"),
  photos: text("photos").array().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("pending"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(chaletSubmissionsTable).omit({ id: true, createdAt: true, status: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type ChaletSubmission = typeof chaletSubmissionsTable.$inferSelect;

export const citiesCatalogTable = pgTable("cities_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type City = typeof citiesCatalogTable.$inferSelect;

export const districtsCatalogTable = pgTable("districts_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cityId: integer("city_id").references(() => citiesCatalogTable.id, { onDelete: "cascade" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type District = typeof districtsCatalogTable.$inferSelect;

export const amenitiesCatalogTable = pgTable("amenities_catalog", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  labelAr: text("label_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AmenityCatalog = typeof amenitiesCatalogTable.$inferSelect;

export const servicesCategoryEnum = pgEnum("services_category", [
  "bounce_houses",
  "ice_cream",
  "productive_families",
]);

export const externalServicesTable = pgTable("external_services", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  category: servicesCategoryEnum("category").notNull(),
  descriptionAr: text("description_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }),
  priceNote: text("price_note"),
  city: text("city"),
  photos: text("photos").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ExternalService = typeof externalServicesTable.$inferSelect;
