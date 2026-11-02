import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toAr } from "@/lib/utils";
import type { RevenuePeriod } from "@/lib/revenuePeriod";
import { revenueMonthLabel } from "@/lib/revenueMonthLabel";
import { RevenueMonthItem } from "./RevenueMonthItem";

export type QuickSalesHistoryStatus = "all" | "completed" | "cancelled";

export function QuickSalesHistoryStatusFilters({ value, onChange, disabled = false }: {
  value: QuickSalesHistoryStatus;
  onChange: (value: QuickSalesHistoryStatus) => void;
  disabled?: boolean;
}) {
  return <div dir="rtl" role="group" aria-label="حالة البيع السريع"
    data-testid="quick-sales-status-filters" className="flex h-10 w-fit shrink-0 items-stretch gap-1 whitespace-nowrap rounded-lg border border-border bg-secondary/40 p-0.5">
    {([["all", "الكل"], ["completed", "المكتملة"], ["cancelled", "الملغاة"]] as const).map(([status, label]) =>
      <button key={status} type="button" aria-pressed={value === status} disabled={disabled} onClick={() => onChange(status)}
        data-testid={`quick-sales-status-${status}`}
        className={`h-full shrink-0 rounded-md px-4 text-sm font-semibold transition-colors disabled:opacity-50 ${value === status
          ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`}>{label}</button>)}
  </div>;
}

export function QuickSalesHistoryFilters({ period, months, loading, onCalendarChange, onChange }: {
  period: RevenuePeriod;
  months: string[];
  loading: boolean;
  onCalendarChange: (calendar: RevenuePeriod["calendar"]) => void;
  onChange: (period: RevenuePeriod) => void;
}) {
  const years = [...new Set(months.map(month => month.slice(0, 4)))];
  const yearMonths = months.filter(month => month.startsWith(`${period.year}-`));
  return (
    <div className="flex w-fit shrink-0 flex-nowrap items-center gap-2"
      dir="rtl" data-testid="quick-sales-history-filters" aria-label="فلاتر سجل البيع السريع">
      <div className="flex h-10 shrink-0 items-stretch overflow-hidden rounded-lg border border-border text-sm"
        role="group" aria-label="التقويم" data-testid="select-history-calendar">
        {(["hijri", "gregorian"] as const).map(calendar => (
          <button type="button" key={calendar} aria-pressed={period.calendar === calendar}
            disabled={loading} onClick={() => onCalendarChange(calendar)} data-testid={`button-history-calendar-${calendar}`}
            className={`whitespace-nowrap px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${period.calendar === calendar ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>
            {calendar === "gregorian" ? "ميلادي" : "هجري"}
          </button>
        ))}
      </div>
      <Select dir="rtl" value={period.year || "__all__"} disabled={loading}
        onValueChange={year => onChange({ ...period, year: year === "__all__" ? "" : year, month: "" })}>
        <SelectTrigger aria-label="السنة" data-testid="select-history-year" dir="rtl"
          className="h-10 w-[7.5rem] shrink-0 gap-1 rounded-lg border-border bg-background px-2 text-right text-sm [&>svg]:shrink-0">
          <SelectValue placeholder="السنة" />
        </SelectTrigger>
        <SelectContent dir="rtl" align="start" className="text-right">
          <SelectItem value="__all__">كل السنوات</SelectItem>
          {years.map(year => <SelectItem key={year} value={year}>{toAr(year)} {period.calendar === "hijri" ? "هـ" : "م"}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select dir="rtl" value={period.month || "__all__"} disabled={loading || !period.year}
        onValueChange={month => onChange({ ...period, month: month === "__all__" ? "" : month })}>
        <SelectTrigger aria-label="الشهر" data-testid="select-history-month" dir="rtl"
          className="h-10 w-[11rem] shrink-0 gap-1 rounded-lg border-border bg-background px-2 text-right text-sm [&>svg]:shrink-0">
          <span className="min-w-0 flex-1 truncate text-right text-sm font-medium">
            {period.month ? revenueMonthLabel(period.month, period.calendar).primary : "كل الأشهر"}
          </span>
        </SelectTrigger>
        <SelectContent dir="rtl" align="start" className="revenue-gregorian-month-menu text-right">
          <SelectItem value="__all__">كل الأشهر</SelectItem>
          {yearMonths.map(month => <RevenueMonthItem key={month} value={month} {...revenueMonthLabel(month, period.calendar)} />)}
        </SelectContent>
      </Select>
    </div>
  );
}
