export type PropertyPaymentFilter = "all" | "unpaid" | "paid";

type PaymentBooking = {
  totalPrice?: string | number | null;
  depositPaid?: string | number | null;
  balanceCollected?: boolean | null;
};

/** Refundable insurance is not part of rent settlement. Unknown prices are not fake zeros. */
export function propertyBookingPaymentStatus(booking: PaymentBooking): "paid" | "unpaid" | "unknown" {
  if (booking.balanceCollected === true) return "paid";
  if (booking.totalPrice == null || booking.totalPrice === "") return "unknown";
  const total = Number(booking.totalPrice);
  const deposit = Number(booking.depositPaid ?? 0);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(deposit)) return "unknown";
  return Math.round(total * 100) <= Math.round(deposit * 100) ? "paid" : "unpaid";
}

export function matchesPropertyPaymentFilter(booking: PaymentBooking, filter: PropertyPaymentFilter) {
  return filter === "all" || propertyBookingPaymentStatus(booking) === filter;
}

/** Calendar-day preparation alert, explicitly today/tomorrow in Saudi time (not device time). */
export function propertyBookingArrival(bookingDate: string, now: number): "today" | "tomorrow" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !Number.isFinite(now)) return null;
  const saudiNow = now + 3 * 60 * 60 * 1000;
  if (bookingDate === new Date(saudiNow).toISOString().slice(0, 10)) return "today";
  if (bookingDate === new Date(saudiNow + 86400000).toISOString().slice(0, 10)) return "tomorrow";
  return null;
}
