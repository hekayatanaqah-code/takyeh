import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const ownerServicesTable = pgTable("owner_services", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("briefcase"),
  kind: text("kind").notNull().default("link"),
  state: text("state").notNull().default("coming_soon"),
  coverageCityIds: jsonb("coverage_city_ids").$type<number[]>().notNull().default([]),
  actionUrl: text("action_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertOwnerServiceSchema = createInsertSchema(ownerServicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type OwnerService = typeof ownerServicesTable.$inferSelect;
