import { formatFinancialAmount } from "@/lib/financialReport";
import { toAr } from "@/lib/utils";
import { HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { useEffect, useState, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BASE } from "@/components/owner/owner-api";
import { toArN } from "@/components/owner/owner-formatting";


/* ── Reports Tab ─────────────────────────────── */
export interface MonthReport {
  month: string;
  hijriMonthLabel?: string;
  totalBookings: number;
  platformBookings: number;
  externalBookings: number;
  totalDays: number;
  daysInMonth: number;
  occupancyRate: number;
  slotStats: { morning: number; evening: number; full_day: number; unspecified: number };
  topSlot: string;
  topSlotLabel: string;
  dailyRevenue?: { day: number; revenue: number }[];
}

const HIJRI_MONTHS = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

/* ── Expense Categories ──────────────────────────── */
export const EXPENSE_CATS: { key: string; label: string; emoji: string; color: string }[] = [
  { key: "salaries",    label: "الرواتب",         emoji: "💰", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { key: "electricity", label: "الكهرباء",        emoji: "⚡", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { key: "water",       label: "الماء",            emoji: "💧", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  { key: "internet",    label: "الإنترنت",         emoji: "🌐", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { key: "maintenance", label: "الصيانة",          emoji: "🔧", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { key: "supplies",    label: "المستلزمات",       emoji: "📦", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { key: "withdrawal",  label: "مسحوبات شخصية",   emoji: "💸", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { key: "other",       label: "أخرى",             emoji: "✨", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
];
export const catMap = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c]));

export async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch(`${BASE}/api/storage/uploads/process`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.url ?? data.originalUrl ?? null;
  } catch { return null; }
}

export function formatAmount(n: number) {
  return `${Math.round(n).toLocaleString("ar-SA")} ر.س`;
}

/* Financial reports use an explicit leading minus, isolated from RTL labels. */
export function formatAmountSigned(n: number) {
  return formatFinancialAmount(n);
}

export function FinancialReportNumber({ value, currency = false, rounded = true }: { value: number; currency?: boolean; rounded?: boolean }) {
  const digits = Math.abs(rounded ? Math.round(value) : value).toLocaleString("ar-SA", { numberingSystem: "arab" }).split("٬");
  return <span className="financial-report-number"><bdi dir="ltr">{value < 0 ? "-" : ""}{digits.map((part, index) =>
    <span key={index}>{index > 0 && <span className="financial-thousands">٬</span>}{part}</span>
  )}</bdi>{currency && <> ر.س</>}</span>;
}

export function formatWhatsAppAmount(n: number) {
  const amount = toAr(Math.round(Math.abs(n)).toLocaleString("en-US"));
  return n < 0 ? `(${amount}) ر.س` : `${amount} ر.س`;
}

export function formatWhatsAppHijriDate(dateStr: string) {
  try {
    const date = new Date(`${dateStr}T12:00:00`);
    if (isNaN(date.getTime())) return toAr(dateStr);
    const { day, month, year } = toHijriComponents(date);
    return `${toAr(day)} ${HIJRI_MONTHS_AR[month - 1] ?? ""} ${toAr(year)} هـ`;
  } catch {
    return toAr(dateStr);
  }
}

export type ReportCalendarMode = "hijri" | "gregorian";
type ReportViewMode = "monthly" | "yearly" | "custom";

function toEnglishDigits(value: string | number) {
  return String(value)
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0));
}

function padReportNumber(value: string | number, length: number) {
  return toEnglishDigits(value).replace(/\D/g, "").padStart(length, "0");
}

function formatReportFileDate(dateStr: string, calMode: ReportCalendarMode) {
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid report date: ${dateStr}`);
  if (calMode === "gregorian") {
    return `${padReportNumber(date.getFullYear(), 4)}-${padReportNumber(date.getMonth() + 1, 2)}-${padReportNumber(date.getDate(), 2)}`;
  }
  const { year, month, day } = toHijriComponents(date);
  return `${padReportNumber(year, 4)}-${padReportNumber(month, 2)}-${padReportNumber(day, 2)}`;
}

export function buildReportFileName(options: {
  viewMode: ReportViewMode;
  calMode: ReportCalendarMode;
  month?: string;
  hijriMonth?: string;
  year?: string;
  hijriYear?: string;
  from?: string;
  to?: string;
}) {
  const { viewMode, calMode } = options;
  if (viewMode === "custom") {
    if (!options.from || !options.to) throw new Error("Custom report dates are required");
    return `${formatReportFileDate(options.from, calMode)}-${formatReportFileDate(options.to, calMode)}.pdf`;
  }
  if (viewMode === "monthly") {
    const monthKey = calMode === "hijri" ? options.hijriMonth : options.month;
    if (!monthKey) throw new Error("Report month is required");
    const [year, month] = toEnglishDigits(monthKey).split("-");
    return `${padReportNumber(year, 4)}-${padReportNumber(month, 2)}.pdf`;
  }
  const year = calMode === "hijri" ? options.hijriYear : options.year;
  if (!year) throw new Error("Report year is required");
  return `${padReportNumber(year, 4)}.pdf`;
}

/* ── Expenses Tab ────────────────────────────────── */
export interface OwnerExpense {
  id: number;
  category: string;
  customCategory: string | null;
  dateStr: string;
  amount: string;
  notes: string | null;
  receiptUrl: string | null;
  submissionId: number | null;
  providerId?: number | null;
}

export interface ExpenseCatItem {
  id: number;
  name: string;
  emoji: string;
  color: string;
  isOther: boolean;
  sortOrder: number;
}

const COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  cyan:   "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  pink:   "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  teal:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

export function catColorClass(color: string) {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
}

type PaginationPageSize = 10 | 25 | 50 | 100;
type ListPaginationState<T> = {
  page: number;
  pageSize: PaginationPageSize;
  totalPages: number;
  paginatedItems: T[];
  tableRef: RefObject<HTMLDivElement | null>;
  goToPage: (page: number) => void;
  changePageSize: (size: PaginationPageSize) => void;
};

export function useListPagination<T>(items: T[], resetKey: string): ListPaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PaginationPageSize>(10);
  const tableRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const scrollToTable = () => {
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goToPage = (nextPage: number) => {
    const next = Math.max(1, Math.min(nextPage, totalPages));
    if (next === safePage) return;
    setPage(next);
    scrollToTable();
  };

  const changePageSize = (nextSize: PaginationPageSize) => {
    setPageSize(nextSize);
    setPage(1);
    scrollToTable();
  };

  return {
    page: safePage,
    pageSize,
    totalPages,
    paginatedItems,
    tableRef,
    goToPage,
    changePageSize,
  };
}

export function PaginatedItems<T>({
  items,
  resetKey,
  children,
}: {
  items: T[];
  resetKey: string;
  children: (pagination: ListPaginationState<T>) => ReactNode;
}) {
  const pagination = useListPagination(items, resetKey);
  return <>{children(pagination)}</>;
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: PaginationPageSize;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PaginationPageSize) => void;
}) {
  const pageNumbers = useMemo<(number | "ellipsis")[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
    const sorted = Array.from(candidates)
      .filter(candidate => candidate >= 1 && candidate <= totalPages)
      .sort((a, b) => a - b);
    const result: (number | "ellipsis")[] = [];
    sorted.forEach((candidate, index) => {
      if (index > 0 && candidate - sorted[index - 1] > 1) result.push("ellipsis");
      result.push(candidate);
    });
    return result;
  }, [page, totalPages]);

  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3" dir="rtl">
      <div className="text-xs text-muted-foreground tabular-nums">
        عرض {toArN(firstItem)} إلى {toArN(lastItem)} من أصل {toArN(totalItems)}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>عدد العناصر:</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) as PaginationPageSize)}>
            <SelectTrigger className="h-8 w-[4.5rem] rounded-lg bg-background text-xs" dir="rtl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {[10, 25, 50, 100].map(size => (
                <SelectItem key={size} value={String(size)}>{toArN(size)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1" dir="ltr">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              aria-label="الصفحة السابقة"
              className="h-8 gap-1 px-2.5 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />السابق
            </Button>
            {pageNumbers.map((pageNumber, index) => pageNumber === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={pageNumber}
                type="button"
                variant={pageNumber === page ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNumber)}
                aria-current={pageNumber === page ? "page" : undefined}
                aria-label={`الصفحة ${toArN(pageNumber)}`}
                className="h-8 min-w-8 px-2 text-xs tabular-nums"
              >
                {toArN(pageNumber)}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              aria-label="الصفحة التالية"
              className="h-8 gap-1 px-2.5 text-xs"
            >
              التالي<ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
