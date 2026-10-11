import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TimePicker } from "./timePicker";

export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
export const API = `${BASE}/api`;
export const ORIGIN = () => window.location.origin + BASE;

export async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method, credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "تعذر تنفيذ الطلب");
  return j as T;
}

export type Status = "invited" | "pending" | "approved" | "rejected" | "suspended";
export interface Interval { weekday: number; start: string; end: string }
export interface Photographer {
  id: number; name: string; whatsapp: string; status: Status; bio: string;
  regionId: number | null; cityId: number | null; districtIds: number[]; allDistricts: boolean;
  sessionMinutes: number; availability: Interval[]; adminNote: string;
  experienceYears?: ExperienceYears | ""; portfolioUrl?: string; profileImagePath?: string;
  blockedDates?: string[];
}
export type ExperienceYears = "under_1" | "1_3" | "3_5" | "over_5";
export const EXPERIENCE_AR: Record<ExperienceYears, string> = { under_1: "أقل من سنة", "1_3": "١-٣ سنوات", "3_5": "٣-٥ سنوات", over_5: "أكثر من ٥ سنوات" };
export interface Pkg { id: number; name: string; priceHalalas: number; platformPercent: number; active: boolean }
export interface Booking {
  propertyId?: number | null; serviceSubmissionId?: number | null;
  id: number; status: string; packageName: string; propertyName: string; photographerName: string;
  startAt: string; endAt: string; priceHalalas: number; commissionHalalas: number;
  photographerEarningsHalalas: number; expiresAt?: string | null;
}

export const STATUS_AR: Record<string, string> = {
  invited: "مدعو", pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض", suspended: "موقوف",
  awaiting_payment: "بانتظار الدفع", payment_review: "قيد مراجعة الدفع", held: "محجوز مؤقتا", pending_payment: "بانتظار الدفع", confirmed: "مؤكد", cancelled: "ملغي", expired: "منتهي", completed: "مكتمل",
};
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const sar = (h: number) => `${(h / 100).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
export const fmtDT = (s: string) =>
  new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(s));
export const fmtT = (s: string) =>
  new Intl.DateTimeFormat("ar-SA", { timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(s));

export const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60";
export const btnCls = "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
export const ghostCls = "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
export const cardCls = "rounded-2xl border border-border bg-card p-4 sm:p-5";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Skel({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <p className="font-semibold text-destructive">{error instanceof Error ? error.message : "حدث خطأ غير متوقع"}</p>
      {onRetry && <button className={`${ghostCls} mt-3`} onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center">
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "ok" | "warn" | "err"; children: ReactNode }) {
  const c = tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10" : tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-destructive/40 bg-destructive/10";
  return <div role={tone === "err" ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${c}`}>{children}</div>;
}

export function StatusPill({ s }: { s: string }) {
  const c = s === "approved" || s === "confirmed" ? "bg-emerald-500/15 text-emerald-700" : s === "rejected" || s === "suspended" || s === "cancelled" || s === "expired" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{STATUS_AR[s] ?? s}</span>;
}

/* ---- Geography ---- */
interface Loc { id: number; nameAr?: string; name?: string }
const nm = (l: Loc) => l.nameAr ?? l.name ?? String(l.id);
export interface Geo { regionId: number | null; cityId: number | null; districtIds: number[]; allDistricts: boolean }

