import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toAr } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "./timePicker";
import { WEEKDAYS, type Interval } from "./shared";
import { DURATION_OPTIONS, isSupportedDuration, byWeekday, flattenWeek, monthCells, riyadhToday, toggleDate } from "./availability";

export function DurationSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const legacy = value > 0 && !isSupportedDuration(value);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold">مدة الجلسة</p>
      <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger dir="rtl" aria-label="مدة الجلسة" className="h-11 w-full rounded-xl sm:w-56" data-testid="select-session"><SelectValue placeholder="اختر المدة" /></SelectTrigger>
        <SelectContent dir="rtl">
          {legacy && <SelectItem value={String(value)} data-testid="option-session-legacy">{toAr(value)} دقيقة (مدة سابقة)</SelectItem>}
          {DURATION_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)} data-testid={`option-session-${o.value}`}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {legacy && <p className="text-xs text-amber-700" data-testid="text-session-legacy">مدتك الحالية {toAr(value)} دقيقة غير متاحة ضمن الخيارات الجديدة. ستبقى كما هي حتى تختار مدة أخرى.</p>}
    </div>
  );
}

export function WeeklyAvailability({ value, onChange }: { value: Interval[]; onChange: (v: Interval[]) => void }) {
  const rows = byWeekday(value);
  const commit = (d: number, list: Interval[]) => onChange(flattenWeek(rows.map((r, i) => (i === d ? list : r))));
  const allOff = rows.every((r) => r.length === 0);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">الأوقات بتوقيت السعودية (UTC+3). اليوم المغلق لا يستقبل حجوزات.</p>
      {allOff && <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="text-all-days-off">كل الأيام مغلقة حالياً، لن تستقبل أي حجوزات جديدة حتى تفعّل يوماً واحداً على الأقل.</p>}
      {rows.map((list, d) => {
        const on = list.length > 0;
        return (
          <div key={d} className={`rounded-2xl border p-3 transition ${on ? "border-primary/40 bg-card" : "border-border bg-muted/40"}`} data-testid={`row-weekday-${d}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`font-bold ${on ? "" : "text-muted-foreground"}`}>{WEEKDAYS[d]}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{on ? "متاح" : "مغلق"}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={`تفعيل ${WEEKDAYS[d]}`} data-testid={`toggle-weekday-${d}`}
                  onClick={() => commit(d, on ? [] : [{ weekday: d, start: "09:00", end: "17:00" }])}
                  className={`relative h-6 w-11 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? "bg-primary" : "bg-border"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${on ? "start-[1.375rem]" : "start-0.5"}`} />
                </button>
              </div>
            </div>
            {on && (
              <div className="mt-3 space-y-2">
                {list.map((v, i) => (
                  <div key={i} className="flex items-end gap-2" data-testid={`row-interval-${d}-${i}`}>
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <TimePicker label="من" value={v.start} onChange={(start) => commit(d, list.map((x, j) => (j === i ? { ...x, start } : x)))} testId={`picker-start-${d}-${i}`} />
                      <TimePicker label="إلى" value={v.end} onChange={(end) => commit(d, list.map((x, j) => (j === i ? { ...x, end } : x)))} testId={`picker-end-${d}-${i}`} />
                    </div>
                    {list.length > 1 && <button type="button" aria-label="حذف الفترة" className="mb-2 grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-muted" onClick={() => commit(d, list.filter((_, j) => j !== i))} data-testid={`button-remove-interval-${d}-${i}`}><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary" data-testid={`button-add-interval-${d}`}
                  onClick={() => commit(d, [...list, { weekday: d, start: list[list.length - 1]?.end ?? "09:00", end: "21:00" }])}><Plus className="h-3.5 w-3.5" />إضافة فترة</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const MONTHS = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { month: "long", year: "numeric", timeZone: "UTC" });
const DAYFMT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dt = (s: string) => new Date(`${s}T00:00:00Z`);

export function BlockedDatesCalendar({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const today = riyadhToday();
  const [ty, tm] = today.split("-").map(Number);
  const [cur, setCur] = useState({ y: ty, m: tm - 1 });
  const shift = (n: number) => setCur(({ y, m }) => { const t = y * 12 + m + n; return { y: Math.floor(t / 12), m: t % 12 }; });
  const atStart = cur.y === ty && cur.m === tm - 1;
  const set = new Set(value);
  const upcoming = value.filter((d) => d >= today);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">أيام الإغلاق</p>
        <p className="text-xs text-muted-foreground">اضغط على يوم لإغلاقه أو إعادة فتحه. تُحفظ التغييرات مع زر الحفظ/الإرسال. الحجوزات المؤكدة لا تُلغى، والإغلاق يمنع الحجوزات الجديدة فقط.</p>
      </div>
      <div className="rounded-2xl border border-border p-3" dir="rtl">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="الشهر السابق" disabled={atStart} onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted disabled:opacity-30" data-testid="button-prev-month"><ChevronRight className="h-4 w-4" /></button>
          <p className="font-bold" data-testid="text-calendar-month">{MONTHS.format(new Date(Date.UTC(cur.y, cur.m, 1)))}</p>
          <button type="button" aria-label="الشهر التالي" onClick={() => shift(1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted" data-testid="button-next-month"><ChevronLeft className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => <span key={w} className="py-1 text-[11px] font-semibold text-muted-foreground">{w.replace("ال", "").slice(0, 3)}</span>)}
          {monthCells(cur.y, cur.m).map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const past = d < today, closed = set.has(d);
            return (
              <button key={d} type="button" disabled={past} aria-pressed={closed} aria-label={`${DAYFMT.format(dt(d))}${closed ? " - مغلق" : ""}`} onClick={() => onChange(toggleDate(value, d))} data-testid={`day-${d}`}
                className={`relative aspect-square rounded-lg text-sm font-semibold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30
                  ${closed ? "bg-destructive/15 text-destructive line-through decoration-2 ring-1 ring-inset ring-destructive/50" : "hover:bg-muted"} ${d === today && !closed ? "ring-1 ring-inset ring-primary" : ""}`}>
                {toAr(Number(d.slice(8)))}
              </button>
            );
          })}
        </div>
      </div>
      {upcoming.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="list-blocked-dates">
          {upcoming.map((d) => (
            <li key={d} className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 py-1 pe-1 ps-3 text-xs font-semibold text-destructive">
              {DAYFMT.format(dt(d))}
              <button type="button" aria-label={`إعادة فتح ${DAYFMT.format(dt(d))}`} onClick={() => onChange(value.filter((x) => x !== d))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-destructive/20" data-testid={`button-unblock-${d}`}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">لا توجد أيام مغلقة قادمة.</p>}
    </div>
  );
}
