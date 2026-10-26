import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, CheckCircle, Loader2, Lock, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "danger";

interface SectionProps {
  /** When false, children render untouched (legacy layout, no wrapper markup). */
  enabled: boolean;
  id: string;
  title: string;
  hint?: string;
  index?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: Tone;
  children: ReactNode;
}

/**
 * Collapsible section for the service-details pilot. Content stays mounted
 * when collapsed (hidden attribute only), so form state is never reset.
 */
export function ServiceActivityDetailsSection({ enabled, id, title, hint, index, open, onOpenChange, tone = "default", children }: SectionProps) {
  const uid = useId();
  if (!enabled) return <>{children}</>;
  const danger = tone === "danger";
  const contentId = `${uid}-content`;
  const triggerId = `${uid}-trigger`;
  return (
    <section
      data-testid={`service-details-section-${id}`}
      data-state={open ? "open" : "closed"}
      className={cn(
        "rounded-2xl border transition-colors",
        danger
          ? "border-destructive/30 bg-destructive/[0.03]"
          : open ? "border-amber-300/70 bg-card shadow-sm" : "border-border bg-card/60",
      )}
    >
      <h3 className="m-0">
        <button
          type="button"
          id={triggerId}
          data-testid={`trigger-service-details-${id}`}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-right rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            danger ? "focus-visible:ring-destructive/50" : "focus-visible:ring-amber-400",
          )}
        >
          {index != null && (
            <span
              aria-hidden="true"
              className={cn(
                "shrink-0 w-8 h-8 rounded-xl grid place-items-center text-xs font-bold tabular-nums",
                danger ? "bg-destructive/10 text-destructive" : open ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {index.toLocaleString("ar-SA")}
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className={cn("block text-sm sm:text-base font-bold", danger ? "text-destructive" : "text-foreground")}>{title}</span>
            {hint && <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{hint}</span>}
          </span>
          <span className="sr-only">{open ? "طي القسم" : "فتح القسم"}</span>
          <ChevronDown aria-hidden="true" className={cn("w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        </button>
      </h3>
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        data-testid={`content-service-details-${id}`}
        hidden={!open}
        className="px-4 sm:px-5 pb-5 pt-1 space-y-6"
      >
        {children}
      </div>
    </section>
  );
}

interface StickySaveProps {
  businessName?: string;
  saving: boolean;
  uploading: boolean;
  readOnly: boolean;
  onSave: () => void;
}

/** Sticky save bar pinned directly under the platform navbar (pilot only). */
export function ServiceDetailsStickySave({ businessName, saving, uploading, readOnly, onSave }: StickySaveProps) {
  const [offset, setOffset] = useState(64);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-testid="platform-navbar"]');
    if (!header) return;
    const update = () => setOffset(Math.round(header.getBoundingClientRect().height));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(header);
    window.addEventListener("resize", update);
    return () => { ro?.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const disabled = saving || uploading;
  const status = readOnly
    ? "وضع القراءة فقط — لا يمكن حفظ التعديلات"
    : saving ? "جارٍ حفظ التعديلات..."
    : uploading ? "انتظر اكتمال رفع الصور قبل الحفظ"
    : "راجع الأقسام ثم احفظ تعديلاتك";

  return (
    <div
      data-testid="sticky-service-details-save"
      style={{ top: offset }}
      className="sticky z-40 -mx-1 sm:mx-0"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200/80 dark:border-amber-800/40 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 px-3 sm:px-4 py-2.5 shadow-[0_6px_20px_-12px_rgba(120,72,0,0.35)]">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">تفاصيل النشاط</p>
          <p className="text-sm font-bold text-foreground truncate">{businessName || "نشاطك"}</p>
          <p className="hidden sm:block text-[11px] text-muted-foreground mt-0.5" aria-live="polite">{status}</p>
        </div>
        <button
          type="button"
          data-testid="button-save-service-details"
          onClick={onSave}
          disabled={disabled}
          aria-disabled={disabled || readOnly}
          aria-busy={saving}
          aria-label={readOnly ? "حفظ التعديلات غير متاح في وضع القراءة فقط" : uploading ? "حفظ التعديلات متوقف حتى اكتمال الرفع" : "حفظ تعديلات تفاصيل النشاط"}
          title={status}
          className={cn(
            "shrink-0 inline-flex items-center justify-center gap-2 min-h-11 px-4 sm:px-6 rounded-xl text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2",
            readOnly ? "bg-muted text-muted-foreground" : "bg-amber-500 hover:bg-amber-600 text-white",
            disabled && "opacity-60 cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
            : readOnly ? <Lock className="w-4 h-4" />
            : uploading ? <UploadCloud className="w-4 h-4" />
            : <CheckCircle className="w-4 h-4" />}
          {saving ? "جارٍ الحفظ" : "حفظ التعديلات"}
        </button>
      </div>
    </div>
  );
}
