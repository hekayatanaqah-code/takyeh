type BookingProperty = { id: number | string };

/** Submission IDs, not published chalet IDs, are sent when creating a booking. */
export function resolveManualBookingProperty(
  properties: BookingProperty[],
  current = "",
  prefilled?: string | null,
): string {
  if (properties.length === 1) return String(properties[0].id);
  const contains = (id?: string | null) => !!id && properties.some(property => String(property.id) === id);
  if (contains(current)) return current;
  if (contains(prefilled)) return prefilled!;
  return "";
}
