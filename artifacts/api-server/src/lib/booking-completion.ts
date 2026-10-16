import { db, chaletsTable, chaletSubmissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isStayComplete, type StayBooking, type StayTimes } from "@workspace/booking-time";

/** Read current property times by the booking's own property, never UI selection. */
export async function propertyStayComplete(booking: StayBooking & { submissionId: number | null }): Promise<boolean> {
  if (!booking.submissionId) return isStayComplete(booking);
  const [live] = await db.select().from(chaletsTable)
    .where(eq(chaletsTable.submissionId, booking.submissionId)).limit(1);
  let times: StayTimes | undefined = live;
  if (!live) {
    const [submission] = await db.select().from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, booking.submissionId)).limit(1);
    times = submission;
  }
  return isStayComplete(booking, times);
}
