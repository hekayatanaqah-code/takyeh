import { useState, useMemo, useRef, useEffect } from "react";
import {
  HIJRI_MONTHS_AR,
  toHijriComponents,
  getHijriMonthDays,
  toGregorianStr,
  prevHijriMonth,
  nextHijriMonth,
} from "@/lib/hijri";

/* Arabic day-of-week headers (Sun → Sat) */
const DAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

/* ── Component ── */

export interface HijriDatePickerProps {
  /** Gregorian date string "YYYY-MM-DD" or "" */
  value: string;
  /** Called with Gregorian "YYYY-MM-DD" string on selection */
  onChange: (gregorian: string) => void;
  className?: string;
  placeholder?: string;
}

export function HijriDatePicker({
  value,
  onChange,
  className = "",
  placeholder = "اختر تاريخاً",
}: HijriDatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Picker navigation state ── */
  const todayHijri = useMemo(() => toHijriComponents(new Date()), []);
  const initHijri = useMemo(() => {
    if (value) {
      try { return toHijriComponents(new Date(value + "T12:00:00")); } catch { /* */ }
    }
    return todayHijri;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerHY, setPickerHY] = useState(initHijri.year);
  const [pickerHM, setPickerHM] = useState(initHijri.month);

  /* Sync picker position when value changes externally */
  useEffect(() => {
    if (value) {
      try {
        const h = toHijriComponents(new Date(value + "T12:00:00"));
        setPickerHY(h.year);
        setPickerHM(h.month);
      } catch { /* */ }
    }
  }, [value]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  /* Month days for the current picker month */
  const monthDays = useMemo(
    () => getHijriMonthDays(pickerHY, pickerHM),
    [pickerHY, pickerHM],
  );

  /* First day-of-week of the Hijri month (0=Sun) */
  const firstDOW = monthDays[0]?.date.getDay() ?? 0;

  /* ── Navigation helpers ── */
  const goPrev = () => { const p = prevHijriMonth(pickerHY, pickerHM); setPickerHY(p.year); setPickerHM(p.month); };
  const goNext = () => { const n = nextHijriMonth(pickerHY, pickerHM); setPickerHY(n.year); setPickerHM(n.month); };

  /* ── Gregorian range label (secondary header) ── */
  const gregRangeLabel = useMemo(() => {
    if (monthDays.length === 0) return "";
    const first = monthDays[0].date;
    const last = monthDays[monthDays.length - 1].date;
    const opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", calendar: "gregory" };
    const a = first.toLocaleDateString("ar-SA", opts);
    const b = last.toLocaleDateString("ar-SA", opts);
    return a === b ? a : `${a} – ${b}`;
  }, [monthDays]);

  /* ── Computed display string ── */
  const displayStr = useMemo(() => {
    if (!value) return null;
    try {
      const d = new Date(value + "T12:00:00");
      const h = toHijriComponents(d);
      const hijriLabel = `${h.day.toLocaleString("ar-SA")} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year} هـ`;
      const gregLabel = d.toLocaleDateString("ar-SA", {
        day: "numeric", month: "long", year: "numeric",
        calendar: "gregory",
      } as Intl.DateTimeFormatOptions);
      return { hijriLabel, gregLabel };
    } catch { return null; }
  }, [value]);

  /* Today's Gregorian string for comparison */
  const todayStr = useMemo(() => toGregorianStr(new Date()), []);

  return (
    <div className={`relative ${className}`} ref={containerRef} dir="rtl">
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-background border border-border rounded-lg px-2.5 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-teal-400/50 hover:border-teal-400/70 transition-colors"
      >
        {displayStr ? (
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold leading-tight">{displayStr.hijriLabel}</span>
            <span className="block text-[9px] text-muted-foreground leading-tight">{displayStr.gregLabel}</span>
          </span>
        ) : (
          <span className="flex-1 text-[11px] text-muted-foreground">{placeholder}</span>
        )}
        <span className="text-base shrink-0 leading-none">📅</span>
      </button>

      {/* ── Dropdown picker ── */}
      {open && (
        <div className="absolute z-[100] top-full mt-1 right-0 w-72 bg-background border border-border rounded-xl shadow-2xl p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5 gap-2">
            <button
              type="button"
              onClick={goNext}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-sm font-bold text-muted-foreground"
              aria-label="الشهر التالي"
            >›</button>

            <div className="flex-1 text-center">
              <p className="text-[13px] font-bold text-foreground">
                {HIJRI_MONTHS_AR[pickerHM - 1]} {pickerHY} هـ
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{gregRangeLabel}</p>
            </div>

            <button
              type="button"
              onClick={goPrev}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-sm font-bold text-muted-foreground"
              aria-label="الشهر السابق"
            >‹</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="text-center text-[9px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: firstDOW }).map((_, i) => <div key={`pad-${i}`} />)}

            {monthDays.map(({ date, hijriDay }) => {
              const gregStr = toGregorianStr(date);
              const isSelected = value === gregStr;
              const isToday = todayStr === gregStr;

              return (
                <button
                  key={gregStr}
                  type="button"
                  onClick={() => { onChange(gregStr); setOpen(false); }}
                  className={[
                    "flex flex-col items-center justify-center rounded-lg py-1 transition-colors",
                    isSelected
                      ? "bg-teal-600 text-white"
                      : isToday
                      ? "ring-1 ring-teal-400 text-teal-700 dark:text-teal-300 hover:bg-muted"
                      : "hover:bg-muted text-foreground",
                  ].join(" ")}
                >
                  <span className="text-[11px] font-bold leading-none">
                    {hijriDay.toLocaleString("ar-SA")}
                  </span>
                  <span className={`text-[7.5px] leading-none mt-0.5 ${isSelected ? "text-teal-100" : "text-muted-foreground"}`}>
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setPickerHY(todayHijri.year);
                setPickerHM(todayHijri.month);
                onChange(todayStr);
                setOpen(false);
              }}
              className="text-[10px] text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium"
            >اليوم</button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >مسح التاريخ</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
