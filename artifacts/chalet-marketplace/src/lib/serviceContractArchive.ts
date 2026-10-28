import { toHijriComponents } from "./hijri";

export type ServiceContractStatus = "signed" | "pending" | "cancelled";
export type ServiceCalView = "hijri" | "gregorian";

export interface ServiceContractRow {
  id: number;
  clientName?: string | null;
  clientPhone?: string | null;
  dateStr?: string | null;
  status?: string | null;
  cancelledAt?: string | null;
  contractSigned?: boolean | null;
}

export const SERVICE_CONTRACTS_PAGE_SIZE = 10;

/** Cancelled always wins over signature. */
export function serviceContractStatus(a: ServiceContractRow): ServiceContractStatus {
  if (a.status === "cancelled" || a.cancelledAt) return "cancelled";
  if (a.contractSigned) return "signed";
  return "pending";
}

/** Parse YYYY-MM-DD as a LOCAL calendar date (no UTC shift). */
function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) || d.getFullYear() !== Number(m[1])
    || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3]) ? null : d;
}

/** "YYYY-MM" key in the requested calendar, or null for missing/invalid dates. */
export function serviceMonthKey(dateStr: string | null | undefined, cal: ServiceCalView): string | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;
  if (cal === "gregorian") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  try {
    const h = toHijriComponents(d);
    return `${h.year}-${String(h.month).padStart(2, "0")}`;
  } catch { return null; }
}

export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

export function serviceYearOptions(rows: ServiceContractRow[], cal: ServiceCalView): string[] {
  const s = new Set<string>();
  for (const r of rows) { const k = serviceMonthKey(r.dateStr, cal); if (k) s.add(k.split("-")[0]); }
  return Array.from(s).sort().reverse();
}

export function serviceMonthOptions(rows: ServiceContractRow[], cal: ServiceCalView, year: string): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    const k = serviceMonthKey(r.dateStr, cal);
    if (!k) continue;
    if (year && k.split("-")[0] !== year) continue;
    s.add(k);
  }
  return Array.from(s).sort();
}

export interface ServiceArchiveFilters {
  search: string;
  cal: ServiceCalView;
  year: string;   // "" = all
  month: string;  // "all" or "YYYY-MM"
  status: "all" | ServiceContractStatus;
}

/** Filters + sorts (newest booking date first, then id desc) over the entire list. */
export function filterServiceContracts<T extends ServiceContractRow>(rows: T[], f: ServiceArchiveFilters): T[] {
  const q = normalizeDigits(f.search.trim().toLowerCase());
  const qDigits = q.replace(/\D/g, "");
  const out = rows.filter(r => {
    if (f.year || f.month !== "all") {
      const k = serviceMonthKey(r.dateStr, f.cal);
      if (!k) return false;
      if (f.month !== "all" && f.year) { if (k !== f.month) return false; }
      else if (f.year && k.split("-")[0] !== f.year) return false;
    }
    if (f.status !== "all" && serviceContractStatus(r) !== f.status) return false;
    if (!q) return true;
    if (String(r.id).includes(q)) return true;
    if (normalizeDigits(String(r.clientName ?? "")).toLowerCase().includes(q)) return true;
    return /^[\d\s()+.-]+$/.test(q) && !!qDigits
      && normalizeDigits(String(r.clientPhone ?? "")).replace(/\D/g, "").includes(qDigits);
  });
  return out.sort((a, b) => {
    const da = String(a.dateStr ?? ""), db = String(b.dateStr ?? "");
    if (da !== db) return da < db ? 1 : -1;
    return b.id - a.id;
  });
}

export function clampPage(page: number, total: number, pageSize = SERVICE_CONTRACTS_PAGE_SIZE): number {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, Math.floor(page) || 1), pages);
}

export function paginate<T>(rows: T[], page: number, pageSize = SERVICE_CONTRACTS_PAGE_SIZE): T[] {
  const p = clampPage(page, rows.length, pageSize);
  return rows.slice((p - 1) * pageSize, p * pageSize);
}
