import * as React from "react";
import { DayPicker, DayButton, getDefaultClassNames } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Hijri helpers ─────────────────────────────────────────────── */
const hijriDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  day: "numeric",
  numberingSystem: "latn",
});

const gregFullFmt = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric",
  month: "long",
  day: "numeric",
  calendar: "gregory",
});

const hijriFullFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

function getHijriDay(date: Date): string {
  try { return hijriDayFmt.format(date); } catch { return ""; }
}

function formatFull(dateStr: string): { gregorian: string; hijri: string } {
  if (!dateStr) return { gregorian: "", hijri: "" };
  try {
    const d = new Date(dateStr + "T12:00:00");
    return { gregorian: gregFullFmt.format(d), hijri: hijriFullFmt.format(d) };
  } catch { return { gregorian: "", hijri: "" }; }
}

/* ── Dual DayButton — shows Gregorian + Hijri day ─────────────── */
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

  const hijriDay = getHijriDay(day.date);
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
      data-day={day.date.toLocaleDateString()}
      data-selected-single={isSelected}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex flex-col items-center justify-center w-full h-auto min-h-[--cell-size] min-w-[--cell-size] rounded-md py-1 px-0 gap-0",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        "data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground",
        "data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-middle=true]:rounded-none",
        modifiers.today && !isSelected && "bg-accent text-accent-foreground",
        modifiers.outside && "opacity-40",
        defaultClassNames.day,
        className
      )}
      {...props}
    >
      <span className="text-sm font-semibold leading-none">{day.date.getDate()}</span>
      {hijriDay && (
        <span
          className={cn(
            "text-[9px] leading-none mt-0.5 font-medium",
            isSelected
              ? "opacity-70"
              : "text-amber-600 dark:text-amber-400"
          )}
        >
          {hijriDay}
        </span>
      )}
    </Button>
  );
}

/* ── Main DualCalendarPicker ───────────────────────────────────── */
interface DualCalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  label?: string;
  className?: string;
}

export function DualCalendarPicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  minDate,
  label,
  className,
}: DualCalendarPickerProps) {
  const [open, setOpen] = React.useState(false);

  const selected = value ? new Date(value + "T12:00:00") : undefined;
  const minDateObj = minDate ? new Date(minDate + "T12:00:00") : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  const { gregorian, hijri } = formatFull(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full text-right bg-transparent border-0 p-0 cursor-pointer outline-none group",
            className
          )}
        >
          {label && (
            <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          )}
          {value ? (
            <div>
              <p className="text-sm font-medium text-foreground leading-tight">{gregorian}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium leading-tight mt-0.5">{hijri}</p>
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
        {/* Header note */}
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900/50">
          <Calendar className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
            الأرقام الكبيرة ميلادية · الأرقام الصغيرة هجرية
          </span>
        </div>

        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          disabled={minDateObj ? { before: minDateObj } : undefined}
          defaultMonth={selected ?? (minDateObj ?? new Date())}
          dir="rtl"
          className="p-3 [--cell-size:2.6rem]"
          classNames={{
            months: "flex flex-col gap-4",
            month: "flex flex-col gap-3",
            month_caption: "flex h-[--cell-size] items-center justify-center px-[--cell-size] font-semibold text-sm",
            nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 px-3 pt-3",
            button_previous: cn(
              "h-[--cell-size] w-[--cell-size] flex items-center justify-center rounded-md hover:bg-accent transition-colors"
            ),
            button_next: cn(
              "h-[--cell-size] w-[--cell-size] flex items-center justify-center rounded-md hover:bg-accent transition-colors"
            ),
            table: "w-full border-collapse",
            weekdays: "flex mb-1",
            weekday: "flex-1 text-center text-[0.7rem] font-medium text-muted-foreground select-none",
            week: "flex w-full mt-1",
            day: "flex-1 relative aspect-square p-0 text-center",
            today: "",
            outside: "",
            disabled: "",
            hidden: "invisible",
          }}
          components={{
            Chevron: ({ orientation }) => {
              if (orientation === "right") return <ChevronRight className="w-4 h-4" />;
              return <ChevronLeft className="w-4 h-4" />;
            },
            DayButton: DualDayButton,
          }}
          formatters={{
            formatCaption: (date) =>
              date.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" }),
            formatWeekdayName: (date) =>
              date.toLocaleDateString("ar-SA", { weekday: "short" }).slice(0, 2),
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
