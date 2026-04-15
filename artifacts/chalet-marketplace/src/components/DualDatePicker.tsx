import { useState } from "react";
import { ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { toAr } from "@/lib/utils";

const WEEKDAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function getHijriDay(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric" }).format(d);
  } catch { return ""; }
}

function getHijriMonthYear(date: Date): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long", year: "numeric" }).format(date);
  } catch { return ""; }
}

function formatDisplay(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric", month: "long", year: "numeric",
    }).format(d);
    const greg = new Intl.DateTimeFormat("ar-SA", {
      day: "numeric", month: "long", year: "numeric", calendar: "gregory",
    }).format(d);
    return `${hijri} هـ — ${greg} م`;
  } catch { return dateStr; }
}

interface DualDatePickerProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function DualDatePicker({ value, onChange, className = "" }: DualDatePickerProps) {
  const [open, setOpen] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);

  const initDate = () => {
    const d = value ? new Date(value + "T12:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  };
  const [nav, setNav] = useState(initDate);

  const firstDay = new Date(nav.year, nav.month, 1);
  const lastDay  = new Date(nav.year, nav.month + 1, 0);
  const startDow = firstDay.getDay();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(`${nav.year}-${String(nav.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setNav(n => {
    if (n.month === 0) return { year: n.year - 1, month: 11 };
    return { year: n.year, month: n.month - 1 };
  });
  const nextMonth = () => setNav(n => {
    if (n.month === 11) return { year: n.year + 1, month: 0 };
    return { year: n.year, month: n.month + 1 };
  });

  const midMonth = new Date(nav.year, nav.month, 15);
  const hijriHeader = getHijriMonthYear(midMonth);
  const gregHeader  = `${MONTHS_AR[nav.month]} ${toAr(nav.year)}`;

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
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
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-2 gap-1">
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="text-center flex-1">
                <p className="text-amber-300 font-bold text-sm">{hijriHeader} هـ</p>
                <p className="text-slate-500 text-[10px]">{gregHeader} م</p>
              </div>
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS_AR.map(d => (
                <div key={d} className="text-center text-[10px] text-slate-500 py-0.5 font-medium">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((dateStr, i) => {
                if (!dateStr) return <div key={i} />;
                const isSelected = dateStr === value;
                const isToday    = dateStr === todayStr;
                const gregDay    = toAr(String(parseInt(dateStr.slice(8))));
                const hijriDay   = getHijriDay(dateStr);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onChange(dateStr); setOpen(false); }}
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
                    <span className="text-[11px] font-bold leading-none">{hijriDay}</span>
                    <span className="text-[9px] opacity-60 leading-none mt-0.5">{gregDay}</span>
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
                onChange(todayStr);
                setOpen(false);
                setNav({ year: new Date().getFullYear(), month: new Date().getMonth() });
              }}
              className="w-full mt-1.5 text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
            >
              اليوم
            </button>
          </div>
        </>
      )}
    </div>
  );
}
