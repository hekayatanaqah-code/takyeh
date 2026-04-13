import { pgTable, text, serial, integer, numeric, timestamp, pgEnum, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chaletsTable = pgTable("chalets", {
  id: serial("id").primaryKey(),
  /* ── Link back to originating submission (set on admin approval) ── */
  submissionId: integer("submission_id"),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar").notNull(),
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
  whatsappNumber: text("whatsapp_number").notNull(),
  mapsUrl: text("maps_url"),
  socialLink: text("social_link"),
  termsAndConditions: text("terms_and_conditions"),
  waReviewTemplate: text("wa_review_template"),
  isVerified: boolean("is_verified").notNull().default(false),
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
  location: text("location").notNull(),
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
  /* ── Per-period check-in / check-out times ── */
  morningCheckIn: text("morning_check_in"),
  morningCheckOut: text("morning_check_out"),
  eveningCheckIn: text("evening_check_in"),
  eveningCheckOut: text("evening_check_out"),
  fullDayCheckIn: text("full_day_check_in"),
  fullDayCheckOut: text("full_day_check_out"),
  amenities: text("amenities").array().notNull().default([]),
  mapsUrl: text("maps_url"),
  socialLink: text("social_link"),
  termsAndConditions: text("terms_and_conditions"),
  photos: text("photos").array().notNull().default([]),
  photoCaptions: text("photo_captions").array().notNull().default([]),
  videoUrl: text("video_url"),
  status: submissionStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(chaletSubmissionsTable).omit({ id: true, createdAt: true, status: true });
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type ChaletSubmission = typeof chaletSubmissionsTable.$inferSelect;

export const citiesCatalogTable = pgTable("cities_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ChaletCategory = typeof chaletCategoriesTable.$inferSelect;

/* ── Owner Bookings ────────────────────────────────────────── */
export const bookingSourceEnum = pgEnum("booking_source", ["platform", "external"]);

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
  balanceCollected: boolean("balance_collected").notNull().default(false),
  insuranceRefunded: boolean("insurance_refunded").notNull().default(false),
  insuranceDeducted: numeric("insurance_deducted", { precision: 10, scale: 2 }),
  insuranceDeductReason: text("insurance_deduct_reason"),
  insuranceProofImages: text("insurance_proof_images"), // JSON array of image URLs
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
});
export type OwnerBooking = typeof ownerBookingsTable.$inferSelect;

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
});
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
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  videoUrl: text("video_url"),
  yearsOfExperience: integer("years_of_experience"),
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
  ownerId: text("owner_id"),
  businessName: text("business_name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  descriptionAr: text("description_ar"),
  whatsappNumber: text("whatsapp_number").notNull(),
  logoUrl: text("logo_url"),
  galleryPhotos: text("gallery_photos").array().notNull().default([]),
  videoUrl: text("video_url"),
  yearsOfExperience: integer("years_of_experience"),
  coverageTags: text("coverage_tags").array().notNull().default([]),
  customFeatureTags: text("custom_feature_tags").array().notNull().default([]),
  photoCaptions: text("photo_captions").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;

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
export const ownerSubscriptionsTable = pgTable("owner_subscriptions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  plan: text("plan").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paymentStatus: text("payment_status").notNull().default("paid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerSubscription = typeof ownerSubscriptionsTable.$inferSelect;

/* ── Subscription Plans (admin-managed) ─────────────────── */
export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  durationDays: integer("duration_days").notNull(),
  trialDays: integer("trial_days").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

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
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OwnerNotification = typeof ownerNotificationsTable.$inferSelect;

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

/* ── Admin Staff (Platform Admins) ──────────────────────────── */

export type AdminPermKey =
  | "chaletApprovals"
  | "globalFinancials"
  | "userManagement"
  | "platformSettings"
  | "supportDisputes";

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
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  priceLabel: text("price_label"),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull().default("1.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ServiceSeason = typeof serviceSeasonsTable.$inferSelect;

/* ── Service Appointments (booking records) ─────────────────── */
export const serviceAppointmentsTable = pgTable("service_appointments", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => serviceProvidersTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  dateStr: text("date_str").notNull(),
  duration: text("duration"),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  deposit: numeric("deposit", { precision: 10, scale: 2 }).default("0"),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }).default("0"),
  insuranceStatus: text("insurance_status").default("held"),
  insuranceDeductAmount: numeric("insurance_deduct_amount", { precision: 10, scale: 2 }),
  insuranceDeductNote: text("insurance_deduct_note"),
  source: text("source").notNull().default("external"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
});
export type ServiceAppointment = typeof serviceAppointmentsTable.$inferSelect;

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
