import { useState, useMemo, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import { toAr } from "@/lib/utils";
import {
  HIJRI_MONTHS_AR,
  toHijriComponents,
  getHijriMonthDays,
  toGregorianStr,
  prevHijriMonth,
  nextHijriMonth,
} from "@/lib/hijri";

const WEEKDAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

function formatDisplay(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric", month: "long", year: "numeric",
    }).format(d);
    const greg = new Intl.DateTimeFormat("ar-SA", {
      day: "numeric", month: "long", year: "numeric", calendar: "gregory",
    } as Intl.DateTimeFormatOptions).format(d);
    return `${hijri} — ${greg} م`;
  } catch { return dateStr; }
}

function getGregRangeLabel(days: Array<{ date: Date; hijriDay: number }>): string {
  if (days.length === 0) return "";
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric", calendar: "gregory" };
  const a = first.toLocaleDateString("ar-SA", opts);
  const b = last.toLocaleDateString("ar-SA", opts);
  return a === b ? a : `${a} – ${b}`;
}

interface DualDatePickerProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function DualDatePicker({ value, onChange, className = "" }: DualDatePickerProps) {
  const [open, setOpen] = useState(false);
  const todayStr = toGregorianStr(new Date());

  /* ── Initial Hijri month from value or today ── */
  const _initH = useMemo(() => {
    if (value) { try { return toHijriComponents(new Date(value + "T12:00:00")); } catch { /* */ } }
    return toHijriComponents(new Date());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerHY, setPickerHY] = useState(_initH.year);
  const [pickerHM, setPickerHM] = useState(_initH.month);

  /* Sync when value changes externally */
  useEffect(() => {
    if (value) {
      try {
        const h = toHijriComponents(new Date(value + "T12:00:00"));
        setPickerHY(h.year);
        setPickerHM(h.month);
      } catch { /* */ }
    }
  }, [value]);

  const monthDays = useMemo(() => getHijriMonthDays(pickerHY, pickerHM), [pickerHY, pickerHM]);
  const firstDOW = monthDays[0]?.date.getDay() ?? 0;

  const goPrev = () => { const p = prevHijriMonth(pickerHY, pickerHM); setPickerHY(p.year); setPickerHM(p.month); };
  const goNext = () => { const n = nextHijriMonth(pickerHY, pickerHM); setPickerHY(n.year); setPickerHM(n.month); };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 h-9 text-right text-sm hover:border-amber-500/60 transition-colors"
      >
        <CalendarDays className="w-4 h-4 text-amber-400 shrink-0" />
        {value
          ? <span className="flex-1 text-slate-100 text-xs truncate">{formatDisplay(value)}</span>
          : <span className="flex-1 text-slate-500 text-xs">اختر تاريخًا…</span>
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50 mt-1 bg-slate-900 border border-slate-600 rounded-2xl shadow-2xl shadow-black/60 p-3 w-72"
            dir="rtl"
          >
            {/* ── Month navigation ── */}
            <div className="flex items-center justify-between mb-2 gap-1">
              {/* RTL: right = next */}
              <button
                type="button"
                onClick={goNext}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-base font-bold"
              >›</button>
              <div className="text-center flex-1">
                <p className="text-amber-300 font-bold text-sm">
                  {HIJRI_MONTHS_AR[pickerHM - 1]} {toAr(pickerHY)} هـ
                </p>
                <p className="text-slate-500 text-[10px]">{getGregRangeLabel(monthDays)}</p>
              </div>
              <button
                type="button"
                onClick={goPrev}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors text-base font-bold"
              >‹</button>
            </div>

            {/* ── Day headers ── */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS_AR.map((d) => (
                <div key={d} className="text-center text-[10px] text-slate-500 py-0.5 font-medium">{d}</div>
              ))}
            </div>

            {/* ── Day cells ── */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDOW }).map((_, i) => <div key={`pad-${i}`} />)}

              {monthDays.map(({ date, hijriDay }) => {
                const gregStr = toGregorianStr(date);
                const isSelected = gregStr === value;
                const isToday = gregStr === todayStr;
                return (
                  <button
                    key={gregStr}
                    type="button"
                    onClick={() => { onChange(gregStr); setOpen(false); }}
                    className={`
                      flex flex-col items-center justify-center rounded-lg py-1 transition-all
                      ${isSelected
                        ? "bg-amber-500 text-slate-900"
                        : isToday
                          ? "bg-slate-700 text-amber-300 ring-1 ring-amber-500/50"
                          : "hover:bg-slate-700 text-slate-300"
                      }
                    `}
                  >
                    {/* Hijri day — large, bold */}
                    <span className="text-[11px] font-bold leading-none">
                      {hijriDay.toLocaleString("ar-SA")}
                    </span>
                    {/* Gregorian day — small */}
                    <span className="text-[9px] opacity-60 leading-none mt-0.5">
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected date footer */}
            {value && (
              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="text-[10px] text-slate-400 text-center">{formatDisplay(value)}</p>
              </div>
            )}

            {/* Today shortcut */}
            <button
              type="button"
              onClick={() => {
                const h = toHijriComponents(new Date());
                setPickerHY(h.year);
                setPickerHM(h.month);
                onChange(todayStr);
                setOpen(false);
              }}
              className="w-full mt-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
            >اليوم</button>
          </div>
        </>
      )}
    </div>
  );
}
