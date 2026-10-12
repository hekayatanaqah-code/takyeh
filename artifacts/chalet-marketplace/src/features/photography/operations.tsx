import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeliverDialog } from "./delivery";
import { call, fmtDT, btnCls, ghostCls, cardCls, inputCls, Notice, ErrorBox, Empty, type Booking, type Photographer } from "./shared";

/* ---------- Types ---------- */
export interface PhotoPolicy { introBookings: number; cancellationThreshold: number; cancellationWindowDays: number; qualityThreshold: number }
export type CancelReason = "emergency" | "equipment" | "personal" | "other";
export const CANCEL_REASON_AR: Record<CancelReason, string> = { emergency: "ظرف طارئ", equipment: "عطل في المعدات", personal: "ظرف شخصي", other: "أخرى" };
export interface PhotoCancellation { id: number; bookingId: number; reason: string; details: string | null; createdAt: string; replacementPhotographerId: number | null; propertyName: string; startAt: string; photographerName?: string }
export interface PhotoAlert { id: number; kind: "quality" | "cancellation_repeat" | "replacement_needed"; photographerId: number; bookingId: number | null; message: string; createdAt: string; readAt: string | null }
export const ALERT_KIND_AR: Record<PhotoAlert["kind"], string> = { quality: "انخفاض التقييم", cancellation_repeat: "اعتذارات متكررة", replacement_needed: "بحاجة لمصور بديل" };

const ar = (n: number, d = 0) => n.toLocaleString("ar-SA", { maximumFractionDigits: d, minimumFractionDigits: d });
export const reasonAr = (r: string) => CANCEL_REASON_AR[r as CancelReason] ?? r;

