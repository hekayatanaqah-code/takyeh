import type { ArchiveFilters } from "@/components/owner/BookingArchiveControls";

export const EMPTY_ARCHIVE_FILTERS: ArchiveFilters = { search: "", period: "all", year: "", from: "", to: "" };

export function getArchiveDateError(filters: ArchiveFilters): string | null {
  return filters.period === "custom" && filters.from && filters.to && filters.from > filters.to
    ? "تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له" : null;
}

/** Quick periods are Gregorian Saudi calendar periods, regardless of the browser timezone. */
export function archiveDateRange(filters: ArchiveFilters, now = Date.now()): { from?: string; to?: string } {
  if (filters.period === "all") return {};
  if (filters.period === "custom") return { from: filters.from || undefined, to: filters.to || undefined };
  if (filters.period === "year") return /^\d{4}$/.test(filters.year)
    ? { from: `${filters.year}-01-01`, to: `${filters.year}-12-31` } : {};
  const saudi = new Date(now + 3 * 60 * 60 * 1000);
  const year = saudi.getUTCFullYear();
  const month = saudi.getUTCMonth() - (filters.period === "last-month" ? 1 : 0);
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

export function archivePageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) result.push("gap");
    result.push(p);
  });
  return result;
}
