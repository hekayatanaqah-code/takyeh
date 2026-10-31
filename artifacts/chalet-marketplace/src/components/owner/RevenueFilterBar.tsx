import { CalendarDays } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DualCalendarPicker } from "../ui/DualCalendarPicker";
import { RevenueMonthItem } from "./RevenueMonthItem";
import type { RevenueSource } from "../../lib/quickSalesRevenue";
import type { RevenueFilterMode } from "../../lib/revenueFilterPeriod";

export type { RevenueFilterMode } from "../../lib/revenueFilterPeriod";
type Calendar = "hijri" | "gregorian";

type Props = {
  mode: RevenueFilterMode; onModeChange: (mode: RevenueFilterMode) => void;
  calendar: Calendar; onCalendarChange: (calendar: Calendar) => void;
  years: string[]; year: string; onYearChange: (year: string) => void;
  months: string[]; month: string; onMonthChange: (month: string) => void;
  monthLabel: (key: string, calendar: Calendar) => { primary: string; secondary: string };
  from: string; to: string; today: string;
  onFromChange: (date: string) => void; onToChange: (date: string) => void;
  source?: RevenueSource; onSourceChange?: (source: RevenueSource) => void;
  disabled?: boolean;
};

const MODES: [RevenueFilterMode, string][] = [["monthly", "شهري"], ["yearly", "سنوي"], ["custom", "مخصص"], ["all", "كل الفترات"]];
const SOURCES: [RevenueSource, string][] = [["all", "الحجوزات والمبيعات المفردة"], ["bookings", "الحجوزات فقط"], ["quick_sales", "المبيعات المفردة فقط"]];
const segClass = (active: boolean) =>
  `min-h-10 min-w-0 rounded-lg px-2 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:px-4 ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`;
const dateTriggerClass = "min-h-24 w-full rounded-xl border-2 border-primary/40 bg-background px-4 py-4 pr-16 text-right shadow-sm transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-primary [&>p]:text-base [&>p]:font-semibold [&>p]:text-foreground [&>div>p]:leading-7 [&>div>p:first-child]:text-base [&>div>p:last-child]:text-sm [&>div>p:last-child]:text-foreground";
const digits = (v: string) => v.replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

