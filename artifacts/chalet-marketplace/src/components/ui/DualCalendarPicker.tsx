import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  HIJRI_MONTHS_AR,
  toHijriComponents,
  getHijriMonthDays,
  toGregorianStr,
  prevHijriMonth,
  nextHijriMonth,
} from "@/lib/hijri";
import type { GlobalSeason } from "@/hooks/useGlobalSeasons";

/* ── Formatters ── */
const hijriFullFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric", month: "long", day: "numeric",
});
const gregFullFmt = new Intl.DateTimeFormat("ar-SA", {
  year: "numeric", month: "long", day: "numeric", calendar: "gregory",
} as Intl.DateTimeFormatOptions);

const DAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
const GREG_MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const EMPTY_SEASONS: GlobalSeason[] = [];

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

function daysInGregMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function gregFirstDOW(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function gregDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/* ── Props ── */
interface DualCalendarPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  /** Inclusive upper bound — days/months/years beyond this date are disabled. */
  maxDate?: string;
  /** When no value is selected, open the picker navigation on this date's month (instead of current month or minDate). */
  initialDate?: string;
  label?: string;
  className?: string;
  compact?: boolean;
  mode?: "hijri" | "gregorian";
  /** Active global seasons used to highlight dates in the customer calendar. */
  seasons?: GlobalSeason[];
  /** Alias for seasons for callers that refer to these as calendar highlights. */
  highlights?: GlobalSeason[];
}

type PickerView = "days" | "months" | "years";

