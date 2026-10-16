import { useId } from "react";
import { Search, RotateCcw, Download, FileSpreadsheet, FileText, ChevronDown, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { archiveToday, getArchiveDateError } from "@/lib/bookingArchive";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ArchivePeriod = "all" | "this-month" | "last-month" | "year" | "custom";

export interface ArchiveFilters {
  search: string;
  period: ArchivePeriod;
  year: string;
  from: string;
  to: string;
}

export interface BookingArchiveControlsProps {
  filters: ArchiveFilters;
  onChange: (filters: ArchiveFilters) => void;
  years: string[];
  total: number;
  loading: boolean;
  exporting: boolean;
  onExport: (format: "xlsx" | "pdf") => void;
  calendarMode?: "hijri" | "gregorian";
}

const PERIODS: { value: ArchivePeriod; label: string }[] = [
  { value: "all", label: "كل الفترات" },
  { value: "this-month", label: "هذا الشهر" },
  { value: "last-month", label: "الشهر الماضي" },
  { value: "year", label: "اختيار سنة" },
  { value: "custom", label: "نطاق مخصص" },
];

const DEFAULT_FILTERS: ArchiveFilters = { search: "", period: "all", year: "", from: "", to: "" };

export default function BookingArchiveControls({
  filters,
  onChange,
  years,
  total,
  loading,
  exporting,
  onExport,
  calendarMode = "hijri",
}: BookingArchiveControlsProps) {
  const uid = useId();
  const searchId = `${uid}-search`;
  const yearId = `${uid}-year`;
  const errorId = `${uid}-err`;

  const dateError = getArchiveDateError(filters);
  const today = archiveToday();
  const isDirty =
    filters.search !== "" || filters.period !== "all" || filters.year !== "" || filters.from !== "" || filters.to !== "";
  const exportDisabled = loading || exporting || total === 0 || !!dateError;

  const set = (patch: Partial<ArchiveFilters>) => onChange({ ...filters, ...patch });

  const selectPeriod = (period: ArchivePeriod) => {
    if (period === "year") {
      set({ period, year: filters.year || years[0] || String(new Date().getFullYear()), from: "", to: "" });
    } else if (period === "custom") {
      set({ period, year: "" });
    } else {
      set({ period, year: "", from: "", to: "" });
    }
  };

  return (
    <section
      dir="rtl"
      aria-label="أدوات تصفية أرشيف الحجوزات"
      className="rounded-xl border border-card-border bg-card p-3 sm:p-4 space-y-3"
      data-testid="section-archive-controls"
    >
      {/* Search + export row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor={searchId} className="text-xs font-semibold text-foreground">
            البحث في الأرشيف
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={searchId}
              type="search"
              inputMode="search"
              maxLength={150}
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="اسم العميل، رقم الجوال أو رقم الحجز"
              className="h-10 rounded-lg pr-9 text-sm"
              data-testid="input-archive-search"
            />
          </div>
        </div>

        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button
              disabled={exportDisabled}
              className="h-10 rounded-lg gap-1.5 w-full sm:w-auto"
              data-testid="button-archive-export"
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {exporting ? "جارٍ التصدير..." : "تصدير الأرشيف (Excel/PDF)"}
              <ChevronDown className="opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13rem] rounded-lg">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">
              صيغة الملف
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={exportDisabled}
              onSelect={() => onExport("xlsx")}
              className="gap-2 cursor-pointer"
              data-testid="button-export-xlsx"
            >
              <FileSpreadsheet className="text-primary" />
              تصدير Excel
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportDisabled}
              onSelect={() => onExport("pdf")}
              className="gap-2 cursor-pointer"
              data-testid="button-export-pdf"
            >
              <FileText className="text-primary" />
              تصدير PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Period quick options */}
      <div role="radiogroup" aria-label="الفترة الزمنية" className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        {PERIODS.map((p) => {
          const active = filters.period === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => selectPeriod(p.value)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-secondary-foreground hover:border-primary/40",
              )}
              data-testid={`button-period-${p.value}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {filters.period === "year" && (
        <div className="space-y-1 sm:max-w-[14rem]">
          <label htmlFor={yearId} className="text-xs font-semibold">
            السنة (ميلادي)
          </label>
          <Select value={filters.year} onValueChange={(year) => set({ year })} dir="rtl">
            <SelectTrigger id={yearId} className="h-10 rounded-lg" data-testid="select-archive-year">
              <SelectValue placeholder="اختر السنة الميلادية" />
            </SelectTrigger>
            <SelectContent>
              {(years.length ? years : [String(new Date().getFullYear())]).map((y) => (
                <SelectItem key={y} value={y} data-testid={`option-year-${y}`}>
                  {y} م
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {filters.period === "custom" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:max-w-md">
            <div className="space-y-1">
              <DualCalendarPicker
                label="من تاريخ"
                value={filters.from}
                selectOnOpen={false}
                maxDate={filters.to && filters.to < today ? filters.to : today}
                onChange={(from) => set({ from })}
                mode={calendarMode}
                className={cn("h-10 rounded-lg text-sm", dateError && "border-destructive")}
              />
              {filters.from && <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => set({ from: "" })}>مسح تاريخ البداية</Button>}
            </div>
            <div className="space-y-1">
              <DualCalendarPicker
                label="إلى تاريخ"
                value={filters.to}
                minDate={filters.from || undefined}
                maxDate={today}
                openingDate={filters.from || undefined}
                selectOnOpen={false}
                onChange={(to) => set({ to })}
                mode={calendarMode}
                className={cn("h-10 rounded-lg text-sm", dateError && "border-destructive")}
              />
              {filters.to && <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => set({ to: "" })}>مسح تاريخ النهاية</Button>}
            </div>
          </div>
          {dateError && (
            <p id={errorId} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-destructive" data-testid="text-archive-date-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {dateError}
            </p>
          )}
        </div>
      )}

      {/* Footer: count + reset + export note */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="text-archive-count">
          {loading ? (
            <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted align-middle" />
          ) : (
            <>
              النتائج المطابقة: <span className="font-bold text-foreground">{total}</span> حجز
            </>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty}
          onClick={() => onChange({ ...DEFAULT_FILTERS })}
          className="h-8 rounded-lg gap-1 text-xs text-primary"
          data-testid="button-archive-reset"
        >
          <RotateCcw className="!size-3.5" />
          إعادة ضبط الفلاتر
        </Button>
        <p className="basis-full text-[11px] leading-relaxed text-muted-foreground" data-testid="text-archive-export-note">
          التصدير يشمل كل السجلات المطابقة للفلاتر الحالية، وليس الصفحة المعروضة فقط.
        </p>
      </div>
    </section>
  );
}
