// Generated native application contracts. No PostgreSQL constructors.

import { sql } from "drizzle-orm";

import { createInsertSchema } from "drizzle-zod";

import { serviceCitiesCatalogTable, serviceRegionsCatalogTable } from "./chalets";

import { serviceCityRequestsTable } from "./tables/service_city_requests";
export { serviceCityRequestsTable };

export const insertServiceCityRequestSchema = createInsertSchema(serviceCityRequestsTable).omit({
  id: true, createdAt: true, reviewedBy: true, reviewedAt: true, approvedCityId: true, legacyKey: true,
});

export type ServiceCityRequest = typeof serviceCityRequestsTable.$inferSelect;
