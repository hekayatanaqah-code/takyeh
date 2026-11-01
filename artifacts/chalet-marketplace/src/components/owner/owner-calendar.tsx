import { HIJRI_MONTHS_AR, toHijriComponents, getHijriMonthGregorianRange } from "@/lib/hijri";
import { toArN } from "@/components/owner/owner-formatting";


export function getLocalDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const GREGORIAN_MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"] as const;

export function getCalCorrespondenceHint(monthKey: string, calType: "hijri" | "gregorian"): string {
  const [ys, ms] = monthKey.split("-").map(Number);
  if (!ys || !ms) return "";
  const gregName = (gy: number, gm: number) =>
    new Date(gy, gm, 15).toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
  if (calType === "hijri") {
    let s: Date | null = null, e: Date | null = null;
    const { start, end } = getHijriMonthGregorianRange(ys, ms);
    if (start && end) {
      s = new Date(start + "T00:00:00");
      e = new Date(end + "T00:00:00");
    } else {
      const epochMs = Date.UTC(622, 6, 19);
      const days = (ys - 1) * 354.36707 + (ms - 1) * 29.53059;
      const estimate = new Date(epochMs + days * 86400000);
      const cursor = new Date(estimate);
      cursor.setDate(cursor.getDate() - 15);
      for (let i = 0; i < 90; i++) {
        const h = toHijriComponents(cursor);
        if (h.year === ys && h.month === ms) { if (!s) s = new Date(cursor); e = new Date(cursor); }
        else if (s) break;
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    if (!s || !e) return "";
    const [sY, sM, eY, eM] = [s.getFullYear(), s.getMonth(), e.getFullYear(), e.getMonth()];
    if (sY === eY && sM === eM) return `يوافق: ${gregName(sY, sM)} ${toArN(sY)} م`;
    if (sY === eY) return `يوافق: ${gregName(sY, sM)} / ${gregName(eY, eM)} ${toArN(sY)} م`;
    return `يوافق: ${gregName(sY, sM)} ${toArN(sY)} م / ${gregName(eY, eM)} ${toArN(eY)} م`;
  } else {
    const h1 = toHijriComponents(new Date(ys, ms - 1, 1));
    const h2 = toHijriComponents(new Date(ys, ms, 0));
    if (h1.year === h2.year && h1.month === h2.month)
      return `يوافق: ${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} هـ`;
    if (h1.year === h2.year)
      return `يوافق: ${HIJRI_MONTHS_AR[h1.month - 1]} / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h1.year)} هـ`;
    return `يوافق: ${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} هـ / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h2.year)} هـ`;
  }
}

const calHintStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#888888",
  fontSize: "11px",
  background: "#f5f5f5",
  borderRadius: "8px",
  padding: "2px 10px",
  direction: "rtl",
  marginTop: "6px",
};

export function getBookingMonthKey(dateStr: string | null | undefined, calView: "hijri" | "gregorian"): string {
  if (!dateStr) {
    const today = new Date();
    if (calView === "gregorian") return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const h = toHijriComponents(today);
    return `${h.year}-${String(h.month).padStart(2, "0")}`;
  }
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(d.getTime())) {
    const today = new Date();
    if (calView === "gregorian") return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const h = toHijriComponents(today);
    return `${h.year}-${String(h.month).padStart(2, "0")}`;
  }
  if (calView === "gregorian") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const h = toHijriComponents(d);
  return `${h.year}-${String(h.month).padStart(2, "0")}`;
}

export function getCurrentFinanceMonth(calView: "hijri" | "gregorian"): string {
  return getBookingMonthKey(getLocalDateStr(), calView);
}

export function getBookingMonthLabel(key: string, calView: "hijri" | "gregorian"): string {
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr), month = Number(monthStr);
  if (calView === "gregorian") return `${GREGORIAN_MONTHS_AR[month - 1]} ${toArN(year)} م`;
  return `${HIJRI_MONTHS_AR[month - 1]} ${toArN(year)} هـ`;
}

export function isCurrentPause(chalet: { pausedFrom?: string | null; pausedUntil?: string | null }, dateStr = getLocalDateStr()) {
  return !!chalet.pausedFrom && chalet.pausedFrom <= dateStr && (!chalet.pausedUntil || chalet.pausedUntil >= dateStr);
}

export function groupBlockedDatesIntoRanges(
  blocks: Array<{ id: number; dateStr: string; notes: string | null }>,
  fromDate?: string,
) {
  const today = fromDate ?? getLocalDateStr();
  const filtered = blocks
    .filter((b) => b.notes && b.dateStr >= today)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  if (!filtered.length) return [] as Array<{ startDate: string; endDate: string; notes: string; ids: number[] }>;
  const ranges: Array<{ startDate: string; endDate: string; notes: string; ids: number[] }> = [];
  let start = filtered[0].dateStr, end = filtered[0].dateStr, note = filtered[0].notes!, ids = [filtered[0].id];
  for (let i = 1; i < filtered.length; i++) {
    const diff = Math.round((new Date(filtered[i].dateStr).getTime() - new Date(end).getTime()) / 86400000);
    if (diff === 1 && filtered[i].notes === note) { end = filtered[i].dateStr; ids.push(filtered[i].id); }
    else { ranges.push({ startDate: start, endDate: end, notes: note, ids }); start = end = filtered[i].dateStr; note = filtered[i].notes!; ids = [filtered[i].id]; }
  }
  ranges.push({ startDate: start, endDate: end, notes: note, ids });
  return ranges;
}
