import { useState, useMemo, useRef, useEffect } from "react";

/* ── Hijri month names (Arabic) ── */
const HIJRI_MONTHS_AR = [
  "محرم", "صفر", "ربيع الأول", "ربيع الثاني",
  "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

/* Arabic day-of-week headers (Sun → Sat) */
const DAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

/* Intl formatter: Umm al-Qura calendar */
const hijriFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** Convert a Gregorian Date to its Hijri components (Umm al-Qura). */
function toHijri(date: Date): { year: number; month: number; day: number } {
  const parts = hijriFmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value?.replace(/[٠-٩]/g, (d) =>
      String(d.charCodeAt(0) - 0x0660)) ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Approximate Gregorian Date for the start of a Hijri month.
 * Accuracy ±5 days — used only as a scan seed.
 */
function hijriToApproxGregorian(hy: number, hm: number): Date {
  /* Islamic epoch: July 19, 622 CE (Gregorian) */
  const epochMs = Date.UTC(622, 6, 19);
  const days = (hy - 1) * 354.36707 + (hm - 1) * 29.53059;
  return new Date(epochMs + days * 86400000);
}

/** All Gregorian days that fall within a given Hijri month (Umm al-Qura). */
function getHijriMonthDays(
  hy: number,
  hm: number,
): { date: Date; hijriDay: number }[] {
  const estimate = hijriToApproxGregorian(hy, hm);
  const cursor = new Date(estimate);
  cursor.setDate(cursor.getDate() - 6); /* start a little before the estimate */

  const result: { date: Date; hijriDay: number }[] = [];
  for (let i = 0; i < 65; i++) {
    const h = toHijri(cursor);
    if (h.year === hy && h.month === hm) {
      result.push({ date: new Date(cursor), hijriDay: h.day });
    } else if (result.length > 0) {
      break; /* past end of month */
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Format a Date as "YYYY-MM-DD" Gregorian string. */
function toGregorianStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
  const todayHijri = useMemo(() => toHijri(new Date()), []);
  const initHijri = useMemo(() => {
    if (value) {
      try {
        return toHijri(new Date(value + "T12:00:00"));
      } catch {
        /* fall through */
      }
    }
    return todayHijri;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerHY, setPickerHY] = useState(initHijri.year);
  const [pickerHM, setPickerHM] = useState(initHijri.month);

  /* Sync picker position when value changes externally */
  useEffect(() => {
    if (value) {
      try {
        const h = toHijri(new Date(value + "T12:00:00"));
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
  const prevHijriMonth = () => {
    if (pickerHM === 1) { setPickerHY((y) => y - 1); setPickerHM(12); }
    else setPickerHM((m) => m - 1);
  };
  const nextHijriMonth = () => {
    if (pickerHM === 12) { setPickerHY((y) => y + 1); setPickerHM(1); }
    else setPickerHM((m) => m + 1);
  };

  /* ── Computed display string ── */
  const displayStr = useMemo(() => {
    if (!value) return null;
    try {
      const d = new Date(value + "T12:00:00");
      const h = toHijri(d);
      const hijriLabel = `${h.day} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year} هـ`;
      const gregLabel = d.toLocaleDateString("ar-SA", {
        day: "numeric",
        month: "long",
        year: "numeric",
        calendar: "gregory",
      } as Intl.DateTimeFormatOptions);
      return { hijriLabel, gregLabel };
    } catch {
      return null;
    }
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
            {/* next month (RTL: left arrow = next) */}
            <button
              type="button"
              onClick={nextHijriMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-sm font-bold text-muted-foreground"
              aria-label="الشهر التالي"
            >›</button>

            <div className="flex-1 text-center">
              <p className="text-[13px] font-bold text-foreground">
                {HIJRI_MONTHS_AR[pickerHM - 1]} {pickerHY}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {monthDays[0]?.date.toLocaleDateString("ar-SA", { month: "long", year: "numeric" })}
                {monthDays.length > 0 && monthDays[monthDays.length - 1]?.date
                  ? " — " + monthDays[monthDays.length - 1].date.toLocaleDateString("ar-SA", { month: "long", year: "numeric" })
                  : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={prevHijriMonth}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-sm font-bold text-muted-foreground"
              aria-label="الشهر السابق"
            >‹</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d) => (
              <div
                key={d}
                className="text-center text-[9px] font-semibold text-muted-foreground py-1"
              >{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {/* Leading empty cells */}
            {Array.from({ length: firstDOW }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

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
                  {/* Hijri day number (Arabic-Indic) */}
                  <span className="text-[11px] font-bold leading-none">
                    {hijriDay.toLocaleString("ar-SA")}
                  </span>
                  {/* Gregorian day number */}
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
