// Generated native MariaDB schema; not wired into the PostgreSQL API.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const externalServicesTable = m.mysqlTable("external_services", {
  id: m.int("id").notNull().autoincrement(),
  nameAr: m.longtext("name_ar").notNull(),
  category: m.mysqlEnum("category", ["bounce_houses","ice_cream","productive_families"]).notNull(),
  descriptionAr: m.longtext("description_ar").notNull(),
  whatsappNumber: m.longtext("whatsapp_number").notNull(),
  price: m.decimal("price", { precision: 10, scale: 2 }),
  priceNote: m.longtext("price_note"),
  city: m.longtext("city"),
  photos: m.json("photos").$type<string[]>().notNull().default(sql.raw("'[]'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  trialEndsAt: m.datetime("trial_ends_at", { mode: "date", fsp: 6 }),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("external_services_photos_array", sql.raw("JSON_TYPE(`photos`) = 'ARRAY'")),
  m.check("external_services_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
]);