/* ---------- Stars ---------- */
export function StarsDisplay({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${ar(value, 1)} من ٥`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} width={size} height={size} className={i <= Math.round(value) ? "fill-[#C9963F] text-[#C9963F]" : "text-muted-foreground/40"} aria-hidden />)}
    </span>
  );
}

export function RatingSummary({ p }: { p: Photographer }) {
  if (p.averageRating == null) return <span className="text-xs text-muted-foreground" data-testid={`text-rating-${p.id}`}>لا تقييمات بعد</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold" data-testid={`text-rating-${p.id}`}><StarsDisplay value={p.averageRating} size={13} />{ar(p.averageRating, 1)} <span className="font-normal text-muted-foreground">({ar(p.ratingCount ?? 0)})</span></span>;
}

/* ---------- Owner review ---------- */
export function OwnerReview({ b, invalidateKey }: { b: Booking; invalidateKey: readonly unknown[] }) {
  const qc = useQueryClient();
  const [stars, setStars] = useState(0); const [hover, setHover] = useState(0); const [comment, setComment] = useState("");
  const m = useMutation({
    mutationFn: () => call(`/photography/bookings/${b.id}/review`, "POST", { stars, ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...invalidateKey] }),
  });
  if (b.review) return (
    <div className="space-y-1 rounded-xl border border-border bg-muted/40 p-3" data-testid={`review-saved-${b.id}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">تقييمك <StarsDisplay value={b.review.stars} /> <span className="text-xs font-normal text-muted-foreground">{fmtDT(b.review.createdAt)}</span></div>
      {b.review.comment && <p className="text-sm">{b.review.comment}</p>}
    </div>
  );
  const shown = hover || stars;
  return (
    <form className="space-y-2 rounded-xl border border-[#8C6246]/30 bg-[#8C6246]/5 p-3" onSubmit={(e) => { e.preventDefault(); if (stars && !m.isPending && !m.isSuccess) m.mutate(); }} data-testid={`form-review-${b.id}`}>
      <p className="text-sm font-bold">تم تسليم الجلسة، كيف كانت تجربتك؟</p>
      <div role="radiogroup" aria-label="التقييم من ١ إلى ٥" className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={stars === i} aria-label={`${ar(i)} من ٥`} onMouseEnter={() => setHover(i)} onClick={() => setStars(i)}
            className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C6246]" data-testid={`button-star-${b.id}-${i}`}>
            <Star width={26} height={26} className={i <= shown ? "fill-[#C9963F] text-[#C9963F]" : "text-muted-foreground/50"} aria-hidden />
          </button>
        ))}
      </div>
      <textarea className={inputCls} rows={2} maxLength={1000} placeholder="تعليق اختياري" value={comment} onChange={(e) => setComment(e.target.value)} data-testid={`input-review-comment-${b.id}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{ar(comment.length)} / ١٠٠٠</span>
        <button className={btnCls} disabled={!stars || m.isPending || m.isSuccess} data-testid={`button-submit-review-${b.id}`}>{m.isPending ? "جار الإرسال" : "إرسال التقييم"}</button>
      </div>
      {m.isError && <ErrorBox error={m.error} />}
    </form>
  );
}

/* ---------- Photographer actions ---------- */
export const canDeliver = (b: Booking, now = Date.now()) =>
  new Date(b.endAt).getTime() <= now && (!b.deliveredAt || (!b.deliveryUrl && !b.deliveryFiles?.length)) && b.assignmentStatus !== "needs_review" && (b.status === "confirmed" || b.status === "completed");
export const canCancel = (b: Booking) => b.status === "confirmed" && !b.deliveredAt && b.assignmentStatus !== "needs_review";

export function BookingActions({ b }: { b: Booking }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<"cancel" | "deliver" | null>(null);
  const [reason, setReason] = useState<CancelReason | "">(""); const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const cancel = useMutation({
    mutationFn: () => call<{ reassigned: boolean; needsAdminReview: boolean; message: string }>(`/photography/portal/bookings/${b.id}/cancel`, "POST", { reason, ...(details.trim() ? { details: details.trim() } : {}) }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["ph-portal"] });
      setOpen(null); setReason(""); setDetails("");
      setResult({ tone: r.reassigned ? "ok" : "warn", text: r.message || (r.reassigned ? "تم نقل الجلسة إلى مصور بديل." : "أحيلت الجلسة إلى الإدارة لتعيين بديل.") });
    },
  });
  const showCancel = canCancel(b); const showDeliver = canDeliver(b);
  if (!showCancel && !showDeliver && !result) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showDeliver && <button type="button" className={btnCls} onClick={() => setOpen("deliver")} data-testid={`button-deliver-${b.id}`}>رفع وتسليم الجلسة</button>}
        {showCancel && <button type="button" className={ghostCls} disabled={cancel.isPending} onClick={() => { cancel.reset(); setOpen("cancel"); }} data-testid={`button-cancel-session-${b.id}`}>اعتذار عن الجلسة</button>}
      </div>
      {result && <Notice tone={result.tone}><span data-testid={`text-action-result-${b.id}`}>{result.text}</span></Notice>}

      <Dialog open={open === "cancel"} onOpenChange={(o) => { if (!cancel.isPending) setOpen(o ? "cancel" : null); }}>
        <DialogContent dir="rtl" className="text-right">
          <DialogHeader><DialogTitle>اعتذار عن الجلسة</DialogTitle>
            <DialogDescription>{b.propertyName} - {fmtDT(b.startAt)}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Notice tone="warn">سيحاول النظام نقل الجلسة تلقائيا لمصور بديل في نفس المنطقة، وإن تعذر ذلك تحال للإدارة. هذا ليس إلغاء ماليا لحجز العميل، ويحتسب الاعتذار ضمن سجلك.</Notice>
            <div className="space-y-1.5">
              <span className="text-sm font-semibold" id={`reason-label-${b.id}`}>سبب الاعتذار (مطلوب)</span>
              <Select value={reason} onValueChange={(v) => setReason(v as CancelReason)}>
                <SelectTrigger aria-labelledby={`reason-label-${b.id}`} data-testid={`select-cancel-reason-${b.id}`}><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                <SelectContent>{(Object.keys(CANCEL_REASON_AR) as CancelReason[]).map((k) => <SelectItem key={k} value={k}>{CANCEL_REASON_AR[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="block space-y-1.5"><span className="text-sm font-semibold">تفاصيل إضافية (اختياري)</span>
              <textarea className={inputCls} rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} data-testid={`input-cancel-details-${b.id}`} />
              <span className="block text-xs text-muted-foreground">{ar(details.length)} / ٢٠٠٠</span></label>
            {cancel.isError && <ErrorBox error={cancel.error} />}
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <button type="button" className={btnCls} disabled={!reason || cancel.isPending} onClick={() => cancel.mutate()} data-testid={`button-confirm-cancel-${b.id}`}>{cancel.isPending ? "جار الإرسال" : "تأكيد الاعتذار"}</button>
            <button type="button" className={ghostCls} disabled={cancel.isPending} onClick={() => setOpen(null)}>تراجع</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeliverDialog b={b} open={open === "deliver"} onClose={() => setOpen(null)} onDone={() => { setOpen(null); setResult({ tone: "ok", text: "تم تسليم الجلسة وإشعار المالك." }); }} />
    </div>
  );
}

/* ---------- Photographer standing ---------- */
export function StandingNotices({ p, policy }: { p: Photographer; policy?: PhotoPolicy }) {
  if (p.status !== "approved") return null;
  const intro = p.introBookingsRemaining ?? 0;
  return (
    <section className={`${cardCls} space-y-3`} data-testid="section-standing">
      <h3 className="font-bold">مستوى الأداء</h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted p-2"><p className="text-xs text-muted-foreground">التقييم</p><p className="font-bold" data-testid="text-my-rating">{p.averageRating == null ? "—" : ar(p.averageRating, 1)}</p><p className="text-[11px] text-muted-foreground">{ar(p.ratingCount ?? 0)} تقييم</p></div>
        <div className="rounded-xl bg-muted p-2"><p className="text-xs text-muted-foreground">اعتذارات {policy ? ar(policy.cancellationWindowDays) : "٣٠"} يوما</p><p className="font-bold" data-testid="text-my-cancellations">{ar(p.cancellationCount30 ?? 0)}{policy && <span className="text-xs font-normal text-muted-foreground"> / {ar(policy.cancellationThreshold)}</span>}</p></div>
        <div className="rounded-xl bg-muted p-2"><p className="text-xs text-muted-foreground">جلسات تعريفية</p><p className="font-bold" data-testid="text-my-intro">{ar(intro)}</p></div>
      </div>
      {intro > 0 && <Notice tone="ok">متبقٍ لك {ar(intro)} من الجلسات التعريفية ذات الأولوية في التوزيع.</Notice>}
      {p.allocationEligible === false && <Notice tone="err">حسابك خارج التوزيع التلقائي للحجوزات حاليا بقرار تشغيلي. تواصل مع الإدارة عبر مركز الدعم.</Notice>}
      {p.priorityReduced && <Notice tone="warn">تم خفض أولويتك في التوزيع{policy ? ` بسبب تقييم أقل من ${ar(policy.qualityThreshold, 1)} أو ${ar(policy.cancellationThreshold)} اعتذارات خلال ${ar(policy.cancellationWindowDays)} يوما` : ""}.</Notice>}
      {!p.priorityReduced && policy && (p.cancellationCount30 ?? 0) > 0 && (p.cancellationCount30 ?? 0) < policy.cancellationThreshold && <Notice tone="warn">بلوغ {ar(policy.cancellationThreshold)} اعتذارات خلال {ar(policy.cancellationWindowDays)} يوما يخفض أولويتك.</Notice>}
    </section>
  );
}

export function CancellationHistory({ items, showPhotographer = false }: { items: PhotoCancellation[]; showPhotographer?: boolean }) {
  if (items.length === 0) return <Empty title="لا يوجد سجل اعتذارات" />;
  return (
    <ul className="space-y-2" data-testid="list-cancellations">
      {[...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => (
        <li key={c.id} className={`${cardCls} space-y-1`} data-testid={`card-cancellation-${c.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{c.propertyName} <span className="text-sm font-normal text-muted-foreground">- {fmtDT(c.startAt)}</span></p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${c.replacementPhotographerId ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-800"}`}>{c.replacementPhotographerId ? "نقلت لبديل" : "بانتظار بديل"}</span>
          </div>
          <p className="text-sm">{showPhotographer && c.photographerName ? <span className="font-semibold">{c.photographerName}: </span> : null}{reasonAr(c.reason)}{c.details ? ` - ${c.details}` : ""}</p>
          <p className="text-xs text-muted-foreground">سجل في {fmtDT(c.createdAt)} - حجز #{ar(c.bookingId)}</p>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Admin ---------- */
function PolicyEditDialog({ policy, onClose, onSaved }: { policy: PhotoPolicy; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ introBookings: String(policy.introBookings), cancellationThreshold: String(policy.cancellationThreshold), cancellationWindowDays: String(policy.cancellationWindowDays), qualityThreshold: String(policy.qualityThreshold) });
  const [err, setErr] = useState<string | null>(null);
  const n = { introBookings: Number(f.introBookings), cancellationThreshold: Number(f.cancellationThreshold), cancellationWindowDays: Number(f.cancellationWindowDays), qualityThreshold: Math.round(Number(f.qualityThreshold) * 10) / 10 };
  const intIn = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  const m = useMutation({
    mutationFn: () => call<PhotoPolicy>("/admin/photography/policy", "PATCH", n),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ph-admin"] }); qc.invalidateQueries({ queryKey: ["ph-portal"] }); onSaved(); onClose(); },
  });
  const submit = () => {
    const e = !intIn(n.introBookings, 0, 100) ? "الجلسات التعريفية عدد صحيح بين ٠ و١٠٠"
      : !intIn(n.cancellationThreshold, 1, 100) ? "حد الاعتذارات عدد صحيح بين ١ و١٠٠"
      : !intIn(n.cancellationWindowDays, 1, 365) ? "نافذة الاعتذارات بين ١ و٣٦٥ يوما"
      : !(f.qualityThreshold.trim() !== "" && n.qualityThreshold >= 1 && n.qualityThreshold <= 5) ? "حد الجودة بين ١ و٥" : null;
    setErr(e); if (!e) m.mutate();
  };
  const fields: [keyof typeof f, string, string, string, string][] = [
    ["introBookings", "الجلسات التعريفية لكل مصور جديد", "0", "100", "1"],
    ["cancellationThreshold", "حد الاعتذارات المتكررة", "1", "100", "1"],
    ["cancellationWindowDays", "نافذة احتساب الاعتذارات (يوم)", "1", "365", "1"],
    ["qualityThreshold", "حد جودة التقييم (من ٥)", "1", "5", "0.1"],
  ];
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !m.isPending) onClose(); }}>
      <DialogContent dir="rtl" className="text-right">
        <DialogHeader><DialogTitle>تعديل سياسة التوزيع والجودة</DialogTitle><DialogDescription>تطبق القيم الجديدة على التوزيع والتنبيهات القادمة.</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <fieldset disabled={m.isPending} className="grid gap-3 sm:grid-cols-2">
            {fields.map(([k, l, lo, hi, st]) => (
              <label key={k} className="block space-y-1.5"><span className="text-sm font-semibold">{l}</span>
                <input type="number" min={lo} max={hi} step={st} className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`input-policy-${k}`} /></label>
            ))}
          </fieldset>
          {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
          <DialogFooter className="gap-2 sm:justify-start">
            <button className={btnCls} disabled={m.isPending} data-testid="button-save-policy">{m.isPending ? "جار الحفظ" : "حفظ السياسة"}</button>
            <button type="button" className={ghostCls} disabled={m.isPending} onClick={onClose}>إلغاء</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PolicyCard({ policy, editable = false }: { policy?: PhotoPolicy; editable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!policy) return null;
  const rows: [string, string][] = [
    ["الجلسات التعريفية لكل مصور جديد", ar(policy.introBookings)],
    ["حد الاعتذارات المتكررة", `${ar(policy.cancellationThreshold)} خلال ${ar(policy.cancellationWindowDays)} يوما`],
    ["حد جودة التقييم", `${ar(policy.qualityThreshold, 1)} من ٥`],
  ];
  return (
    <section className={`${cardCls} space-y-2`} data-testid="section-policy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">سياسة التوزيع والجودة المعتمدة</h3>
        {editable && <button type="button" className={ghostCls} onClick={() => { setSaved(false); setOpen(true); }} data-testid="button-edit-policy">تعديل السياسة</button>}
      </div>
      <p className="text-xs text-muted-foreground">{editable ? "" : "للاطلاع فقط. "}التوزيع تلقائي بالتناوب الموزون بين المصورين المؤهلين في نفس المنطقة والمدينة والحي.</p>
      <dl className="divide-y divide-border">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="font-bold">{v}</dd></div>)}</dl>
      {saved && <Notice tone="ok"><span data-testid="text-policy-saved">تم حفظ السياسة.</span></Notice>}
      {editable && open && <PolicyEditDialog policy={policy} onClose={() => setOpen(false)} onSaved={() => setSaved(true)} />}
    </section>
  );
}

