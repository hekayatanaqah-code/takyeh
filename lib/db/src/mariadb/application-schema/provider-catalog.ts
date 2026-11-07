import { z } from "zod/v4";

// Generated native application contracts. No PostgreSQL constructors.

import { createInsertSchema } from "drizzle-zod";

import { serviceProvidersTable } from "./chalets";

import { providerCatalogItemsTable } from "./tables/provider_catalog_items";
export { providerCatalogItemsTable };

import { providerOffersTable } from "./tables/provider_offers";
export { providerOffersTable };

export const insertProviderCatalogItemSchema = createInsertSchema(providerCatalogItemsTable, { galleryPhotos: z.array(z.string()).optional() }).omit({ id: true, deletedAt: true });

export const insertProviderOfferSchema = createInsertSchema(providerOffersTable).omit({ id: true });

export type ProviderCatalogRecord = typeof providerCatalogItemsTable.$inferSelect;

export type ProviderOfferRecord = typeof providerOffersTable.$inferSelect;
