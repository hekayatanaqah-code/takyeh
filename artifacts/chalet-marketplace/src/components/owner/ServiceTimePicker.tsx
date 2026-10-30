import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Clock, X } from "lucide-react";
import { cn, toAr } from "../../lib/utils";

export interface ServiceTimePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  defaultOpen?: boolean;
}

export type TimeFormat = "12" | "24";
export const TIME_FORMAT_KEY = "serviceBookingTimeFormat";

/** Parse canonical "HH:mm"; returns null when invalid. */
export function parseTime(value: string): { h: number; m: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export function formatCanonical(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function to12(h: number): { hour: number; pm: boolean } {
  return { hour: h % 12 === 0 ? 12 : h % 12, pm: h >= 12 };
}

export function from12(hour: number, pm: boolean): number {
  return (hour % 12) + (pm ? 12 : 0);
}

export function displayTime(value: string, format: TimeFormat): string {
  const t = parseTime(value);
  if (!t) return "";
  const mm = toAr(String(t.m).padStart(2, "0"));
  if (format === "24") return `${toAr(String(t.h).padStart(2, "0"))}:${mm}`;
  const { hour, pm } = to12(t.h);
  return `${toAr(hour)}:${mm} ${pm ? "م" : "ص"}`;
}

function readFormat(): TimeFormat {
  try {
    return window.localStorage.getItem(TIME_FORMAT_KEY) === "24" ? "24" : "12";
  } catch {
    return "12";
  }
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

interface ColumnProps<T extends string | number> {
  label: string;
  options: T[];
  selected: T;
  render: (v: T) => string;
  onSelect: (v: T) => void;
  testId: string;
}

function Column<T extends string | number>({ label, options, selected, render, onSelect, testId }: ColumnProps<T>) {
  const optionId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && listRef.current) {
      listRef.current.scrollTop = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2;
    }
  }, [selected, options.length]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.indexOf(selected);
    let next = idx;
    if (e.key === "ArrowDown") next = idx < 0 ? 0 : (idx + 1) % options.length;
    else if (e.key === "ArrowUp") next = idx < 0 ? options.length - 1 : (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else if (e.key === "PageDown") next = Math.min(options.length - 1, idx + 5);
    else if (e.key === "PageUp") next = Math.max(0, idx - 5);
    else return;
    e.preventDefault();
    onSelect(options[next]);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-center text-[11px] font-bold text-muted-foreground" dir="rtl">{label}</span>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        aria-activedescendant={options.includes(selected) ? `${optionId}-${String(selected)}` : undefined}
        tabIndex={0}
        onKeyDown={onKey}
        data-testid={testId}
        className="relative h-44 overflow-y-auto overscroll-contain rounded-xl border border-primary/15 bg-background p-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [scrollbar-width:thin]"
      >
        {options.map(opt => {
          const isSel = opt === selected;
          return (
            <div
              key={String(opt)}
              role="option"
              id={`${optionId}-${String(opt)}`}
              aria-selected={isSel}
              onClick={() => onSelect(opt)}
              data-testid={`${testId}-${opt}`}
              className={cn(
                "flex h-9 cursor-pointer select-none items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                isSel ? "bg-primary font-bold text-primary-foreground shadow-sm" : "text-foreground hover:bg-primary/10",
              )}
            >
              {render(opt)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ServiceTimePicker({ id, value, onChange, describedBy, defaultOpen = false }: ServiceTimePickerProps) {
  const [format, setFormat] = useState<TimeFormat>("12");
  const [open, setOpen] = useState(defaultOpen);
  const parsed = parseTime(value);
  const [draft, setDraft] = useState(() => parsed ?? { h: 9, m: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setFormat(readFormat()); }, []);

  const changeFormat = (f: TimeFormat) => {
    setFormat(f);
    try { window.localStorage.setItem(TIME_FORMAT_KEY, f); } catch { /* ignore */ }
  };

  const openPanel = () => {
    setDraft(parseTime(value) ?? { h: 9, m: 0 });
    setOpen(true);
  };
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
  }, [open]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const confirm = () => { onChange(formatCanonical(draft.h, draft.m)); close(); };

  const { hour: h12, pm } = to12(draft.h);
  const display = displayTime(value, format);
  const formatLabel = format === "12" ? "نظام ١٢ ساعة" : "نظام ٢٤ ساعة";
  const panelId = `${id}-panel`;

  return (
    <div className="min-w-0 space-y-2" data-time-value={value} data-testid="service-time-picker">
      <input type="hidden" name={id} value={value} data-testid="input-service-time-value" />
      <div className="flex min-w-0 items-stretch gap-1.5">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-describedby={describedBy}
          aria-label={`الوقت، ${formatLabel}: ${display || "لم يحدد"}`}
          data-time-value={value}
          onClick={() => (open ? close() : openPanel())}
          data-testid="service-booking-time"
          className={cn(
            "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 text-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            open && "border-primary/50",
          )}
        >
          <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className={cn("truncate tabular-nums", !display && "text-muted-foreground")} dir={display ? "ltr" : "rtl"}>
            {display || "اختر الوقت"}
          </span>
        </button>
        {value && (
          <button
            type="button"
            aria-label="مسح الوقت"
            onClick={() => { onChange(""); close(); }}
            data-testid="button-clear-service-time"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-input bg-background text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="اختيار الوقت"
          onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}
          className="min-w-0 space-y-3 rounded-2xl border border-primary/20 bg-card p-3 shadow-sm animate-in fade-in-0 slide-in-from-top-1"
          data-testid="panel-service-time"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold tabular-nums text-primary" dir="ltr" aria-live="polite" data-testid="text-time-draft">
              {displayTime(formatCanonical(draft.h, draft.m), format)}
            </span>
            <div role="radiogroup" aria-label="نظام الساعة" className="flex rounded-lg bg-muted p-0.5 text-xs"
              onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "12" : event.key === "End" ? "24" : format === "12" ? "24" : "12";
                changeFormat(next);
                event.currentTarget.querySelector<HTMLButtonElement>(`[data-testid="button-time-format-${next}"]`)?.focus();
              }}>
              {(["12", "24"] as TimeFormat[]).map(f => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  tabIndex={format === f ? 0 : -1}
                  aria-checked={format === f}
                  onClick={() => changeFormat(f)}
                  data-testid={`button-time-format-${f}`}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold transition-all",
                    format === f ? "bg-background text-primary shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {toAr(f)} ساعة
                </button>
              ))}
            </div>
          </div>

          <div dir="ltr" className="flex min-w-0 gap-2">
            {format === "12" ? (
              <Column label="الساعة" options={HOURS_12} selected={h12} render={v => toAr(v)}
                onSelect={v => setDraft(d => ({ ...d, h: from12(v, pm) }))} testId="list-time-hour" />
            ) : (
              <Column label="الساعة" options={HOURS_24} selected={draft.h} render={v => toAr(String(v).padStart(2, "0"))}
                onSelect={v => setDraft(d => ({ ...d, h: v }))} testId="list-time-hour" />
            )}
            <span className="self-center pt-5 text-lg font-bold text-muted-foreground" aria-hidden>:</span>
            <Column label="الدقيقة" options={MINUTES} selected={draft.m} render={v => toAr(String(v).padStart(2, "0"))}
              onSelect={v => setDraft(d => ({ ...d, m: v }))} testId="list-time-minute" />
            {format === "12" && (
              <Column label="الفترة" options={["ص", "م"]} selected={pm ? "م" : "ص"}
                render={v => (v === "ص" ? "ص" : "م")}
                onSelect={v => setDraft(d => ({ ...d, h: from12(to12(d.h).hour, v === "م") }))} testId="list-time-period" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {format === "12"
              ? "ص = صباحًا، م = مساءً. استخدم الأسهم للتنقل."
              : "من ٠٠ إلى ٢٣ ساعة. استخدم الأسهم للتنقل."}
          </p>

          <div className="flex gap-2">
            <button type="button" onClick={confirm} data-testid="button-confirm-service-time"
              className="h-10 flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              تأكيد الوقت
            </button>
            <button type="button" onClick={close} data-testid="button-cancel-service-time"
              className="h-10 rounded-xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ServiceTimePicker;
