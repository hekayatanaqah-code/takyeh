import { formatDualDate } from "./hijri";

export type CustomerCalendar = "hijri" | "gregorian";

export function customerDates(value: string | null | undefined, preference: CustomerCalendar) {
  const dates = formatDualDate(value ?? "");
  if (!dates.hijri || !dates.gregorian) return null;
  const hijri = `${dates.hijri.replace(/\s*هـ\s*$/, "")} هـ`;
  const gregorian = `${dates.gregorian.replace(/\s*م\s*$/, "")} م`;
  return preference === "gregorian" ? [gregorian, hijri] : [hijri, gregorian];
}
