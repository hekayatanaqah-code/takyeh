// Generated native application contracts. No PostgreSQL constructors.

import { createInsertSchema } from "drizzle-zod";

import { z } from "zod/v4";

import { ownerStaffTable } from "./chalets";

import { staffHoldingsTable } from "./tables/staff_holdings";
export { staffHoldingsTable };

export const insertStaffHoldingSchema = createInsertSchema(staffHoldingsTable).omit({ id: true, createdAt: true });

export type InsertStaffHolding = z.infer<typeof insertStaffHoldingSchema>;

export type StaffHolding = typeof staffHoldingsTable.$inferSelect;
