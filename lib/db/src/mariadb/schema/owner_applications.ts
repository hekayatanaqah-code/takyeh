// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerApplicationsTable = m.mysqlTable("owner_applications", {
  id: m.int("id").notNull().autoincrement(),
  fullName: m.longtext("full_name").notNull(),
  businessName: m.longtext("business_name").notNull(),
  phone: m.longtext("phone").notNull(),
  email: m.longtext("email"),
  passwordHash: m.longtext("password_hash").notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'pending'")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  businessType: m.longtext("business_type").notNull().default(sql.raw("'chalet'")),
  docsStatus: m.longtext("docs_status").default(sql.raw("'pending_docs'")),
  emailVerified: m.boolean("email_verified").notNull().default(sql.raw("0")),
  emailVerifiedAt: m.datetime("email_verified_at", { mode: "date", fsp: 6 }),
  whatsappNewsSubscribe: m.boolean("whatsapp_news_subscribe").notNull().default(sql.raw("0")),
  whatsappSubscribedAt: m.datetime("whatsapp_subscribed_at", { mode: "date", fsp: 6 }),
  phoneVerified: m.boolean("phone_verified").notNull().default(sql.raw("0")),
  phoneVerifiedAt: m.datetime("phone_verified_at", { mode: "date", fsp: 6 }),
  deletedAt: m.datetime("deleted_at", { mode: "date", fsp: 6 }),
  deleteReason: m.longtext("delete_reason"),
  bookingsCalPref: m.varchar("bookings_cal_pref", { length: 20 }).default(sql.raw("'hijri'")),
  reportsCalPref: m.varchar("reports_cal_pref", { length: 20 }).default(sql.raw("'gregorian'")),
  salaryCalPref: m.longtext("salary_cal_pref").default(sql.raw("'gregorian'")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_applications_email_verified_bool", sql.raw("`email_verified` IN (0,1)")),
  m.check("owner_applications_whatsapp_news_subscribe_bool", sql.raw("`whatsapp_news_subscribe` IN (0,1)")),
  m.check("owner_applications_phone_verified_bool", sql.raw("`phone_verified` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
