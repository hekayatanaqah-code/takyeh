import { boolean, date, index, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { chaletSubmissionsTable } from "./chalets";

export const propertyOffersTable = pgTable("property_offers", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id").notNull().references(() => chaletSubmissionsTable.id),
  nameAr: text("name_ar").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  weekdays: jsonb("weekdays").$type<number[]>().notNull(),
  discountType: text("discount_type").$type<"percent" | "fixed" | "night_price">().notNull(),
  value: numeric("value", { precision: 12, scale: 2 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("property_offers_submission_idx").on(table.submissionId, table.enabled)]);

export const insertPropertyOfferSchema = createInsertSchema(propertyOffersTable).omit({ id: true, createdAt: true, updatedAt: true });
