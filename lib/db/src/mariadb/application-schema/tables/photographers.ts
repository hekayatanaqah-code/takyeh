import type { PhotographyAvailability } from "../photography";
// Generated native MariaDB schema; native application model.
import * as m from "drizzle-orm/mysql-core";
import { sql, desc } from "drizzle-orm";
import { photographyContractsTable } from "./photography_contracts";

export const photographersTable = m.mysqlTable("photographers", {
  id: m.int("id").notNull().autoincrement(),
  name: m.longtext("name").notNull(),
  whatsapp: m.varchar("whatsapp", { length: 191 }).notNull(),
  status: m.longtext("status").notNull().default(sql.raw("'invited'")),
  bio: m.longtext("bio").notNull().default(sql.raw("''")),
  regionId: m.int("region_id"),
  cityId: m.int("city_id"),
  districtIds: m.json("district_ids").$type<number[]>().notNull().default(sql.raw("'[]'")),
  allDistricts: m.boolean("all_districts").notNull().default(sql.raw("0")),
  sessionMinutes: m.int("session_minutes").notNull().default(sql.raw("60")),
  availability: m.json("availability").$type<PhotographyAvailability>().notNull().default(sql.raw("'[]'")),
  adminNote: m.longtext("admin_note"),
  passwordHash: m.longtext("password_hash"),
  inviteHash: m.varchar("invite_hash", { length: 191 }),
  inviteExpiresAt: m.datetime("invite_expires_at", { mode: "date", fsp: 6 }),
  createdAt: m.datetime("created_at", { mode: "date", fsp: 6 }).notNull().default(sql.raw("CURRENT_TIMESTAMP(6)")),
  experienceYears: m.longtext("experience_years").notNull().default(sql.raw("''")),
  portfolioUrl: m.longtext("portfolio_url").notNull().default(sql.raw("''")),
  profileImagePath: m.longtext("profile_image_path").notNull().default(sql.raw("''")),
  blockedDates: m.json("blocked_dates").$type<string[]>().notNull().default(sql.raw("'[]'")),
  iban: m.longtext("iban").notNull().default(sql.raw("''")),
  bankName: m.longtext("bank_name").notNull().default(sql.raw("''")),
  contractVersion: m.int("contract_version"),
  contractAcceptedAt: m.datetime("contract_accepted_at", { mode: "date", fsp: 6 }),
  rotationCredit: m.int("rotation_credit").notNull().default(sql.raw("0")),
  confirmedAssignments: m.int("confirmed_assignments").notNull().default(sql.raw("0")),
  lastAssignedAt: m.datetime("last_assigned_at", { mode: "date", fsp: 6 }),
  ratingSum: m.int("rating_sum").notNull().default(sql.raw("0")),
  ratingCount: m.int("rating_count").notNull().default(sql.raw("0")),
  approvedPackageIds: m.json("approved_package_ids").$type<number[]>().notNull().default(sql.raw("'[]'")),
  approvedSpecialties: m.json("approved_specialties").$type<string[]>().notNull().default(sql.raw("'[]'")),
  email: m.longtext("email").notNull().default(sql.raw("''")),
}, (table): m.MySqlTableExtraConfigValue[] => [
  m.check("photographers_all_districts_bool", sql.raw("`all_districts` IN (0,1)")),
  m.check("photographers_session_minutes_check", sql.raw("(((session_minutes >= 30) AND (session_minutes <= 240)))")),
  m.check("photographers_status_check", sql.raw("((status IN ('invited', 'pending', 'approved', 'rejected', 'suspended')))")),
  m.uniqueIndex("photographers_invite_hash_key").on(table.inviteHash),
  m.primaryKey({ columns: [table.id] }),
  m.uniqueIndex("photographers_whatsapp_key").on(table.whatsapp),
  m.foreignKey({ name: "photographers_contract_version_fkey", columns: [table.contractVersion], foreignColumns: [photographyContractsTable.id] }).onDelete("restrict").onUpdate("restrict"),
]);
