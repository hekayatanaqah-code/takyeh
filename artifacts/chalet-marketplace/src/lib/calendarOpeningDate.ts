/** Choose a navigation anchor without changing the selected date. Bounds are inclusive. */
export function calendarOpeningDate(today: string, initialDate?: string, minDate?: string, maxDate?: string): string {
  const anchor = initialDate || today;
  if (minDate && anchor < minDate) return minDate;
  if (maxDate && anchor > maxDate) return maxDate;
  return anchor;
}

/** Switch views using a real Gregorian day, never re-use a year number in another era. */
export function calendarSwitchDate(
  selectedDate: string,
  visibleDates: string[],
  today: string,
  minDate?: string,
  maxDate?: string,
): string {
  const anchor = visibleDates.includes(selectedDate) ? selectedDate : visibleDates[0] || today;
  return calendarOpeningDate(today, anchor, minDate, maxDate);
}
