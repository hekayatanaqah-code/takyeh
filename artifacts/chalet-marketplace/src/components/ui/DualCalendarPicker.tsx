import * as React from "react";
import { flushSync } from "react-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  HIJRI_MONTHS_AR,
  toHijriComponents,
  getHijriMonthDays,
  toGregorianStr,
  prevHijriMonth,
  nextHijriMonth,
} from "@/lib/hijri";

/* ── Formatters ── */
const hijriFullFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric", month: "long", day: "numeric",
});
const gregFullFmt = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric", month: "long", day: "numeric", calendar: "gregory",
} as Intl.DateTimeFormatOptions);

const DAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

/* ── Helpers ── */
function formatSelected(dateStr: string): { hijri: string; gregorian: string } {
  if (!dateStr) return { hijri: "", gregorian: "" };
  try {
    const d = new Date(dateStr + "T12:00:00");
    return { hijri: hijriFullFmt.format(d), gregorian: gregFullFmt.format(d) };
  } catch { return { hijri: "", gregorian: "" }; }
}

function getGregRangeLabel(days: Array<{ date: Date; hijriDay: number }>): string {
  if (days.length === 0) return "";
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", calendar: "gregory" };
  const firstLabel = first.toLocaleDateString("ar-SA", opts);
  const lastLabel = last.toLocaleDateString("ar-SA", opts);
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`;
}

/* ── Props ── */
interface DualCalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  label?: string;
  className?: string;
}

/* ── Main component ── */
export function DualCalendarPicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  minDate,
  label,
  className,
}: DualCalendarPickerProps) {
  const [open, setOpen] = React.useState(false);

  /* ── Picker navigation (Hijri month) ── */
  const _initH = React.useMemo(() => {
    if (value) { try { return toHijriComponents(new Date(value + "T12:00:00")); } catch { /* */ } }
    if (minDate) { try { return toHijriComponents(new Date(minDate + "T12:00:00")); } catch { /* */ } }
    return toHijriComponents(new Date());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerHY, setPickerHY] = React.useState(_initH.year);
  const [pickerHM, setPickerHM] = React.useState(_initH.month);

  /* Sync picker to selected value when it changes externally */
  React.useEffect(() => {
    if (value) {
      try {
        const h = toHijriComponents(new Date(value + "T12:00:00"));
        setPickerHY(h.year);
        setPickerHM(h.month);
      } catch { /* */ }
    }
  }, [value]);

  /* ── Month grid ── */
  const monthDays = React.useMemo(
    () => getHijriMonthDays(pickerHY, pickerHM),
    [pickerHY, pickerHM],
  );
  const firstDOW = monthDays[0]?.date.getDay() ?? 0;

  const minDateStr = minDate ?? "";
  const todayStr = toGregorianStr(new Date());

  /* ── Navigation ── */
  const goPrev = () => { const p = prevHijriMonth(pickerHY, pickerHM); setPickerHY(p.year); setPickerHM(p.month); };
  const goNext = () => { const n = nextHijriMonth(pickerHY, pickerHM); setPickerHY(n.year); setPickerHM(n.month); };

  const { hijri, gregorian } = formatSelected(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full text-right bg-transparent border-0 p-0 cursor-pointer outline-none",
            className,
          )}
        >
          {label && (
            <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          )}
          {value ? (
            <div>
              <p className="text-sm font-bold text-foreground leading-tight">{hijri}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{gregorian}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-medium">{placeholder}</p>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto min-w-[22rem] p-4 shadow-xl rounded-2xl border border-border overflow-hidden"
        align="start"
        side="bottom"
        dir="rtl"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-3 gap-2">
          {/* RTL: right arrow = next month */}
          <button
            type="button"
            onClick={goNext}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-base font-bold text-muted-foreground"
            aria-label="الشهر التالي"
          >›</button>

          <div className="flex-1 text-center">
            <p className="text-[1rem] font-bold text-foreground leading-tight">
              {HIJRI_MONTHS_AR[pickerHM - 1]} {pickerHY} هـ
            </p>
            <p className="text-[0.68rem] font-normal text-muted-foreground leading-tight mt-0.5">
              {getGregRangeLabel(monthDays)}
            </p>
          </div>

          <button
            type="button"
            onClick={goPrev}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-base font-bold text-muted-foreground"
            aria-label="الشهر السابق"
          >‹</button>
        </div>

        {/* ── Day-of-week headers ── */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map((d) => (
            <div
              key={d}
              className="text-center text-[0.65rem] font-semibold text-muted-foreground select-none pb-1"
            >{d}</div>
          ))}
        </div>

        {/* ── Day cells ── */}
        <div className="grid grid-cols-7 gap-[2px]">
          {/* Leading empty cells */}
          {Array.from({ length: firstDOW }).map((_, i) => <div key={`pad-${i}`} />)}

          {monthDays.map(({ date, hijriDay }) => {
            const gregStr = toGregorianStr(date);
            const isSelected = value === gregStr;
            const isToday = todayStr === gregStr;
            const isDisabled = !!minDateStr && gregStr < minDateStr;

            return (
              <button
                key={gregStr}
                type="button"
                disabled={isDisabled}
                onClick={() => { onChange(gregStr); flushSync(() => setOpen(false)); }}
                className={cn(
                  "flex flex-col items-center justify-center gap-[2px] w-full aspect-square rounded-lg transition-colors",
                  isDisabled && "opacity-30 pointer-events-none",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "ring-2 ring-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-accent",
                )}
              >
                {/* Hijri day — large, bold */}
                <span className="text-[1.1rem] font-bold leading-none">
                  {hijriDay.toLocaleString("ar-SA")}
                </span>
                {/* Gregorian day — small, muted */}
                <span
                  className="text-[0.62rem] font-normal leading-none"
                  style={{ color: isSelected ? "rgba(255,255,255,0.6)" : "#a1a1aa" }}
                >
                  {date.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const h = toHijriComponents(today);
              setPickerHY(h.year);
              setPickerHM(h.month);
              onChange(todayStr);
              flushSync(() => setOpen(false));
            }}
            className="text-[0.7rem] text-primary hover:text-primary/80 font-medium transition-colors"
          >اليوم</button>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); flushSync(() => setOpen(false)); }}
              className="text-[0.7rem] text-muted-foreground hover:text-destructive transition-colors"
            >مسح</button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
