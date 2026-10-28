import { boolean, date, index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { serviceProvidersTable } from "./chalets";

export const quickSalesSettingsTable = pgTable("quick_sales_settings", {
  ownerId: text("owner_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
});

export const quickSalesTable = pgTable("quick_sales", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "restrict" }),
  providerName: text("provider_name").notNull(),
  dateStr: date("date_str", { mode: "string" }).notNull(),
  clientName: text("client_name").notNull().default(""),
  items: jsonb("items").$type<Array<{ catalogItemId?: number; name: string; quantity: number; unitPrice: number }>>().notNull(),
  total: numeric("total", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").$type<"cash" | "bank">().notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status").$type<"completed" | "cancelled">().notNull().default("completed"),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("quick_sales_owner_request_idx").on(t.ownerId, t.idempotencyKey),
  index("quick_sales_owner_date_idx").on(t.ownerId, t.dateStr),
  index("quick_sales_provider_idx").on(t.providerId),
]);