export function AlertsList({ alerts, names, kinds, title, emptyText, renderExtra }: { alerts: PhotoAlert[]; names: Map<number, string>; kinds: PhotoAlert["kind"][]; title: string; emptyText: string; renderExtra?: (a: PhotoAlert) => React.ReactNode }) {
  const qc = useQueryClient();
  const read = useMutation({ mutationFn: (id: number) => call(`/admin/photography/alerts/${id}/read`, "POST"), onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-admin"] }) });
  const list = alerts.filter((a) => kinds.includes(a.kind)).sort((a, b) => (a.readAt ? 1 : 0) - (b.readAt ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  const unread = list.filter((a) => !a.readAt).length;
  return (
    <section className="space-y-3" data-testid={`section-alerts-${kinds.join("-")}`}>
      <h3 className="font-bold">{title} {unread > 0 && <span className="ms-2 rounded-full bg-[#8C6246] px-2 py-0.5 text-xs text-white">{ar(unread)} غير مراجع</span>}</h3>
      {read.isError && <ErrorBox error={read.error} />}
      {list.length === 0 ? <Empty title={emptyText} /> : (
        <ul className="space-y-2">{list.map((a) => (
          <li key={a.id} className={`${cardCls} space-y-2 ${a.readAt ? "opacity-80" : "border-amber-400 bg-amber-50/60"}`} data-testid={`card-alert-${a.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold"><span className="me-2 rounded-full bg-muted px-2 py-0.5 text-xs">{ALERT_KIND_AR[a.kind]}</span>{names.get(a.photographerId) ?? `مصور #${ar(a.photographerId)}`}</p>
              <span className="text-xs font-semibold" data-testid={`status-alert-${a.id}`}>{a.readAt ? `تمت المراجعة ${fmtDT(a.readAt)}` : "غير مراجع"}</span>
            </div>
            <p className="text-sm">{a.message}</p>
            <p className="text-xs text-muted-foreground">{fmtDT(a.createdAt)}{a.bookingId ? ` - حجز #${ar(a.bookingId)}` : ""}</p>
            <div className="flex flex-wrap gap-2">
              {renderExtra?.(a)}
              {!a.readAt && <button type="button" className={ghostCls} disabled={read.isPending && read.variables === a.id} onClick={() => read.mutate(a.id)} data-testid={`button-read-alert-${a.id}`}>تمت المراجعة</button>}
            </div>
            {!a.readAt && a.kind !== "replacement_needed" && <p className="text-[11px] text-muted-foreground">المراجعة لا تعيد أهلية التوزيع تلقائيا.</p>}
          </li>
        ))}</ul>
      )}
    </section>
  );
}

export function ReassignButton({ bookingId }: { bookingId: number }) {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: () => call<{ message?: string }>(`/admin/photography/bookings/${bookingId}/reassign`, "POST"), onSuccess: () => qc.invalidateQueries({ queryKey: ["ph-admin"] }) });
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={btnCls} disabled={m.isPending} onClick={() => m.mutate()} data-testid={`button-reassign-${bookingId}`}>{m.isPending ? "جار البحث عن بديل" : "إعادة محاولة التعيين"}</button>
      {m.isError && <span role="alert" className="text-xs font-semibold text-destructive">{m.error instanceof Error ? m.error.message : "تعذر التعيين"}</span>}
      {m.isSuccess && <span className="text-xs font-semibold text-emerald-700">{m.data?.message || "تمت إعادة المحاولة"}</span>}
    </span>
  );
}
