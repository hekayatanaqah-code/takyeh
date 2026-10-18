import { pgTable, serial, text, integer, numeric, date, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ownerStaffTable } from "./chalets";

/** Documentary register, deliberately separate from payroll and bank movements. */
export const staffHoldingsTable = pgTable("staff_holdings", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  staffId: integer("staff_id").notNull().references(() => ownerStaffTable.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  recordedOn: date("recorded_on", { mode: "string" }).notNull(),
  notes: text("notes").notNull().default(""),
  requestId: text("request_id").notNull(),
  status: text("status").notNull().default("open"),
  settledOn: date("settled_on", { mode: "string" }),
  settlementNotes: text("settlement_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("staff_holdings_owner_request").on(table.ownerId, table.requestId),
  index("staff_holdings_owner_staff").on(table.ownerId, table.staffId),
]);

export const insertStaffHoldingSchema = createInsertSchema(staffHoldingsTable).omit({ id: true, createdAt: true });
export type InsertStaffHolding = z.infer<typeof insertStaffHoldingSchema>;
export type StaffHolding = typeof staffHoldingsTable.$inferSelect;
