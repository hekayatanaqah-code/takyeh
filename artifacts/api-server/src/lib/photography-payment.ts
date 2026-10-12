import { db, photographersTable, photographyBookingsTable, photographyDeliveriesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { deliverPhotographyMessage } from "./photography-delivery";
import { logger } from "./logger";
import { publishPhotographyBooking } from "./photography-events";
import { lockPhotographyAllocation } from "./photography-allocation";

type Invoice = {
  id: string; status: string; amount: number; currency: string; url: string;
  payments?: { id: string; status: string; amount: number; currency: string; refunded?: number; invoice_id: string }[];
};
export async function photographyInvoice(path: string, body?: object): Promise<Invoice> {
  const key = process.env.MOYASAR_SECRET_KEY;
  if (!key) throw new Error("payment_not_configured");
  const response = await fetch(`https://api.moyasar.com/v1/invoices${path}`, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error("payment_provider_unavailable");
  return await response.json() as Invoice;
}
/** Invoice identity is always loaded from our database, never accepted from browser/webhook claims. */
export async function reconcilePhotographyBooking(id: number, options: {
  fetchInvoice?: typeof photographyInvoice; deliverMessage?: typeof deliverPhotographyMessage;
} = {}) {
  const [initial] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, id));
  if (!initial?.invoiceId) throw new Error("invoice_missing");
  const invoice = await (options.fetchInvoice ?? photographyInvoice)(`/${encodeURIComponent(initial.invoiceId)}`);
  if (invoice.id !== initial.invoiceId || invoice.currency !== "SAR" || invoice.amount !== initial.priceHalalas) throw new Error("payment_mismatch");
  const paid = invoice.payments?.find(p => p.status === "paid" && p.invoice_id === invoice.id
    && p.currency === "SAR" && p.amount === initial.priceHalalas && !p.refunded);
  let newlyConfirmed = false;
  const result = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731220, ${initial.photographerId})`);
    const [booking] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, id)).for("update");
    if (!booking) throw new Error("booking_missing");
    if (booking.status === "confirmed" || booking.status === "completed") return booking;
    if (booking.status !== "awaiting_payment") return booking;
    if (invoice.status === "paid" && paid) {
      // Invoiced reservations are held until the provider reports a final state,
      // so payment made before invoice expiry remains safe even when reconciliation is delayed.
       const [confirmed] = await tx.update(photographyBookingsTable).set({ status: "confirmed", paymentId: paid.id, financialStatus: "paid" })
        .where(eq(photographyBookingsTable.id, id)).returning();
      newlyConfirmed = true;
      await tx.update(photographersTable).set({ confirmedAssignments: sql`${photographersTable.confirmedAssignments} + 1` })
        .where(eq(photographersTable.id, booking.photographerId));
      const localTime = booking.startAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" });
      for (const [role, recipient] of [["owner", booking.ownerPhone], ["photographer", booking.photographerPhone]]) {
        await tx.insert(photographyDeliveriesTable).values({
          dedupeKey: `booking:${id}:${role}`, bookingId: id, recipient, kind: "booking",
          ...(role === "photographer" ? { photographerId: booking.photographerId } : {}),
          parameters: [booking.propertyName, booking.packageName, localTime, String(booking.id)],
        }).onConflictDoNothing({ target: photographyDeliveriesTable.dedupeKey });
      }
      return confirmed;
    }
    if (["expired", "canceled", "voided", "refunded"].includes(invoice.status)) {
      const [expired] = await tx.update(photographyBookingsTable).set({ status: "expired" })
        .where(eq(photographyBookingsTable.id, id)).returning();
      return expired;
    }
    return booking;
  });
  if (newlyConfirmed) publishPhotographyBooking(result.photographerId, result.id);
  const messages = await db.select({ id: photographyDeliveriesTable.id }).from(photographyDeliveriesTable)
    .where(and(eq(photographyDeliveriesTable.bookingId, id), eq(photographyDeliveriesTable.status, "pending")));
  const notifications = await Promise.all(messages.map(m => (options.deliverMessage ?? deliverPhotographyMessage)(m.id)));
  return { booking: result, notifications };
}

/** Read-triggered catch-up avoids test timers and never releases an uncertain payment. */
export async function reconcileExpiredPhotographyInvoices(photographerId: number) {
  const rows = await db.select().from(photographyBookingsTable).where(and(
    eq(photographyBookingsTable.photographerId, photographerId),
    eq(photographyBookingsTable.status, "awaiting_payment"),
    sql`${photographyBookingsTable.invoiceId} IS NOT NULL AND ${photographyBookingsTable.expiresAt} < now()`,
  )).limit(20);
  for (const row of rows) {
    try { await reconcilePhotographyBooking(row.id); }
    catch { logger.warn({ bookingId: row.id }, "Photography invoice reconciliation deferred"); }
  }
}
