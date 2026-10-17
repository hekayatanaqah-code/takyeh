import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Archive, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CustomerNoteAutosave } from "@/lib/customerNoteAutosave";

export interface CustomerNotesHandle { flush: () => Promise<void>; }

export const CustomerNotes = forwardRef<CustomerNotesHandle, {
  initialValue: string; save: (value: string) => Promise<void>;
}>(function CustomerNotes({ initialValue, save }, ref) {
  const [writer] = useState(() => new CustomerNoteAutosave(initialValue, save));
  const [, refresh] = useState(0);
  useImperativeHandle(ref, () => ({ flush: () => writer.flush() }), [writer]);
  useEffect(() => {
    writer.onChange = () => refresh(value => value + 1);
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (writer.dirty || writer.status === "saving") { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => {
      writer.onChange = undefined;
      window.removeEventListener("beforeunload", warnUnsaved);
      // Persist the captured customer/draft, never whichever customer is opened next.
      void writer.flush().catch(() => {});
    };
  }, [writer]);
  const persist = () => { void writer.flush().catch(() => {}); };
  const error = writer.status === "error";
  return <div className="bg-card border border-border rounded-2xl p-5">
    <h3 className="font-bold text-sm text-foreground mb-1 flex items-center gap-2">
      <FileText className="w-4 h-4 text-primary" />ملاحظات داخلية
    </h3>
    <p className="text-xs text-muted-foreground mb-3">
      هذه الملاحظات مخفية تماماً عن العميل — تُستخدم للتذكير والملاحظات الداخلية فقط
    </p>
    <Textarea
      aria-label="ملاحظات داخلية" aria-describedby="customer-note-status"
      value={writer.value} onChange={event => writer.change(event.target.value)} onBlur={persist}
      placeholder="مثال: عميل VIP، يفضّل الفترة الصباحية، تأخّر في الخروج مرة واحدة…"
      rows={4} className="text-sm resize-none" dir="rtl"
    />
    <div className="flex items-center justify-between gap-3 mt-3">
      <p id="customer-note-status" role={error ? "alert" : "status"} aria-live="polite"
        className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
        {error ? "تعذّر الحفظ. النص محفوظ هنا؛ أعد المحاولة قبل المغادرة."
          : writer.status === "saving" ? "جارٍ حفظ الملاحظة…"
          : writer.status === "pending" ? "تغييرات غير محفوظة…"
          : "جميع التغييرات محفوظة"}
      </p>
      <Button size="sm" onClick={persist} disabled={!writer.dirty || writer.status === "saving"} className="gap-2 shrink-0">
        {writer.status === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
        {error ? "إعادة محاولة الحفظ" : "حفظ الملاحظة"}
      </Button>
    </div>
  </div>;
});
