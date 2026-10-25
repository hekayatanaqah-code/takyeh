import { useMemo } from "react";
import { financialMonthCounterpart } from "@/lib/financialMonthLabel";

export function FinancialMonthOption({ name, monthKey, hijri }: { name: string; monthKey: string; hijri: boolean }) {
  const counterpart = useMemo(() => financialMonthCounterpart(monthKey, hijri), [monthKey, hijri]);
  return (
    <span className="flex flex-col items-start gap-1 py-0.5 text-right" dir="rtl">
      <span className="text-sm font-medium">{name}</span>
      {counterpart && <span className="max-w-72 whitespace-normal text-[11px] font-normal leading-relaxed text-muted-foreground">{counterpart}</span>}
    </span>
  );
}
