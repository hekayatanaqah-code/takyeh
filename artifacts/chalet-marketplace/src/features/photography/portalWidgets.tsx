import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { call, fmtDT, fmtT, ghostCls, cardCls, brownActionColors, Empty, ErrorBox, type Booking } from "./shared";
import { formatSessionCalendarDate, type SessionCalendarMode } from "./sessionCalendarDate";

/** Platform-consistent RTL upper tabs with always-mounted hidden panels (drafts persist). */
export function UpperTabs<K extends string>({ id, tabs, active, onChange }: { id: string; tabs: readonly (readonly [NoInfer<K>, string])[]; active: K; onChange: (k: K) => void }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length; let j = -1;
    if (e.key === "ArrowLeft") j = (i + 1) % n; else if (e.key === "ArrowRight") j = (i - 1 + n) % n; else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1;
    if (j < 0) return; e.preventDefault(); onChange(tabs[j][0]); document.getElementById(`${id}-tab-${tabs[j][0]}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="أقسام الصفحة" className="sticky top-0 z-10 -mx-1 flex snap-x gap-1 overflow-x-auto rounded-2xl border border-border bg-card/95 p-1 backdrop-blur [scrollbar-width:none]">
      {tabs.map(([k, l], i) => {
        const on = k === active;
        return <button key={k} id={`${id}-tab-${k}`} type="button" role="tab" aria-selected={on} aria-controls={`${id}-panel-${k}`} tabIndex={on ? 0 : -1} onClick={() => onChange(k)} onKeyDown={(e) => onKey(e, i)}
          className={`min-h-11 flex-1 shrink-0 snap-start whitespace-nowrap rounded-xl px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C6246]/50 ${on ? `${brownActionColors} shadow-sm` : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} data-testid={`tab-${id}-${k}`}>{l}</button>;
      })}
    </div>
  );
}
export function TabPanel({ id, k, active, children }: { id: string; k: string; active: string; children: React.ReactNode }) {
  return <div role="tabpanel" id={`${id}-panel-${k}`} aria-labelledby={`${id}-tab-${k}`} hidden={k !== active} tabIndex={0} className="space-y-5 focus-visible:outline-none" data-testid={`panel-${id}-${k}`}>{children}</div>;
}

export interface PortalNotification { id: number; bookingId: number; propertyName: string; packageName: string; startAt: string; endAt: string; createdAt: string; readAt: string | null; whatsappStatus: string }

export function BookingNotices({ items }: { items: PortalNotification[] }) {
  const qc = useQueryClient();
  const read = useMutation({
    mutationFn: (id: number) => call(`/photography/notifications/${id}/read`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-portal"] }),
  });
  const unread = items.filter((n) => !n.readAt).length;
  const sorted = [...items].sort((a, b) => (a.readAt ? 1 : 0) - (b.readAt ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="space-y-3" data-testid="section-notifications">
      <h3 className="font-bold">تنبيهات الحجوزات {unread > 0 && <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground" data-testid="badge-notifications-unread">{unread.toLocaleString("ar-SA")} جديد</span>}</h3>
      {read.isError && <ErrorBox error={read.error} />}
      {sorted.length === 0 ? <Empty title="لا توجد تنبيهات" text="ستظهر هنا الحجوزات الجديدة فور تأكيدها." /> : (
        <ul className="space-y-2">
          {sorted.map((n) => (
            <li key={n.id} className={`${cardCls} flex flex-wrap items-center justify-between gap-3 ${n.readAt ? "" : "border-primary"}`} data-testid={`card-notification-${n.id}`}>
              <div>
                <p className="font-bold">{n.readAt ? "" : "حجز جديد مؤكد: "}{n.propertyName}</p>
                <p className="text-sm text-muted-foreground">{n.packageName} - {fmtDT(n.startAt)} إلى {fmtT(n.endAt)}</p>
                <p className="text-xs text-muted-foreground">وصل في {fmtDT(n.createdAt)}</p>
              </div>
              {!n.readAt && <button type="button" className={ghostCls} disabled={read.isPending && read.variables === n.id} onClick={() => read.mutate(n.id)} data-testid={`button-read-notification-${n.id}`}>تمت القراءة</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const keyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const riyadhKey = (d: Date) => keyFmt.format(d);
/** Riyadh is fixed UTC+3; split a booking into per-day intervals. */
function daysOf(bk: Booking): string[] {
  const s = riyadhKey(new Date(bk.startAt));
  const e = riyadhKey(new Date(Math.max(new Date(bk.startAt).getTime(), new Date(bk.endAt).getTime() - 1)));
  const out: string[] = [];
  for (let t = new Date(`${s}T00:00:00Z`).getTime(); t <= new Date(`${e}T00:00:00Z`).getTime() && out.length < 31; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Read-only booked-session view. Never mutates blocked dates or weekly availability. */
export function SessionCalendar({ bookings }: { bookings: Booking[] }) {
  const today = riyadhKey(new Date());
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) for (const k of daysOf(b)) m.set(k, [...(m.get(k) ?? []), b]);
    for (const l of m.values()) l.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [bookings]);
  const occupied = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const [sel, setSel] = useState<string>(() => occupied[0] ?? today);
  const [calendarMode, setCalendarMode] = useState<SessionCalendarMode>("hijri");
  const selList = byDay.get(sel) ?? [];
  const dateDisplay = formatSessionCalendarDate(sel, calendarMode);
  return (
    <section className={`${cardCls} space-y-3`} data-testid="section-session-calendar">
      <div>
        <h3 className="font-bold">تقويم الجلسات المحجوزة</h3>
        <p className="text-xs text-muted-foreground">النقطة تعني وجود جلسة محجوزة، والأوقات بتوقيت السعودية. لا يغلق اليوم كاملا ولا يغير أيام الإغلاق أو أوقات التوفر.</p>
      </div>
      <DualCalendarPicker inline mode={calendarMode} onModeChange={setCalendarMode} value={sel} onChange={(v) => setSel(v || today)} occupiedDates={occupied} label="تقويم الجلسات المحجوزة" className="mx-auto max-w-[22rem]" />
      <div className="space-y-2 border-t border-border pt-3" data-testid="panel-cal-day" aria-live="polite">
        <p className="text-sm font-semibold" data-testid="text-session-calendar-date" data-calendar-mode={calendarMode}>{dateDisplay.weekday}، {dateDisplay.primary} <span className="font-normal text-muted-foreground">- {dateDisplay.secondary}</span></p>
        {selList.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد جلسات محجوزة في هذا اليوم.</p> : (
          <ul className="space-y-1.5">
            {selList.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm" data-testid={`row-cal-session-${b.id}`}>
                <span className="font-bold">{fmtT(b.startAt)} - {fmtT(b.endAt)}</span>
                <span className="text-muted-foreground">{b.propertyName} - {b.packageName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
