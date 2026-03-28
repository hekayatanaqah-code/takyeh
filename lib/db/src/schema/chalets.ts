import { pgTable, text, serial, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
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
  nameAr: text("name_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  location: text("location").notNull(),
  websiteUrl: text("website_url"),
  descriptionAr: text("description_ar").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  photos: text("photos").array().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(chaletSubmissionsTable).omit({ id: true, createdAt: true, status: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type ChaletSubmission = typeof chaletSubmissionsTable.$inferSelect;
