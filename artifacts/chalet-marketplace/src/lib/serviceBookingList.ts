export const SERVICE_BOOKINGS_PER_PAGE = 10;

export interface ScheduledServiceBooking {
  id: number;
  dateStr: string;
  startTime?: string | null;
}

/** Upcoming dates nearest first, followed by past dates newest first; no source mutation. */
export function sortServiceBookings<T extends ScheduledServiceBooking>(bookings: readonly T[], today: string): T[] {
  return [...bookings].sort((a, b) => {
    const aValid = /^\d{4}-\d{2}-\d{2}$/.test(a.dateStr ?? "");
    const bValid = /^\d{4}-\d{2}-\d{2}$/.test(b.dateStr ?? "");
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (!aValid && !bValid) return b.id - a.id;
    const aUpcoming = aValid && a.dateStr >= today;
    const bUpcoming = bValid && b.dateStr >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    const dateOrder = aUpcoming ? a.dateStr.localeCompare(b.dateStr) : b.dateStr.localeCompare(a.dateStr);
    if (dateOrder) return dateOrder;
    // Known appointment times precede unspecified times on the same day.
    if (!!a.startTime !== !!b.startTime) return a.startTime ? -1 : 1;
    const timeOrder = aUpcoming
      ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
      : (b.startTime ?? "").localeCompare(a.startTime ?? "");
    return timeOrder || b.id - a.id;
  });
}

export function serviceBookingPage<T>(bookings: readonly T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(bookings.length / SERVICE_BOOKINGS_PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, Math.floor(requestedPage) || 1));
  return {
    page,
    totalPages,
    items: bookings.slice((page - 1) * SERVICE_BOOKINGS_PER_PAGE, page * SERVICE_BOOKINGS_PER_PAGE),
  };
}
