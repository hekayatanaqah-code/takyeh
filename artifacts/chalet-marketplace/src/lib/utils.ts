import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * toAr — converts every Western digit (0-9) in a string to its
 * Arabic-Indic equivalent (٠-٩). Accepts a string or number.
 * Safe to call on already-converted strings.
 */
export function toAr(v: string | number | null | undefined): string {
  if (v == null) return "";
  const digits = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
  return String(v).replace(/[0-9]/g, d => digits[+d]);
}

/**
 * fromAr — converts Arabic-Indic digits (٠-٩) back to Western digits (0-9).
 * Safe to call on strings that already contain Western digits.
 * Use this in onChange handlers paired with toAr() on the value prop.
 */
export function fromAr(v: string): string {
  return v
    .replace(/٠/g, "0").replace(/١/g, "1").replace(/٢/g, "2")
    .replace(/٣/g, "3").replace(/٤/g, "4").replace(/٥/g, "5")
    .replace(/٦/g, "6").replace(/٧/g, "7").replace(/٨/g, "8")
    .replace(/٩/g, "9");
}

/**
 * hijriAndGregorian — formats a date as:
 * "١٢ ذو القعدة ١٤٤٧ هـ | ١ مايو ٢٠٢٦ م"
 *
 * Uses the browser's built-in Intl API with calendar: 'islamic-umalqura'.
 */
export function hijriAndGregorian(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const locale = "ar-SA";
  const hijri = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    calendar: "islamic-umalqura",
  } as Intl.DateTimeFormatOptions).format(d);
  const gregorian = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  return `${hijri} | ${gregorian} م`;
}

/**
 * arabicTimeTo24h — converts Arabic AM/PM time strings stored in the DB
 * (e.g. "٦ ص", "٤ م", "١٢ م", "٤ص") to HH:MM 24-hour format ("06:00", "16:00").
 * If the value is already HH:MM it is normalised and returned as-is.
 * Returns "" for null/empty/unrecognised input.
 */
export function arabicTimeTo24h(time: string | null | undefined): string {
  if (!time) return "";
  const s = fromAr(time.trim()); // convert Arabic-Indic digits → Western
  // Already HH:MM?
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  // Arabic 12-h: "6 ص", "6ص", "4 م", "4م"
  const match = s.match(/^(\d+)\s*([صم])$/);
  if (!match) return "";
  let h = parseInt(match[1]);
  const isPm = match[2] === "م";
  if (isPm)  { if (h !== 12) h += 12; }
  else        { if (h === 12) h  = 0; }  // 12 ص = midnight
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * time24hToArabic — converts HH:MM 24-hour format back to Arabic AM/PM
 * using Arabic-Indic numerals (e.g. "06:00" → "٦ ص", "16:00" → "٤ م").
 * If the value already contains ص/م it is returned unchanged.
 * Returns "" for null/empty/unrecognised input.
 */
export function time24hToArabic(time: string | null | undefined): string {
  if (!time) return "";
  if (/[صم]/.test(time)) return time.trim(); // already Arabic format
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time.trim();
  let h = parseInt(match[1]);
  const period = h < 12 ? "ص" : "م";
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  return toAr(displayH) + " " + period;
}

/**
 * hijriShort — short Hijri date: "١٢ / ١١ / ١٤٤٧ هـ"
 */
export function hijriShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  } as Intl.DateTimeFormatOptions).format(d) + " هـ";
}
