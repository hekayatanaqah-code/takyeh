import * as React from "react";
import { DayPicker, DayButton, MonthCaption, getDefaultClassNames } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Formatters (module-level singletons) ──────────────────────── */
const hijriDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  day: "numeric",
  numberingSystem: "latn",
});
const hijriMonthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  month: "long",
});
const hijriYearFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric",
  numberingSystem: "latn",
});
const hijriFullFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const gregFullFmt = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric",
  month: "long",
  day: "numeric",
  calendar: "gregory",
});
const gregCaptionFmt = new Intl.DateTimeFormat("ar-SA", {
  month: "long",
  year: "numeric",
  calendar: "gregory",
});

/* ── Hijri helpers ─────────────────────────────────────────────── */
function getHijriDay(date: Date): string {
  try { return hijriDayFmt.format(date); } catch { return ""; }
}

/**
 * Returns the Hijri caption for a Gregorian display month.
 * Handles the case where a Gregorian month spans TWO Hijri months.
 */
function getHijriCaption(displayMonth: Date): string {
  try {
    const firstDay = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
    const lastDay  = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0);

    const firstHijriMonth = hijriMonthFmt.format(firstDay);
    const lastHijriMonth  = hijriMonthFmt.format(lastDay);
    const firstHijriYear  = hijriYearFmt.format(firstDay);
    const lastHijriYear   = hijriYearFmt.format(lastDay);

    if (firstHijriMonth === lastHijriMonth && firstHijriYear === lastHijriYear) {
      return `${firstHijriMonth} ${firstHijriYear}`;
    }
    if (firstHijriYear === lastHijriYear) {
      return `${firstHijriMonth} - ${lastHijriMonth} ${firstHijriYear}`;
    }
    return `${firstHijriMonth} ${firstHijriYear} - ${lastHijriMonth} ${lastHijriYear}`;
  } catch { return ""; }
}

function formatSelected(dateStr: string): { hijri: string; gregorian: string } {
  if (!dateStr) return { hijri: "", gregorian: "" };
  try {
    const d = new Date(dateStr + "T12:00:00");
    return { hijri: hijriFullFmt.format(d), gregorian: gregFullFmt.format(d) };
  } catch { return { hijri: "", gregorian: "" }; }
}

/* ── Custom Caption (two-line Hijri-primary header) ─────────────── */
function HijriCaptionLabel({ displayMonth }: { displayMonth: Date }) {
  const hijriCaption = getHijriCaption(displayMonth);
  const gregCaption  = gregCaptionFmt.format(displayMonth);

  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span className="text-base font-bold text-foreground leading-tight">{hijriCaption}</span>
      <span className="text-[11px] font-normal text-muted-foreground leading-tight">{gregCaption}</span>
    </div>
  );
}

function HijriMonthCaption(props: React.ComponentProps<typeof MonthCaption>) {
  return (
    <div className="flex h-12 items-center justify-center px-10">
      <HijriCaptionLabel displayMonth={props.calendarMonth.date} />
    </div>
  );
}

/* ── Day cell — Hijri is PRIMARY (large), Gregorian is corner ──── */
function DualDayButton({
  day,
  modifiers,
  className,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const hijriDay  = getHijriDay(day.date);
  const gregDay   = day.date.getDate();

  const isSelected =
    modifiers.selected &&
    !modifiers.range_start &&
    !modifiers.range_end &&
    !modifiers.range_middle;

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-selected-single={isSelected}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-auto min-h-[--cell-size] min-w-[--cell-size] rounded-md py-1 px-0 gap-0",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground",
        "data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-middle=true]:rounded-none",
        modifiers.today && !isSelected && "ring-1 ring-primary/40 bg-accent/50",
        modifiers.outside && "opacity-35",
        defaultClassNames.day,
        className
      )}
      {...props}
    >
      {/* Gregorian day — small, top-left corner (visually top-right in RTL) */}
      <span
        className={cn(
          "absolute top-1 right-1 text-[9px] font-normal leading-none",
          isSelected ? "opacity-60" : "text-muted-foreground"
        )}
      >
        {gregDay}
      </span>

      {/* Hijri day — large, centred */}
      <span className="text-base font-bold leading-none">{hijriDay}</span>
    </Button>
  );
}

/* ── Props ────────────────────────────────────────────────────────── */
interface DualCalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  label?: string;
  className?: string;
}

/* ── Main component ────────────────────────────────────────────── */
export function DualCalendarPicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  minDate,
  label,
  className,
}: DualCalendarPickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected    = value    ? new Date(value    + "T12:00:00") : undefined;
  const minDateObj  = minDate  ? new Date(minDate  + "T12:00:00") : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    // Defer the close by one frame so DayPicker finishes its internal update first
    requestAnimationFrame(() => setOpen(false));
  };

  const { hijri, gregorian } = formatSelected(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full text-right bg-transparent border-0 p-0 cursor-pointer outline-none",
            className
          )}
        >
          {label && (
            <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          )}
          {value ? (
            <div>
              {/* Hijri date — primary / large */}
              <p className="text-sm font-bold text-foreground leading-tight">{hijri}</p>
              {/* Gregorian date — secondary / small */}
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{gregorian}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground font-medium">{placeholder}</p>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 shadow-xl rounded-2xl border border-border overflow-hidden"
        align="start"
        side="bottom"
        dir="rtl"
      >
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          disabled={minDateObj ? { before: minDateObj } : undefined}
          defaultMonth={selected ?? (minDateObj ?? new Date())}
          dir="rtl"
          className="p-3 [--cell-size:2.75rem]"
          classNames={{
            months:         "flex flex-col gap-4",
            month:          "flex flex-col gap-3",
            month_caption:  "flex h-12 items-center justify-center px-10 relative",
            nav:            "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 px-2 pt-1.5",
            button_previous: "h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors",
            button_next:     "h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors",
            table:    "w-full border-collapse",
            weekdays: "flex mb-1",
            weekday:  "flex-1 text-center text-[0.68rem] font-semibold text-muted-foreground select-none",
            week:     "flex w-full mt-1",
            day:      "flex-1 relative aspect-square p-0 text-center",
            today:    "",
            outside:  "",
            disabled: "opacity-30 pointer-events-none",
            hidden:   "invisible",
          }}
          components={{
            Chevron: ({ orientation }) =>
              orientation === "right"
                ? <ChevronRight className="w-4 h-4" />
                : <ChevronLeft  className="w-4 h-4" />,
            MonthCaption: HijriMonthCaption,
            DayButton: DualDayButton,
          }}
          formatters={{
            formatWeekdayName: (date) =>
              date.toLocaleDateString("ar-SA", { weekday: "short" }).replace("ال", "").slice(0, 2),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
