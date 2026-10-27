/* ── Arabic Hijri month names (Umm al-Qura) ── */
export const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
] as const;

/*
 * Use Latin digits for machine-readable parts. WebKit can return an Arabic
 * month name even when `month: "numeric"` is requested with the ar-SA locale,
 * which previously converted to 0 and emptied the Hijri day grid.
 */
const _hijriComponentsFmt = new Intl.DateTimeFormat(
  "en-US-u-ca-islamic-umalqura-nu-latn",
  { year: "numeric", month: "numeric", day: "numeric" },
);

/** Convert Arabic-Indic digit string (e.g. "١٤٤٦") to a plain integer. */
function _arToInt(s: string): number {
  const ascii = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return parseInt(ascii, 10) || 0;
}

function _readHijriParts(date: Date): { year: number; month: number; day: number } {
  const parts = _hijriComponentsFmt.formatToParts(date);
  const get = (type: string) =>
    _arToInt(parts.find((part) => part.type === type)?.value ?? "0");
  const result = { year: get("year"), month: get("month"), day: get("day") };

  if (
    result.year < 1 ||
    result.month < 1 ||
    result.month > 12 ||
    result.day < 1 ||
    result.day > 30
  ) {
    throw new RangeError("Intl returned invalid Umm al-Qura date parts");
  }

  return result;
}

/** Extract Hijri year / month / day from a Gregorian Date (Umm al-Qura). */
export function toHijriComponents(date: Date): { year: number; month: number; day: number } {
  const safeDate = date && !isNaN(date.getTime()) ? date : new Date();
  return _readHijriParts(safeDate);
}

/** Approximate Gregorian Date for the start of a Hijri month (scanning seed, ±5 days). */
function _hijriApproxGregorian(hy: number, hm: number): Date {
  /* Islamic calendar epoch: July 19, 622 CE (Gregorian) */
  const epochMs = Date.UTC(622, 6, 19);
  const days = (hy - 1) * 354.36707 + (hm - 1) * 29.53059;
  return new Date(epochMs + days * 86400000);
}

/** Format a Date as "YYYY-MM-DD" Gregorian string. */
export function toGregorianStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Returns all Gregorian days that fall within the given Hijri month (Umm al-Qura).
 * Each entry carries the corresponding Hijri day number.
 */
export function getHijriMonthDays(
  hy: number,
  hm: number,
): Array<{ date: Date; hijriDay: number }> {
  const estimate = _hijriApproxGregorian(hy, hm);
  const cursor = new Date(estimate);
  cursor.setDate(cursor.getDate() - 6); /* start a bit before the estimate */

  const result: Array<{ date: Date; hijriDay: number }> = [];
  for (let i = 0; i < 65; i++) {
    const h = toHijriComponents(cursor);
    if (h.year === hy && h.month === hm) {
      result.push({ date: new Date(cursor), hijriDay: h.day });
    } else if (result.length > 0) {
      break; /* past end of this Hijri month */
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Navigate one Hijri month backward. */
export function prevHijriMonth(hy: number, hm: number): { year: number; month: number } {
  return hm === 1 ? { year: hy - 1, month: 12 } : { year: hy, month: hm - 1 };
}

/** Navigate one Hijri month forward. */
export function nextHijriMonth(hy: number, hm: number): { year: number; month: number } {
  return hm === 12 ? { year: hy + 1, month: 1 } : { year: hy, month: hm + 1 };
}

/** Gregorian date range (start/end strings) that a Hijri month spans. */
export function getHijriMonthGregorianRange(
  hy: number,
  hm: number,
): { start: string; end: string } {
  const days = getHijriMonthDays(hy, hm);
  if (days.length === 0) return { start: "", end: "" };
  return {
    start: toGregorianStr(days[0].date),
    end: toGregorianStr(days[days.length - 1].date),
  };
}

/* ── Legacy exports (kept for existing consumers) ── */

export function toHijri(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T00:00:00");
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

/** Intl's Arabic Hijri dates may already include the era suffix. */
export function withHijriEra(label: string): string {
  const base = label.replace(/(?:[\s\u200e\u200f\u061c]*هـ)+[\s\u200e\u200f\u061c]*$/u, "").trim();
  return base ? `${base} هـ` : "";
}

export function formatDualDate(dateStr: string): { gregorian: string; hijri: string } {
  if (!dateStr) return { gregorian: "", hijri: "" };
  try {
    const date = new Date(dateStr + "T00:00:00");
    if (isNaN(date.getTime())) return { gregorian: "", hijri: "" };
    const gregorian = new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      calendar: "gregory",
    }).format(date);
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
    return { gregorian, hijri };
  } catch {
    return { gregorian: "", hijri: "" };
  }
}

export function formatDateWithHijri(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (isNaN(d.getTime())) return "";
    const gregorian = d.toLocaleDateString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" });
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Riyadh",
    }).format(d);
    return `${hijri} — ${gregorian} م`;
  } catch {
    return "";
  }
}
