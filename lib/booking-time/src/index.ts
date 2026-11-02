export interface StayBooking {
  bookingDate: string;
  durationDays?: number | null;
  period?: string | null;
  /** Persisted Saudi departure instant. Null legacy records use calendar-end fallback. */
  checkoutAt?: string | Date | null;
}

export interface StayTimes {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  morningCheckIn?: string | null;
  morningCheckOut?: string | null;
  eveningCheckIn?: string | null;
  eveningCheckOut?: string | null;
  fullDayCheckIn?: string | null;
  fullDayCheckOut?: string | null;
}

export const REVIEW_NOT_READY_MESSAGE = "رابط التقييم سيكون متاحاً بعد اكتمال إقامتكم في العقار";
export const INSURANCE_NOT_READY_MESSAGE = "يمكن إرجاع التأمين أو خصم التلفيات بعد انتهاء الإقامة وموعد المغادرة فقط";

/** Stored Arabic 12-hour times and HH:mm values are both supported. */
export function timeMinutes(value?: string | null): number | null {
  const text = (value ?? "").trim()
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm)?$/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minutes = Number(match[2] ?? 0), marker = match[3]?.toLowerCase();
  if (minutes > 59 || hour > (marker ? 12 : 23) || (marker && hour < 1)) return null;
  if (marker) hour = hour % 12 + (marker === "م" || marker === "pm" ? 12 : 0);
  return hour * 60 + minutes;
}

/** Absolute check-out in Saudi time, independent of the server/browser timezone.
 * Duration counts occupied dates. A check-out at/before check-in is next morning.
 * Missing times conservatively keep the final occupied date active until midnight. */
export function bookingCheckoutAt(booking: StayBooking, times?: StayTimes | null): number {
  if (booking.checkoutAt != null) {
    const pinned = booking.checkoutAt instanceof Date ? booking.checkoutAt.getTime() : Date.parse(booking.checkoutAt);
    return Number.isFinite(pinned) ? pinned : Number.POSITIVE_INFINITY;
  }
  // A persisted legacy record must never start following today's property schedule.
  if ("checkoutAt" in booking) return bookingCalendarEndAt(booking);
  const day = Date.parse(`${booking.bookingDate.slice(0, 10)}T00:00:00+03:00`);
  if (!Number.isFinite(day)) return Number.POSITIVE_INFINITY;
  const duration = Math.max(1, Math.trunc(booking.durationDays ?? 1));
  if (!Number.isFinite(duration)) return Number.POSITIVE_INFINITY;
  const prefix = booking.period === "morning" ? "morning"
    : booking.period === "evening" ? "evening" : "fullDay";
  const checkIn = timeMinutes(times?.[`${prefix}CheckIn`] || times?.checkInTime);
  const checkOut = timeMinutes(times?.[`${prefix}CheckOut`] || times?.checkOutTime);
  if (checkOut === null) return day + duration * 86400000;
  // Unknown arrival time: early full-day/evening departures are next-day.
  const overnight = checkIn !== null ? checkOut <= checkIn
    : prefix !== "morning" && checkOut < 12 * 60;
  return day + (duration - 1 + Number(overnight)) * 86400000 + checkOut * 60000;
}

export function isStayComplete(booking: StayBooking, times?: StayTimes | null, now = Date.now()): boolean {
  return now >= bookingCheckoutAt(booking, times);
}

/** List/archive classification uses whole occupied Saudi dates, not check-out hours.
 * A duration of N occupies the start date through start + N - 1, inclusive. */
export function bookingCalendarEndAt(booking: StayBooking): number {
  const date = booking.bookingDate?.slice(0, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.POSITIVE_INFINITY;
  const utcDay = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(utcDay) || new Date(utcDay).toISOString().slice(0, 10) !== date) return Number.POSITIVE_INFINITY;
  const duration = Math.max(1, Math.trunc(booking.durationDays ?? 1));
  if (!Number.isFinite(duration)) return Number.POSITIVE_INFINITY;
  return utcDay - 3 * 60 * 60 * 1000 + duration * 86400000;
}

export function isBookingCalendarComplete(booking: StayBooking, now = Date.now()): boolean {
  return now >= bookingCalendarEndAt(booking);
}
