import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { serviceCitiesCatalogTable, serviceRegionsCatalogTable } from "./chalets";

export const serviceCityRequestsTable = pgTable("service_city_requests", {
  id: serial("id").primaryKey(),
  city: text("city").notNull(),
  regionId: integer("region_id").references(() => serviceRegionsCatalogTable.id, { onDelete: "set null" }),
  requesterId: text("requester_id").notNull(),
  requesterName: text("requester_name").notNull().default("مقدم خدمة"),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  reason: text("reason"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedCityId: integer("approved_city_id").references(() => serviceCitiesCatalogTable.id, { onDelete: "set null" }),
  legacyKey: text("legacy_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index("service_city_requests_status_idx").on(table.status, table.createdAt),
  check("service_city_requests_status_check", sql`${table.status} in ('pending', 'approved', 'rejected')`),
]);

export const insertServiceCityRequestSchema = createInsertSchema(serviceCityRequestsTable).omit({
  id: true, createdAt: true, reviewedBy: true, reviewedAt: true, approvedCityId: true, legacyKey: true,
});
export type ServiceCityRequest = typeof serviceCityRequestsTable.$inferSelect;
