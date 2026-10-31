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
};

const dateTriggerClass = "min-h-24 w-full rounded-xl border-2 border-primary/40 bg-background px-4 py-4 pr-16 text-right shadow-sm transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-primary [&>p]:text-base [&>p]:font-semibold [&>p]:text-foreground [&>div>p]:leading-7 [&>div>p:first-child]:text-base [&>div>p:last-child]:text-sm [&>div>p:last-child]:text-foreground";

export function ServiceReportPeriodControls(props: Props) {
  return (
    <section dir="rtl" aria-label="فترة وتقويم تقرير الخدمات"
      className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-[auto_auto_minmax(0,1fr)]">
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">فترة التقرير</legend>
          <div className="grid grid-cols-3 rounded-xl border border-border bg-muted/60 p-1">
            {(["monthly", "yearly", "custom"] as const).map(mode =>
              <button type="button" key={mode} aria-pressed={props.mode === mode}
                data-testid={`service-report-period-${mode}`} onClick={() => props.onModeChange(mode)}
                className={`min-h-10 rounded-lg px-4 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${props.mode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`}>
                {mode === "monthly" ? "شهري" : mode === "yearly" ? "سنوي" : "مخصص"}
              </button>)}
          </div>
        </fieldset>
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">تقويم التقرير</legend>
          <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/60 p-1">
            {(["hijri", "gregorian"] as const).map(calendar =>
              <button type="button" key={calendar} aria-pressed={props.hijri === (calendar === "hijri")}
                data-testid={`financial-report-calendar-${calendar}`} onClick={() => props.onCalendarChange(calendar === "hijri")}
                className={`min-h-10 rounded-lg px-4 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${props.hijri === (calendar === "hijri") ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`}>
                {calendar === "hijri" ? "هجري" : "ميلادي"}
              </button>)}
          </div>
        </fieldset>
        {props.mode !== "custom" && <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <FinancialPeriodControls months={props.months} years={props.years} monthNames={props.monthNames}
            month={props.month} year={props.year} annual={props.mode === "yearly"} prominent hijri={props.hijri}
            disabled={props.disabled || props.periodsUnavailable}
            onMonthChange={props.onMonthChange} onYearChange={props.onYearChange} />
        </div>}
      </div>
      {props.mode === "custom" && (
        <div className="grid min-w-0 gap-5 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2"
          data-testid="service-report-custom-range" inert={props.disabled ? true : undefined}>
          <div className="min-w-0 space-y-2">
            <span className="block text-base font-bold text-foreground">من تاريخ</span>
            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.from} onChange={props.onFromChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ البداية" maxDate={props.to || props.today}
                mode={props.hijri ? "hijri" : "gregorian"} className={dateTriggerClass} />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <span className="block text-base font-bold text-foreground">إلى تاريخ</span>
            <div className="relative">
              <CalendarDays aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 z-10 h-7 w-7 -translate-y-1/2 text-primary" />
              <DualCalendarPicker value={props.to} onChange={props.onToChange} selectOnOpen={false}
                placeholder="اضغط لاختيار تاريخ النهاية" minDate={props.from || undefined} maxDate={props.today}
                openingDate={props.from || undefined} mode={props.hijri ? "hijri" : "gregorian"} className={dateTriggerClass} />
            </div>
          </div>
        </div>
      )}
      <p role="status" className="border-t border-border pt-4 text-base font-medium leading-8 text-foreground">
        {props.mode === "yearly" ? "اختر تقويم التقرير ثم السنة المطلوبة لعرض تقريرها المالي الكامل."
          : props.mode === "monthly" ? "اختر فترة التقرير ثم التقويم، وبعدها حدد السنة والشهر المطلوبين."
          : !props.from || !props.to ? "اضغط على حقل «من تاريخ» ثم «إلى تاريخ» لاختيار الفترة. يشمل التقرير اليوم الأول والأخير."
          : props.from > props.to ? "يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعدها."
          : "يشمل التقرير الحجوزات والمبيعات والمصروفات بين التاريخين المحددين، بما فيهما يوم البداية ويوم النهاية."}
      </p>
    </section>
  );
}
