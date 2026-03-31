import { pgTable, text, serial, integer, numeric, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chaletsTable = pgTable("chalets", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar").notNull(),
  location: text("location").notNull(),
  district: text("district"),
  category: text("category"),
  propertyType: text("property_type"),
  sections: text("sections"),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  /* ── Time-slot pricing ── */
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  slotMorning: boolean("slot_morning").notNull().default(true),
  slotEvening: boolean("slot_evening").notNull().default(true),
  slotFullDay: boolean("slot_full_day").notNull().default(true),
  maxGuests: integer("max_guests").notNull(),
  bedrooms: integer("bedrooms").notNull(),
  amenities: text("amenities").array().notNull().default([]),
  photos: text("photos").array().notNull().default([]),
  whatsappNumber: text("whatsapp_number").notNull(),
  mapsUrl: text("maps_url"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChaletSchema = createInsertSchema(chaletsTable).omit({ id: true, createdAt: true });
export type InsertChalet = z.infer<typeof insertChaletSchema>;
export type Chalet = typeof chaletsTable.$inferSelect;

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected", "needs_revision"]);

export const chaletSubmissionsTable = pgTable("chalet_submissions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  nameAr: text("name_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  location: text("location").notNull(),
  district: text("district"),
  category: text("category"),
  propertyType: text("property_type"),
  sections: text("sections"),
  websiteUrl: text("website_url"),
  descriptionAr: text("description_ar").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  /* ── Time-slot pricing ── */
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  slotMorning: boolean("slot_morning").notNull().default(true),
  slotEvening: boolean("slot_evening").notNull().default(true),
  slotFullDay: boolean("slot_full_day").notNull().default(true),
  amenities: text("amenities").array().notNull().default([]),
  mapsUrl: text("maps_url"),
  socialLink: text("social_link"),
  photos: text("photos").array().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
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

/* ── Chalet Categories ─────────────────────────────────────── */
export const chaletCategoriesTable = pgTable("chalet_categories", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletCategory = typeof chaletCategoriesTable.$inferSelect;

/* ── Owner Bookings ────────────────────────────────────────── */
export const bookingSourceEnum = pgEnum("booking_source", ["platform", "external"]);

export const ownerBookingsTable = pgTable("owner_bookings", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id").references(() => chaletSubmissionsTable.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  bookingDate: text("booking_date").notNull(),
  durationDays: integer("duration_days").notNull().default(1),
  period: text("period"),
  source: bookingSourceEnum("source").notNull().default("platform"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerBooking = typeof ownerBookingsTable.$inferSelect;

/* ── Site Settings ─────────────────────────────────────────── */
export const siteSettingsTable = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SiteSetting = typeof siteSettingsTable.$inferSelect;

/* ── Service Provider Submissions ──────────────────────────── */
export const serviceProviderSubmissionsTable = pgTable("service_provider_submissions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProviderSubmission = typeof serviceProviderSubmissionsTable.$inferSelect;

/* ── Approved Service Providers ────────────────────────────── */
export const serviceProvidersTable = pgTable("service_providers", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;
