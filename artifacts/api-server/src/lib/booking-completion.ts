import { db, chaletsTable, chaletSubmissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { bookingCheckoutAt, isStayComplete, type StayBooking, type StayTimes } from "@workspace/booking-time";

/** Persisted bookings never consult mutable property schedules. */
export async function propertyStayComplete(booking: StayBooking & { submissionId: number | null }): Promise<boolean> {
  return isStayComplete({ ...booking, checkoutAt: booking.checkoutAt ?? null });
}

/** Only creation and actual rescheduling may capture the current property schedule.
 * Use the writing transaction so the pin and booking are saved together. */
export async function capturePropertyCheckout(
  booking: StayBooking & { submissionId?: number | null },
  tx: Pick<typeof db, "select">,
): Promise<Date> {
  const [live] = booking.submissionId ? await tx.select().from(chaletsTable)
    .where(eq(chaletsTable.submissionId, booking.submissionId)).limit(1)
    : [];
  let times: StayTimes | undefined = live;
  if (!live && booking.submissionId) {
    const [submission] = await tx.select().from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, booking.submissionId)).limit(1);
    times = submission;
  }
  const { checkoutAt: _previous, ...stay } = booking;
  const checkout = bookingCheckoutAt(stay, times);
  if (!Number.isFinite(checkout)) throw new Error("Invalid booking departure");
  return new Date(checkout);
}
