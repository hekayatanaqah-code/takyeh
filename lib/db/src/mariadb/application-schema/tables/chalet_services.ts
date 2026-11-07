
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { chaletsTable } from "./chalets";

export const chaletServicesTable = m.mysqlTable("chalet_services", {
  id: m.int("id").notNull().autoincrement(),
  chaletId: m.int("chalet_id").notNull(),
  name: m.longtext("name").notNull(),
  description: m.longtext("description"),
  price: m.decimal("price", { precision: 10, scale: 2 }).notNull(),
  unit: m.longtext("unit").notNull().default(sql.raw("'مرة واحدة'")),
  isActive: m.boolean("is_active").notNull().default(sql.raw("1")),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  category: m.longtext("category"),
  imageUrl: m.longtext("image_url"),
  galleryPhotos: m.json("gallery_photos").$type<Array<{ url: string; caption: string }>>(),
  minPersons: m.int("min_persons"),
  maxPersons: m.int("max_persons"),
  maxQuantity: m.int("max_quantity"),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("chalet_services_is_active_bool", sql.raw("`is_active` IN (0,1)")),
  m.primaryKey({ columns: [table.id] }),
  m.foreignKey({ name: "chalet_services_chalet_id_fkey", columns: [table.chaletId], foreignColumns: [chaletsTable.id] }).onDelete("cascade").onUpdate("restrict"),
]);
