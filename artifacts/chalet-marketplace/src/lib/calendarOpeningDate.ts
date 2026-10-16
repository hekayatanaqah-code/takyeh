/** Choose a navigation anchor without changing the selected date. Bounds are inclusive. */
export function calendarOpeningDate(today: string, initialDate?: string, minDate?: string, maxDate?: string): string {
  const anchor = initialDate || today;
  if (minDate && anchor < minDate) return minDate;
  if (maxDate && anchor > maxDate) return maxDate;
  return anchor;
}
