import { db, photographyBookingsTable, photographyRefundsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { lockPhotographyAllocation, type PhotographyTx } from "./photography-allocation";
import { creditOwnerWallet } from "./owner-wallet";
import { publishPhotographyBooking } from "./photography-events";

export const photographyRefundSchema = z.object({
  requestKey: z.string().uuid(), amountHalalas: z.number().int().positive().max(2147483647),
  destination: z.enum(["card", "wallet"]), reason: z.string().trim().min(1).max(2000),
}).strict();
type Refund = typeof photographyRefundsTable.$inferSelect;
type Booking = typeof photographyBookingsTable.$inferSelect;
type ProviderPayment = { id?: string; amount?: number; currency?: string; invoice_id?: string; status?: string; refunded?: number };
export async function moyasarRefundApi(path: string, amount?: number): Promise<ProviderPayment> {
  if (!process.env.MOYASAR_SECRET_KEY) throw new Error("refund_provider_unconfigured");
  const response = await fetch(`https://api.moyasar.com/v1/payments/${path}`, {
    method: amount === undefined ? "GET" : "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString("base64")}`, "Content-Type": "application/json" },
    ...(amount === undefined ? {} : { body: JSON.stringify({ amount }) }),
  });
  if (!response.ok) {
    const error = new Error("refund_provider_failed") as Error & { definitive?: boolean };
    error.definitive = response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status);
    throw error;
  }
  return await response.json() as ProviderPayment;
}
function verifiedPayment(p: ProviderPayment, b: Booking) {
  return p.id === b.paymentId && p.amount === b.priceHalalas && p.currency === "SAR"
    && (!b.invoiceId || p.invoice_id === b.invoiceId) && ["paid", "captured", "refunded"].includes(p.status ?? "")
    && Number.isSafeInteger(p.refunded) && p.refunded! >= 0 && p.refunded! <= b.priceHalalas;
}
async function finishRefund(tx: PhotographyTx, refund: Refund, booking: Booking) {
  if (refund.destination === "wallet") await creditOwnerWallet(tx, refund.ownerId, refund.amountHalalas, `photo-refund:${refund.id}`, `استرداد جلسة التصوير رقم ${booking.id}`);
  await tx.update(photographyRefundsTable).set({ status: "succeeded", completedAt: new Date(), error: null }).where(eq(photographyRefundsTable.id, refund.id));
  const refundedHalalas = booking.refundedHalalas + refund.amountHalalas;
  await tx.update(photographyBookingsTable).set({
    refundedHalalas, financialStatus: refundedHalalas === booking.priceHalalas ? "refunded" : "partially_refunded",
  }).where(eq(photographyBookingsTable.id, booking.id));
}
export async function requestPhotographyRefund(bookingId: number, adminId: string, input: z.infer<typeof photographyRefundSchema>, provider = moyasarRefundApi) {
  const refund = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [existing] = await tx.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.requestKey, input.requestKey));
    if (existing) {
      if (existing.bookingId !== bookingId || existing.amountHalalas !== input.amountHalalas || existing.destination !== input.destination) throw new Error("refund_duplicate");
      return existing;
    }
    const [booking] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, bookingId)).for("update");
    if (!booking || !booking.paymentId || !["confirmed", "completed", "cancelled"].includes(booking.status)
      || input.amountHalalas > booking.priceHalalas - booking.refundedHalalas) throw new Error("refund_amount");
    const [pending] = await tx.select().from(photographyRefundsTable).where(and(eq(photographyRefundsTable.bookingId, bookingId), eq(photographyRefundsTable.status, "pending")));
    if (pending) throw new Error("refund_pending");
    if (input.destination === "card" && (booking.paymentMethod === "wallet" || !booking.paymentId || !/^[0-9a-f-]{36}$/i.test(booking.paymentId))) throw new Error("refund_card_unavailable");
    const [row] = await tx.insert(photographyRefundsTable).values({ ...input, bookingId, ownerId: booking.ownerId, requestedBy: adminId }).returning();
    await tx.update(photographyBookingsTable).set({
      status: booking.deliveredAt ? booking.status : "cancelled", financialStatus: "refund_pending",
    }).where(eq(photographyBookingsTable.id, bookingId));
    if (input.destination === "wallet") await finishRefund(tx, row, booking);
    return row;
  });
  if (refund.destination === "card" && refund.status === "pending") await reconcilePhotographyRefund(refund.id, provider);
  const [updated] = await db.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, refund.id));
  const [book] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, refund.bookingId));
  publishPhotographyBooking(book.photographerId, book.id);
  return { refund: updated };
}
/** Persist an attempt BEFORE POST. An uncertain response is polled, NEVER blindly resubmitted. */
export async function reconcilePhotographyRefund(id: number, provider = moyasarRefundApi) {
  const snapshot = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [r] = await tx.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, id)).for("update");
    if (!r) throw new Error("refund_missing");
    const [b] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, r.bookingId));
    const [prior] = await tx.select({ amount: sql<number>`coalesce(sum(${photographyRefundsTable.amountHalalas}),0)::integer` }).from(photographyRefundsTable)
      .where(and(eq(photographyRefundsTable.bookingId, b.id), eq(photographyRefundsTable.status, "succeeded"), eq(photographyRefundsTable.destination, "card")));
    return { r, b, prior: prior.amount };
  });
  if (snapshot.r.status !== "pending" || snapshot.r.destination !== "card") return { refund: snapshot.r };
  let posting = false;
  try {
    const path = encodeURIComponent(snapshot.b.paymentId!);
    let payment = await provider(path);
    if (!verifiedPayment(payment, snapshot.b)) throw new Error("refund_payment_mismatch");
    const expected = snapshot.prior + snapshot.r.amountHalalas;
    if (payment.refunded === snapshot.prior && !snapshot.r.attemptedAt) {
      const shouldPost = await db.transaction(async tx => {
        await lockPhotographyAllocation(tx);
        const [row] = await tx.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, id)).for("update");
        if (row.status !== "pending" || row.attemptedAt) return false;
        await tx.update(photographyRefundsTable).set({ attemptedAt: new Date() }).where(eq(photographyRefundsTable.id, id));
        return true;
      });
      if (shouldPost) { posting = true; payment = await provider(`${path}/refund`, snapshot.r.amountHalalas); }
    }
    if (!verifiedPayment(payment, snapshot.b) || payment.refunded !== expected) throw new Error("refund_confirmation_pending");
    await db.transaction(async tx => {
      await lockPhotographyAllocation(tx);
      const [r] = await tx.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, id)).for("update");
      if (r.status !== "pending") return;
      const [b] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, r.bookingId)).for("update");
      await finishRefund(tx, r, b);
    });
  } catch (error) {
    await db.transaction(async tx => {
      await lockPhotographyAllocation(tx);
      const [row] = await tx.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, id)).for("update");
      if (row.status !== "pending") return;
      // A failed GET after an earlier uncertain POST is NOT evidence that no
      // refund occurred. Keep the reservation until the provider confirms it.
      const definitive = (error as Error & { definitive?: boolean }).definitive === true
        && (posting || row.attemptedAt === null);
      await tx.update(photographyRefundsTable).set({
        status: definitive ? "failed" : "pending",
        error: definitive ? "رفض ميسر طلب الاسترداد؛ راجع العملية قبل إنشاء طلب جديد" : "لم يتأكد الاسترداد بعد؛ تحقق من الحالة دون تكرار الطلب",
      }).where(eq(photographyRefundsTable.id, id));
      if (definitive) await tx.update(photographyBookingsTable).set({ financialStatus: "refund_failed" }).where(eq(photographyBookingsTable.id, row.bookingId));
    });
  }
  const [refund] = await db.select().from(photographyRefundsTable).where(eq(photographyRefundsTable.id, id));
  return { refund };
}
