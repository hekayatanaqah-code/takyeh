import React from "react";
import { serviceReportSourceLabels, type ServiceReportMode } from "../../lib/serviceFinancialReport";
import type { RevenueSource } from "../../lib/quickSalesRevenue";
import type { PropertyPaymentFilter } from "../../lib/propertyBookingStatus";
import { PropertyBookingPaymentFilters } from "../PropertyBookingStatus";

type Props = {
  source: RevenueSource; payment: PropertyPaymentFilter; mode: ServiceReportMode; disabled?: boolean;
  onSourceChange: (value: RevenueSource) => void;
  onPaymentChange: (value: PropertyPaymentFilter) => void;
  onModeChange: (value: ServiceReportMode) => void;
};

export function ServiceReportFilters(props: Props) {
  return (
    <section aria-label="خيارات تقرير الخدمات" dir="rtl" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-5">
        <div className="min-w-0 grow basis-64">
          <label htmlFor="service-report-source" className="mb-2 block text-sm font-bold text-foreground">نطاق التقرير</label>
          <select id="service-report-source" data-testid="service-report-source" value={props.source}
            disabled={props.disabled} onChange={event => props.onSourceChange(event.target.value as RevenueSource)}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50">
            {(["all", "bookings", "quick_sales"] as const).map(source =>
              <option key={source} value={source}>{serviceReportSourceLabels[source]}</option>)}
          </select>
        </div>
        <fieldset disabled={props.disabled} className="min-w-0 grow basis-80">
          <legend className="mb-2 text-sm font-bold text-foreground">حالة السداد</legend>
          <div className="flex min-h-11 items-center [&>div]:mb-0"><PropertyBookingPaymentFilters value={props.payment} onChange={props.onPaymentChange} /></div>
        </fieldset>
        <fieldset disabled={props.disabled} className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-foreground">طريقة العرض</legend>
          <div role="group" aria-label="نمط عرض تقرير الخدمات" className="flex rounded-lg border border-border bg-muted/60 p-1">
            {([["compact", "مختصر"], ["detailed", "تفصيلي"]] as const).map(([mode, label]) =>
              <button key={mode} type="button" aria-pressed={props.mode === mode}
                data-testid={`service-report-mode-${mode}`} onClick={() => props.onModeChange(mode)}
                className={`min-h-9 rounded-md px-4 py-2 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${props.mode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`}>
                {label}
              </button>)}
          </div>
        </fieldset>
      </div>
      <div className="mt-4 space-y-2 border-t border-border pt-4 text-base font-medium leading-8 text-foreground">
        <p>المبيعات الفردية المكتملة مسددة بالكامل؛ لا تظهر عند اختيار «متبقي عليه مبالغ».</p>
        <p>تُطبّق هذه الخيارات على الملخص والتفاصيل والطباعة. العرض المختصر يخفي الجداول دون تغيير الحسابات.</p>
      </div>
    </section>
  );
}
