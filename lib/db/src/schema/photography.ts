import { pgTable, serial, text, integer, boolean, jsonb, timestamp, numeric, check, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export type PhotographyAvailability = { weekday: number; start: string; end: string }[];
export const photographyReceiptsTable = pgTable("photography_receipts", {
  id: serial("id").primaryKey(),
  objectPath: text("object_path").notNull().unique(),
  sourcePath: text("source_path").unique(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const photographyContractsTable = pgTable("photography_contracts", {
  id: serial("id").primaryKey(),
  html: text("html").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const photographersTable = pgTable("photographers", {
  id: serial("id").primaryKey(), name: text("name").notNull(), whatsapp: text("whatsapp").notNull().unique(),
  status: text("status").notNull().default("invited"), bio: text("bio").notNull().default(""),
  experienceYears: text("experience_years").notNull().default(""),
  portfolioUrl: text("portfolio_url").notNull().default(""),
  profileImagePath: text("profile_image_path").notNull().default(""),
  approvedPackageIds: jsonb("approved_package_ids").$type<number[]>().notNull().default([]),
  approvedSpecialties: jsonb("approved_specialties").$type<string[]>().notNull().default([]),
  regionId: integer("region_id"), cityId: integer("city_id"),
  districtIds: jsonb("district_ids").$type<number[]>().notNull().default([]),
  allDistricts: boolean("all_districts").notNull().default(false),
  sessionMinutes: integer("session_minutes").notNull().default(60),
  availability: jsonb("availability").$type<PhotographyAvailability>().notNull().default([]),
  blockedDates: jsonb("blocked_dates").$type<string[]>().notNull().default([]),
  iban: text("iban").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  contractVersion: integer("contract_version").references(() => photographyContractsTable.id),
  contractAcceptedAt: timestamp("contract_accepted_at", { withTimezone: true }),
  adminNote: text("admin_note"), passwordHash: text("password_hash"),
  inviteHash: text("invite_hash").unique(), inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  rotationCredit: integer("rotation_credit").notNull().default(0),
  confirmedAssignments: integer("confirmed_assignments").notNull().default(0),
  lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
});
export const photographyTransfersTable = pgTable("photography_transfers", {
  id: serial("id").primaryKey(),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  amountHalalas: integer("amount_halalas").notNull(),
  reference: text("reference").notNull().unique(),
  transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(),
  receiptId: integer("receipt_id").references(() => photographyReceiptsTable.id),
  recordedBy: text("recorded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [check("photography_transfer_positive", sql`${table.amountHalalas} > 0`), uniqueIndex("photography_transfer_receipt_unique").on(table.receiptId)]);
export const photographyPackagesTable = pgTable("photography_packages", {
  id: serial("id").primaryKey(), name: text("name").notNull(),
  priceHalalas: integer("price_halalas").notNull(),
  platformPercent: numeric("platform_percent", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  propertyTypes: jsonb("property_types").$type<string[]>().notNull().default([]),
  specialties: jsonb("specialties").$type<string[]>().notNull().default([]),
});
export const photographerSessionsTable = pgTable("photographer_sessions", {
  hash: text("hash").primaryKey(),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const photographyBookingsTable = pgTable("photography_bookings", {
  id: serial("id").primaryKey(), ownerId: text("owner_id").notNull(),
  propertyId: integer("property_id"),
  serviceSubmissionId: integer("service_submission_id"),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  packageId: integer("package_id").notNull().references(() => photographyPackagesTable.id),
  propertyName: text("property_name").notNull(), photographerName: text("photographer_name").notNull(),
  packageName: text("package_name").notNull(), ownerPhone: text("owner_phone").notNull(),
  photographerPhone: text("photographer_phone").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(), endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("awaiting_payment"),
  assignmentStatus: text("assignment_status").notNull().default("assigned"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  paymentMethod: text("payment_method").notNull().default("card"),
  refundedHalalas: integer("refunded_halalas").notNull().default(0),
  financialStatus: text("financial_status").notNull().default("unpaid"),
  targetCity: text("target_city"),
  targetRegion: text("target_region"),
  targetDistrict: text("target_district"),
  targetType: text("target_type"),
  deliveryUrl: text("delivery_url"),
  deliveryFiles: jsonb("delivery_files").$type<{ objectPath: string; name: string; contentType: string; size: number }[]>().notNull().default([]),
  priceHalalas: integer("price_halalas").notNull(), commissionHalalas: integer("commission_halalas").notNull(),
  photographerEarningsHalalas: integer("photographer_earnings_halalas").notNull(),
  invoiceId: text("invoice_id").unique(), paymentId: text("payment_id").unique(), paymentUrl: text("payment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("photography_booking_one_target", sql`num_nonnulls(${table.propertyId}, ${table.serviceSubmissionId}) = 1`),
]);
export const photographyDeliveriesTable = pgTable("photography_deliveries", {
  id: serial("id").primaryKey(), dedupeKey: text("dedupe_key").notNull().unique(),
  bookingId: integer("booking_id").references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  photographerId: integer("photographer_id").references(() => photographersTable.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(), kind: text("kind").notNull(),
  parameters: jsonb("parameters").$type<string[]>().notNull(), status: text("status").notNull().default("pending"),
  error: text("error"), providerMessageId: text("provider_message_id"),
  internalReadAt: timestamp("internal_read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPhotographerSchema = createInsertSchema(photographersTable);
export const photographyReviewsTable = pgTable("photography_reviews", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  ownerId: text("owner_id").notNull(),
  stars: integer("stars").notNull(),
  comment: text("comment").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("photography_review_booking_unique").on(t.bookingId),
  check("photography_rating_range", sql`${t.stars} BETWEEN 1 AND 5`),
]);
export const photographyCancellationsTable = pgTable("photography_cancellations", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  replacementPhotographerId: integer("replacement_photographer_id").references(() => photographersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("photography_decline_booking_photographer_unique").on(t.bookingId, t.photographerId),
  index("photography_decline_recent_idx").on(t.photographerId, t.createdAt),
  check("photography_decline_reason", sql`${t.reason} IN ('emergency','equipment','personal','other')`),
]);
export const photographyAlertsTable = pgTable("photography_alerts", {
  id: serial("id").primaryKey(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  kind: text("kind").notNull(),
  photographerId: integer("photographer_id").notNull().references(() => photographersTable.id),
  bookingId: integer("booking_id").references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
export const photographyRefundsTable = pgTable("photography_refunds", {
  id: serial("id").primaryKey(),
  requestKey: text("request_key").notNull().unique(),
  bookingId: integer("booking_id").notNull().references(() => photographyBookingsTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  amountHalalas: integer("amount_halalas").notNull(),
  destination: text("destination").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  providerRefundId: text("provider_refund_id"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  error: text("error"),
  requestedBy: text("requested_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, t => [check("photography_refund_positive", sql`${t.amountHalalas} > 0`)]);
export const ownerWalletEntriesTable = pgTable("owner_wallet_entries", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  sourceKey: text("source_key").notNull().unique(),
  kind: text("kind").notNull(),
  amountHalalas: integer("amount_halalas").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("owner_wallet_owner_idx").on(t.ownerId), check("owner_wallet_nonzero", sql`${t.amountHalalas} <> 0`)]);
export const insertPhotographyPackageSchema = createInsertSchema(photographyPackagesTable);
export type Photographer = typeof photographersTable.$inferSelect;
export type PhotographyBooking = typeof photographyBookingsTable.$inferSelect;
