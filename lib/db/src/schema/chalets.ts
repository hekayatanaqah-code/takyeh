import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
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
