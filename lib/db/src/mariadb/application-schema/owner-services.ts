// Generated native application contracts. No PostgreSQL constructors.

import { createInsertSchema } from "drizzle-zod";

import { ownerServicesTable } from "./tables/owner_services";
export { ownerServicesTable };

export const insertOwnerServiceSchema = createInsertSchema(ownerServicesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type OwnerService = typeof ownerServicesTable.$inferSelect;
