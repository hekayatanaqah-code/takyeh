import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { call, fmtDT, fmtT, ghostCls, cardCls, Empty, ErrorBox, WEEKDAYS, type Booking } from "./shared";

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
const monthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const utcDate = (k: string) => new Date(`${k}T00:00:00Z`);
/** Riyadh is fixed UTC+3; split a booking into per-day intervals. */
function daysOf(bk: Booking): string[] {
  const s = riyadhKey(new Date(bk.startAt));
  const e = riyadhKey(new Date(Math.max(new Date(bk.startAt).getTime(), new Date(bk.endAt).getTime() - 1)));
  const out: string[] = [];
  for (let t = utcDate(s).getTime(); t <= utcDate(e).getTime() && out.length < 31; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function SessionCalendar({ bookings }: { bookings: Booking[] }) {
  const today = riyadhKey(new Date());
  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) for (const k of daysOf(b)) m.set(k, [...(m.get(k) ?? []), b]);
    for (const l of m.values()) l.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [bookings]);
  const first = [...byDay.keys()].sort()[0];
  const [cursor, setCursor] = useState(() => (first ?? today).slice(0, 7));
  const [sel, setSel] = useState<string | null>(first ?? null);
  const [y, mo] = cursor.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1)); const lead = start.getUTCDay();
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${cursor}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); setCursor(d.toISOString().slice(0, 7)); };
  const selList = sel ? byDay.get(sel) ?? [] : [];
  return (
    <section className={`${cardCls} space-y-3`} data-testid="section-session-calendar">
      <div>
        <h3 className="font-bold">تقويم الجلسات المحجوزة</h3>
        <p className="text-xs text-muted-foreground">يعرض الفترات المحجوزة فقط بتوقيت السعودية. لا يغلق اليوم كاملا ولا يغير أيام الإغلاق أو أوقات التوفر.</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={`${ghostCls} px-3 py-1.5`} onClick={() => shift(-1)} data-testid="button-cal-prev">السابق</button>
        <p className="font-bold" data-testid="text-cal-month">{monthFmt.format(start)}</p>
        <button type="button" className={`${ghostCls} px-3 py-1.5`} onClick={() => shift(1)} data-testid="button-cal-next">التالي</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => <span key={w} className="py-1 font-semibold text-muted-foreground">{w.replace("ال", "").slice(0, 3)}</span>)}
        {cells.map((k, i) => {
          if (!k) return <span key={`e${i}`} />;
          const n = byDay.get(k)?.length ?? 0; const active = sel === k;
          return (
            <button type="button" key={k} onClick={() => setSel(k)} aria-pressed={active} aria-label={`${dayFmt.format(utcDate(k))}${n ? ` - ${n} جلسة` : ""}`}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition ${active ? "border-primary bg-primary text-primary-foreground" : n ? "border-primary/50 bg-primary/10 font-bold" : "border-transparent hover:bg-muted"} ${k === today && !active ? "ring-1 ring-primary" : ""}`}
              data-testid={`button-cal-day-${k}`}>
              {Number(k.slice(8)).toLocaleString("ar-SA")}
              {n > 0 && <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : "bg-primary"}`} aria-hidden />}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="space-y-2 border-t border-border pt-3" data-testid="panel-cal-day">
          <p className="text-sm font-semibold">{dayFmt.format(utcDate(sel))}</p>
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
      )}
    </section>
  );
}
