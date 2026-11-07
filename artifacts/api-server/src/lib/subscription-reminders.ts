import { writeRecords } from "@workspace/db/mutations";
import { and, eq, gte, like, lt, notInArray, sql } from "drizzle-orm";
import { lockResource } from "@workspace/db/transaction-lock";
import { db, ownerNotificationsTable, ownerSubscriptionsTable } from "@workspace/db";
import { siteSettingsTable } from "@workspace/db/schema";
import { logger } from "./logger";

const RIYADH_TIME_ZONE = "Asia/Riyadh";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [5, 3, 0] as const;
const REMINDER_LOCK_NAMESPACE = 1414746448;
const REMINDER_LOCK_ID = 1;
const REMINDER_HEARTBEAT_KEY = "subscription_expiry_reminder_heartbeat";

function getRiyadhDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function shiftCalendarDate(date: Date, days: number): string {
  const { year, month, day } = getRiyadhDateParts(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function startOfRiyadhDayUtc(date: string): Date {
  return new Date(`${date}T00:00:00+03:00`);
}

function toArabicNumerals(value: number): string {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function reminderMessage(daysUntilExpiry: number, marker: string): string {
  const reminder = daysUntilExpiry === 0
    ? "ينتهي اشتراكك اليوم. جدّده الآن لمواصلة استخدام المنصة."
    : `ينتهي اشتراكك خلال ${toArabicNumerals(daysUntilExpiry)} أيام. جدّده قبل انتهائه لمواصلة استخدام المنصة.`;

  // The invisible marker provides persistent, per-expiry deduplication without
  // adding a schema field or exposing an internal key in the notification UI.
  return `⏳ ${reminder}\u2063${marker}\u2063`;
}

/**
 * Inserts in-app renewal reminders once per owner, expiry timestamp, and
 * milestone. A database row transaction lock makes the check-and-insert
 * safe across restarts and concurrent server instances.
 */
export async function runSubscriptionExpiryReminders(): Promise<void> {
  let status: "success" | "failure" = "success";
  try {
    const createdCount = await db.transaction(async (tx) => {
      await lockResource(tx, REMINDER_LOCK_NAMESPACE, REMINDER_LOCK_ID);

      const now = new Date();
      let inserted = 0;

      for (const daysUntilExpiry of REMINDER_DAYS) {
        const targetDay = shiftCalendarDate(now, daysUntilExpiry);
        const start = startOfRiyadhDayUtc(targetDay);
        const end = new Date(start.getTime() + MILLISECONDS_PER_DAY);
        const statusCondition = daysUntilExpiry === 0
          ? notInArray(ownerSubscriptionsTable.status, ["cancelled", "canceled"])
          : eq(ownerSubscriptionsTable.status, "active");

        const dueSubscriptions = await tx
          .select({
            ownerId: ownerSubscriptionsTable.ownerId,
            expiresAt: ownerSubscriptionsTable.expiresAt,
          })
          .from(ownerSubscriptionsTable)
          .where(and(
            gte(ownerSubscriptionsTable.expiresAt, start),
            lt(ownerSubscriptionsTable.expiresAt, end),
            statusCondition,
          ));

        for (const subscription of dueSubscriptions) {
          if (!subscription.expiresAt) continue;
          const marker = `subscription-expiry:${subscription.expiresAt.getTime()}:${daysUntilExpiry}`;
          const [existingReminder] = await tx
            .select({ id: ownerNotificationsTable.id })
            .from(ownerNotificationsTable)
            .where(and(
              eq(ownerNotificationsTable.ownerId, subscription.ownerId),
              eq(ownerNotificationsTable.type, "subscription_expiry_reminder"),
              like(ownerNotificationsTable.message, `%${marker}%`),
            ))
            .limit(1);

          if (existingReminder) continue;

          await tx.insert(ownerNotificationsTable).values({
            ownerId: subscription.ownerId,
            type: "subscription_expiry_reminder",
            message: reminderMessage(daysUntilExpiry, marker),
          });
          inserted++;
        }
      }

      return inserted;
    });

    if (createdCount > 0) {
      logger.info({ createdCount }, "Subscription expiry reminders created");
    }
  } catch (error) {
    status = "failure";
    logger.error({ err: error }, "Subscription expiry reminder job failed");
  } finally {
    const heartbeat = JSON.stringify({ lastCheckAt: new Date().toISOString(), status });
    try {
      await writeRecords(db, siteSettingsTable, { key: REMINDER_HEARTBEAT_KEY, value: heartbeat, updatedAt: new Date() }, { conflict: { action: "update", ...{
          target: siteSettingsTable.key,
          set: { value: heartbeat, updatedAt: new Date() },
        } } });
    } catch (heartbeatError) {
      // Preserve the scheduler's original outcome; heartbeat persistence is best-effort.
      logger.error({ err: heartbeatError, jobStatus: status }, "Subscription expiry reminder heartbeat could not be saved");
    }
  }
}