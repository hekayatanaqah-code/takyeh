// Generated native application contracts. No PostgreSQL constructors.

import { createInsertSchema } from "drizzle-zod";

import { z } from "zod/v4";

import { chaletsTable } from "./tables/chalets";
export { chaletsTable };

export const insertChaletSchema = createInsertSchema(chaletsTable, { amenities: z.array(z.string()).optional(), photos: z.array(z.string()).optional(), photoCaptions: z.array(z.string()).optional() }).omit({ id: true, createdAt: true });

export type InsertChalet = z.infer<typeof insertChaletSchema>;

export type Chalet = typeof chaletsTable.$inferSelect;

export const submissionStatusEnum = { enumValues: ["pending", "approved", "rejected", "needs_revision"] } as const;

import { chaletSubmissionsTable } from "./tables/chalet_submissions";
export { chaletSubmissionsTable };

export const insertSubmissionSchema = createInsertSchema(chaletSubmissionsTable, { amenities: z.array(z.string()).optional(), photos: z.array(z.string()).optional(), photoCaptions: z.array(z.string()).optional() }).omit({ id: true, createdAt: true, status: true });

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;

export type ChaletSubmission = typeof chaletSubmissionsTable.$inferSelect;

import { regionsCatalogTable } from "./tables/regions_catalog";
export { regionsCatalogTable };

export type Region = typeof regionsCatalogTable.$inferSelect;

import { citiesCatalogTable } from "./tables/cities_catalog";
export { citiesCatalogTable };

export type City = typeof citiesCatalogTable.$inferSelect;

import { districtsCatalogTable } from "./tables/districts_catalog";
export { districtsCatalogTable };

export type District = typeof districtsCatalogTable.$inferSelect;

import { serviceRegionsCatalogTable } from "./tables/service_regions_catalog";
export { serviceRegionsCatalogTable };

export const insertServiceRegionSchema = createInsertSchema(serviceRegionsCatalogTable).omit({ id: true, createdAt: true });

export type InsertServiceRegion = z.infer<typeof insertServiceRegionSchema>;

export type ServiceRegion = typeof serviceRegionsCatalogTable.$inferSelect;

import { serviceCitiesCatalogTable } from "./tables/service_cities_catalog";
export { serviceCitiesCatalogTable };

export const insertServiceCitySchema = createInsertSchema(serviceCitiesCatalogTable).omit({ id: true, createdAt: true });

export type InsertServiceCity = z.infer<typeof insertServiceCitySchema>;

export type ServiceCity = typeof serviceCitiesCatalogTable.$inferSelect;

import { serviceDistrictsCatalogTable } from "./tables/service_districts_catalog";
export { serviceDistrictsCatalogTable };

export const insertServiceDistrictSchema = createInsertSchema(serviceDistrictsCatalogTable).omit({ id: true, createdAt: true });

export type InsertServiceDistrict = z.infer<typeof insertServiceDistrictSchema>;

export type ServiceDistrict = typeof serviceDistrictsCatalogTable.$inferSelect;

import { amenitiesCatalogTable } from "./tables/amenities_catalog";
export { amenitiesCatalogTable };

export type AmenityCatalog = typeof amenitiesCatalogTable.$inferSelect;

export const servicesCategoryEnum = { enumValues: [
  "bounce_houses",
  "ice_cream",
  "productive_families",
] } as const;

import { externalServicesTable } from "./tables/external_services";
export { externalServicesTable };

export type ExternalService = typeof externalServicesTable.$inferSelect;

import { chaletCategoriesTable } from "./tables/chalet_categories";
export { chaletCategoriesTable };

export type ChaletCategory = typeof chaletCategoriesTable.$inferSelect;

export const bookingSourceEnum = { enumValues: ["platform", "external"] } as const;

export const paymentMethodEnum = { enumValues: ["cash", "transfer", "pos"] } as const;

import { ownerBookingsTable } from "./tables/owner_bookings";
export { ownerBookingsTable };

export type OwnerBooking = typeof ownerBookingsTable.$inferSelect;

import { ownerRefundsTable } from "./tables/owner_refunds";
export { ownerRefundsTable };

export type OwnerRefund = typeof ownerRefundsTable.$inferSelect;

import { cashDepositLogsTable } from "./tables/cash_deposit_logs";
export { cashDepositLogsTable };

export type CashDepositLog = typeof cashDepositLogsTable.$inferSelect;

import { ownerRescheduleLogsTable } from "./tables/owner_reschedule_logs";
export { ownerRescheduleLogsTable };

export type OwnerRescheduleLog = typeof ownerRescheduleLogsTable.$inferSelect;

import { siteSettingsTable } from "./tables/site_settings";
export { siteSettingsTable };

export type SiteSetting = typeof siteSettingsTable.$inferSelect;