export function GeoPicker({ value, onChange }: { value: Geo; onChange: (g: Geo) => void }) {
  const regions = useQuery({ queryKey: ["ph-regions"], queryFn: () => call<Loc[]>("/regions"), staleTime: 600000 });
  const cities = useQuery({ queryKey: ["ph-cities", value.regionId], enabled: value.regionId != null, queryFn: () => call<Loc[]>(`/cities?regionId=${value.regionId}`) });
  const districts = useQuery({ queryKey: ["ph-districts", value.cityId], enabled: value.cityId != null, queryFn: () => call<Loc[]>(`/districts?cityId=${value.cityId}`) });
  const toggle = (id: number) => onChange({ ...value, districtIds: value.districtIds.includes(id) ? value.districtIds.filter((x) => x !== id) : [...value.districtIds, id] });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="المنطقة">
          <select className={inputCls} value={value.regionId ?? ""} data-testid="select-region"
            onChange={(e) => onChange({ regionId: e.target.value ? Number(e.target.value) : null, cityId: null, districtIds: [], allDistricts: false })}>
            <option value="">اختر المنطقة</option>
            {(regions.data ?? []).map((r) => <option key={r.id} value={r.id}>{nm(r)}</option>)}
          </select>
        </Field>
        <Field label="المدينة">
          <select className={inputCls} value={value.cityId ?? ""} disabled={value.regionId == null} data-testid="select-city"
            onChange={(e) => onChange({ ...value, cityId: e.target.value ? Number(e.target.value) : null, districtIds: [], allDistricts: false })}>
            <option value="">اختر المدينة</option>
            {(cities.data ?? []).map((r) => <option key={r.id} value={r.id}>{nm(r)}</option>)}
          </select>
        </Field>
      </div>
      {(regions.isError || cities.isError || districts.isError) && <ErrorBox error={regions.error ?? cities.error ?? districts.error} onRetry={() => { regions.refetch(); cities.refetch(); districts.refetch(); }} />}
      {value.cityId != null && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={value.allDistricts} data-testid="check-all-districts"
              onChange={(e) => onChange({ ...value, allDistricts: e.target.checked, districtIds: e.target.checked ? [] : value.districtIds })} />
            كل أحياء المدينة
          </label>
          {!value.allDistricts && (districts.isLoading ? <Skel n={1} /> : (districts.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد أحياء مسجلة لهذه المدينة.</p> : (
            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
              {(districts.data ?? []).map((d) => (
                <button type="button" key={d.id} aria-pressed={value.districtIds.includes(d.id)} onClick={() => toggle(d.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${value.districtIds.includes(d.id) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}>{nm(d)}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export const geoError = (g: Geo) =>
  g.regionId == null ? "اختر المنطقة" : g.cityId == null ? "اختر المدينة" : !g.allDistricts && g.districtIds.length === 0 ? "اختر حيا واحدا على الأقل أو كل الأحياء" : null;

/* ---- Availability ---- */
export function AvailabilityEditor({ value, onChange, customTimePicker = false }: { value: Interval[]; onChange: (v: Interval[]) => void; customTimePicker?: boolean }) {
  const set = (i: number, p: Partial<Interval>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">الأوقات بتوقيت السعودية (Asia/Riyadh، UTC+3).</p>
      {value.map((v, i) => customTimePicker ? (
        <div key={i} className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3" data-testid={`row-interval-${i}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select className={`${inputCls} w-auto min-w-[8rem] flex-1 sm:flex-none`} value={v.weekday} onChange={(e) => set(i, { weekday: Number(e.target.value) })} aria-label="اليوم" data-testid={`select-weekday-${i}`}>
              {WEEKDAYS.map((w, d) => <option key={d} value={d}>{w}</option>)}
            </select>
            <button type="button" className={`${ghostCls} px-3 py-2`} onClick={() => onChange(value.filter((_, j) => j !== i))} data-testid={`button-remove-interval-${i}`}>حذف</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <TimePicker label="من" value={v.start} onChange={(start) => set(i, { start })} testId={`picker-start-${i}`} />
            <TimePicker label="إلى" value={v.end} onChange={(end) => set(i, { end })} testId={`picker-end-${i}`} />
          </div>
        </div>
      ) : (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
          <select className={inputCls} value={v.weekday} onChange={(e) => set(i, { weekday: Number(e.target.value) })} aria-label="اليوم">
            {WEEKDAYS.map((w, d) => <option key={d} value={d}>{w}</option>)}
          </select>
          <input type="time" className={inputCls} value={v.start} onChange={(e) => set(i, { start: e.target.value })} aria-label="من" />
          <input type="time" className={inputCls} value={v.end} onChange={(e) => set(i, { end: e.target.value })} aria-label="إلى" />
          <button type="button" className={ghostCls} onClick={() => onChange(value.filter((_, j) => j !== i))}>حذف</button>
        </div>
      ))}
      <button type="button" className={ghostCls} data-testid="button-add-interval" onClick={() => onChange([...value, { weekday: 0, start: "09:00", end: "17:00" }])}>إضافة فترة</button>
    </div>
  );
}
export function availabilityError(v: Interval[], mins: number): string | null {
  if (!Number.isInteger(mins) || mins < 30 || mins > 240) return "مدة الجلسة بين ٣٠ و٢٤٠ دقيقة";
  for (const x of v) {
    if (!x.start || !x.end || x.start >= x.end) return "وقت نهاية كل فترة يجب أن يكون بعد بدايتها";
  }
  return null;
}

export function useCopy() {
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (!done) return undefined; const t = setTimeout(() => setDone(null), 2000); return () => clearTimeout(t); }, [done]);
  return { done, copy: async (t: string) => { try { await navigator.clipboard.writeText(t); setDone(t); } catch { setDone(null); } } };
}