/* ── Main component ── */
export function DualCalendarPicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  minDate,
  maxDate,
  initialDate,
  label,
  className,
  compact = false,
  mode = "hijri",
  seasons,
  highlights,
}: DualCalendarPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [pickerView, setPickerView] = React.useState<PickerView>("days");
  const [calendarMode, setCalendarMode] = React.useState<"hijri" | "gregorian">(mode);

  React.useEffect(() => {
    setCalendarMode(mode);
  }, [mode]);

  /* ── Hijri navigation state — init on value, then current month (NOT minDate) ── */
  const _initH = React.useMemo(() => {
    if (value) { try { return toHijriComponents(new Date(value + "T12:00:00")); } catch { /* */ } }
    return toHijriComponents(new Date());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerHY, setPickerHY] = React.useState(_initH.year);
  const [pickerHM, setPickerHM] = React.useState(_initH.month);

  /* ── Gregorian navigation state — init on value, then current month ── */
  const _initG = React.useMemo(() => {
    const d = value ? new Date(value + "T12:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerGY, setPickerGY] = React.useState(_initG.year);
  const [pickerGM, setPickerGM] = React.useState(_initG.month);

  /* Sync picker navigation when value changes externally */
  React.useEffect(() => {
    if (value) {
      try {
        const h = toHijriComponents(new Date(value + "T12:00:00"));
        setPickerHY(h.year); setPickerHM(h.month);
        const g = new Date(value + "T12:00:00");
        setPickerGY(g.getFullYear()); setPickerGM(g.getMonth());
      } catch { /* */ }
    }
  }, [value]);

  /* When popover opens without a selected value, jump to initialDate's month */
  React.useEffect(() => {
    if (open && !value && initialDate) {
      try {
        const h = toHijriComponents(new Date(initialDate + "T12:00:00"));
        setPickerHY(h.year); setPickerHM(h.month);
        const g = new Date(initialDate + "T12:00:00");
        setPickerGY(g.getFullYear()); setPickerGM(g.getMonth());
      } catch { /* */ }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Reset to days view when popover closes */
  React.useEffect(() => {
    if (!open) setPickerView("days");
  }, [open]);

  /* ── Hijri month grid ── */
  const hijriMonthDays = React.useMemo(
    () => getHijriMonthDays(pickerHY, pickerHM),
    [pickerHY, pickerHM],
  );
  const hijriFirstDOW = hijriMonthDays[0]?.date.getDay() ?? 0;

  /* ── Gregorian month grid ── */
  const gregDayCount = daysInGregMonth(pickerGY, pickerGM);
  const gregFirst = gregFirstDOW(pickerGY, pickerGM);

  const minDateStr = minDate ?? "";
  const maxDateStr = maxDate ?? "";
  const todayStr = toGregorianStr(new Date());

  const seasonInput = seasons ?? highlights ?? EMPTY_SEASONS;
  const normalizedSeasons = React.useMemo(
    () => seasonInput
      .filter((season) => season.isActive !== false && season.startDate && season.endDate)
      .map((season) => ({
        ...season,
        startDate: season.startDate.slice(0, 10),
        endDate: season.endDate.slice(0, 10),
      })),
    [seasonInput],
  );

  const getSeasonHighlights = React.useCallback((gregStr: string) => (
    normalizedSeasons.filter(
      (season) => gregStr >= season.startDate && gregStr <= season.endDate,
    )
  ), [normalizedSeasons]);

  const visibleGregorianDates = React.useMemo(() => {
    if (calendarMode === "hijri") {
      return hijriMonthDays.map(({ date }) => toGregorianStr(date));
    }
    return Array.from({ length: gregDayCount }, (_, i) => gregDateStr(pickerGY, pickerGM, i + 1));
  }, [calendarMode, gregDayCount, hijriMonthDays, pickerGM, pickerGY]);

  const visibleSeasons = React.useMemo(() => {
    const ids = new Set<number>();
    visibleGregorianDates.forEach((gregStr) => {
      getSeasonHighlights(gregStr).forEach((season) => ids.add(season.id));
    });
    return normalizedSeasons.filter((season) => ids.has(season.id));
  }, [getSeasonHighlights, normalizedSeasons, visibleGregorianDates]);

  const seasonNames = (highlights: GlobalSeason[]) => highlights.map((season) => season.nameAr).join("، ");
  const dayAriaLabel = (gregStr: string, highlights: GlobalSeason[]) => {
    const date = new Date(`${gregStr}T12:00:00`);
    const gregLabel = gregFullFmt.format(date);
    const hijriLabel = hijriFullFmt.format(date);
    const dateLabel = calendarMode === "hijri"
      ? `${hijriLabel}، الموافق ${gregLabel}`
      : `${gregLabel}، الموافق ${hijriLabel}`;
    const names = seasonNames(highlights);
    return names ? `${dateLabel} — ${names}` : dateLabel;
  };

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setCalendarMode(mode);
      setPickerView("days");

      if (!value) {
        const initialValue =
          minDateStr && todayStr < minDateStr
            ? minDateStr
            : maxDateStr && todayStr > maxDateStr
              ? maxDateStr
              : todayStr;
        const initial = new Date(initialValue + "T12:00:00");
        const h = toHijriComponents(initial);
        setPickerHY(h.year);
        setPickerHM(h.month);
        setPickerGY(initial.getFullYear());
        setPickerGM(initial.getMonth());
        onChange(initialValue);
      }
    }
    setOpen(nextOpen);
  }, [maxDateStr, minDateStr, mode, onChange, todayStr, value]);

  /* ── Year/month ranges for picker ── */
  const nowH = React.useMemo(() => toHijriComponents(new Date()), []);
  const nowG = React.useMemo(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }), []);

  /* Derived max bounds (without maxDate, allow normal future booking/navigation). */
  const maxH = React.useMemo(() => {
    if (maxDate) { try { return toHijriComponents(new Date(maxDate + "T12:00:00")); } catch { /* */ } }
    return { year: nowH.year + 10, month: 12, day: 30 };
  }, [maxDate, nowH]);

  const maxG = React.useMemo(() => {
    if (maxDate) { try { const d = new Date(maxDate + "T12:00:00"); return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }; } catch { /* */ } }
    return { year: nowG.year + 10, month: 11, day: 31 };
  }, [maxDate, nowG]);

  const minHY = React.useMemo(() => {
    if (minDate) { try { return toHijriComponents(new Date(minDate + "T12:00:00")).year; } catch { /* */ } }
    return nowH.year - 12;
  }, [minDate, nowH.year]);

  const minGY = React.useMemo(() => {
    if (minDate) { try { return new Date(minDate + "T12:00:00").getFullYear(); } catch { /* */ } }
    return nowG.year - 10;
  }, [minDate, nowG.year]);

  const minHM = React.useMemo(() => {
    if (minDate) { try { return toHijriComponents(new Date(minDate + "T12:00:00")).month; } catch { /* */ } }
    return 1;
  }, [minDate]);

  const minGM = React.useMemo(() => {
    if (minDate) { try { return new Date(minDate + "T12:00:00").getMonth(); } catch { /* */ } }
    return 0;
  }, [minDate]);

  /* Hijri year list — newest first, capped at maxDate year */
  const hijriYears = React.useMemo(
    () => Array.from({ length: maxH.year - minHY + 1 }, (_, i) => maxH.year - i),
    [maxH.year, minHY],
  );

  /* Gregorian year list — newest first, capped at maxDate year */
  const gregYears = React.useMemo(
    () => Array.from({ length: maxG.year - minGY + 1 }, (_, i) => maxG.year - i),
    [maxG.year, minGY],
  );

  /* ── Navigation ── */
  const goPrevHijri = () => { const p = prevHijriMonth(pickerHY, pickerHM); setPickerHY(p.year); setPickerHM(p.month); };
  const goNextHijri = () => { const n = nextHijriMonth(pickerHY, pickerHM); setPickerHY(n.year); setPickerHM(n.month); };

  const goPrevGreg = () => {
    if (pickerGM === 0) { setPickerGY(y => y - 1); setPickerGM(11); }
    else setPickerGM(m => m - 1);
  };
  const goNextGreg = () => {
    if (pickerGM === 11) { setPickerGY(y => y + 1); setPickerGM(0); }
    else setPickerGM(m => m + 1);
  };

  const goPrev = calendarMode === "gregorian" ? goPrevGreg : goPrevHijri;
  const goNext = calendarMode === "gregorian" ? goNextGreg : goNextHijri;

  const { hijri, gregorian } = formatSelected(value);

  /* ── Trigger label ── */
  const primaryLabel  = mode === "gregorian" ? gregorian : hijri;
  const secondaryLabel = mode === "gregorian" ? hijri     : gregorian;

  /* ── Helpers: disable year/month/day in picker ── */
  const isYearDisabled = (y: number) => {
    if (calendarMode === "hijri") return y > maxH.year;
    return y > maxG.year;
  };
  const isMonthDisabledInYear = (m: number /* 1-based for hijri, 0-based for greg */) => {
    if (calendarMode === "hijri") {
      if (pickerHY === minHY && m < minHM) return true;
      if (pickerHY === maxH.year && m > maxH.month) return true;
      if (pickerHY > maxH.year) return true;
      return false;
    } else {
      if (pickerGY === minGY && m < minGM) return true;
      if (pickerGY === maxG.year && m > maxG.month) return true;
      if (pickerGY > maxG.year) return true;
      return false;
    }
  };

  /* Keep bounded customer calendars inside their allowed month range. */
  const isPrevMonthDisabled = React.useMemo(() => {
    if (!minDateStr) return false;
    if (calendarMode === "hijri") {
      return pickerHY < minHY || (pickerHY === minHY && pickerHM <= minHM);
    }
    return pickerGY < minGY || (pickerGY === minGY && pickerGM <= minGM);
  }, [calendarMode, minDateStr, minHY, minHM, minGY, minGM, pickerHY, pickerHM, pickerGY, pickerGM]);

  const isNextMonthDisabled = React.useMemo(() => {
    if (calendarMode === "hijri") {
      return pickerHY > maxH.year || (pickerHY === maxH.year && pickerHM >= maxH.month);
    }
    return pickerGY > maxG.year || (pickerGY === maxG.year && pickerGM >= maxG.month);
  }, [calendarMode, pickerHY, pickerHM, pickerGY, pickerGM, maxH, maxG]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={label ?? placeholder}
          aria-expanded={open}
          className={cn(
            "w-full text-right bg-transparent border-0 p-0 cursor-pointer outline-none touch-manipulation focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 rounded-md",
            compact && "h-full flex items-center",
            className,
          )}
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          {label && !compact && (
            <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
          )}
          {value ? (
            compact ? (
              <p className="text-sm font-semibold text-foreground truncate leading-none">{primaryLabel}</p>
            ) : (
              <div>
                <p className="text-sm font-bold text-foreground leading-tight">{primaryLabel}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{secondaryLabel}</p>
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground font-medium">{placeholder}</p>
          )}
        </button>
      </DialogTrigger>

      <DialogContent
        data-testid="dual-calendar-popover"
        hideClose
        className="w-[calc(100vw-2rem)] max-w-[22rem] min-w-0 max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto overscroll-contain rounded-2xl border border-border p-4 shadow-xl touch-pan-y [-webkit-overflow-scrolling:touch]"
        dir="rtl"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">{label ?? placeholder}</DialogTitle>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="نوع التقويم">
          <button
            type="button"
            aria-pressed={calendarMode === "hijri"}
            onClick={() => {
              setCalendarMode("hijri");
              setPickerView("days");
            }}
            className={cn(
              "min-h-9 rounded-lg px-3 text-sm font-semibold transition-colors touch-manipulation",
              calendarMode === "hijri"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            هجري
          </button>
          <button
            type="button"
            aria-pressed={calendarMode === "gregorian"}
            onClick={() => {
              setCalendarMode("gregorian");
              setPickerView("days");
            }}
            className={cn(
              "min-h-9 rounded-lg px-3 text-sm font-semibold transition-colors touch-manipulation",
              calendarMode === "gregorian"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            ميلادي
          </button>
        </div>

        {/* ══ YEARS VIEW ══ */}
        {pickerView === "years" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">اختر السنة</span>
              <button
                type="button"
                onClick={() => setPickerView("days")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
              >✕</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-60 overflow-y-auto">
              {(calendarMode === "hijri" ? hijriYears : gregYears).map((y) => {
                const disabled = isYearDisabled(y);
                const isCurrent = calendarMode === "hijri" ? y === pickerHY : y === pickerGY;
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (calendarMode === "hijri") setPickerHY(y);
                      else setPickerGY(y);
                      setPickerView("months");
                    }}
                    className={cn(
                      "pointer-events-auto touch-manipulation py-2 rounded-lg text-sm font-semibold transition-colors",
                      disabled ? "pointer-events-none text-[#9ca3af] cursor-not-allowed line-through" : (
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent text-foreground"
                      ),
                    )}
                  >
                    {calendarMode === "hijri"
                      ? `${y} هـ`
                      : `${y} م`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ MONTHS VIEW ══ */}
        {pickerView === "months" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setPickerView("years")}
                className="text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
              >
                {calendarMode === "hijri" ? `${pickerHY} هـ` : `${pickerGY} م`}
              </button>
              <span className="text-sm font-bold text-foreground">اختر الشهر</span>
              <button
                type="button"
                onClick={() => setPickerView("days")}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
              >✕</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(calendarMode === "hijri" ? HIJRI_MONTHS_AR : GREG_MONTHS_AR).map((name, idx) => {
                const mNum = calendarMode === "hijri" ? idx + 1 : idx; // hijri: 1-based, greg: 0-based
                const disabled = isMonthDisabledInYear(mNum);
                const isCurrent = calendarMode === "hijri" ? pickerHM === mNum : pickerGM === mNum;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (calendarMode === "hijri") setPickerHM(mNum);
                      else setPickerGM(mNum);
                      setPickerView("days");
                    }}
                    className={cn(
                      "pointer-events-auto touch-manipulation py-2 rounded-lg text-sm font-semibold transition-colors",
                      disabled ? "pointer-events-none text-[#9ca3af] cursor-not-allowed" : (
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent text-foreground"
                      ),
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ DAYS VIEW ══ */}
        {pickerView === "days" && (
          <>
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-3 gap-2">
              {/* RTL: right button = next month */}
              <button
                type="button"
                onClick={goNext}
                disabled={isNextMonthDisabled}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-base font-bold",
                  isNextMonthDisabled
                    ? "opacity-25 cursor-not-allowed text-muted-foreground"
                    : "hover:bg-accent text-muted-foreground",
                )}
                aria-label="الشهر التالي"
              >›</button>

              {/* Clickable month/year header → opens year picker */}
              <button
                type="button"
                onClick={() => setPickerView("years")}
                className="flex-1 text-center rounded-lg py-1 hover:bg-accent transition-colors group"
                title="اختر السنة والشهر مباشرة"
              >
                {calendarMode === "hijri" ? (
                  <>
                    <p className="text-[1rem] font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                      {HIJRI_MONTHS_AR[pickerHM - 1]} {pickerHY} هـ
                      <span className="mr-1 text-xs text-muted-foreground/60">▾</span>
                    </p>
                    <p className="text-[0.68rem] font-normal text-muted-foreground leading-tight mt-0.5">
                      {getGregRangeLabel(hijriMonthDays)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[1rem] font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                      {GREG_MONTHS_AR[pickerGM]} {pickerGY} م
                      <span className="mr-1 text-xs text-muted-foreground/60">▾</span>
                    </p>
                    <p className="text-[0.68rem] font-normal text-muted-foreground leading-tight mt-0.5">
                      {(() => {
                        try {
                          const d1 = new Date(pickerGY, pickerGM, 1);
                          const h1 = toHijriComponents(d1);
                          const d2 = new Date(pickerGY, pickerGM + 1, 0);
                          const h2 = toHijriComponents(d2);
                          if (h1.month === h2.month)
                            return `${HIJRI_MONTHS_AR[h1.month - 1]} ${h1.year} هـ`;
                          return `${HIJRI_MONTHS_AR[h1.month - 1]} – ${HIJRI_MONTHS_AR[h2.month - 1]} ${h2.year} هـ`;
                        } catch { return ""; }
                      })()}
                    </p>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={goPrev}
                disabled={isPrevMonthDisabled}
                className={cn(
                  "h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-base font-bold",
                  isPrevMonthDisabled
                    ? "opacity-25 cursor-not-allowed text-muted-foreground"
                    : "hover:bg-accent text-muted-foreground",
                )}
                aria-label="الشهر السابق"
              >‹</button>
            </div>

            {/* ── Day-of-week headers ── */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="text-center text-[0.65rem] font-semibold text-muted-foreground select-none pb-1">{d}</div>
              ))}
            </div>

            {/* ── Day cells ── */}
            {calendarMode === "hijri" ? (
              <div className="grid grid-cols-7 gap-[2px]" data-testid="dual-calendar-day-grid">
                {Array.from({ length: hijriFirstDOW }).map((_, i) => <div key={`pad-${i}`} />)}
                {hijriMonthDays.map(({ date, hijriDay }) => {
                  const gregStr = toGregorianStr(date);
                  const isSelected = value === gregStr;
                  const isToday = todayStr === gregStr;
                  const isDisabled = (!!minDateStr && gregStr < minDateStr) || (!!maxDateStr && gregStr > maxDateStr);
                   const highlights = getSeasonHighlights(gregStr);
                   const seasonLabel = seasonNames(highlights);
                  return (
                    <button
                      key={gregStr}
                      type="button"
                       data-calendar-day={gregStr}
                       aria-label={dayAriaLabel(gregStr, highlights)}
                       title={seasonLabel || undefined}
                      disabled={isDisabled}
                      onClick={() => { onChange(gregStr); setOpen(false); }}
                      style={{
                        pointerEvents: isDisabled ? "none" : "auto",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        backgroundColor: !isSelected && !isToday && !isDisabled && highlights[0]
                          ? `color-mix(in srgb, ${highlights[0].color} 16%, transparent)`
                          : undefined,
                      }}
                      className={cn(
                        "pointer-events-auto relative flex flex-col items-center justify-center gap-[2px] w-full aspect-square rounded-lg transition-colors touch-manipulation",
                        isDisabled && "opacity-30 pointer-events-none",
                        isSelected ? "bg-primary text-primary-foreground"
                          : isToday ? "ring-2 ring-primary/40 bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="text-[1.1rem] font-bold leading-none">{hijriDay.toLocaleString("ar-SA")}</span>
                      <span className="text-[0.62rem] font-normal leading-none" style={{ color: isSelected ? "rgba(255,255,255,0.6)" : "#a1a1aa" }}>
                        {date.getDate()}
                      </span>
                      {highlights.length > 0 && (
                        <span className="absolute inset-x-1 bottom-0.5 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                          {highlights.map((season) => (
                            <span key={season.id} className="min-w-0 flex-1 rounded-full" style={{ backgroundColor: season.color }} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-[2px]" data-testid="dual-calendar-day-grid">
                {Array.from({ length: gregFirst }).map((_, i) => <div key={`pad-${i}`} />)}
                {Array.from({ length: gregDayCount }, (_, i) => i + 1).map((day) => {
                  const gregStr = gregDateStr(pickerGY, pickerGM, day);
                  const isSelected = value === gregStr;
                  const isToday = todayStr === gregStr;
                  const isDisabled = (!!minDateStr && gregStr < minDateStr) || (!!maxDateStr && gregStr > maxDateStr);
                   const highlights = getSeasonHighlights(gregStr);
                   const seasonLabel = seasonNames(highlights);
                  let hijriDay = 0;
                  try { hijriDay = toHijriComponents(new Date(gregStr + "T12:00:00")).day; } catch { /* */ }
                  return (
                    <button
                      key={gregStr}
                      type="button"
                       data-calendar-day={gregStr}
                       aria-label={dayAriaLabel(gregStr, highlights)}
                       title={seasonLabel || undefined}
                      disabled={isDisabled}
                      onClick={() => { onChange(gregStr); setOpen(false); }}
                      style={{
                        pointerEvents: isDisabled ? "none" : "auto",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        backgroundColor: !isSelected && !isToday && !isDisabled && highlights[0]
                          ? `color-mix(in srgb, ${highlights[0].color} 16%, transparent)`
                          : undefined,
                      }}
                      className={cn(
                        "pointer-events-auto relative flex flex-col items-center justify-center gap-[2px] w-full aspect-square rounded-lg transition-colors touch-manipulation",
                        isDisabled && "opacity-30 pointer-events-none",
                        isSelected ? "bg-primary text-primary-foreground"
                          : isToday ? "ring-2 ring-primary/40 bg-primary/5 hover:bg-primary/10"
                          : "hover:bg-accent",
                      )}
                    >
                      {/* Gregorian day — large, bold */}
                      <span className="text-[1.1rem] font-bold leading-none">{day.toLocaleString("ar-SA")}</span>
                      {/* Hijri day — small, muted */}
                      <span className="text-[0.62rem] font-normal leading-none" style={{ color: isSelected ? "rgba(255,255,255,0.6)" : "#a1a1aa" }}>
                        {hijriDay > 0 ? hijriDay.toLocaleString("ar-SA") : ""}
                      </span>
                      {highlights.length > 0 && (
                        <span className="absolute inset-x-1 bottom-0.5 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                          {highlights.map((season) => (
                            <span key={season.id} className="min-w-0 flex-1 rounded-full" style={{ backgroundColor: season.color }} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {visibleSeasons.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.68rem] text-muted-foreground" aria-label="مواسم الفترة" role="list">
                {visibleSeasons.map((season) => (
                  <span key={season.id} className="inline-flex items-center gap-1 whitespace-nowrap" role="listitem">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: season.color }} aria-hidden="true" />
                    {season.nameAr}
                  </span>
                ))}
              </div>
            )}

            {/* ── Footer ── */}
            <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  const h = toHijriComponents(today);
                  setPickerHY(h.year); setPickerHM(h.month);
                  setPickerGY(today.getFullYear()); setPickerGM(today.getMonth());
                  onChange(todayStr);
                   setOpen(false);
                }}
                className="text-[0.7rem] text-primary hover:text-primary/80 font-medium transition-colors"
              >اليوم</button>
              {value && (
                <button
                  type="button"
                 onClick={() => { onChange(""); setOpen(false); }}
                  className="text-[0.7rem] text-muted-foreground hover:text-destructive transition-colors"
                >مسح</button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
