
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyPackagesTable } from "./photography_packages";
import { photographersTable } from "./photographers";

export const photographyBookingsTable = m.mysqlTable("photography_bookings", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.longtext("owner_id").notNull(),
  propertyId: m.int("property_id"),
  photographerId: m.int("photographer_id").notNull(),
  packageId: m.int("package_id").notNull(),
  propertyName: m.longtext("property_name").notNull(),
  photographerName: m.longtext("photographer_name").notNull(),
  packageName: m.longtext("package_name").notNull(),
  ownerPhone: m.longtext("owner_phone").notNull(),
  photographerPhone: m.longtext("photographer_phone").notNull(),
  startAt: m.datetime("start_at", { mode: "date", fsp: 6 }).notNull(),
  endAt: m.datetime("end_at", { mode: "date", fsp: 6 }).notNull(),
  expiresAt: m.datetime("expires_at", { mode: "date", fsp: 6 }).notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'awaiting_payment'")),
  priceHalalas: m.int("price_halalas").notNull(),
  commissionHalalas: m.int("commission_halalas").notNull(),
  photographerEarningsHalalas: m.int("photographer_earnings_halalas").notNull(),
  invoiceId: m.varchar("invoice_id", { length: 191 }),
  paymentId: m.varchar("payment_id", { length: 191 }),
  paymentUrl: m.longtext("payment_url"),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  serviceSubmissionId: m.int("service_submission_id"),
  assignmentStatus: m.longtext("assignment_status").notNull().default(sql.raw("'assigned'")),
  deliveredAt: m.datetime("delivered_at", { mode: "date", fsp: 6 }),
  targetCity: m.longtext("target_city"),
  targetRegion: m.longtext("target_region"),
  targetDistrict: m.longtext("target_district"),
  paymentMethod: m.longtext("payment_method").notNull().default(sql.raw("'card'")),
  refundedHalalas: m.int("refunded_halalas").notNull().default(sql.raw("0")),
  financialStatus: m.longtext("financial_status").notNull().default(sql.raw("'unpaid'")),
  targetType: m.longtext("target_type"),
  deliveryUrl: m.longtext("delivery_url"),
  deliveryFiles: m.json("delivery_files").$type<{ objectPath: string; name: string; contentType: string; size: number }[]>().notNull().default(sql.raw("'[]'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photography_booking_one_target", sql.raw("((((property_id IS NOT NULL) + (service_submission_id IS NOT NULL)) = 1))")),
  m.check("photography_bookings_check", sql.raw("((end_at > start_at))")),
  m.check("photography_bookings_check1", sql.raw("((price_halalas = (commission_halalas + photographer_earnings_halalas)))")),
  m.check("photography_bookings_status_check", sql.raw("((status IN ('awaiting_payment', 'confirmed', 'expired', 'cancelled', 'completed', 'payment_review')))")),
  m.uniqueIndex("photography_bookings_invoice_id_key").on(table.invoiceId),
  m.uniqueIndex("photography_bookings_payment_id_key").on(table.paymentId),
  m.primaryKey({ columns: [table.id] }),
  m.index("photography_slot_lookup").on(table.photographerId, table.startAt, table.endAt),
  m.foreignKey({ name: "photography_bookings_package_id_fkey", columns: [table.packageId], foreignColumns: [photographyPackagesTable.id] }).onDelete("restrict").onUpdate("restrict"),
  m.foreignKey({ name: "photography_bookings_photographer_id_fkey", columns: [table.photographerId], foreignColumns: [photographersTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
