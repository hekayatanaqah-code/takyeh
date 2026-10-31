import { pgTable, text, serial, integer, numeric, timestamp, pgEnum, boolean, jsonb, varchar, doublePrecision, uniqueIndex, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chaletsTable = pgTable("chalets", {
  id: serial("id").primaryKey(),
  /* ── Link back to originating submission (set on admin approval) ── */
  submissionId: integer("submission_id"),
  ownerId: text("owner_id"),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar").notNull(),
  region: text("region"),
  location: text("location").notNull(),
  district: text("district"),
  category: text("category"),
  propertyType: text("property_type"),
  sections: text("sections"),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  /* ── Time-slot pricing ── */
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  slotMorning: boolean("slot_morning").notNull().default(true),
  slotEvening: boolean("slot_evening").notNull().default(true),
  slotFullDay: boolean("slot_full_day").notNull().default(true),
  /* ── Weekday / Weekend pricing ── */
  priceWeekday: numeric("price_weekday", { precision: 10, scale: 2 }),
  priceWeekend: numeric("price_weekend", { precision: 10, scale: 2 }),
  /* ── Per-day-of-week pricing per period ─────────────────────────────
     Structure: { morning: {"0":200,"5":400}, evening: {...}, fullday: {...} }
     Key = JS Date.getDay() (0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat)
     Falls back to priceMorning/priceEvening/priceFullDay when a day key is missing. */
  dailyPrices: jsonb("daily_prices").$type<Record<string, Record<string, number>>>(),
  seasonalDisclaimer: boolean("seasonal_disclaimer").notNull().default(true),
  maxGuests: integer("max_guests"),
  bedrooms: integer("bedrooms"),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  /* ── Per-period check-in / check-out times ── */
  morningCheckIn: text("morning_check_in"),
  morningCheckOut: text("morning_check_out"),
  eveningCheckIn: text("evening_check_in"),
  eveningCheckOut: text("evening_check_out"),
  fullDayCheckIn: text("full_day_check_in"),
  fullDayCheckOut: text("full_day_check_out"),
  amenities: text("amenities").array().notNull().default([]),
  photos: text("photos").array().notNull().default([]),
  photoCaptions: text("photo_captions").array().notNull().default([]),
  videoUrl: text("video_url"),
  logoUrl: text("logo_url"),
  whatsappNumber: text("whatsapp_number").notNull(),
  mapsUrl: text("maps_url"),
  socialLink: text("social_link"),
  termsAndConditions: text("terms_and_conditions"),
  waReviewTemplate: text("wa_review_template"),
  /* ── Booking Reminder (WhatsApp) ── */
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderDays: integer("reminder_days").notNull().default(1),
  /* ── Buffer / Cleaning Time Policy ── */
  bufferPolicyEnabled: boolean("buffer_policy_enabled").notNull().default(false),
  bufferBlockNextMorningFullDay: boolean("buffer_block_next_morning_full_day").notNull().default(false),
  bufferBlockNextMorningEvening: boolean("buffer_block_next_morning_evening").notNull().default(false),
  bufferBlockSameDayEvening: boolean("buffer_block_same_day_evening").notNull().default(false),
  bufferExceptionWeekdays: text("buffer_exception_weekdays").default("[]"),
  bufferExceptionDates: text("buffer_exception_dates").default("[]"),
  /* ── Map coordinates ── */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  isVerified: boolean("is_verified").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  pausedFrom: text("paused_from"),
  pausedUntil: text("paused_until"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deleteReason: text("delete_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChaletSchema = createInsertSchema(chaletsTable).omit({ id: true, createdAt: true });
export type InsertChalet = z.infer<typeof insertChaletSchema>;
export type Chalet = typeof chaletsTable.$inferSelect;

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected", "needs_revision"]);

export const chaletSubmissionsTable = pgTable("chalet_submissions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  nameAr: text("name_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  region: text("region"),
  location: text("location").notNull(),
  suggestedCityName: text("suggested_city_name"),
  district: text("district"),
  category: text("category"),
  propertyType: text("property_type"),
  sections: text("sections"),
  websiteUrl: text("website_url"),
  descriptionAr: text("description_ar").notNull(),
  pricePerNight: numeric("price_per_night", { precision: 10, scale: 2 }).notNull(),
  /* ── Time-slot pricing ── */
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  slotMorning: boolean("slot_morning").notNull().default(true),
  slotEvening: boolean("slot_evening").notNull().default(true),
  slotFullDay: boolean("slot_full_day").notNull().default(true),
  /* ── Weekday / Weekend pricing ── */
  priceWeekday: numeric("price_weekday", { precision: 10, scale: 2 }),
  priceWeekend: numeric("price_weekend", { precision: 10, scale: 2 }),
  /* ── Per-day-of-week pricing per period ── */
  dailyPrices: jsonb("daily_prices").$type<Record<string, Record<string, number>>>(),
  seasonalDisclaimer: boolean("seasonal_disclaimer").notNull().default(true),
  maxGuests: integer("max_guests"),
  bedrooms: integer("bedrooms"),
  checkInTime: text("check_in_time"),
  checkOutTime: text("check_out_time"),
  /* ── Per-period check-in / check-out times ── */
  morningCheckIn: text("morning_check_in"),
  morningCheckOut: text("morning_check_out"),
  eveningCheckIn: text("evening_check_in"),
  eveningCheckOut: text("evening_check_out"),
  fullDayCheckIn: text("full_day_check_in"),
  fullDayCheckOut: text("full_day_check_out"),
  amenities: text("amenities").array().notNull().default([]),
  logoUrl: text("logo_url"),
  mapsUrl: text("maps_url"),
  socialLink: text("social_link"),
  termsAndConditions: text("terms_and_conditions"),
  photos: text("photos").array().notNull().default([]),
  photoCaptions: text("photo_captions").array().notNull().default([]),
  videoUrl: text("video_url"),
  status: submissionStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  ownerRevisionNote: text("owner_revision_note"),
  suggestedCategoryName: text("suggested_category_name"),
  pendingCategoryApproval: boolean("pending_category_approval").notNull().default(false),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /* ── Cancellation Policy (owner-controlled, per-property) ── */
  cancellationWindowEnabled: boolean("cancellation_window_enabled").notNull().default(false),
  cancellationWindowHours: integer("cancellation_window_hours").default(24),
  bookingPolicyText: text("booking_policy_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(chaletSubmissionsTable).omit({ id: true, createdAt: true, status: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type ChaletSubmission = typeof chaletSubmissionsTable.$inferSelect;

export const regionsCatalogTable = pgTable("regions_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Region = typeof regionsCatalogTable.$inferSelect;

export const citiesCatalogTable = pgTable("cities_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  regionId: integer("region_id").references(() => regionsCatalogTable.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type City = typeof citiesCatalogTable.$inferSelect;

export const districtsCatalogTable = pgTable("districts_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cityId: integer("city_id").references(() => citiesCatalogTable.id, { onDelete: "cascade" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type District = typeof districtsCatalogTable.$inferSelect;

/* ── Independent service-location catalogs ─────────────────────────────── */
export const serviceRegionsCatalogTable = pgTable("service_regions_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertServiceRegionSchema = createInsertSchema(serviceRegionsCatalogTable).omit({ id: true, createdAt: true });
export type InsertServiceRegion = z.infer<typeof insertServiceRegionSchema>;
export type ServiceRegion = typeof serviceRegionsCatalogTable.$inferSelect;

export const serviceCitiesCatalogTable = pgTable("service_cities_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  regionId: integer("region_id").references(() => serviceRegionsCatalogTable.id, { onDelete: "restrict" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertServiceCitySchema = createInsertSchema(serviceCitiesCatalogTable).omit({ id: true, createdAt: true });
export type InsertServiceCity = z.infer<typeof insertServiceCitySchema>;
export type ServiceCity = typeof serviceCitiesCatalogTable.$inferSelect;

export const serviceDistrictsCatalogTable = pgTable("service_districts_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cityId: integer("city_id").references(() => serviceCitiesCatalogTable.id, { onDelete: "cascade" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertServiceDistrictSchema = createInsertSchema(serviceDistrictsCatalogTable).omit({ id: true, createdAt: true });
export type InsertServiceDistrict = z.infer<typeof insertServiceDistrictSchema>;
export type ServiceDistrict = typeof serviceDistrictsCatalogTable.$inferSelect;

export const amenitiesCatalogTable = pgTable("amenities_catalog", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  labelAr: text("label_ar").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AmenityCatalog = typeof amenitiesCatalogTable.$inferSelect;

export const servicesCategoryEnum = pgEnum("services_category", [
  "bounce_houses",
  "ice_cream",
  "productive_families",
]);

export const externalServicesTable = pgTable("external_services", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  nameAr: text("name_ar").notNull(),
  category: servicesCategoryEnum("category").notNull(),
  descriptionAr: text("description_ar").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }),
  priceNote: text("price_note"),
  city: text("city"),
  photos: text("photos").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ExternalService = typeof externalServicesTable.$inferSelect;

/* ── Chalet Categories ─────────────────────────────────────── */
export const chaletCategoriesTable = pgTable("chalet_categories", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  emoji: text("emoji").notNull().default("🏠"),
  isActive: boolean("is_active").notNull().default(true),
  showSectionFilter: boolean("show_section_filter").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletCategory = typeof chaletCategoriesTable.$inferSelect;

/* ── Owner Bookings ────────────────────────────────────────── */
export const bookingSourceEnum = pgEnum("booking_source", ["platform", "external"]);
export const paymentMethodEnum = pgEnum("payment_method_type", ["cash", "transfer", "pos"]);

export const ownerBookingsTable = pgTable("owner_bookings", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id").references(() => chaletSubmissionsTable.id, { onDelete: "set null" }),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  bookingDate: text("booking_date").notNull(),
  durationDays: integer("duration_days").notNull().default(1),
  period: text("period"),
  source: bookingSourceEnum("source").notNull().default("platform"),
  notes: text("notes"),
  revenueAmount: numeric("revenue_amount", { precision: 10, scale: 2 }),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }),
  depositPaid: numeric("deposit_paid", { precision: 10, scale: 2 }),
  insuranceFee: numeric("insurance_fee", { precision: 10, scale: 2 }),
  insuranceReceived: boolean("insurance_received").notNull().default(false),
  balanceCollected: boolean("balance_collected").notNull().default(false),
  insuranceRefunded: boolean("insurance_refunded").notNull().default(false),
  insuranceDeducted: numeric("insurance_deducted", { precision: 10, scale: 2 }),
  insuranceDeductReason: text("insurance_deduct_reason"),
  insuranceProofImages: text("insurance_proof_images"), // JSON array of image URLs
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  cancelReasonCode: text("cancel_reason_code"), /* طلب_عميل | صيانة | تعارض | أخرى */
  cancelRefundAmount: numeric("cancel_refund_amount", { precision: 10, scale: 2 }), /* amount returned to client */
  cancelIncome: numeric("cancel_income", { precision: 10, scale: 2 }), /* deposit - refund = realized profit */
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  paymentMethod: paymentMethodEnum("payment_method").default("cash"),
  cashDeposited: boolean("cash_deposited").notNull().default(false),
  insurancePaymentMethod: text("insurance_payment_method").$type<"cash" | "transfer">().notNull().default("transfer"),
  paymentReceiptUrl: text("payment_receipt_url"),
  bookedAddons: jsonb("booked_addons").$type<Array<{ id: number; name: string; price: string; unit: string }>>(),
  offerSnapshot: jsonb("offer_snapshot").$type<{
    basePrice: number; price: number; discountAmount: number;
    days: Array<{ date: string; basePrice: number; price: number; offerId: number | null; offerName: string | null; badge: string | null }>;
  }>(),
  contractSigned: boolean("contract_signed").notNull().default(false),
  contractSignerName: text("contract_signer_name"),
  contractSignerId: text("contract_signer_id"),
  contractSignatureDataUrl: text("contract_signature_data_url"),
  contractSignedAt: timestamp("contract_signed_at", { withTimezone: true }),
}, (table) => ({
  bookingDateIdx: index("owner_bookings_booking_date_idx").on(table.bookingDate),
  cancelledAtIdx: index("owner_bookings_cancelled_at_idx").on(table.cancelledAt),
  customerHistoryIdx: index("owner_bookings_customer_history_idx").on(table.ownerId, table.clientPhone, table.bookingDate.desc(), table.id.desc()),
}));
export type OwnerBooking = typeof ownerBookingsTable.$inferSelect;

/* ── Owner Refunds (manual refunds issued by owner on any booking) ── */
export const ownerRefundsTable = pgTable("owner_refunds", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  bookingId: integer("booking_id").references(() => ownerBookingsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull().default("partial"), /* 'partial' | 'full' */
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerRefund = typeof ownerRefundsTable.$inferSelect;

/* ── Cash Deposit Logs ─────────────────────────────────────────── */
export const cashDepositLogsTable = pgTable("cash_deposit_logs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id"),
  bookingId: integer("booking_id").references(() => ownerBookingsTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type CashDepositLog = typeof cashDepositLogsTable.$inferSelect;

/* ── Owner Reschedule Logs ─────────────────────────────────── */
export const ownerRescheduleLogsTable = pgTable("owner_reschedule_logs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  bookingId: integer("booking_id").notNull(),
  clientName: text("client_name").notNull().default(""),
  clientPhone: text("client_phone"),
  oldDate: text("old_date").notNull(),
  newDate: text("new_date").notNull(),
  oldDuration: integer("old_duration").notNull().default(1),
  newDuration: integer("new_duration").notNull().default(1),
  oldPeriod: text("old_period"),
  newPeriod: text("new_period"),
  reason: text("reason").notNull().default(""),
  rescheduledAt: timestamp("rescheduled_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  customerHistoryIdx: index("owner_reschedule_logs_customer_history_idx").on(table.ownerId, table.bookingId, table.rescheduledAt.desc(), table.id.desc()),
}));
export type OwnerRescheduleLog = typeof ownerRescheduleLogsTable.$inferSelect;

/* ── Site Settings ─────────────────────────────────────────── */
export const siteSettingsTable = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SiteSetting = typeof siteSettingsTable.$inferSelect;

/* ── Service Categories (admin-managed) ────────────────────── */
export const serviceCategoriesTable = pgTable("service_categories", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  labelAr: text("label_ar").notNull(),
  emoji: text("emoji").notNull().default("✨"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceCategory = typeof serviceCategoriesTable.$inferSelect;

/* ── Service Provider Submissions ──────────────────────────── */
export const serviceProviderSubmissionsTable = pgTable("service_provider_submissions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id"),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  serviceRegionId: integer("service_region_id").references(() => serviceRegionsCatalogTable.id, { onDelete: "restrict" }),
  serviceCityId: integer("service_city_id").references(() => serviceCitiesCatalogTable.id, { onDelete: "restrict" }),
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  videoUrl: text("video_url"),
  yearsOfExperience: integer("years_of_experience"),
  pricingUnit: text("pricing_unit"),
  dailyCapacity: integer("daily_capacity"),
  requiresInsurance: boolean("requires_insurance").notNull().default(false),
  requiresContract: boolean("requires_contract").notNull().default(false),
  contractText: text("contract_text"),
  includeElectronicSignature: boolean("include_electronic_signature").notNull().default(true),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),
  coverageTags: text("coverage_tags").array().notNull().default([]),
  customFeatureTags: text("custom_feature_tags").array().notNull().default([]),
  status: submissionStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProviderSubmission = typeof serviceProviderSubmissionsTable.$inferSelect;

/* ── Approved Service Providers ────────────────────────────── */
export const serviceProvidersTable = pgTable("service_providers", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .references(() => serviceProviderSubmissionsTable.id, { onDelete: "set null" })
    .unique(),
  ownerId: text("owner_id"),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  serviceRegionId: integer("service_region_id").references(() => serviceRegionsCatalogTable.id, { onDelete: "restrict" }),
  serviceCityId: integer("service_city_id").references(() => serviceCitiesCatalogTable.id, { onDelete: "restrict" }),
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  videoUrl: text("video_url"),
  yearsOfExperience: integer("years_of_experience"),
  pricingUnit: text("pricing_unit"),
  dailyCapacity: integer("daily_capacity"),
  requiresInsurance: boolean("requires_insurance").notNull().default(false),
  requiresContract: boolean("requires_contract").notNull().default(false),
  contractText: text("contract_text"),
  includeElectronicSignature: boolean("include_electronic_signature").notNull().default(true),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),
  coverageTags: text("coverage_tags").array().notNull().default([]),
  customFeatureTags: text("custom_feature_tags").array().notNull().default([]),
  photoCaptions: text("photo_captions").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;

/* ── Stable link between an authenticated account and its legacy owner profile ── */
export const ownerAccountLinksTable = pgTable("owner_account_links", {
  userId: text("user_id").primaryKey(),
  ownerApplicationId: integer("owner_application_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerAccountLink = typeof ownerAccountLinksTable.$inferSelect;

/* ── Chalet Availability (date-slot blocking by owner) ─────── */
export const chaletAvailabilityTable = pgTable("chalet_availability", {
  id: serial("id").primaryKey(),
  chaletId: integer("chalet_id").notNull(),
  ownerId: text("owner_id").notNull(),
  dateStr: text("date_str").notNull(),
  periodMorning: boolean("period_morning").notNull().default(false),
  periodEvening: boolean("period_evening").notNull().default(false),
  periodFullDay: boolean("period_full_day").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletAvailability = typeof chaletAvailabilityTable.$inferSelect;

/* ── Owner Subscriptions ───────────────────────────────────── */
export type SubscriptionTerms = {
  nameAr: string;
  features: string[];
  scope: "property" | "full";
  chaletLimit: number | null;
  serviceLimit: number | null;
};

export const ownerSubscriptionsTable = pgTable("owner_subscriptions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  plan: text("plan").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  billingCycleDays: integer("billing_cycle_days"),
  renewalPriceHalala: integer("renewal_price_halala"),
  autoRenewEnabled: boolean("auto_renew_enabled").notNull().default(false),
  paymentStatus: text("payment_status").notNull().default("paid"),
  termsSnapshot: jsonb("terms_snapshot").$type<SubscriptionTerms>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiresStatusIdx: index("owner_subscriptions_expires_status_idx").on(table.expiresAt, table.status),
}));
export type OwnerSubscription = typeof ownerSubscriptionsTable.$inferSelect;

/* Append-only superadmin full-access grants; the newest started grant per owner wins.
   Date-window grants use inclusive Saudi calendar start/end dates and keep expiresAt
   null; legacy duration grants continue to use expiresAt. */
export const ownerFreeAccessGrantsTable = pgTable("owner_free_access_grants", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  actorId: text("actor_id").notNull(),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("owner_free_access_grants_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
}));
export type OwnerFreeAccessGrant = typeof ownerFreeAccessGrantsTable.$inferSelect;

/* Append-only account discounts; newest started row per linked owner wins. */
export const ownerAccountDiscountsTable = pgTable("owner_account_discounts", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  actorId: text("actor_id").notNull(),
  kind: text("kind").$type<"percent" | "fixed">().notNull(),
  value: numeric("value", { precision: 15, scale: 2 }).notNull(),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerCreatedIdx: index("owner_account_discounts_owner_created_idx").on(table.ownerId, table.createdAt, table.id),
}));
export type OwnerAccountDiscount = typeof ownerAccountDiscountsTable.$inferSelect;

/* ── Subscription Plans (admin-managed) ─────────────────── */
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  trialDays: integer("trial_days").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  scope: text("scope"),
  chaletLimit: integer("chalet_limit"),
  serviceLimit: integer("service_limit"),
  extraChaletPrice: numeric("extra_chalet_price", { precision: 10, scale: 2 }),
  extraServicePrice: numeric("extra_service_price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

/* ── Subscription Promo Codes ───────────────────────────── */
export const subscriptionPromoCodesTable = pgTable("subscription_promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind").$type<"percent" | "fixed">().notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SubscriptionPromoCode = typeof subscriptionPromoCodesTable.$inferSelect;

/* ── Subscription checkout intents and payment idempotency ─ */
export const subscriptionCheckoutIntentsTable = pgTable("subscription_checkout_intents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  plan: text("plan").notNull(),
  amountHalala: integer("amount_halala").notNull(),
  paymentMethod: text("payment_method").notNull().default("card"),
  listPriceHalala: integer("list_price_halala").notNull(),
  durationDays: integer("duration_days").notNull(),
  planLabel: text("plan_label").notNull(),
  termsSnapshot: jsonb("terms_snapshot").$type<SubscriptionTerms>(),
  discountCode: text("discount_code"),
  invoiceLines: jsonb("invoice_lines").$type<Array<{
    kind: "base" | "addon";
    label: string;
    amountHalala: number;
    addonPurchaseId?: number;
    quantity?: number;
    unitPriceHalala?: number;
    periodStartAt?: string;
    periodEndAt?: string;
  }>>().notNull().default([]),
  accountDiscountSnapshot: jsonb("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
  quotedBaseExpiresAt: timestamp("quoted_base_expires_at", { withTimezone: true }),
  recurringAddonSnapshot: jsonb("recurring_addon_snapshot").$type<Array<{
    id: number;
    quantity: number;
    monthlyUnitPriceHalala: number;
    paidThroughAt: string | null;
    cancelAtPeriodEnd: boolean;
    revision: number;
  }>>().notNull().default([]),
  autoRenewConsent: boolean("auto_renew_consent").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  freeAccessBlockedAt: timestamp("free_access_blocked_at", { withTimezone: true }),
});

export const subscriptionPaymentsTable = pgTable("subscription_payments", {
  paymentId: text("payment_id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  intentId: text("intent_id").notNull().unique(),
  plan: text("plan").notNull(),
  amountHalala: integer("amount_halala").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── One-time additional subscription slots ───────────────── */
export const subscriptionAddonCheckoutIntentsTable = pgTable("subscription_addon_checkout_intents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  addonType: text("addon_type").$type<"chalet" | "service">().notNull(),
  quantity: integer("quantity").notNull().default(1),
  amountHalala: integer("amount_halala").notNull(),
  monthlyUnitPriceHalala: integer("monthly_unit_price_halala").notNull().default(0),
  nextChargeHalala: integer("next_charge_halala").notNull().default(0),
  baseMonthlyHalala: integer("base_monthly_halala").notNull().default(0),
  remainingDays: integer("remaining_days").notNull().default(0),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
  cycleDays: integer("cycle_days").notNull().default(30),
  quotedBaseExpiresAt: timestamp("quoted_base_expires_at", { withTimezone: true }),
  accountDiscountSnapshot: jsonb("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
  periodStartAt: timestamp("period_start_at", { withTimezone: true }),
  periodEndAt: timestamp("period_end_at", { withTimezone: true }),
  quoteVersion: integer("quote_version").notNull().default(1),
  autoRenewConsent: boolean("auto_renew_consent").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  freeAccessBlockedAt: timestamp("free_access_blocked_at", { withTimezone: true }),
});

export const subscriptionAddonPurchasesTable = pgTable("subscription_addon_purchases", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  addonType: text("addon_type").$type<"chalet" | "service">().notNull(),
  paymentId: text("payment_id").notNull().unique(),
  intentId: text("intent_id").notNull().unique(),
  quantity: integer("quantity").notNull().default(1),
  amountHalala: integer("amount_halala").notNull(),
  recurring: boolean("recurring").notNull().default(false),
  monthlyUnitPriceHalala: integer("monthly_unit_price_halala").notNull().default(0),
  periodStartAt: timestamp("period_start_at", { withTimezone: true }),
  paidThroughAt: timestamp("paid_through_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionPaymentReconciliationsTable = pgTable("subscription_payment_reconciliations", {
  id: serial("id").primaryKey(),
  paymentId: text("payment_id").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  intentId: text("intent_id").notNull(),
  amountHalala: integer("amount_halala").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("required"),
  refundId: text("refund_id"),
  refundEligible: boolean("refund_eligible").notNull().default(true),
  attemptCount: integer("attempt_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  refundRequestedAt: timestamp("refund_requested_at", { withTimezone: true }),
  refundAttemptNumber: integer("refund_attempt_number").notNull().default(0),
  refundAttemptKey: text("refund_attempt_key"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ownerBillingProfilesTable = pgTable("owner_billing_profiles", {
  ownerId: text("owner_id").primaryKey(),
  encryptedPaymentToken: text("encrypted_payment_token"),
  tokenPaymentId: text("token_payment_id"),
  autoRenewEnabled: boolean("auto_renew_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionRenewalInvoicesTable = pgTable("subscription_renewal_invoices", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  periodStartAt: timestamp("period_start_at", { withTimezone: true }).notNull(),
  periodEndAt: timestamp("period_end_at", { withTimezone: true }).notNull(),
  givenId: text("given_id").notNull().unique(),
  basePlan: text("base_plan").notNull(),
  cycleDays: integer("cycle_days").notNull(),
  basePriceHalala: integer("base_price_halala").notNull(),
  amountHalala: integer("amount_halala").notNull(),
  lineItems: jsonb("line_items").$type<Array<{
    kind: "base" | "addon";
    label: string;
    amountHalala: number;
    addonPurchaseId?: number;
    quantity?: number;
    unitPriceHalala?: number;
    periodStartAt?: string;
    periodEndAt?: string;
  }>>().notNull(),
  accountDiscountSnapshot: jsonb("account_discount_snapshot").$type<{
    kind: "percent" | "fixed";
    value: number;
    startDate: string | null;
    endDate: string | null;
    reason: string;
    discountHalala: number;
  }>(),
  status: text("status").notNull().default("pending"),
  paymentId: text("payment_id"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => ({
  ownerPeriodUnique: uniqueIndex("subscription_renewal_owner_period_unique").on(table.ownerId, table.periodStartAt),
  dueIdx: index("subscription_renewal_due_idx").on(table.status, table.nextAttemptAt),
}));

export const subscriptionRenewalAttemptsTable = pgTable("subscription_renewal_attempts", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  givenId: text("given_id").notNull().unique(),
  paymentId: text("payment_id"),
  status: text("status").notNull().default("pending"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  invoiceAttemptUnique: uniqueIndex("subscription_renewal_invoice_attempt_unique").on(table.invoiceId, table.attemptNumber),
  attemptDueIdx: index("subscription_renewal_attempt_due_idx").on(table.status, table.nextAttemptAt),
}));


export const subscriptionGrantAuditTable = pgTable("subscription_grant_audit", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  actorId: text("actor_id").notNull(),
  plan: text("plan").notNull(),
  days: integer("days").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Expense Management ────────────────────────────────────── */

/** Legacy enum — kept so existing imports don't break; no longer used as column type. */
export const expenseCategoryEnum = pgEnum("expense_category", [
  "salaries", "electricity", "water", "internet", "maintenance", "supplies", "other",
]);

/** Dynamic expense categories managed by the Admin. */
export const expenseCategoriesTable = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("✨"),
  color: text("color").notNull().default("slate"),
  isOther: boolean("is_other").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;

export const ownerExpensesTable = pgTable("owner_expenses", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id").references(() => chaletSubmissionsTable.id, { onDelete: "set null" }),
  providerId: integer("provider_id"),
  dateStr: text("date_str").notNull(),
  category: text("category").notNull().default("other"),
  customCategory: text("custom_category"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerExpense = typeof ownerExpensesTable.$inferSelect;

/* ── Staff & Salary ─────────────────────────────────────────── */

export type StaffPermissions = {
  dashboardAccess?: boolean;
  bookingsControl?: boolean;
  financialAccess?: boolean;
  insuranceManagement?: boolean;
  chaletManagement?: boolean;
  pricingControl?: boolean;
  availabilityControl?: boolean;
  customerData?: boolean;
  accountSettings?: boolean;
};

export const ownerStaffTable = pgTable("owner_staff", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  permissions: jsonb("permissions").$type<StaffPermissions>().notNull().default({}),
  baseSalary: numeric("base_salary", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  assignedToType: text("assigned_to_type").notNull().default("all"),
  assignedToId: integer("assigned_to_id"),
  nationalId: text("national_id"),
  phoneNum: text("phone_num"),
  jobTitle: text("job_title"),
  email: text("email"),
  birthDate: text("birth_date"),
  hireDate: text("hire_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerStaff = typeof ownerStaffTable.$inferSelect;

export const staffSessionsTable = pgTable("staff_sessions", {
  sid: text("sid").primaryKey(),
  staffId: integer("staff_id").references(() => ownerStaffTable.id, { onDelete: "cascade" }).notNull(),
  ownerId: text("owner_id").notNull(),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
});

export const salaryLogsTable = pgTable("salary_logs", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  staffId: integer("staff_id").references(() => ownerStaffTable.id, { onDelete: "cascade" }).notNull(),
  month: text("month").notNull(),
  bonus: numeric("bonus", { precision: 10, scale: 2 }).notNull().default("0"),
  deduction: numeric("deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  bonusNotes: text("bonus_notes"),
  deductionNotes: text("deduction_notes"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expenseId: integer("expense_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SalaryLog = typeof salaryLogsTable.$inferSelect;

/* ── Review Invitations (one-time tokens) ───────────────────── */
export const reviewInvitationsTable = pgTable("review_invitations", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  chaletId: integer("chalet_id").notNull().references(() => chaletsTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => ownerBookingsTable.id, { onDelete: "set null" }),
  guestName: text("guest_name"),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ReviewInvitation = typeof reviewInvitationsTable.$inferSelect;

/* ── Reviews (submitted by guests via invitation link) ──────── */
export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  chaletId: integer("chalet_id").notNull().references(() => chaletsTable.id, { onDelete: "cascade" }),
  invitationId: integer("invitation_id").references(() => reviewInvitationsTable.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  photoUrls: text("photo_urls").array().notNull().default([]),
  guestName: text("guest_name"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(true),
  /* ── Moderation ── */
  isHidden: boolean("is_hidden").notNull().default(false),
  /* ── Owner reply ── */
  ownerReply: text("owner_reply"),
  ownerReplyAt: timestamp("owner_reply_at", { withTimezone: true }),
  /* ── Report system ── */
  reportedBy: text("reported_by"),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportReason: text("report_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type Review = typeof reviewsTable.$inferSelect;

/* ── Owner Notifications ────────────────────────────────────── */

export const ownerNotificationsTable = pgTable("owner_notifications", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  type: text("type").notNull(),
  chaletId: integer("chalet_id").references(() => chaletsTable.id, { onDelete: "cascade" }),
  reviewId: integer("review_id").references(() => reviewsTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => ownerBookingsTable.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  broadcastCampaignId: integer("broadcast_campaign_id"),
  broadcastRecipientKey: text("broadcast_recipient_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  broadcastRecipientUnique: uniqueIndex("owner_notifications_broadcast_recipient_uq")
    .on(table.broadcastCampaignId, table.broadcastRecipientKey),
}));
export type OwnerNotification = typeof ownerNotificationsTable.$inferSelect;

/* ── Superadmin broadcasts ─────────────────────────────────── */
export const broadcastCampaignsTable = pgTable("broadcast_campaigns", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull(),
  channels: text("channels").array().notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const broadcastDeliveriesTable = pgTable("broadcast_deliveries", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => broadcastCampaignsTable.id, { onDelete: "cascade" }),
  recipientKey: text("recipient_key").notNull(),
  recipientOwnerId: text("recipient_owner_id").notNull(),
  recipientEmail: text("recipient_email"),
  recipientWhatsappPhone: text("recipient_whatsapp_phone"),
  recipientName: text("recipient_name"),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("pending"),
  errorCode: text("error_code"),
  attempts: integer("attempts").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  recipientChannelUnique: uniqueIndex("broadcast_deliveries_campaign_recipient_channel_uq")
    .on(table.campaignId, table.recipientKey, table.channel),
  campaignStatusIdx: index("broadcast_deliveries_campaign_status_idx").on(table.campaignId, table.status),
  queueStatusIdx: index("broadcast_deliveries_status_id_idx").on(table.status, table.id),
}));
export const ownerBroadcastPreferencesTable = pgTable("owner_broadcast_preferences", {
  ownerKey: text("owner_key").primaryKey(),
  inApp: boolean("in_app").notNull().default(true),
  inbox: boolean("inbox").notNull().default(false),
  email: boolean("email").notNull().default(false),
  whatsapp: boolean("whatsapp").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const ownerBroadcastInboxTable = pgTable("owner_broadcast_inbox", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  campaignId: integer("campaign_id").notNull().references(() => broadcastCampaignsTable.id, { onDelete: "cascade" }),
  recipientKey: text("recipient_key").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  campaignRecipientUnique: uniqueIndex("owner_broadcast_inbox_campaign_recipient_uq")
    .on(table.campaignId, table.recipientKey),
  ownerCreatedIdx: index("owner_broadcast_inbox_owner_created_idx").on(table.ownerId, table.createdAt),
}));
export const broadcastSmtpSettingsTable = pgTable("broadcast_smtp_settings", {
  id: integer("id").primaryKey(),
  host: text("host"),
  port: integer("port"),
  secure: boolean("secure").notNull().default(false),
  username: text("username"),
  fromAddress: text("from_address"),
  encryptedPassword: text("encrypted_password"),
  enabled: boolean("enabled").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Report Archive ─────────────────────────────────────────── */

export const ownerReportArchiveTable = pgTable("owner_report_archive", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  reportType: text("report_type").notNull(),
  reportPeriod: text("report_period").notNull(),
  submissionId: integer("submission_id"),
  propertyName: text("property_name"),
  pdfUrl: text("pdf_url"),
  data: jsonb("data").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerReportArchive = typeof ownerReportArchiveTable.$inferSelect;

/* ── Chalet Seasons & Special Pricing ──────────────────────── */
export const chaletSeasonsTable = pgTable("chalet_seasons", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  submissionId: integer("submission_id").references(() => chaletSubmissionsTable.id, { onDelete: "cascade" }).notNull(),
  nameAr: text("name_ar").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  dailyPrices: jsonb("daily_prices"),
  period: text("period"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletSeason = typeof chaletSeasonsTable.$inferSelect;

/* ── Centrally managed global seasons ───────────────────────── */
export const globalSeasonsTable = pgTable("global_seasons", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  color: text("color").notNull().default("#D97706"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type GlobalSeason = typeof globalSeasonsTable.$inferSelect;
export type InsertGlobalSeason = typeof globalSeasonsTable.$inferInsert;

export const chaletGlobalSeasonsTable = pgTable("chalet_global_seasons", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").references(() => chaletSubmissionsTable.id, { onDelete: "cascade" }).notNull(),
  globalSeasonId: integer("global_season_id").references(() => globalSeasonsTable.id, { onDelete: "cascade" }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priceMorning: numeric("price_morning", { precision: 10, scale: 2 }),
  priceEvening: numeric("price_evening", { precision: 10, scale: 2 }),
  priceFullDay: numeric("price_full_day", { precision: 10, scale: 2 }),
  dailyPrices: jsonb("daily_prices"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  submissionGlobalSeasonUnique: uniqueIndex("chalet_global_seasons_submission_global_season_unique")
    .on(table.submissionId, table.globalSeasonId),
}));
export type ChaletGlobalSeason = typeof chaletGlobalSeasonsTable.$inferSelect;
export type InsertChaletGlobalSeason = typeof chaletGlobalSeasonsTable.$inferInsert;

/* ── Admin Staff (Platform Admins) ──────────────────────────── */

export type AdminPermKey =
  | "chaletApprovals"
  | "globalFinancials"
  | "userManagement"
  | "platformSettings"
  | "supportDisputes"
  | "serviceListings"
  | "serviceCatalog"
  | "financeSettings"
  | "subscriberManagement";

export type AdminStaffPermissions = Partial<Record<AdminPermKey, boolean>>;

/* ── CRM: owner-private notes about recurring customers ─────── */
export const customerNotesTable = pgTable("customer_notes", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  clientPhone: text("client_phone").notNull(),
  notes: text("notes").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminStaffTable = pgTable("admin_staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  personalEmail: text("email"),
  mobile: text("mobile"),
  passwordHash: text("password_hash").notNull(),
  permissions: jsonb("permissions").$type<AdminStaffPermissions>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type AdminStaff = typeof adminStaffTable.$inferSelect;

export const adminSessionsTable = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  sid: text("sid").notNull().unique(),
  adminStaffId: integer("admin_staff_id").notNull().references(() => adminStaffTable.id, { onDelete: "cascade" }),
  expire: timestamp("expire", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Owner Notification Settings ─────────────────────────── */
export const ownerNotificationSettingsTable = pgTable("owner_notification_settings", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  waEnabled: boolean("wa_enabled").notNull().default(false),
  waPhone: text("wa_phone"),
  waSupportEnabled: boolean("wa_support_enabled").notNull().default(false),
  waInstanceId: text("wa_instance_id"),
  waToken: text("wa_token"),
  bookingConfirmationEnabled: boolean("booking_confirmation_enabled").notNull().default(false),
  bookingConfirmationTemplate: text("booking_confirmation_template"),
  arrivalReminderEnabled: boolean("arrival_reminder_enabled").notNull().default(false),
  arrivalReminderOffsetHours: integer("arrival_reminder_offset_hours").notNull().default(24),
  arrivalReminderTemplate: text("arrival_reminder_template"),
  changeNoticeEnabled: boolean("change_notice_enabled").notNull().default(false),
  changeNoticeTemplate: text("change_notice_template"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerNotificationSettings = typeof ownerNotificationSettingsTable.$inferSelect;

/* ── Chalet Add-on Services ───────────────────────────────── */
export const chaletServicesTable = pgTable("chalet_services", {
  id: serial("id").primaryKey(),
  chaletId: integer("chalet_id").notNull().references(() => chaletsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("مرة واحدة"),
  imageUrl: text("image_url"),
  galleryPhotos: jsonb("gallery_photos").$type<Array<{ url: string; caption: string }>>(),
  isActive: boolean("is_active").notNull().default(true),
  minPersons: integer("min_persons"),
  maxPersons: integer("max_persons"),
  maxQuantity: integer("max_quantity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletService = typeof chaletServicesTable.$inferSelect;
export type NewChaletService = typeof chaletServicesTable.$inferInsert;

/* ════════════════════════════════════════════════════════════════
   SERVICE PROVIDER ERP TABLES
   (Independent service providers — not chalet add-ons)
   ════════════════════════════════════════════════════════════════ */

/* ── Service Blocked Dates (calendar blocking) ─────────────── */
export const serviceBlockedDatesTable = pgTable("service_blocked_dates", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  dateStr: text("date_str").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceBlockedDate = typeof serviceBlockedDatesTable.$inferSelect;

/* ── Service Seasons (pricing/availability periods) ─────────── */
export const serviceSeasonsTable = pgTable("service_seasons", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  globalSeasonId: integer("global_season_id").references(() => globalSeasonsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  priceLabel: text("price_label"),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull().default("1.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("service_seasons_provider_global_unique").on(table.providerId, table.globalSeasonId),
]);
export type ServiceSeason = typeof serviceSeasonsTable.$inferSelect;

/* ── Owner customers (shared across properties and services) ── */
export const ownerCustomersTable = pgTable("owner_customers", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  phoneNormalized: text("phone_normalized").notNull(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  serviceAddress: text("service_address"),
  serviceDeliveryMethod: text("service_delivery_method"),
  clientIdNumber: text("client_id_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerPhoneUnique: uniqueIndex("owner_customers_owner_phone_unique").on(table.ownerId, table.phoneNormalized),
}));
export type OwnerCustomer = typeof ownerCustomersTable.$inferSelect;

/* ── Service Appointments (booking records) ─────────────────── */
export const serviceAppointmentsTable = pgTable("service_appointments", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  serviceAddress: text("service_address"),
  serviceDeliveryMethod: text("service_delivery_method"),
  clientIdNumber: text("client_id_number"),
  dateStr: text("date_str").notNull(),
  startTime: text("start_time"),
  previousStartTime: text("previous_start_time"),
  duration: text("duration"),
  durationUnit: text("duration_unit").notNull().default("hours"),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  deposit: numeric("deposit", { precision: 10, scale: 2 }).default("0"),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }).default("0"),
  insuranceStatus: text("insurance_status").default("held"),
  insuranceDeductAmount: numeric("insurance_deduct_amount", { precision: 10, scale: 2 }),
  insuranceDeductNote: text("insurance_deduct_note"),
  insuranceProofImages: jsonb("insurance_proof_images").$type<string[]>().notNull().default([]),
  source: text("source").notNull().default("external"),
  paymentMethod: paymentMethodEnum("payment_method").default("cash"),
  paymentReceiptUrl: text("payment_receipt_url"),
  cashDeposited: boolean("cash_deposited").notNull().default(false),
  contractSigned: boolean("contract_signed").notNull().default(false),
  contractSignatureDataUrl: text("contract_signature_data_url"),
  contractSignedAt: timestamp("contract_signed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  cancelRefundAmount: numeric("cancel_refund_amount", { precision: 10, scale: 2 }).default("0"),
  editReason: text("edit_reason"),
  previousDateStr: text("previous_date_str"),
  editedDateStr: text("edited_date_str"),
  previousAmount: numeric("previous_amount", { precision: 10, scale: 2 }),
  previousDuration: text("previous_duration"),
  previousDurationUnit: text("previous_duration_unit"),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
}, (table) => ({
  customerHistoryIdx: index("service_appointments_customer_history_idx").on(table.ownerId, table.providerId, table.clientPhone, table.dateStr.desc(), table.id.desc()),
}));
export type ServiceAppointment = typeof serviceAppointmentsTable.$inferSelect;

/* ── Service Review Invitations (one-time tokens) ───────────── */
export const serviceReviewInvitationsTable = pgTable("service_review_invitations", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  guestName: text("guest_name"),
  used: boolean("used").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceReviewInvitation = typeof serviceReviewInvitationsTable.$inferSelect;

/* ── Service Reviews ─────────────────────────────────────────── */
export const serviceReviewsTable = pgTable("service_reviews", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  invitationId: integer("invitation_id").unique().references(() => serviceReviewInvitationsTable.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  photoUrls: text("photo_urls").array().notNull().default([]),
  guestName: text("guest_name"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(true),
  isHidden: boolean("is_hidden").notNull().default(false),
  ownerReply: text("owner_reply"),
  ownerReplyAt: timestamp("owner_reply_at", { withTimezone: true }),
  reportedBy: text("reported_by"),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportReason: text("report_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceReview = typeof serviceReviewsTable.$inferSelect;

/* ── Service Insurances (policy tracking) ───────────────────── */
export const serviceInsurancesTable = pgTable("service_insurances", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  providerId: integer("provider_id").references(() => serviceProvidersTable.id, { onDelete: "set null" }),
  policyName: text("policy_name").notNull(),
  insurerName: text("insurer_name"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  renewalDate: text("renewal_date"),
  notes: text("notes"),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }).default("0"),
  refundNote: text("refund_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceInsurance = typeof serviceInsurancesTable.$inferSelect;

/* ── Owner Temporary Sessions (admin impersonation) ─────────── */
export const ownerTempSessionsTable = pgTable("owner_temp_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  adminLabel: text("admin_label"), /* admin name for banner display */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdByReplitId: text("created_by_replit_id"), /* Replit user ID who created this session */
});

/* ── Owner Support Requests ───────────────────────────────── */
export const ownerSupportRequestsTable = pgTable("owner_support_requests", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  ownerName: text("owner_name"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), /* new | in_progress | replied | resolved */
  source: text("source").notNull().default("owner_request"),
  adminReply: text("admin_reply"),
  adminReplyAt: timestamp("admin_reply_at", { withTimezone: true }),
  isReadByOwner: boolean("is_read_by_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusCreatedIdx: index("owner_support_requests_status_created_idx").on(table.status, table.createdAt),
  ownerCreatedIdx: index("owner_support_requests_owner_created_idx").on(table.ownerId, table.createdAt),
}));
export type OwnerSupportRequest = typeof ownerSupportRequestsTable.$inferSelect;

/* ── Contact Inquiries (submitted via Contact Us page) ───────── */
export const contactInquiriesTable = pgTable("contact_inquiries", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  statusUpdatedIdx: index("contact_inquiries_status_updated_idx").on(table.status, table.updatedAt),
  createdAtIdx: index("contact_inquiries_created_at_idx").on(table.createdAt),
}));
export type ContactInquiry = typeof contactInquiriesTable.$inferSelect;

/* ── Admin Audit Log ──────────────────────────────────────────
 * The first four columns intentionally retain the names used by the
 * pre-existing admin_audit_logs table. The remaining columns are additive,
 * allowing older installations to migrate without losing existing entries.
 */
export const adminAuditLogsTable = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: text("admin_id"),
  actorName: text("admin_name"),
  action: text("action").notNull(),
  method: text("method"),
  path: text("path"),
  entity: text("entity"),
  entityId: text("entity_id"),
  targetOwnerId: text("target_owner_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index("admin_audit_logs_created_at_idx").on(table.createdAt),
  actorIdx: index("admin_audit_logs_actor_idx").on(table.actorId),
  actionIdx: index("admin_audit_logs_action_idx").on(table.action),
  entityIdx: index("admin_audit_logs_entity_idx").on(table.entity, table.entityId),
}));
export type AdminAuditLog = typeof adminAuditLogsTable.$inferSelect;

/* ── Booking Payments / Installments ────────────────────────── */
export const bookingPaymentsTable = pgTable("booking_payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => ownerBookingsTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: text("payment_date").notNull(),
  method: text("method").notNull().default("cash"),
  cashDeposited: boolean("cash_deposited").notNull().default(false),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type BookingPayment = typeof bookingPaymentsTable.$inferSelect;

/* ── Section Guides (Video Tutorials per dashboard section) ─── */
export const sectionGuidesTable = pgTable("section_guides", {
  id:         serial("id").primaryKey(),
  sectionKey: varchar("section_key", { length: 100 }).notNull(),
  title:      varchar("title", { length: 255 }).notNull(),
  videoUrl:   varchar("video_url", { length: 500 }).notNull(),
});
export type SectionGuide = typeof sectionGuidesTable.$inferSelect;
