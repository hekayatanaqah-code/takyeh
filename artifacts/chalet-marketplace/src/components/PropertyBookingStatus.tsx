import React from "react";
import type { PropertyPaymentFilter } from "../lib/propertyBookingStatus";
import { propertyBookingArrival } from "../lib/propertyBookingStatus";

export function PropertyBookingPaymentFilters({ value, onChange }: {
  value: PropertyPaymentFilter;
  onChange: (filter: PropertyPaymentFilter) => void;
}) {
  return (
    <div role="group" aria-label="تصفية الحجوزات حسب حالة الدفع" className="flex flex-wrap gap-2 mb-3">
      {([
        ["all", "الكل"],
        ["unpaid", "متبقي عليه مبالغ"],
        ["paid", "مسدد بالكامل"],
      ] as const).map(([filter, label]) => (
        <button
          key={filter}
          type="button"
          aria-pressed={value === filter}
          data-testid={`property-payment-filter-${filter}`}
          onClick={() => onChange(filter)}
          className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            value === filter
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PropertyBookingArrivalBadge({ bookingDate, now }: { bookingDate: string; now: number }) {
  const arrival = propertyBookingArrival(bookingDate, now);
  if (!arrival) return null;
  return (
    <span
      data-testid="property-upcoming-arrival"
      title="تنبيه للتجهيز والتواصل — حسب توقيت السعودية"
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
        arrival === "today"
          ? "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-100"
          : "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100"
      }`}
    >
      {arrival === "today" ? "الوصول اليوم" : "الوصول غداً"}
    </span>
  );
}
