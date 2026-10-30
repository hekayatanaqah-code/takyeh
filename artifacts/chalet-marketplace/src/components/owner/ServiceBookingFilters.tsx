import React from "react";
import type { PropertyPaymentFilter } from "../../lib/propertyBookingStatus";
import type { ServiceBookingScope } from "../../lib/serviceBookingOperations";

type BookingStatusFilter = "all" | "confirmed" | "pending";

type Props = {
  scope: ServiceBookingScope;
  payment: PropertyPaymentFilter;
  status: BookingStatusFilter;
  onScopeChange: (value: ServiceBookingScope) => void;
  onPaymentChange: (value: PropertyPaymentFilter) => void;
  onStatusChange: (value: BookingStatusFilter) => void;
};

const buttonClass = (selected: boolean) =>
  `min-h-10 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
    selected
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-foreground hover:bg-muted"
  }`;

export function ServiceBookingFilters({ scope, payment, status, onScopeChange, onPaymentChange, onStatusChange }: Props) {
  return (
    <div dir="rtl" data-testid="service-booking-filters"
      className="flex min-w-0 flex-wrap items-end gap-x-5 gap-y-4 rounded-2xl border border-border bg-card p-4">
      <fieldset className="min-w-0 max-w-full">
        <legend className="mb-2 px-1 text-xs font-semibold text-muted-foreground">نطاق السجل</legend>
        <div role="group" aria-label="نطاق سجل حجوزات الخدمات" className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
          {([["active", "الحجوزات النشطة"], ["completed", "أرشيف المكتملة"], ["cancelled", "الملغية"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={scope === value}
              className={buttonClass(scope === value)} onClick={() => onScopeChange(value)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="min-w-0 max-w-full md:border-s md:border-border md:ps-5">
        <legend className="mb-2 px-1 text-xs font-semibold text-muted-foreground">حالة الدفع</legend>
        <div role="group" aria-label="تصفية الحجوزات حسب حالة الدفع" className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
          {([["all", "الكل"], ["unpaid", "متبقي عليه مبالغ"], ["paid", "مسدد بالكامل"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={payment === value}
              className={buttonClass(payment === value)} onClick={() => onPaymentChange(value)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {scope !== "cancelled" && (
        <fieldset className="min-w-0 max-w-full md:border-s md:border-border md:ps-5">
          <legend className="mb-2 px-1 text-xs font-semibold text-muted-foreground">حالة الحجز</legend>
          <div role="group" aria-label="تصفية حجوزات الخدمات حسب الحالة" className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
            {([["all", "الكل"], ["confirmed", "مؤكد"], ["pending", "بانتظار التأكيد"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={status === value}
                className={buttonClass(status === value)} onClick={() => onStatusChange(value)}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
