import { useId } from "react";
import { Search, RotateCcw, Download, FileSpreadsheet, FileText, ChevronDown, Loader2, AlertCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { archiveToday, archiveCalendarYear, getArchiveDateError } from "@/lib/bookingArchive";
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
  onCalendarModeChange?: (calendar: "hijri" | "gregorian") => void;
}

const PERIODS: { value: ArchivePeriod; label: string }[] = [
  { value: "all", label: "كل الفترات" },
  { value: "this-month", label: "هذا الشهر" },
  { value: "last-month", label: "الشهر الماضي" },
  { value: "year", label: "اختيار سنة" },
  { value: "custom", label: "تحديد فترة" },
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
  onCalendarModeChange,
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
      set({ period, year: filters.year || years[0] || String(archiveCalendarYear(calendarMode)), from: "", to: "" });
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
      className="rounded-xl border border-card-border bg-card p-3 sm:p-4 space-y-4 text-right"
      data-testid="section-archive-controls"
    >
      {/* Search + export row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor={searchId} className="text-sm font-semibold text-foreground">
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
      <div dir="rtl" role="radiogroup" aria-label="الفترة الزمنية" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
                "min-h-11 min-w-0 rounded-lg border px-3 py-2.5 text-center text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                p.value === "custom" && "col-span-2 sm:col-span-1",
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

      {onCalendarModeChange && (
        <div dir="rtl" className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3" aria-label="تقويم فلاتر الأرشيف">
          <span className="shrink-0 text-sm font-semibold text-foreground">تقويم الفلترة</span>
          <div dir="rtl" role="group" aria-label="اختيار تقويم الفلترة" className="grid w-full max-w-xs grid-cols-2 overflow-hidden rounded-xl border border-border">
            {(["hijri", "gregorian"] as const).map(calendar => (
              <button key={calendar} type="button" aria-pressed={calendarMode === calendar}
                onClick={() => onCalendarModeChange(calendar)}
                className={cn("min-h-11 px-5 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", calendarMode === calendar ? "bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted")}>
                {calendar === "hijri" ? "هجري" : "ميلادي"}
              </button>
            ))}
          </div>
        </div>
      )}
      {filters.period === "year" && (
        <div className="space-y-1 sm:max-w-[14rem]">
          <label htmlFor={yearId} className="text-sm font-semibold">
            السنة ({calendarMode === "hijri" ? "هجري" : "ميلادي"})
          </label>
          <Select value={filters.year} onValueChange={(year) => set({ year })} dir="rtl">
            <SelectTrigger id={yearId} className="h-10 rounded-lg" data-testid="select-archive-year">
              <SelectValue placeholder={`اختر السنة ${calendarMode === "hijri" ? "الهجرية" : "الميلادية"}`} />
            </SelectTrigger>
            <SelectContent>
              {(years.length ? years : [String(archiveCalendarYear(calendarMode))]).map((y) => (
                <SelectItem key={y} value={y} data-testid={`option-year-${y}`}>
                  {Number(y).toLocaleString("ar-SA", { useGrouping: false })} {calendarMode === "hijri" ? "هـ" : "م"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {filters.period === "custom" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:max-w-md">
            <div className="relative space-y-1 rounded-xl border border-border bg-background p-3 shadow-sm transition-colors hover:border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-primary" />
              <DualCalendarPicker
                label="من تاريخ"
                value={filters.from}
                selectOnOpen={false}
                maxDate={filters.to && filters.to < today ? filters.to : today}
                onChange={(from) => set({ from })}
                mode={calendarMode}
                className={cn("min-h-12 rounded-lg pl-7 text-sm", dateError && "text-destructive")}
              />
              {filters.from && <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => set({ from: "" })}>مسح تاريخ البداية</Button>}
            </div>
            <div className="relative space-y-1 rounded-xl border border-border bg-background p-3 shadow-sm transition-colors hover:border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-primary" />
              <DualCalendarPicker
                label="إلى تاريخ"
                value={filters.to}
                minDate={filters.from || undefined}
                maxDate={today}
                openingDate={filters.from || undefined}
                selectOnOpen={false}
                onChange={(to) => set({ to })}
                mode={calendarMode}
                className={cn("min-h-12 rounded-lg pl-7 text-sm", dateError && "text-destructive")}
              />
              {filters.to && <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => set({ to: "" })}>مسح تاريخ النهاية</Button>}
            </div>
          </div>
          {dateError && (
            <p id={errorId} role="alert" className="flex items-center gap-1.5 text-sm leading-6 font-medium text-destructive" data-testid="text-archive-date-error">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {dateError}
            </p>
          )}
        </div>
      )}

      {/* Footer: count + reset + export note */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
        <p className="text-sm leading-6 text-foreground/80" aria-live="polite" data-testid="text-archive-count">
          {loading ? (
            <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted align-middle" />
          ) : (
            <>
              عدد الحجوزات المطابقة: <span className="font-bold text-foreground">{total}</span>
            </>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isDirty}
          onClick={() => onChange({ ...DEFAULT_FILTERS })}
          className="min-h-10 rounded-lg gap-1.5 text-sm text-primary"
          data-testid="button-archive-reset"
        >
          <RotateCcw className="!size-3.5" />
          إعادة ضبط الفلاتر
        </Button>
        <p className="basis-full text-sm leading-6 text-foreground/80" data-testid="text-archive-export-note">
          يشمل التصدير جميع النتائج المطابقة للفلاتر، وليس الصفحة الحالية فقط.
        </p>
      </div>
    </section>
  );
}
