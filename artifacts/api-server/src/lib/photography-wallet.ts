import { db, photographyBookingsTable, photographyDeliveriesTable, photographersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { debitOwnerWallet } from "./owner-wallet";
import type { PhotographyTx } from "./photography-allocation";

/** Caller locks allocation + booking and verifies ownership and enabled service.
 * Kept separate so the money transaction can be verified without opening the live service.
 */
export async function confirmPhotographyWalletPayment(tx: PhotographyTx, b: typeof photographyBookingsTable.$inferSelect) {
  if (b.paymentMethod === "wallet" && b.paymentId === `wallet:photography:${b.id}`) return b;
  if (b.status !== "awaiting_payment" || +b.expiresAt <= Date.now()) throw new Error("expired");
  if (b.invoiceId || b.paymentUrl) throw new Error("wallet_invoice_active");
  await debitOwnerWallet(tx, b.ownerId, b.priceHalalas, `photo-payment:${b.id}`, `حجز تصوير رقم ${b.id} — ${b.packageName}`);
  const [confirmed] = await tx.update(photographyBookingsTable).set({
    paymentId: `wallet:photography:${b.id}`, paymentMethod: "wallet", status: "confirmed", financialStatus: "paid",
  }).where(eq(photographyBookingsTable.id, b.id)).returning();
  await tx.update(photographersTable).set({ confirmedAssignments: sql`${photographersTable.confirmedAssignments} + 1` }).where(eq(photographersTable.id, b.photographerId));
  for (const [role, recipient] of [["owner", b.ownerPhone], ["photographer", b.photographerPhone]]) {
    await tx.insert(photographyDeliveriesTable).values({
      dedupeKey: `booking:${b.id}:${role}`, bookingId: b.id, recipient, kind: "booking",
      ...(role === "photographer" ? { photographerId: b.photographerId } : {}),
      parameters: [b.propertyName, b.packageName, b.startAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }), String(b.id)],
    }).onConflictDoNothing({ target: photographyDeliveriesTable.dedupeKey });
  }
  return confirmed;
}
