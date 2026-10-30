type CalendarBooking = {
  id: number;
  bookingDate: string;
  durationDays?: number | null;
  period?: string | null;
  clientName?: string | null;
  cancelledAt?: string | null;
};

/** Keep every booking, including equal periods on different properties. */
export function propertyCalendarBookingMap(bookings: CalendarBooking[]) {
  const days = new Map<string, Map<string, CalendarBooking[]>>();
  for (const booking of bookings) {
    if (!booking.bookingDate || booking.cancelledAt) continue;
    const [year, month, day] = booking.bookingDate.split("-").map(Number);
    const duration = Math.max(1, booking.durationDays ?? 1);
    // Legacy/unspecified periods still occupy the day, just as in the booking list.
    const period = booking.period === "morning" || booking.period === "evening" ? booking.period : "full_day";
    for (let offset = 0; offset < duration; offset++) {
      const date = new Date(year, month - 1, day + offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      if (!days.has(key)) days.set(key, new Map());
      const periods = days.get(key)!;
      if (!periods.has(period)) periods.set(period, []);
      periods.get(period)!.push(booking);
    }
  }
  return days;
}

export type PropertyCalendarRow = { label: string; guest: string; amber: boolean; cleaning?: boolean; period?: string; bookingId?: number };

export function propertyCalendarRows(
  bookings: Map<string, CalendarBooking[]> | undefined,
  availability?: { periodMorning?: boolean; periodEvening?: boolean; periodFullDay?: boolean; notes?: string | null },
): PropertyCalendarRow[] {
  const rows: PropertyCalendarRow[] = [];
  const labels: Record<string, string> = { full_day: "يوم كامل", morning: "صباحي", evening: "مسائي" };
  for (const [period, entries] of bookings ?? []) {
    for (const booking of entries) {
      rows.push({ label: labels[period] ?? "يوم كامل", guest: booking.clientName?.trim().split(/\s+/)[0] ?? "", amber: period !== "full_day", bookingId: booking.id });
    }
  }
  // Availability is a blocking mirror, not a replacement for booking records.
  if (availability?.notes && !rows.length) return rows;
  if (availability?.periodFullDay && !bookings?.has("full_day")) {
    rows.push({ label: "🔒 يوم كامل", guest: "", amber: false });
  } else if (!availability?.periodFullDay && !bookings?.has("full_day")) {
    if (availability?.periodMorning && !bookings?.has("morning")) rows.push({ label: "🔒 صباحي", guest: "", amber: true });
    if (availability?.periodEvening && !bookings?.has("evening")) rows.push({ label: "🔒 مسائي", guest: "", amber: true });
  }
  return rows;
}
