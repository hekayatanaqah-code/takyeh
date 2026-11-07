
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";

export const ownerNotificationSettingsTable = m.mysqlTable("owner_notification_settings", {
  id: m.int("id").notNull().autoincrement(),
  ownerId: m.varchar("owner_id", { length: 191 }).notNull(),
  waEnabled: m.boolean("wa_enabled").notNull().default(sql.raw("0")),
  waPhone: m.longtext("wa_phone"),
  updatedAt: m.datetime("updated_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  waInstanceId: m.longtext("wa_instance_id"),
  waToken: m.longtext("wa_token"),
  bookingConfirmationEnabled: m.boolean("booking_confirmation_enabled").notNull().default(sql.raw("0")),
  bookingConfirmationTemplate: m.longtext("booking_confirmation_template"),
  arrivalReminderEnabled: m.boolean("arrival_reminder_enabled").notNull().default(sql.raw("0")),
  arrivalReminderOffsetHours: m.int("arrival_reminder_offset_hours").notNull().default(sql.raw("24")),
  arrivalReminderTemplate: m.longtext("arrival_reminder_template"),
  changeNoticeEnabled: m.boolean("change_notice_enabled").notNull().default(sql.raw("0")),
  changeNoticeTemplate: m.longtext("change_notice_template"),
  waSupportEnabled: m.boolean("wa_support_enabled").notNull().default(sql.raw("0")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("owner_notification_settings_wa_enabled_bool", sql.raw("`wa_enabled` IN (0,1)")),
  m.check("owner_notification_settings_booking_confirmation_enabled_bool", sql.raw("`booking_confirmation_enabled` IN (0,1)")),
  m.check("owner_notification_settings_arrival_reminder_enabled_bool", sql.raw("`arrival_reminder_enabled` IN (0,1)")),
  m.check("owner_notification_settings_change_notice_enabled_bool", sql.raw("`change_notice_enabled` IN (0,1)")),
  m.check("owner_notification_settings_wa_support_enabled_bool", sql.raw("`wa_support_enabled` IN (0,1)")),
  m.uniqueIndex("owner_notification_settings_owner_id_key").on(table.ownerId),
  m.uniqueIndex("owner_notification_settings_owner_id_unique").on(table.ownerId),
  m.primaryKey({ columns: [table.id] }),
]);
