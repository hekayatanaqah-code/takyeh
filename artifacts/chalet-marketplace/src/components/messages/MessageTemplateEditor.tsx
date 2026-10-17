import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MessageTemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: readonly string[];
  disabled?: boolean;
  rows?: number;
  label: string;
}

const VISIBLE_COUNT = 10;

/** Split text into plain and token segments. Tokens = known variables or any {word}. */
export function splitTemplateTokens(text: string, variables: readonly string[]) {
  const known = new Set(variables);
  const parts: { text: string; token: boolean; known: boolean }[] = [];
  const re = /\{[^{}\n]{1,40}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), token: false, known: false });
    parts.push({ text: m[0], token: true, known: known.has(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), token: false, known: false });
  return parts;
}

// Shared metrics: textarea and overlay MUST match exactly.
const METRICS =
  "px-3.5 py-3 text-[15px] leading-7 font-sans whitespace-pre-wrap break-words [overflow-wrap:anywhere] [tab-size:4] [scrollbar-gutter:stable] border [font-feature-settings:'locl'_1,'tnum'_0,'onum'_0]";

export function MessageTemplateEditor({ value, onChange, variables, disabled = false, rows = 8, label }: MessageTemplateEditorProps) {
  const id = useId();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [announce, setAnnounce] = useState("");

  const parts = useMemo(() => splitTemplateTokens(value, variables), [value, variables]);

  const syncScroll = useCallback(() => {
    const ta = taRef.current, ov = overlayRef.current;
    if (ta && ov) { ov.scrollTop = ta.scrollTop; ov.scrollLeft = ta.scrollLeft; }
  }, []);
  useLayoutEffect(syncScroll, [value, syncScroll]);

  const insert = (variable: string) => {
    const ta = taRef.current;
    if (!ta || disabled) return;
    ta.focus();
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    // execCommand keeps native undo stack; fall back to setRangeText.
    let ok = false;
    try { ok = document.execCommand("insertText", false, variable); } catch { ok = false; }
    if (!ok || ta.value === value) {
      const next = value.slice(0, start) + variable + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const pos = start + variable.length;
        ta.setSelectionRange(pos, pos);
        syncScroll();
      });
    }
    setAnnounce(`تم إدراج ${variable}`);
  };

  const shown = expanded ? variables : variables.slice(0, VISIBLE_COUNT);
  const hidden = variables.length - VISIBLE_COUNT;

  return (
    <div className="space-y-2" dir="rtl" data-testid="message-template-editor">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">{label}</label>

      <div role="group" aria-label="إدراج متغير في موضع المؤشر" className="flex flex-wrap gap-1.5">
        {shown.map((v, i) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onMouseDown={e => e.preventDefault()}
            onClick={() => insert(v)}
            data-testid={`button-insert-variable-${i}`}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100 dark:hover:bg-sky-900"
          >
            <Plus className="h-3 w-3" aria-hidden />
            <span>{v}</span>
          </button>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(x => !x)}
            aria-expanded={expanded}
            data-testid="button-toggle-variables"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expanded ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
            {expanded ? "عرض أقل" : `عرض ${hidden} متغيرات أخرى`}
          </button>
        )}
      </div>

      <div className={cn("relative rounded-xl bg-white dark:bg-zinc-950", disabled && "opacity-60")}>
        <div
          ref={overlayRef}
          aria-hidden
          dir="rtl"
          className={cn(METRICS, "pointer-events-none absolute inset-0 overflow-hidden rounded-xl border-transparent text-transparent select-none")}
        >
          {parts.map((p, i) =>
            p.token ? (
              <mark
                key={i}
                className={cn(
                  "rounded-md text-transparent [box-decoration-break:clone]",
                  p.known
                    ? "bg-sky-200/80 shadow-[0_0_0_1px_rgb(14_116_144/0.45)] dark:bg-sky-700/60"
                    : "bg-amber-200/80 shadow-[0_0_0_1px_rgb(180_83_9/0.5)] dark:bg-amber-700/60",
                )}
                data-currency-raw
              >{p.text}</mark>
            ) : (
              <span key={i} data-currency-raw>{p.text}</span>
            ),
          )}
          {"\u200b\n"}
        </div>
        <textarea
          ref={taRef}
          id={id}
          dir="rtl"
          rows={rows}
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={e => onChange(e.target.value)}
          onScroll={syncScroll}
          onPaste={e => {
            const text = e.clipboardData.getData("text/plain");
            if (!text) return;
            e.preventDefault();
            const ta = e.currentTarget;
            let ok = false;
            try { ok = document.execCommand("insertText", false, text); } catch { ok = false; }
            if (!ok) {
              const s = ta.selectionStart, en = ta.selectionEnd;
              onChange(ta.value.slice(0, s) + text + ta.value.slice(en));
              requestAnimationFrame(() => ta.setSelectionRange(s + text.length, s + text.length));
            }
          }}
          data-testid="input-message-template"
          className={cn(
            METRICS,
            "relative block w-full resize-y overflow-auto rounded-xl border-input bg-transparent text-zinc-950 caret-zinc-950 dark:text-zinc-50 dark:caret-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed",
          )}
        />
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium leading-6 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <span className="font-bold text-sky-900 dark:text-sky-200">الأزرق: متغير معروف يُستبدل ببيانات الحجز.</span>
        {" "}
        <span className="font-bold text-amber-950 dark:text-amber-200">البرتقالي: متغير غير معروف؛ راجع كتابته قبل الحفظ.</span>
        <p>استخدم الأزرار أعلاه للإدراج في موضع المؤشر. تُجهَّز الرسالة تلقائياً، وتراجعها وترسلها يدوياً في واتساب.</p>
      </div>
    </div>
  );
}
