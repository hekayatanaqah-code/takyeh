import { pgTable, serial, text, integer, boolean, jsonb, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export type PhotographyAvailability = { weekday: number; start: string; end: string }[];
export const photographersTable = pgTable("photographers", {
  id: serial("id").primaryKey(), name: text("name").notNull(), whatsapp: text("whatsapp").notNull().unique(),
  status: text("status").notNull().default("invited"), bio: text("bio").notNull().default(""),
  regionId: integer("region_id"), cityId: integer("city_id"),
  districtIds: jsonb("district_ids").$type<number[]>().notNull().default([]),
  allDistricts: boolean("all_districts").notNull().default(false),
  sessionMinutes: integer("session_minutes").notNull().default(60),
  availability: jsonb("availability").$type<PhotographyAvailability>().notNull().default([]),
  adminNote: text("admin_note"), passwordHash: text("password_hash"),
  inviteHash: text("invite_hash").unique(), inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const photographyPackagesTable = pgTable("photography_packages", {
  id: serial("id").primaryKey(), name: text("name").notNull(),
  priceHalalas: integer("price_halalas").notNull(),
  platformPercent: numeric("platform_percent", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});
export const photographerSessionsTable = pgTable("photographer_sessions", {
  hash: text("hash").primaryKey(),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const photographyBookingsTable = pgTable("photography_bookings", {
  id: serial("id").primaryKey(), ownerId: text("owner_id").notNull(),
  propertyId: integer("property_id").notNull(),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  packageId: integer("package_id").notNull().references(() => photographyPackagesTable.id),
  propertyName: text("property_name").notNull(), photographerName: text("photographer_name").notNull(),
  packageName: text("package_name").notNull(), ownerPhone: text("owner_phone").notNull(),
  photographerPhone: text("photographer_phone").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(), endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("awaiting_payment"),
  priceHalalas: integer("price_halalas").notNull(), commissionHalalas: integer("commission_halalas").notNull(),
  photographerEarningsHalalas: integer("photographer_earnings_halalas").notNull(),
  invoiceId: text("invoice_id").unique(), paymentId: text("payment_id").unique(), paymentUrl: text("payment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const photographyDeliveriesTable = pgTable("photography_deliveries", {
  id: serial("id").primaryKey(), dedupeKey: text("dedupe_key").notNull().unique(),
  bookingId: integer("booking_id").references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  photographerId: integer("photographer_id").references(() => photographersTable.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(), kind: text("kind").notNull(),
  parameters: jsonb("parameters").$type<string[]>().notNull(), status: text("status").notNull().default("pending"),
  error: text("error"), providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPhotographerSchema = createInsertSchema(photographersTable);
export const insertPhotographyPackageSchema = createInsertSchema(photographyPackagesTable);
export type Photographer = typeof photographersTable.$inferSelect;
export type PhotographyBooking = typeof photographyBookingsTable.$inferSelect;
