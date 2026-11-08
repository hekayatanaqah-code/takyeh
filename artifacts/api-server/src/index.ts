import app from "./app";
import { logger } from "./lib/logger";
import { seedCatalogIfEmpty } from "#catalog-bootstrap";
import { seedSubscriptionPlansOnce } from "./lib/subscription-defaults";
import { runSubscriptionExpiryReminders } from "./lib/subscription-reminders";
import { startLongPauseAlertCheck } from "./routes/admin";
import { runSubscriptionExpiryJob } from "./lib/subscription-expiry";
import { runSubscriptionRenewalJob } from "./lib/subscription-renewals";
import { runSubscriptionPaymentReconciliationJob } from "./lib/subscription-payment-reconciliation";
import { db, pool } from "@workspace/db";
import { ownerBookingsTable, ownerNotificationsTable, ownerSubscriptionsTable } from "@workspace/db/schema";
import { eq, and, isNull, like } from "drizzle-orm";
import { serverPort } from "./lib/server-port";

const port = serverPort(process.env.PORT);

const timers = new Set<ReturnType<typeof setInterval>>();
const jobs = new Set<Promise<void>>();
let stopping = false;
let stopPauseAlerts: (() => Promise<void>) | undefined;
function schedule(job: () => Promise<void>, intervalMs: number) {
  let running = false;
  const run = () => {
    if (stopping || running) return;
    running = true;
    const pending = Promise.resolve().then(job).catch(error => {
      logger.error({ err: error }, "Background job failed");
    }).finally(() => { running = false; jobs.delete(pending); });
    jobs.add(pending);
  };
  run();
  timers.add(setInterval(run, intervalMs));
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

async function initialize() {
  logger.info({ port }, "Server listening");

  // An intentional full reset must stay empty across restarts until the
  // operator explicitly chooses to initialize catalogs and subscription plans.
  if (process.env.DISABLE_STARTUP_SEEDING === "true") {
    logger.info("Automatic catalog and subscription-plan initialization disabled");
  } else {
    try {
      await seedCatalogIfEmpty();
      await seedSubscriptionPlansOnce();
      logger.info("Catalog seeded");
    } catch (e) {
      logger.error({ err: e }, "Failed to seed catalog");
    }
  }
  if (stopping) return;

  // Run booking reminder check on startup and every 30 minutes
  schedule(sendBookingReminders, 30 * 60 * 1000);

  // Check on startup and hourly; reminders precede the expiry transition.
  const checkSubscriptions = async () => {
    try {
      if (process.env.DISABLE_STARTUP_SEEDING === "true") {
        // The reminder heartbeat is stored in site_settings. Do not recreate
        // operational rows in an intentionally empty, not-yet-initialized DB.
        const [subscription] = await db.select({ ownerId: ownerSubscriptionsTable.ownerId })
          .from(ownerSubscriptionsTable).limit(1);
        if (!subscription) return;
      }
      await runSubscriptionExpiryReminders();
      await runSubscriptionExpiryJob();
    } catch (error) {
      logger.error({ err: error }, "Subscription expiry check failed");
    }
  };
  schedule(checkSubscriptions, 60 * 60 * 1000);

  // Unified token renewals are idempotent in the database and with Moyasar given_id.
  schedule(runSubscriptionRenewalJob, 15 * 60 * 1000);

  // Captured checkout payments with stale quotes remain queued until refund identity
  // is verified or an operational manual-review state is reached.
  const reconcileSubscriptionPayments = async () => {
    try {
      await runSubscriptionPaymentReconciliationJob();
    } catch (error) {
      logger.error({ err: error }, "Failed to reconcile captured subscription payments");
    }
  };
  schedule(reconcileSubscriptionPayments, 5 * 60 * 1000);

  // Check for long-paused chalets on startup and every hour
  stopPauseAlerts = startLongPauseAlertCheck();
}

const server = app.listen(port, "0.0.0.0", (error?: Error) => {
  // Express 5 invokes this callback on listen errors too. Never initialize
  // schedulers after a failed bind; the error listener handles pool cleanup.
  if (error) return;
  const initialization = initialize().catch(error => {
    logger.error({ err: error }, "Server initialization failed");
  });
  jobs.add(initialization);
  void initialization.finally(() => { jobs.delete(initialization); });
});
server.once("error", (error: NodeJS.ErrnoException) => {
  stopping = true;
  logger.error({ code: error.code, port }, "HTTP listener failed; check the hosting-assigned PORT and other processes");
  process.exitCode = 1;
  void pool.end().catch(() => undefined);
});

// Managed Node.js hosting sends SIGTERM during redeploy. Stop new work, drain
// HTTP and in-flight jobs, then close the pool instead of abandoning writes.
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Stopping server");
  for (const timer of timers) clearInterval(timer);
  const pauseAlertStopped = stopPauseAlerts?.();
  const deadline = setTimeout(() => {
    logger.error("Shutdown deadline exceeded; unfinished transactions require reconciliation");
    process.exit(1);
  }, 25000);
  deadline.unref();
  try {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeIdleConnections();
    });
    await pauseAlertStopped;
    await Promise.allSettled([...jobs]);
    await pool.end();
    clearTimeout(deadline);
    logger.info("Server stopped");
  } catch {
    logger.error("Graceful shutdown failed");
    process.exitCode = 1;
  }
}
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
