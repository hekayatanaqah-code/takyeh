// Generated native application contracts. No PostgreSQL constructors.

import { createInsertSchema } from "drizzle-zod";

import { chaletSubmissionsTable } from "./chalets";

import { propertyOffersTable } from "./tables/property_offers";
export { propertyOffersTable };

export const insertPropertyOfferSchema = createInsertSchema(propertyOffersTable).omit({ id: true, createdAt: true, updatedAt: true });
