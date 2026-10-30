import { bookingCalendarEndAt, isBookingCalendarComplete } from "@workspace/booking-time";
import { matchesPropertyPaymentFilter, type PropertyPaymentFilter } from "./propertyBookingStatus";

export type OperationalServiceBooking = {
  id: number;
  dateStr: string;
  duration?: string | number | null;
  durationUnit?: string | null;
  status?: string | null;
  amount?: string | number | null;
  deposit?: string | number | null;
};
export type ServiceBookingScope = "active" | "completed" | "cancelled";

function calendarBooking(booking: OperationalServiceBooking) {
  const duration = Number(booking.duration);
  return {
    bookingDate: booking.dateStr,
    durationDays: booking.durationUnit === "days" && Number.isFinite(duration) && duration > 0 ? Math.ceil(duration) : 1,
  };
}

export function serviceBookingComplete(booking: OperationalServiceBooking, now: number) {
  return isBookingCalendarComplete(calendarBooking(booking), now);
}

/** One identity per occupied day, including stays crossing months and years. */
export function serviceCalendarBookings<T extends OperationalServiceBooking>(bookings: T[]) {
  const days = new Map<string, T[]>();
  for (const booking of bookings) {
    const normalized = calendarBooking(booking);
    const end = bookingCalendarEndAt(normalized);
    if (!Number.isFinite(end)) continue;
    const start = end - normalized.durationDays * 86400000;
    for (let i = 0; i < normalized.durationDays; i++) {
      const day = new Date(start + i * 86400000 + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (!days.has(day)) days.set(day, []);
      days.get(day)!.push(booking);
    }
  }
  return days;
}

export function serviceBookingMatches(
  booking: OperationalServiceBooking, scope: ServiceBookingScope,
  status: "all" | "confirmed" | "pending", payment: PropertyPaymentFilter, now: number,
) {
  if (scope === "cancelled") {
    if (booking.status !== "cancelled") return false;
  } else {
    if (booking.status === "cancelled" || serviceBookingComplete(booking, now) !== (scope === "completed")) return false;
    if (status !== "all" && booking.status !== status) return false;
  }
  // Service deposit already contains cumulative service collections, never the refundable insurance.
  return matchesPropertyPaymentFilter({ totalPrice: booking.amount, depositPaid: booking.deposit }, payment);
}
