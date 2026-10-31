import React from "react";
import { CalendarDays } from "lucide-react";
import { FinancialPeriodControls } from "../FinancialPeriodControls";
import { DualCalendarPicker } from "../ui/DualCalendarPicker";
import type { ServiceReportPeriodMode } from "../../lib/serviceFinancialReport";

type Props = {
  mode: ServiceReportPeriodMode; onModeChange: (mode: ServiceReportPeriodMode) => void;
  hijri: boolean; onCalendarChange: (hijri: boolean) => void;
  months: string[]; years: string[]; monthNames: readonly string[]; month: string; year: string;
  onMonthChange: (month: string) => void; onYearChange: (year: string) => void;
  from: string; to: string; today: string;
  onFromChange: (date: string) => void; onToChange: (date: string) => void;
  disabled?: boolean; periodsUnavailable?: boolean;
  ariaLabel?: string; allPeriods?: boolean; onAllPeriods?: () => void; earliestDate?: string;
};

const dateTriggerClass = "min-h-24 w-full rounded-xl border-2 border-primary/40 bg-background px-4 py-4 pr-16 text-right shadow-sm transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-primary [&>p]:text-base [&>p]:font-semibold [&>p]:text-foreground [&>div>p]:leading-7 [&>div>p:first-child]:text-base [&>div>p:last-child]:text-sm [&>div>p:last-child]:text-foreground";

export function ServiceReportPeriodControls(props: Props) {
  const all = !!props.onAllPeriods && !!props.allPeriods;
  const btn = (on: boolean) => `min-h-11 rounded-lg py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${on ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`;
  return (
    <section dir="rtl" aria-label={props.ariaLabel ?? "فترة وتقويم تقرير الخدمات"}
      className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <fieldset disabled={props.disabled} className="min-w-0">
        <legend className="mb-2 text-base font-bold text-foreground">فترة التقرير</legend>
        <div className={`grid gap-1 rounded-xl border border-border bg-muted/60 p-1 ${props.onAllPeriods ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {(["monthly", "yearly", "custom"] as const).map(mode =>
            <button type="button" key={mode} aria-pressed={!all && props.mode === mode}
              data-testid={`service-report-period-${mode}`} onClick={() => props.onModeChange(mode)}
              className={`${btn(!all && props.mode === mode)} px-3`}>
              {mode === "monthly" ? "شهري" : mode === "yearly" ? "سنوي" : "مخصص"}
            </button>)}
          {props.onAllPeriods && <button type="button" aria-pressed={all} data-testid="service-report-period-all"
            onClick={props.onAllPeriods} className={`${btn(all)} px-3`}>جميع الفترات</button>}
        </div>
      </fieldset>
      {!all && <div className={`grid min-w-0 items-end gap-2 sm:gap-4 ${props.mode === "custom" ? "grid-cols-1" : props.mode === "yearly" ? "grid-cols-2" : "grid-cols-3"}`}
        style={props.mode === "monthly" ? { gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr) minmax(0,1.2fr)" } : undefined}>
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">التقويم</legend>
          <div className="grid h-12 grid-cols-2 gap-1 rounded-xl border border-border bg-muted/60 p-1">
            {(["hijri", "gregorian"] as const).map(calendar =>
              <button type="button" key={calendar} aria-pressed={props.hijri === (calendar === "hijri")}
                data-testid={`financial-report-calendar-${calendar}`} onClick={() => props.onCalendarChange(calendar === "hijri")}
                className={`${btn(props.hijri === (calendar === "hijri"))} min-h-0 px-1 sm:px-3`}>
                {calendar === "hijri" ? "هجري" : "ميلادي"}
              </button>)}
          </div>
        </fieldset>
        {props.mode !== "custom" &&
          <FinancialPeriodControls months={props.months} years={props.years} monthNames={props.monthNames}
            month={props.month} year={props.year} annual={props.mode === "yearly"} prominent inline hijri={props.hijri}
            disabled={props.disabled || props.periodsUnavailable}
            onMonthChange={props.onMonthChange} onYearChange={props.onYearChange} />}
      </div>}
      {!all && props.mode === "custom" && (
        <div className="grid min-w-0 gap-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2"
          data-testid="service-report-custom-range" inert={props.disabled ? true : undefined}>
          <div className="min-w-0 space-y-2">
            <span className="block text-base font-bold text-foreground">من تاريخ</span>
            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.from} onChange={props.onFromChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ البداية" minDate={props.earliestDate || undefined} maxDate={props.to || props.today}
                mode={props.hijri ? "hijri" : "gregorian"} className={dateTriggerClass} />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-base font-bold text-foreground">إلى تاريخ</span>
            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.to} onChange={props.onToChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ النهاية" minDate={props.from || props.earliestDate || undefined} maxDate={props.today}
                openingDate={props.from || undefined} mode={props.hijri ? "hijri" : "gregorian"} className={dateTriggerClass} />
            </div>
          </div>
        </div>
      )}
      <p role="status" className="border-t border-border pt-4 text-base font-medium leading-8 text-foreground">
        {all ? "يعرض التقرير جميع الفترات المسجلة دون تقييد بشهر أو سنة."
          : props.mode === "yearly" ? "اختر تقويم التقرير ثم السنة المطلوبة لعرض تقريرها المالي الكامل."
          : props.mode === "monthly" ? "اختر فترة التقرير ثم التقويم، وبعدها حدد السنة والشهر المطلوبين."
          : !props.from || !props.to ? "اضغط على حقل «من تاريخ» ثم «إلى تاريخ» لاختيار الفترة. يشمل التقرير اليوم الأول والأخير."
          : props.from > props.to ? "يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعدها."
          : "يشمل التقرير الحجوزات والمبيعات والمصروفات بين التاريخين المحددين، بما فيهما يوم البداية ويوم النهاية."}
      </p>
    </section>
  );
}
