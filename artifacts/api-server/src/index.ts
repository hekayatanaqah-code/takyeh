import app from "./app";
import { logger } from "./lib/logger";
import { seedCatalogIfEmpty } from "./lib/seed-catalog";
import { seedSubscriptionPlansOnce } from "./lib/subscription-defaults";
import { runSubscriptionExpiryReminders } from "./lib/subscription-reminders";
import { startLongPauseAlertCheck } from "./routes/admin";
import { runSubscriptionExpiryJob } from "./lib/subscription-expiry";
import { db } from "@workspace/db";
import { ownerBookingsTable, ownerNotificationsTable } from "@workspace/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Booking reminder — runs every 30 minutes */
async function sendBookingReminders() {
  try {
    const now = new Date();

    const upcomingBookings = await db
      .select()
      .from(ownerBookingsTable)
      .where(isNull(ownerBookingsTable.cancelledAt));

    for (const booking of upcomingBookings) {
      const [year, month, day] = booking.bookingDate.split("-").map(Number);
      const arrivalDate = new Date(year, month - 1, day);
      if (arrivalDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) continue;

      const offsetHours = 24;
      const dueAt = new Date(arrivalDate.getTime() - offsetHours * 60 * 60 * 1000);
      if (now < dueAt) continue;

      const tag = `[booking:${booking.id}]`;
      const existing = await db
        .select({ id: ownerNotificationsTable.id })
        .from(ownerNotificationsTable)
        .where(
          and(
            eq(ownerNotificationsTable.ownerId, booking.ownerId),
            eq(ownerNotificationsTable.type, "booking_reminder"),
            like(ownerNotificationsTable.message, `%${tag}%`)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        const periodLabel = booking.period
          ? ({ morning: "صباحي", evening: "مسائي", full_day: "يوم كامل" } as Record<string, string>)[booking.period] ?? ""
          : "";
        await db.insert(ownerNotificationsTable).values({
          ownerId: booking.ownerId,
          type: "booking_reminder",
          bookingId: booking.id,
          message: `⏰ تذكير: حجز غداً · ${booking.clientName}${periodLabel ? ` · ${periodLabel}` : ""} ${tag}`,
        });
        logger.info({ bookingId: booking.id }, "Booking reminder notification created");
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Booking reminder cron failed");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  try {
    await seedCatalogIfEmpty();
    await seedSubscriptionPlansOnce();
    logger.info("Catalog seeded");
  } catch (e) {
    logger.error({ err: e }, "Failed to seed catalog");
  }

  // Run booking reminder check on startup and every 30 minutes
  sendBookingReminders();
  setInterval(sendBookingReminders, 30 * 60 * 1000);

  // Check on startup and hourly; reminders precede the expiry transition.
  const checkSubscriptions = async () => {
    await runSubscriptionExpiryReminders();
    await runSubscriptionExpiryJob();
  };
  void checkSubscriptions();
  setInterval(() => { void checkSubscriptions(); }, 60 * 60 * 1000);

  // Check for long-paused chalets on startup and every hour
  startLongPauseAlertCheck();
});
