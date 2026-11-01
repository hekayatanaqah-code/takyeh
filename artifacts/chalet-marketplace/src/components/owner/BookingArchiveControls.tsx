import { useId } from "react";
import { Search, RotateCcw, Download, FileSpreadsheet, FileText, ChevronDown, Loader2, AlertCircle, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { archiveToday, archiveCalendarYear, archiveCalendarMonth, getArchiveDateError } from "@/lib/bookingArchive";
import { HIJRI_MONTHS_AR } from "@/lib/hijri";
import { GREGORIAN_MONTHS_AR } from "@/components/owner/owner-calendar";
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

export type ArchivePeriod = "all" | "this-month" | "last-month" | "year" | "month" | "custom";

export interface ArchiveFilters {
  search: string;
  period: ArchivePeriod;
  year: string;
  month: string;
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
  { value: "month", label: "اختيار شهر" },
  { value: "custom", label: "تحديد فترة" },
];

const DEFAULT_FILTERS: ArchiveFilters = { search: "", period: "all", year: "", month: "", from: "", to: "" };

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
  const monthId = `${uid}-month`;
  const errorId = `${uid}-err`;

  const dateError = getArchiveDateError(filters);
  const today = archiveToday();
  const isDirty =
    filters.search !== "" || filters.period !== "all" || filters.year !== "" || filters.month !== "" || filters.from !== "" || filters.to !== "";
  const exportDisabled = loading || exporting || total === 0 || !!dateError;

  const set = (patch: Partial<ArchiveFilters>) => onChange({ ...filters, ...patch });

  const selectPeriod = (period: ArchivePeriod) => {
    if (period === "year" || period === "month") {
      set({
        period,
        year: filters.year || years[0] || String(archiveCalendarYear(calendarMode)),
        month: period === "month" ? filters.month || String(archiveCalendarMonth(calendarMode)) : "",
        from: "",
        to: "",
      });
    } else if (period === "custom") {
      set({ period, year: "", month: "" });
    } else {
      set({ period, year: "", month: "", from: "", to: "" });
    }
  };

  const selectYear = (year: string) => {
    const clampMonth = filters.period === "month"
      && Number(year) === archiveCalendarYear(calendarMode)
      && Number(filters.month) > archiveCalendarMonth(calendarMode);
    set({ year, ...(clampMonth ? { month: String(archiveCalendarMonth(calendarMode)) } : {}) });
  };

  return (
    <section
      dir="rtl"
      aria-label="أدوات تصفية أرشيف الحجوزات"
      className="min-w-0 rounded-xl border border-card-border bg-card p-3 sm:p-4 space-y-4 text-right"
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
      <div dir="rtl" role="radiogroup" aria-label="الفترة الزمنية" className="flex max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">
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
                "min-h-11 shrink-0 rounded-lg border px-4 py-2.5 text-center text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:flex-1",
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
      <p className="text-sm leading-6 text-foreground/80 sm:hidden">اسحب أفقياً لعرض بقية الفترات.</p>

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
      {(filters.period === "year" || filters.period === "month") && (
        <div dir="rtl" className={cn("grid grid-cols-1 gap-3 rounded-xl border border-border bg-background p-3", filters.period === "month" ? "sm:max-w-xl sm:grid-cols-2" : "sm:max-w-xs")}>
          <div className="space-y-2">
          <label htmlFor={yearId} className="block text-sm font-semibold">
            السنة ({calendarMode === "hijri" ? "هجري" : "ميلادي"})
          </label>
          <Select value={filters.year} onValueChange={selectYear} dir="rtl">
            <SelectTrigger id={yearId} className="h-12 rounded-lg bg-card text-sm" data-testid="select-archive-year">
              <SelectValue placeholder={`اختر السنة ${calendarMode === "hijri" ? "الهجرية" : "الميلادية"}`} />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {(years.length ? years : [String(archiveCalendarYear(calendarMode))]).map((y) => (
                <SelectItem key={y} value={y} data-testid={`option-year-${y}`}>
                  {Number(y).toLocaleString("ar-SA", { useGrouping: false })} {calendarMode === "hijri" ? "هـ" : "م"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          {filters.period === "month" && (
            <div className="space-y-2">
              <label htmlFor={monthId} className="block text-sm font-semibold">الشهر ({calendarMode === "hijri" ? "هجري" : "ميلادي"})</label>
              <Select value={filters.month} onValueChange={(month) => set({ month })} dir="rtl">
                <SelectTrigger id={monthId} className="h-12 rounded-lg bg-card text-sm" data-testid="select-archive-month">
                  <SelectValue placeholder="اختر الشهر" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {(calendarMode === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR).map((month, index) => (
                    <SelectItem key={index + 1} value={String(index + 1)} disabled={Number(filters.year) === archiveCalendarYear(calendarMode) && index + 1 > archiveCalendarMonth(calendarMode)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {filters.period === "month" && dateError && <p id={errorId} role="alert" className="text-sm leading-6 text-destructive sm:col-span-2">{dateError}</p>}
        </div>
      )}

      {filters.period === "custom" && (
        <div className="space-y-1.5">
          <div dir="rtl" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:max-w-xl">
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
