
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { serviceCitiesCatalogTable } from "./service_cities_catalog";
import { serviceRegionsCatalogTable } from "./service_regions_catalog";

export const serviceCityRequestsTable = m.mysqlTable("service_city_requests", {
  id: m.int("id").notNull().autoincrement(),
  city: m.longtext("city").notNull(),
  regionId: m.int("region_id"),
  requesterId: m.longtext("requester_id").notNull(),
  requesterName: m.longtext("requester_name").notNull().default(sql.raw("'مقدم خدمة'")),
  status: m.varchar("status", { length: 191 }).$type<"pending" | "approved" | "rejected">().notNull().default(sql.raw("'pending'")),
  reason: m.longtext("reason"),
  reviewedBy: m.longtext("reviewed_by"),
  reviewedAt: m.datetime("reviewed_at", { mode: "date", fsp: 6 }),
  approvedCityId: m.int("approved_city_id"),
  legacyKey: m.varchar("legacy_key", { length: 191 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("service_city_requests_status_check", sql.raw("((status IN ('pending', 'approved', 'rejected')))")),
  m.uniqueIndex("service_city_requests_legacy_key_key").on(table.legacyKey),
  m.primaryKey({ columns: [table.id] }),
  m.index("service_city_requests_status_idx").on(table.status, table.createdAt),
  m.foreignKey({ name: "service_city_requests_approved_city_id_fkey", columns: [table.approvedCityId], foreignColumns: [serviceCitiesCatalogTable.id] }).onDelete("set null").onUpdate("restrict"),
  m.foreignKey({ name: "service_city_requests_region_id_fkey", columns: [table.regionId], foreignColumns: [serviceRegionsCatalogTable.id] }).onDelete("set null").onUpdate("restrict"),
]);