import { serviceCategoriesTable } from "./tables/service_categories";
export { serviceCategoriesTable };

export type ServiceCategory = typeof serviceCategoriesTable.$inferSelect;

import { serviceProviderSubmissionsTable } from "./tables/service_provider_submissions";
export { serviceProviderSubmissionsTable };

export type ServiceProviderSubmission = typeof serviceProviderSubmissionsTable.$inferSelect;

import { serviceProvidersTable } from "./tables/service_providers";
export { serviceProvidersTable };

export type ServiceProvider = typeof serviceProvidersTable.$inferSelect;

import { ownerAccountLinksTable } from "./tables/owner_account_links";
export { ownerAccountLinksTable };

export type OwnerAccountLink = typeof ownerAccountLinksTable.$inferSelect;

import { chaletAvailabilityTable } from "./tables/chalet_availability";
export { chaletAvailabilityTable };

export type ChaletAvailability = typeof chaletAvailabilityTable.$inferSelect;

export type SubscriptionTerms = {
  nameAr: string;
  features: string[];
  scope: "property" | "full";
  chaletLimit: number | null;
  serviceLimit: number | null;
};

import { ownerSubscriptionsTable } from "./tables/owner_subscriptions";
export { ownerSubscriptionsTable };

export type OwnerSubscription = typeof ownerSubscriptionsTable.$inferSelect;

import { ownerFreeAccessGrantsTable } from "./tables/owner_free_access_grants";
export { ownerFreeAccessGrantsTable };

export type OwnerFreeAccessGrant = typeof ownerFreeAccessGrantsTable.$inferSelect;

import { ownerAccountDiscountsTable } from "./tables/owner_account_discounts";
export { ownerAccountDiscountsTable };

export type OwnerAccountDiscount = typeof ownerAccountDiscountsTable.$inferSelect;

import { subscriptionPlansTable } from "./tables/subscription_plans";
export { subscriptionPlansTable };

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;

import { subscriptionPromoCodesTable } from "./tables/subscription_promo_codes";
export { subscriptionPromoCodesTable };

export type SubscriptionPromoCode = typeof subscriptionPromoCodesTable.$inferSelect;

import { subscriptionCheckoutIntentsTable } from "./tables/subscription_checkout_intents";
export { subscriptionCheckoutIntentsTable };

import { subscriptionPaymentsTable } from "./tables/subscription_payments";
export { subscriptionPaymentsTable };

import { subscriptionAddonCheckoutIntentsTable } from "./tables/subscription_addon_checkout_intents";
export { subscriptionAddonCheckoutIntentsTable };

import { subscriptionAddonPurchasesTable } from "./tables/subscription_addon_purchases";
export { subscriptionAddonPurchasesTable };

import { subscriptionPaymentReconciliationsTable } from "./tables/subscription_payment_reconciliations";
export { subscriptionPaymentReconciliationsTable };

import { ownerBillingProfilesTable } from "./tables/owner_billing_profiles";
export { ownerBillingProfilesTable };

import { subscriptionRenewalInvoicesTable } from "./tables/subscription_renewal_invoices";
export { subscriptionRenewalInvoicesTable };

import { subscriptionRenewalAttemptsTable } from "./tables/subscription_renewal_attempts";
export { subscriptionRenewalAttemptsTable };

import { subscriptionGrantAuditTable } from "./tables/subscription_grant_audit";
export { subscriptionGrantAuditTable };

export const expenseCategoryEnum = { enumValues: [
  "salaries", "electricity", "water", "internet", "maintenance", "supplies", "other",
] } as const;

import { expenseCategoriesTable } from "./tables/expense_categories";
export { expenseCategoriesTable };

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;

import { ownerExpensesTable } from "./tables/owner_expenses";
export { ownerExpensesTable };

export type OwnerExpense = typeof ownerExpensesTable.$inferSelect;

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

import { ownerStaffTable } from "./tables/owner_staff";
export { ownerStaffTable };

export type OwnerStaff = typeof ownerStaffTable.$inferSelect;

import { staffSessionsTable } from "./tables/staff_sessions";
export { staffSessionsTable };

import { salaryLogsTable } from "./tables/salary_logs";
export { salaryLogsTable };

export type SalaryLog = typeof salaryLogsTable.$inferSelect;

import { reviewInvitationsTable } from "./tables/review_invitations";
export { reviewInvitationsTable };

export type ReviewInvitation = typeof reviewInvitationsTable.$inferSelect;

import { reviewsTable } from "./tables/reviews";
export { reviewsTable };

export type Review = typeof reviewsTable.$inferSelect;

import { ownerNotificationsTable } from "./tables/owner_notifications";
export { ownerNotificationsTable };

export type OwnerNotification = typeof ownerNotificationsTable.$inferSelect;

