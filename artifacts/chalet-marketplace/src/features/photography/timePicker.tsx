import { toAr } from "@/lib/utils";

export interface Parts12 { hour: number; minute: number; pm: boolean }

/** "HH:mm" (24h) -> 12h parts. Invalid input falls back to 09:00. */
export function split24(v: string): Parts12 {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? "");
  let h = m ? Math.min(23, Number(m[1])) : 9;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  const pm = h >= 12;
  h = h % 12; if (h === 0) h = 12;
  return { hour: h, minute, pm };
}

/** 12h parts -> "HH:mm" (24h). */
export function join24({ hour, minute, pm }: Parts12): string {
  const h = (hour % 12) + (pm ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const selCls = "h-10 appearance-none rounded-lg border border-border bg-background px-2 text-center text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function TimePicker({ value, onChange, label, testId }: { value: string; onChange: (v: string) => void; label: string; testId?: string }) {
  const p = split24(value);
  const up = (x: Partial<Parts12>) => onChange(join24({ ...p, ...x }));
  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-card p-2" data-testid={testId}>
      <legend className="px-1 text-xs font-semibold text-muted-foreground">{label}</legend>
      <div dir="rtl" className="flex items-center gap-1.5">
        <select aria-label={`${label} - الساعة`} className={`${selCls} w-14`} value={p.hour} onChange={(e) => up({ hour: Number(e.target.value) })}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{toAr(h)}</option>)}
        </select>
        <span aria-hidden className="font-bold text-muted-foreground">:</span>
        <select aria-label={`${label} - الدقيقة`} className={`${selCls} w-14`} value={p.minute} onChange={(e) => up({ minute: Number(e.target.value) })}>
          {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{toAr(String(m).padStart(2, "0"))}</option>)}
        </select>
        <div role="radiogroup" aria-label={`${label} - الفترة`} className="ms-auto flex overflow-hidden rounded-lg border border-border">
          {([false, true] as const).map((pm) => (
            <button key={String(pm)} type="button" role="radio" aria-checked={p.pm === pm} onClick={() => up({ pm })}
              className={`h-10 w-9 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${p.pm === pm ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
              {pm ? "م" : "ص"}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
