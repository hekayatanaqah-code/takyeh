import app from "./app";
import { logger } from "./lib/logger";
import { seedCatalogIfEmpty } from "./lib/seed-catalog";
import { runSubscriptionExpiryJob } from "./routes/admin";
import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable, ownerBookingsTable, ownerNotificationSettingsTable, ownerNotificationsTable } from "@workspace/db/schema";
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

const DEFAULT_ARRIVAL_REMINDER_TEMPLATE = "تذكير ودي يا {guest_name}: موعد وصولك إلى {property_name} بتاريخ {booking_date}. الموقع: {location_link}";

function normalizeWhatsAppPhone(phone?: string | null): string {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `966${digits}`;
  return digits;
}

function applyWhatsAppTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(guest_name|property_name|booking_date|location_link|total_price|change_reason)\}/g, (_, key: string) => values[key] ?? "");
}

async function sendOwnerWhatsAppMessage(instanceId: string, token: string, to: string, body: string): Promise<boolean> {
  const response = await fetch(`https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, to, body }),
  });
  return response.ok;
}

async function getBookingReminderValues(booking: typeof ownerBookingsTable.$inferSelect) {
  let chaletName = "شاليهك";
  let locationLink = "";
  if (booking.submissionId) {
    const [chalet] = await db
      .select({ nameAr: chaletsTable.nameAr, mapsUrl: chaletsTable.mapsUrl })
      .from(chaletsTable)
      .where(eq(chaletsTable.submissionId, booking.submissionId))
      .limit(1);
    if (chalet) {
      chaletName = chalet.nameAr;
      locationLink = chalet.mapsUrl ?? "";
    } else {
      const [sub] = await db
        .select({ nameAr: chaletSubmissionsTable.nameAr, mapsUrl: chaletSubmissionsTable.mapsUrl })
        .from(chaletSubmissionsTable)
        .where(eq(chaletSubmissionsTable.id, booking.submissionId))
        .limit(1);
      if (sub) {
        chaletName = sub.nameAr;
        locationLink = sub.mapsUrl ?? "";
      }
    }
  }
  return {
    guest_name: booking.clientName,
    property_name: chaletName,
    booking_date: booking.bookingDate,
    location_link: locationLink || "سيتم إرسال الموقع من المالك",
    total_price: booking.totalPrice ? String(Math.round(Number(booking.totalPrice))) : "غير محدد",
    change_reason: "تذكير بموعد الوصول",
  };
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

      const [settings] = await db
        .select()
        .from(ownerNotificationSettingsTable)
        .where(eq(ownerNotificationSettingsTable.ownerId, booking.ownerId))
        .limit(1);
      const offsetHours = settings?.arrivalReminderEnabled ? settings.arrivalReminderOffsetHours ?? 24 : 24;
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
        if (
          settings?.waEnabled &&
          settings.arrivalReminderEnabled &&
          settings.waInstanceId &&
          settings.waToken &&
          booking.clientPhone
        ) {
          const phone = normalizeWhatsAppPhone(booking.clientPhone);
          if (phone) {
            const values = await getBookingReminderValues(booking);
            const body = applyWhatsAppTemplate(settings.arrivalReminderTemplate || DEFAULT_ARRIVAL_REMINDER_TEMPLATE, values);
            await sendOwnerWhatsAppMessage(settings.waInstanceId, settings.waToken, phone, body);
          }
        }
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
    logger.info("Catalog seeded");
  } catch (e) {
    logger.error({ err: e }, "Failed to seed catalog");
  }

  // Run booking reminder check on startup and every 30 minutes
  sendBookingReminders();
  setInterval(sendBookingReminders, 30 * 60 * 1000);

  // Auto-deactivate expired subscriptions on startup and every hour
  runSubscriptionExpiryJob();
  setInterval(runSubscriptionExpiryJob, 60 * 60 * 1000);
});
