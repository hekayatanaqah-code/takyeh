import { useMemo } from "react";
import { getHijriMonthDays, toHijriComponents } from "@/lib/hijri";
import { propertyCalendarBookingMap, propertyCalendarRows } from "@/lib/propertyCalendar";
import { ChaletAvailability, OwnerBooking } from "@/components/owner/owner-booking-types";


/* ── Mini Calendar ───────────────────────────── */
const _hijriFmt     = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric" });
const _hijriMFmt    = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long" });
const _hijriYFmt    = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" });
const _getFirstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export type BufferExceptionDateFE = { date: string; periods: string[]; action: "disable" | "enable" };

export function MiniCalendar({
  hijriYear, hijriMonth, availability, bookings, onDateClick, bufferPolicy, onCleaningBlockClick,
}: {
  hijriYear: number;
  hijriMonth: number;
  availability: ChaletAvailability[];
  bookings: OwnerBooking[];
  onDateClick: (dateStr: string) => void;
  bufferPolicy?: {
    enabled: boolean;
    blockNextMorningFullDay: boolean;
    blockNextMorningEvening: boolean;
    blockSameDayEvening: boolean;
    exceptionWeekdays?: number[];
    exceptionDates?: BufferExceptionDateFE[];
  };
  onCleaningBlockClick?: (dateStr: string, period: string) => void;
}) {
  const arabicDays = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
  const hijriMonthDays = useMemo(() => getHijriMonthDays(hijriYear, hijriMonth), [hijriYear, hijriMonth]);
  const firstDOW = hijriMonthDays[0]?.date.getDay() ?? 0;

  const availMap = useMemo(() => {
    const m = new Map<string, ChaletAvailability>();
    for (const a of availability) m.set(a.dateStr, a);
    return m;
  }, [availability]);

  /* Preserve every booking per period, expanded across its full duration. */
  const bookingMap = useMemo(() => {
    return propertyCalendarBookingMap(bookings);
  }, [bookings]);

  /* Dates that have a cash booking NOT yet deposited to bank */
  const cashUndepositedDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate || b.paymentMethod !== "cash" || b.cashDeposited === true) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        s.add(ds);
      }
    }
    return s;
  }, [bookings]);

  /* Buffer / cleaning-time periods — Map<dateStr, Set<"morning"|"evening">> */
  const cleaningTimePeriods = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!bufferPolicy?.enabled) return m;

    const exWeekdays = bufferPolicy.exceptionWeekdays ?? [];
    const exDates = bufferPolicy.exceptionDates ?? [];

    const addPeriod = (ds: string, period: string) => {
      /* ── Exception priority ── */
      /* 1. Date-specific exception */
      const dateEx = exDates.find((e) => e.date === ds && e.periods.includes(period));
      if (dateEx) {
        if (dateEx.action === "disable") return; /* override removes cleaning block */
        /* action === "enable": force-add → fall through */
      } else {
        /* 2. Weekday exception */
        const dow = new Date(ds + "T12:00:00").getDay();
        if (exWeekdays.includes(dow)) return; /* buffer disabled on this weekday */
      }
      if (!m.has(ds)) m.set(ds, new Set());
      m.get(ds)!.add(period);
    };

    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      /* last day of the booking */
      const lastD = new Date(sy, sm - 1, sd + duration - 1);
      const lastDs = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, "0")}-${String(lastD.getDate()).padStart(2, "0")}`;
      /* next day after the booking */
      const nextD = new Date(lastD); nextD.setDate(nextD.getDate() + 1);
      const nextDs = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, "0")}-${String(nextD.getDate()).padStart(2, "0")}`;
      const p = b.period ?? "full_day";
      if (bufferPolicy.blockNextMorningFullDay && p === "full_day") addPeriod(nextDs, "morning");
      if (bufferPolicy.blockNextMorningEvening && p === "evening") addPeriod(nextDs, "morning");
      if (bufferPolicy.blockSameDayEvening && p === "morning") addPeriod(lastDs, "evening");
    }
    return m;
  }, [bookings, bufferPolicy]);

  /* Dates where the booking is fully paid (green dot) */
  const fullyPaidDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const total = Number(b.totalPrice ?? 0);
      const dep = Number(b.depositPaid ?? 0);
      const isFullyPaid = b.balanceCollected === true || (total > 0 && dep >= total);
      if (!isFullyPaid) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        s.add(ds);
      }
    }
    return s;
  }, [bookings]);

  /* Dates where the booking has a remaining (متبقي) balance (yellow dot) */
  const hasRemainingDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const total = Number(b.totalPrice ?? 0);
      const dep = Number(b.depositPaid ?? 0);
      if (total === 0) continue;
      const isFullyPaid = b.balanceCollected === true || (total > 0 && dep >= total);
      if (isFullyPaid) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        s.add(ds);
      }
    }
    return s;
  }, [bookings]);

  const pendingContractDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate || b.cancelledAt || b.contractSigned) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
    return s;
  }, [bookings]);

  const today = new Date().toISOString().slice(0, 10);

  type CalCell = { date: Date; hijriDay: number } | null;
  const calCells: CalCell[] = [...Array<null>(firstDOW).fill(null), ...hijriMonthDays];

  return (
    <div className="select-none rounded-xl overflow-hidden border border-border">
      {/* Unified grid: header row + day cells */}
      <div className="grid grid-cols-7 gap-px bg-border">
        {/* Day-of-week headers */}
        {arabicDays.map((d) => (
          <div key={d} className="bg-muted/60 text-center text-[10px] font-bold text-muted-foreground py-2">{d}</div>
        ))}

        {/* Day cells */}
        {calCells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} className="bg-background/60 min-h-[62px]" />;

          const { date: cellDate, hijriDay } = cell;
          const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
          const avEntry = availMap.get(dateStr);
          const bkEntry = bookingMap.get(dateStr); // Map<period, guestName>

          /* Resolve per-period blocked state + guest names */
          const morningBlocked = bkEntry?.has("morning") || !!avEntry?.periodMorning;
          const eveningBlocked = bkEntry?.has("evening") || !!avEntry?.periodEvening;
          const fullDayBlocked = bkEntry?.has("full_day") || !!avEntry?.periodFullDay;
          const isBlocked = morningBlocked || eveningBlocked || fullDayBlocked;
          const isPartial = isBlocked && !fullDayBlocked && (morningBlocked !== eveningBlocked);
          const isToday = dateStr === today;
          /* Manual maintenance block: avEntry has notes and NO real booking on this day */
          const isManualBlock = !!avEntry?.notes && (!bkEntry || bkEntry.size === 0);

          /* Hijri day number */

          /* Build per-period rows for display */
          const pRows = propertyCalendarRows(bkEntry, avEntry);
          /* Cleaning-time virtual rows */
          const cleanPeriods = cleaningTimePeriods.get(dateStr);
          if (cleanPeriods) {
            if (cleanPeriods.has("morning") && !morningBlocked && !fullDayBlocked)
              pRows.push({ label: "🧹 تنظيف ص", guest: "", amber: false, cleaning: true, period: "morning" });
            if (cleanPeriods.has("evening") && !eveningBlocked && !fullDayBlocked)
              pRows.push({ label: "🧹 تنظيف م", guest: "", amber: false, cleaning: true, period: "evening" });
          }

          return (
            <button
              key={dateStr}
              data-property-calendar-date={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={[
                "relative flex flex-col items-center justify-start pt-1.5 pb-1.5 px-0.5 w-full",
                "transition-colors focus:outline-none focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary/60",
                "min-h-[66px]",
                isManualBlock
                  ? "bg-gray-200 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300"
                  : isBlocked
                    ? isPartial
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                      : "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100"
                    : "bg-background hover:bg-primary/5 text-foreground",
                isToday ? "ring-2 ring-inset ring-primary" : "",
              ].join(" ")}
            >
              {/* Hijri day — large, primary */}
              <span className="text-[0.82rem] font-bold leading-none">{hijriDay.toLocaleString("ar-SA")}</span>
              {/* Gregorian day — small, secondary */}
              <span className={`text-[0.52rem] leading-none mt-0.5 tabular-nums ${isBlocked || isManualBlock ? "opacity-60" : "text-muted-foreground"}`}>{cellDate.getDate()}</span>

              {/* Manual block label */}
              {isManualBlock && (
                <span className="mt-0.5 text-[0.42rem] font-bold leading-none text-gray-500 dark:text-gray-400 text-center">
                  🔧 {avEntry!.notes!.length > 8 ? avEntry!.notes!.slice(0, 7) + "…" : avEntry!.notes}
                </span>
              )}

              {/* Per-period rows — shown independently */}
              {pRows.length > 0 && (
                <div className="mt-1 w-full flex flex-col items-center gap-[2px]">
                  {pRows.map((row, ri) => (
                    <div key={row.bookingId ?? `block-${ri}`} data-calendar-booking-id={row.bookingId} className="w-full min-w-0 flex flex-col items-center">
                      <span
                      className={`text-[0.44rem] font-bold leading-none text-center ${
                        row.cleaning
                          ? "text-teal-700 dark:text-teal-300 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 underline decoration-dotted"
                          : row.amber ? "text-amber-800 dark:text-amber-200" : "text-red-800 dark:text-red-200"
                      }`}
                      title={row.cleaning ? "انقر للسماح بالحجز في هذه الفترة" : undefined}
                      onClick={row.cleaning && row.period ? (e) => { e.stopPropagation(); onCleaningBlockClick?.(dateStr, row.period!); } : undefined}
                    >{row.label}</span>
                      {row.guest && (
                        <span className={`text-[0.42rem] leading-none truncate w-full text-center font-medium ${
                          row.amber ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"
                        }`}>{row.guest}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* Cash-not-deposited indicator dot */}
              {cashUndepositedDates.has(dateStr) && (
                <span
                  className="absolute top-1 left-1 w-2 h-2 rounded-full bg-orange-500 ring-1 ring-white dark:ring-gray-900"
                  title="نقدي لم يُودَع في البنك"
                />
              )}
              {/* Pending contract indicator — pulsing amber dot */}
              {pendingContractDates.has(dateStr) && (
                <span
                  className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-violet-600 ring-1 ring-white dark:ring-gray-900 animate-pulse"
                  title="عقد بانتظار توقيع المستأجر"
                />
              )}
              {/* Payment status dot — green: fully paid, yellow: has remaining */}
              {isBlocked && !cashUndepositedDates.has(dateStr) && (
                hasRemainingDates.has(dateStr) ? (
                  <span
                    className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-white dark:ring-gray-900"
                    title="يوجد متبقي غير مسدد"
                  />
                ) : fullyPaidDates.has(dateStr) ? (
                  <span
                    className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 ring-1 ring-white dark:ring-gray-900"
                    title="مسدد بالكامل"
                  />
                ) : null
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Gregorian Calendar Grid ─────────────────── */
export function GregorianMiniCalendar({
  gregYear, gregMonth, availability, bookings, onDateClick, bufferPolicy, onCleaningBlockClick,
}: {
  gregYear: number;
  gregMonth: number;
  availability: ChaletAvailability[];
  bookings: OwnerBooking[];
  onDateClick: (dateStr: string) => void;
  bufferPolicy?: {
    enabled: boolean;
    blockNextMorningFullDay: boolean;
    blockNextMorningEvening: boolean;
    blockSameDayEvening: boolean;
    exceptionWeekdays?: number[];
    exceptionDates?: BufferExceptionDateFE[];
  };
  onCleaningBlockClick?: (dateStr: string, period: string) => void;
}) {
  const arabicDays = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

  const gregDays = useMemo(() => {
    const daysInMonth = new Date(gregYear, gregMonth, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(gregYear, gregMonth - 1, i + 1);
      const h = toHijriComponents(date);
      return { date, gregDay: i + 1, hijriDay: h.day };
    });
  }, [gregYear, gregMonth]);

  const firstDOW = gregDays[0]?.date.getDay() ?? 0;

  const availMap = useMemo(() => {
    const m = new Map<string, ChaletAvailability>();
    for (const a of availability) m.set(a.dateStr, a);
    return m;
  }, [availability]);

  const bookingMap = useMemo(() => {
    return propertyCalendarBookingMap(bookings);
  }, [bookings]);

  const cashUndepositedDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate || b.paymentMethod !== "cash" || b.cashDeposited === true) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
    return s;
  }, [bookings]);

  const cleaningTimePeriods = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!bufferPolicy?.enabled) return m;
    const exWeekdays = bufferPolicy.exceptionWeekdays ?? [];
    const exDates = bufferPolicy.exceptionDates ?? [];
    const addPeriod = (ds: string, period: string) => {
      const dateEx = exDates.find((e) => e.date === ds && e.periods.includes(period));
      if (dateEx) { if (dateEx.action === "disable") return; }
      else { const dow = new Date(ds + "T12:00:00").getDay(); if (exWeekdays.includes(dow)) return; }
      if (!m.has(ds)) m.set(ds, new Set());
      m.get(ds)!.add(period);
    };
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      const lastD = new Date(sy, sm - 1, sd + duration - 1);
      const lastDs = `${lastD.getFullYear()}-${String(lastD.getMonth() + 1).padStart(2, "0")}-${String(lastD.getDate()).padStart(2, "0")}`;
      const nextD = new Date(lastD); nextD.setDate(nextD.getDate() + 1);
      const nextDs = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, "0")}-${String(nextD.getDate()).padStart(2, "0")}`;
      const p = b.period ?? "full_day";
      if (bufferPolicy.blockNextMorningFullDay && p === "full_day") addPeriod(nextDs, "morning");
      if (bufferPolicy.blockNextMorningEvening && p === "evening") addPeriod(nextDs, "morning");
      if (bufferPolicy.blockSameDayEvening && p === "morning") addPeriod(lastDs, "evening");
    }
    return m;
  }, [bookings, bufferPolicy]);

  const fullyPaidDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const total = Number(b.totalPrice ?? 0);
      const dep = Number(b.depositPaid ?? 0);
      if (!(b.balanceCollected === true || (total > 0 && dep >= total))) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
    return s;
  }, [bookings]);

  const hasRemainingDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const total = Number(b.totalPrice ?? 0);
      const dep = Number(b.depositPaid ?? 0);
      if (total === 0 || b.balanceCollected === true || (total > 0 && dep >= total)) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
    return s;
  }, [bookings]);

  const pendingContractDates = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.bookingDate || b.cancelledAt || b.contractSigned) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
    }
    return s;
  }, [bookings]);

  const today = new Date().toISOString().slice(0, 10);
  type CalCell = { date: Date; gregDay: number; hijriDay: number } | null;
  const calCells: CalCell[] = [...Array<null>(firstDOW).fill(null), ...gregDays];

  return (
    <div className="select-none rounded-xl overflow-hidden border border-border">
      <div className="grid grid-cols-7 gap-px bg-border">
        {arabicDays.map((d) => (
          <div key={d} className="bg-muted/60 text-center text-[10px] font-bold text-muted-foreground py-2">{d}</div>
        ))}
        {calCells.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} className="bg-background/60 min-h-[62px]" />;
          const { date: cellDate, gregDay, hijriDay } = cell;
          const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
          const avEntry = availMap.get(dateStr);
          const bkEntry = bookingMap.get(dateStr);
          const morningBlocked = bkEntry?.has("morning") || !!avEntry?.periodMorning;
          const eveningBlocked = bkEntry?.has("evening") || !!avEntry?.periodEvening;
          const fullDayBlocked = bkEntry?.has("full_day") || !!avEntry?.periodFullDay;
          const isBlocked = morningBlocked || eveningBlocked || fullDayBlocked;
          const isPartial = isBlocked && !fullDayBlocked && (morningBlocked !== eveningBlocked);
          const isToday = dateStr === today;
          const isManualBlock = !!avEntry?.notes && (!bkEntry || bkEntry.size === 0);
          const pRows = propertyCalendarRows(bkEntry, avEntry);
          const cleanPeriods = cleaningTimePeriods.get(dateStr);
          if (cleanPeriods) {
            if (cleanPeriods.has("morning") && !morningBlocked && !fullDayBlocked)
              pRows.push({ label: "🧹 تنظيف ص", guest: "", amber: false, cleaning: true, period: "morning" });
            if (cleanPeriods.has("evening") && !eveningBlocked && !fullDayBlocked)
              pRows.push({ label: "🧹 تنظيف م", guest: "", amber: false, cleaning: true, period: "evening" });
          }
          return (
            <button
              key={dateStr}
              data-property-calendar-date={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={[
                "relative flex flex-col items-center justify-start pt-1.5 pb-1.5 px-0.5 w-full",
                "transition-colors focus:outline-none focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary/60",
                "min-h-[66px]",
                isManualBlock ? "bg-gray-200 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300"
                  : isBlocked ? isPartial ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                    : "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100"
                  : "bg-background hover:bg-primary/5 text-foreground",
                isToday ? "ring-2 ring-inset ring-primary" : "",
              ].join(" ")}
            >
              {/* Gregorian day — large, primary */}
              <span className="text-[0.82rem] font-bold leading-none">{gregDay.toLocaleString("ar-SA")}</span>
              {/* Hijri day — small, secondary */}
              <span className={`text-[0.52rem] leading-none mt-0.5 tabular-nums ${isBlocked || isManualBlock ? "opacity-60" : "text-muted-foreground"}`}>{hijriDay.toLocaleString("ar-SA")} هـ</span>
              {isManualBlock && (
                <span className="mt-0.5 text-[0.42rem] font-bold leading-none text-gray-500 dark:text-gray-400 text-center">
                  🔧 {avEntry!.notes!.length > 8 ? avEntry!.notes!.slice(0, 7) + "…" : avEntry!.notes}
                </span>
              )}
              {pRows.length > 0 && (
                <div className="mt-1 w-full flex flex-col items-center gap-[2px]">
                  {pRows.map((row, ri) => (
                    <div key={row.bookingId ?? `block-${ri}`} data-calendar-booking-id={row.bookingId} className="w-full min-w-0 flex flex-col items-center">
                      <span
                        className={`text-[0.44rem] font-bold leading-none text-center ${row.cleaning ? "text-teal-700 dark:text-teal-300 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 underline decoration-dotted" : row.amber ? "text-amber-800 dark:text-amber-200" : "text-red-800 dark:text-red-200"}`}
                        onClick={row.cleaning && row.period ? (e) => { e.stopPropagation(); onCleaningBlockClick?.(dateStr, row.period!); } : undefined}
                      >{row.label}</span>
                      {row.guest && (
                        <span className={`text-[0.42rem] leading-none truncate w-full text-center font-medium ${row.amber ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"}`}>{row.guest}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {cashUndepositedDates.has(dateStr) && (
                <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-orange-500 ring-1 ring-white dark:ring-gray-900" title="نقدي لم يُودَع في البنك" />
              )}
              {/* Pending contract indicator — pulsing amber dot */}
              {pendingContractDates.has(dateStr) && (
                <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-violet-600 ring-1 ring-white dark:ring-gray-900 animate-pulse" title="عقد بانتظار توقيع المستأجر" />
              )}
              {isBlocked && !cashUndepositedDates.has(dateStr) && (
                hasRemainingDates.has(dateStr) ? (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-400 ring-1 ring-white dark:ring-gray-900" title="يوجد متبقي غير مسدد" />
                ) : fullyPaidDates.has(dateStr) ? (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 ring-1 ring-white dark:ring-gray-900" title="مسدد بالكامل" />
                ) : null
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
