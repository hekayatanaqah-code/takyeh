// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceCitiesCatalogTable } from "./service_cities_catalog";
import { serviceRegionsCatalogTable } from "./service_regions_catalog";
import { serviceProviderSubmissionsTable } from "./service_provider_submissions";

export const serviceProvidersTable = m.mysqlTable("service_providers", {
  id: m.int("id").notNull().autoincrement(),
  businessName: m.longtext("business_name").notNull(),
  category: m.longtext("category").notNull(),
  city: m.longtext("city").notNull(),
  descriptionAr: m.longtext("description_ar"),
  whatsappNumber: m.longtext("whatsapp_number").notNull(),
  logoUrl: m.longtext("logo_url"),
  galleryPhotos: m.json("gallery_photos").$type<string[]>().notNull().default(sql.raw("'[]'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  videoUrl: m.longtext("video_url"),
  yearsOfExperience: m.int("years_of_experience"),
  coverageTags: m.json("coverage_tags").$type<string[]>().notNull().default(sql.raw("'[]'")),
  customFeatureTags: m.json("custom_feature_tags").$type<string[]>().notNull().default(sql.raw("'[]'")),
  ownerId: m.longtext("owner_id"),
  financeMode: m.longtext("finance_mode").default(sql.raw("'separate'")),
  clientListMode: m.longtext("client_list_mode").default(sql.raw("'unified'")),
  photoCaptions: m.json("photo_captions").$type<string[]>().default(sql.raw("'[]'")),
  pricingUnit: m.longtext("pricing_unit"),
  dailyCapacity: m.int("daily_capacity"),
  requiresInsurance: m.boolean("requires_insurance").notNull().default(sql.raw("0")),
  insuranceAmount: m.decimal("insurance_amount", { precision: 10, scale: 2 }),
  requiresContract: m.boolean("requires_contract").notNull().default(sql.raw("0")),
  contractText: m.longtext("contract_text"),
  includeElectronicSignature: m.boolean("include_electronic_signature").notNull().default(sql.raw("1")),
  serviceRegionId: m.int("service_region_id"),
  serviceCityId: m.int("service_city_id"),
  submissionId: m.int("submission_id"),
  instagramAccount: m.longtext("instagram_account"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_providers_gallery_photos_array", sql.raw("JSON_TYPE(`gallery_photos`) = 'ARRAY'")),
  m.check("service_providers_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.check("service_providers_coverage_tags_array", sql.raw("JSON_TYPE(`coverage_tags`) = 'ARRAY'")),
  m.check("service_providers_custom_feature_tags_array", sql.raw("JSON_TYPE(`custom_feature_tags`) = 'ARRAY'")),
  m.check("service_providers_photo_captions_array", sql.raw("JSON_TYPE(`photo_captions`) = 'ARRAY'")),
  m.check("service_providers_requires_insurance_bool", sql.raw("`requires_insurance` IN (0,1)")),
  m.check("service_providers_requires_contract_bool", sql.raw("`requires_contract` IN (0,1)")),
  m.check("service_providers_include_electronic_signature_bool", sql.raw("`include_electronic_signature` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("service_providers_submission_id_unique").on(table.submissionId),
  m.foreignKey({ name: "service_providers_service_city_id_fkey", columns: [table.serviceCityId], foreignColumns: [serviceCitiesCatalogTable.id] }).onDelete("restrict").onUpdate("restrict"),
  m.foreignKey({ name: "service_providers_service_region_id_fkey", columns: [table.serviceRegionId], foreignColumns: [serviceRegionsCatalogTable.id] }).onDelete("restrict").onUpdate("restrict"),
  m.foreignKey({ name: "service_providers_submission_id_fkey", columns: [table.submissionId], foreignColumns: [serviceProviderSubmissionsTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
