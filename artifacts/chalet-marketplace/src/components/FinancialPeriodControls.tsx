import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialMonthOption } from "./FinancialMonthOption";

type Props = {
  months: string[];
  years: string[];
  monthNames: readonly string[];
  month: string;
  year: string;
  annual?: boolean;
  hijri: boolean;
  disabled?: boolean;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
};

export function FinancialPeriodControls(props: Props) {
  const year = props.annual ? props.year : props.month.slice(0, 4);
  const months = props.months.filter(key => key.startsWith(`${year}-`));
  const digits = (value: string) => value.replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  return (
    <div className="flex flex-wrap items-center gap-2" dir="rtl">
      <label className="flex items-center gap-2 text-xs font-semibold">
        السنة
        <Select dir="rtl" value={props.years.includes(year) ? year : ""} disabled={props.disabled || !props.years.length}
          onValueChange={value => {
            if (props.annual) props.onYearChange(value);
            else {
              const latestMonth = props.months.find(key => key.startsWith(`${value}-`));
              if (latestMonth) props.onMonthChange(latestMonth);
            }
          }}>
          <SelectTrigger className="h-9 w-32 text-sm" aria-label="سنة التقرير المالي" data-testid="financial-report-year"><SelectValue placeholder="لا توجد سنوات" /></SelectTrigger>
          <SelectContent dir="rtl">
            {props.years.map(value => <SelectItem key={value} value={value}>{digits(value)} {props.hijri ? "هـ" : "م"}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      {!props.annual && <label className="flex items-center gap-2 text-xs font-semibold">
        الشهر
        <Select dir="rtl" value={months.includes(props.month) ? props.month : ""} onValueChange={props.onMonthChange} disabled={props.disabled || !months.length}>
          <SelectTrigger className="h-9 w-40 text-sm" aria-label="شهر التقرير المالي" data-testid="financial-report-month"><SelectValue placeholder="لا توجد أشهر">{months.includes(props.month) ? props.monthNames[Number(props.month.slice(5)) - 1] : undefined}</SelectValue></SelectTrigger>
          <SelectContent dir="rtl">
            {months.map(value => <SelectItem key={value} value={value} textValue={props.monthNames[Number(value.slice(5)) - 1]}>
              <FinancialMonthOption name={props.monthNames[Number(value.slice(5)) - 1]} monthKey={value} hijri={props.hijri} />
            </SelectItem>)}
          </SelectContent>
        </Select>
      </label>}
    </div>
  );
}