export function RevenueFilterBar(props: Props) {
  const { mode, calendar } = props;
  const showYear = mode === "monthly" || mode === "yearly";
  const showMonth = mode === "monthly";
  const monthSel = props.months.includes(props.month) ? props.month : "";
  const help = mode === "yearly" ? "اختر التقويم ثم السنة المطلوبة لعرض إيراداتها كاملة."
    : mode === "monthly" ? "اختر التقويم ثم السنة والشهر المطلوبين لعرض الإيرادات."
    : mode === "all" ? "يعرض جميع الإيرادات المسجلة منذ البداية دون تقييد بفترة."
    : !props.from || !props.to ? "اضغط على حقل «من تاريخ» ثم «إلى تاريخ» لاختيار الفترة. تشمل الإيرادات اليوم الأول والأخير."
    : props.from > props.to ? "يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعدها."
    : "تشمل الفترة يوم البداية ويوم النهاية، وتُطبّق على نوع الإيراد المختار.";

  return (
    <section dir="rtl" aria-label="فلاتر الإيرادات" data-testid="revenue-filter-bar"
      className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">فترة الإيرادات</legend>
          <div role="group" aria-label="فترة الإيرادات" className="grid grid-cols-4 rounded-xl border border-border bg-muted/60 p-1">
            {MODES.map(([m, label]) =>
              <button type="button" key={m} aria-pressed={mode === m} data-testid={`revenue-filter-mode-${m}`}
                onClick={() => props.onModeChange(m)} className={segClass(mode === m)}>{label}</button>)}
          </div>
        </fieldset>
        {props.source !== undefined && props.onSourceChange && (
          <div className="min-w-0">
            <span id="revenue-filter-source-label" className="mb-2 block text-sm font-bold text-foreground">نوع الإيراد</span>
            <Select dir="rtl" value={props.source} disabled={props.disabled}
              onValueChange={v => props.onSourceChange?.(v as RevenueSource)}>
              <SelectTrigger aria-labelledby="revenue-filter-source-label" data-testid="revenue-filter-source"
                className="h-12 w-full min-w-0 bg-background text-right text-base"><SelectValue /></SelectTrigger>
              <SelectContent dir="rtl" align="start">
                {SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-2 sm:gap-4"
        style={{ gridTemplateColumns: showMonth ? "minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr)" : showYear ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)" }}>
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">التقويم</legend>
          <div role="group" aria-label="تقويم الإيرادات" className="grid h-12 grid-cols-2 rounded-xl border border-border bg-muted/60 p-1">
            {(["hijri", "gregorian"] as const).map(c =>
              <button type="button" key={c} aria-pressed={calendar === c} data-testid={`revenue-filter-calendar-${c}`}
                onClick={() => props.onCalendarChange(c)} className={`${segClass(calendar === c)} min-h-0`}>
                {c === "hijri" ? "هجري" : "ميلادي"}
              </button>)}
          </div>
        </fieldset>
        {showYear && (
          <div className="flex min-w-0 flex-col gap-2 text-sm font-bold text-foreground">
            <span>السنة</span>
            <Select dir="rtl" value={props.years.includes(props.year) ? props.year : ""} onValueChange={props.onYearChange}
              disabled={props.disabled || !props.years.length}>
              <SelectTrigger aria-label="سنة الإيرادات" data-testid="revenue-filter-year"
                className="h-12 w-full min-w-0 bg-background px-2 text-sm sm:px-3 sm:text-base"><SelectValue placeholder="لا توجد سنوات" /></SelectTrigger>
              <SelectContent dir="rtl">
                {props.years.map(v => <SelectItem key={v} value={v}>{digits(v)} {calendar === "hijri" ? "هـ" : "م"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {showMonth && (
          <div className="flex min-w-0 flex-col gap-2 text-sm font-bold text-foreground">
            <span>الشهر</span>
            <Select dir="rtl" value={monthSel} onValueChange={props.onMonthChange} disabled={props.disabled || !props.months.length}>
              <SelectTrigger aria-label="شهر الإيرادات" data-testid="revenue-filter-month"
                className="h-12 w-full min-w-0 bg-background px-2 text-sm sm:px-3 sm:text-base">
                <SelectValue placeholder="لا توجد أشهر">
                  {monthSel ? <span className="block truncate">{props.monthLabel(monthSel, calendar).primary}</span> : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent dir="rtl">
                {props.months.map(k => { const l = props.monthLabel(k, calendar);
                  return <RevenueMonthItem key={k} value={k} primary={l.primary} secondary={l.secondary} />; })}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {mode === "custom" && (
        <div className="grid min-w-0 gap-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2"
          data-testid="revenue-filter-custom-range" inert={props.disabled ? true : undefined}>
          <div className="min-w-0 space-y-2" data-testid="revenue-filter-from">
            <span className="block text-base font-bold text-foreground">من تاريخ</span>
            <div className="relative" aria-label="تاريخ بداية الإيرادات">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.from} onChange={props.onFromChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ البداية" maxDate={props.to || props.today}
                mode={calendar} className={dateTriggerClass} />
            </div>
          </div>
          <div className="min-w-0 space-y-2" data-testid="revenue-filter-to">
            <span className="block text-base font-bold text-foreground">إلى تاريخ</span>
            <div className="relative" aria-label="تاريخ نهاية الإيرادات">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.to} onChange={props.onToChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ النهاية" minDate={props.from || undefined} maxDate={props.today}
                openingDate={props.from || undefined} mode={calendar} className={dateTriggerClass} />
            </div>
          </div>
        </div>
      )}

      <p role="status" data-testid="revenue-filter-help" className="border-t border-border pt-4 text-base font-medium leading-8 text-foreground">{help}</p>
    </section>
  );
}