import { broadcastCampaignsTable } from "./tables/broadcast_campaigns";
export { broadcastCampaignsTable };

import { broadcastDeliveriesTable } from "./tables/broadcast_deliveries";
export { broadcastDeliveriesTable };

import { ownerBroadcastPreferencesTable } from "./tables/owner_broadcast_preferences";
export { ownerBroadcastPreferencesTable };

import { ownerBroadcastInboxTable } from "./tables/owner_broadcast_inbox";
export { ownerBroadcastInboxTable };

import { broadcastSmtpSettingsTable } from "./tables/broadcast_smtp_settings";
export { broadcastSmtpSettingsTable };

import { ownerReportArchiveTable } from "./tables/owner_report_archive";
export { ownerReportArchiveTable };

export type OwnerReportArchive = typeof ownerReportArchiveTable.$inferSelect;

import { chaletSeasonsTable } from "./tables/chalet_seasons";
export { chaletSeasonsTable };

export type ChaletSeason = typeof chaletSeasonsTable.$inferSelect;

import { globalSeasonsTable } from "./tables/global_seasons";
export { globalSeasonsTable };

export type GlobalSeason = typeof globalSeasonsTable.$inferSelect;

export type InsertGlobalSeason = typeof globalSeasonsTable.$inferInsert;

import { chaletGlobalSeasonsTable } from "./tables/chalet_global_seasons";
export { chaletGlobalSeasonsTable };

export type ChaletGlobalSeason = typeof chaletGlobalSeasonsTable.$inferSelect;

export type InsertChaletGlobalSeason = typeof chaletGlobalSeasonsTable.$inferInsert;

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

import { customerNotesTable } from "./tables/customer_notes";
export { customerNotesTable };

import { adminStaffTable } from "./tables/admin_staff";
export { adminStaffTable };

export type AdminStaff = typeof adminStaffTable.$inferSelect;

import { adminSessionsTable } from "./tables/admin_sessions";
export { adminSessionsTable };

import { ownerNotificationSettingsTable } from "./tables/owner_notification_settings";
export { ownerNotificationSettingsTable };

export type OwnerNotificationSettings = typeof ownerNotificationSettingsTable.$inferSelect;

import { chaletServicesTable } from "./tables/chalet_services";
export { chaletServicesTable };

export type ChaletService = typeof chaletServicesTable.$inferSelect;

export type NewChaletService = typeof chaletServicesTable.$inferInsert;

import { serviceBlockedDatesTable } from "./tables/service_blocked_dates";
export { serviceBlockedDatesTable };

export type ServiceBlockedDate = typeof serviceBlockedDatesTable.$inferSelect;

import { serviceSeasonsTable } from "./tables/service_seasons";
export { serviceSeasonsTable };

export type ServiceSeason = typeof serviceSeasonsTable.$inferSelect;

import { ownerCustomersTable } from "./tables/owner_customers";
export { ownerCustomersTable };

export type OwnerCustomer = typeof ownerCustomersTable.$inferSelect;

import { serviceAppointmentsTable } from "./tables/service_appointments";
export { serviceAppointmentsTable };

export type ServiceAppointment = typeof serviceAppointmentsTable.$inferSelect;

import { serviceReviewInvitationsTable } from "./tables/service_review_invitations";
export { serviceReviewInvitationsTable };

export type ServiceReviewInvitation = typeof serviceReviewInvitationsTable.$inferSelect;

import { serviceReviewsTable } from "./tables/service_reviews";
export { serviceReviewsTable };

export type ServiceReview = typeof serviceReviewsTable.$inferSelect;

import { serviceInsurancesTable } from "./tables/service_insurances";
export { serviceInsurancesTable };

export type ServiceInsurance = typeof serviceInsurancesTable.$inferSelect;

import { ownerTempSessionsTable } from "./tables/owner_temp_sessions";
export { ownerTempSessionsTable };

import { ownerSupportRequestsTable } from "./tables/owner_support_requests";
export { ownerSupportRequestsTable };

export type OwnerSupportRequest = typeof ownerSupportRequestsTable.$inferSelect;

import { contactInquiriesTable } from "./tables/contact_inquiries";
export { contactInquiriesTable };

export type ContactInquiry = typeof contactInquiriesTable.$inferSelect;

import { adminAuditLogsTable } from "./tables/admin_audit_logs";
export { adminAuditLogsTable };

export type AdminAuditLog = typeof adminAuditLogsTable.$inferSelect;

import { bookingPaymentsTable } from "./tables/booking_payments";
export { bookingPaymentsTable };

export type BookingPayment = typeof bookingPaymentsTable.$inferSelect;

import { sectionGuidesTable } from "./tables/section_guides";
export { sectionGuidesTable };

export type SectionGuide = typeof sectionGuidesTable.$inferSelect;
