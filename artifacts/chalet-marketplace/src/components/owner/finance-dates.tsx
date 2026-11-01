


/* ── Revenue Tab ─────────────────────────────── */
/* ── Hijri month helpers ── */
function getHijriMonthKey(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long", year: "numeric" }).format(new Date(dateStr + "T12:00:00"));
  } catch { return ""; }
}

const HIJRI_MONTH_NAMES_AR = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

export function getHijriYMClient(date: Date): { year: number; month: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric" }).formatToParts(date);
    return {
      year:  Number(parts.find(p => p.type === "year")?.value  ?? 0),
      month: Number(parts.find(p => p.type === "month")?.value ?? 0),
    };
  } catch { return { year: 0, month: 0 }; }
}
