import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RevenueMonthItem } from "./RevenueMonthItem";

type MonthParts = { primary: string; secondary?: string };

export function ReceivablesMonthSelect({ mode, value, onValueChange, months, monthParts, defaultOpen }: {
  mode: "gregorian" | "hijri";
  value: string;
  onValueChange: (value: string) => void;
  months: string[];
  monthParts: (month: string) => MonthParts;
  defaultOpen?: boolean;
}) {
  return (
    <Select
      dir="rtl"
      value={value}
      onValueChange={onValueChange}
      defaultOpen={defaultOpen}
    >
      <SelectTrigger className="h-9 text-sm rounded-lg border-border min-w-[130px] max-w-[200px]" dir="rtl">
        {value !== "__all__" ? (
          <span className="text-sm font-medium">{monthParts(value).primary}</span>
        ) : (
          <span className="text-sm text-muted-foreground">كل الشهور</span>
        )}
      </SelectTrigger>
      <SelectContent dir="rtl" align="end" className="revenue-month-menu" data-calendar={mode}>
        <SelectItem value="__all__">
          <span className="text-sm">كل الشهور</span>
        </SelectItem>
        {months.map(month => {
          const { primary, secondary } = monthParts(month);
          return (
            <RevenueMonthItem key={month} value={month} primary={primary} secondary={secondary} />
          );
        })}
      </SelectContent>
    </Select>
  );
}
