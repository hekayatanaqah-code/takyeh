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
    const gregorian = d.toLocaleDateString("ar-SA");
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
    return `${gregorian} — ${hijri}`;
  } catch {
    return "";
  }
}
