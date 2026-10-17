import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Undo2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { call, API, sar, fmtDT, Field, inputCls, btnCls, ghostCls, Notice, ErrorBox, type Booking } from "./shared";
import { DEST_AR, type Refund, type RefundDestination } from "./money";

const REFUNDABLE = new Set(["confirmed", "completed", "cancelled"]);
export const refundableHalalas = (b: Booking) => Math.max(0, b.priceHalalas - (b.refundedHalalas ?? 0));
export const canRefund = (b: Booking) => REFUNDABLE.has(b.status) && !!b.paymentMethod && refundableHalalas(b) > 0 && b.financialStatus !== "refund_pending";

/* ── Persisted submitted refund (no receipts/URLs/secrets; only the request body) ── */
interface RefundMarker { requestKey: string; bookingId: number; amountHalalas: number; destination: RefundDestination; reason: string; createdAt: string; duplicate?: boolean }
const markerKey = (actor: string, bookingId: number) => `refund-op:v1:${actor}:booking:${bookingId}`;
function readMarker(actor: string | null, bookingId: number): RefundMarker | null {
  if (!actor) return null;
  try {
    const raw = window.localStorage.getItem(markerKey(actor, bookingId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.requestKey !== "string" || v.bookingId !== bookingId || !Number.isSafeInteger(v.amountHalalas) || v.amountHalalas <= 0 ||
        (v.destination !== "card" && v.destination !== "wallet") || typeof v.reason !== "string") return null;
    return v as RefundMarker;
  } catch { return null; }
}
function writeMarker(actor: string, m: RefundMarker): boolean {
  try {
    window.localStorage.setItem(markerKey(actor, m.bookingId), JSON.stringify(m));
    return readMarker(actor, m.bookingId)?.requestKey === m.requestKey;
  } catch { return false; }
}
function removeMarker(actor: string, bookingId: number) { try { window.localStorage.removeItem(markerKey(actor, bookingId)); } catch { /* ignore */ } }

type Outcome =
  | { kind: "done"; refund: Refund }            // verified succeeded/failed → clear
  | { kind: "pending"; refund: Refund }         // row exists, provider pending → keep
  | { kind: "rejected"; message: string }       // definite no-intent rejection → clear
  | { kind: "duplicate"; message: string }      // key used with a different body → keep & block
  | { kind: "uncertain"; message: string };     // network / 5xx / unreadable → keep

async function sendRefund(m: RefundMarker): Promise<Outcome> {
  let r: Response;
  try {
    r = await fetch(`${API}/admin/photography/bookings/${m.bookingId}/refunds`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestKey: m.requestKey, amountHalalas: m.amountHalalas, destination: m.destination, reason: m.reason }),
    });
  } catch { return { kind: "uncertain", message: "انقطع الاتصال قبل وصول رد الخادم؛ نتيجة الاسترداد غير معروفة." }; }
  let j: { code?: string; error?: string; refund?: Refund & { requestKey?: string } } | null = null;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok) {
    const refund = j?.refund;
    if (!refund || !["pending", "succeeded", "failed"].includes(refund.status) || refund.requestKey !== m.requestKey || refund.bookingId !== m.bookingId || refund.amountHalalas !== m.amountHalalas || refund.destination !== m.destination) return { kind: "uncertain", message: "رد غير مكتمل من الخادم؛ نتيجة الاسترداد غير معروفة." };
    return refund.status === "pending" ? { kind: "pending", refund } : { kind: "done", refund };
  }
  const msg = j?.error || "";
  if (r.status === 409 && (j?.code === "refund_duplicate" || msg.includes("مستخدم بمبلغ"))) return { kind: "duplicate", message: msg };
  // Explicit validation/permission/state rejections where no row was created.
  if ([400, 403, 404, 409, 422].includes(r.status) && msg) return { kind: "rejected", message: msg };
  return { kind: "uncertain", message: msg || `خطأ من الخادم (${r.status})؛ نتيجة الاسترداد غير معروفة.` };
}

interface Draft { mode: "full" | "partial"; amount: string; dest: RefundDestination | ""; reason: string }
const newDraft = (): Draft => ({ mode: "full", amount: "", dest: "", reason: "" });

/** Admin refund action. The submitted request (key + exact body) is persisted per admin actor + booking until a verified result. */
export function RefundAction({ b, actor }: { b: Booking; actor: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(newDraft);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Refund | null>(null);
  const [marker, setMarker] = useState<RefundMarker | null>(() => readMarker(actor, b.id));
  const [notice, setNotice] = useState<{ tone: "warn" | "err"; text: string } | null>(null);
  useEffect(() => { setMarker(readMarker(actor, b.id)); }, [actor, b.id]);
  const lock = useRef(false);
  const max = refundableHalalas(b);
  const cardOk = b.paymentMethod === "card" && !!b.paymentId;
  const amountH = d.mode === "full" ? max : Math.round(Number(d.amount) * 100);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["ph-admin"] }); qc.invalidateQueries({ queryKey: ["ph-finance"] }); };
  const m = useMutation({
    mutationFn: (mk: RefundMarker) => sendRefund(mk),
    onSuccess: (o, mk) => {
      if (o.kind === "done") {
        if (actor) removeMarker(actor, mk.bookingId);
        setMarker(null); setResult(o.refund); setNotice(null); setD(newDraft()); setConfirm(false);
      } else if (o.kind === "pending") {
        setResult(o.refund);
        setNotice({ tone: "warn", text: "أُنشئ طلب الاسترداد وهو بانتظار ميسر. تابع حالته من «التحقق من الحالة» في سجل الاستردادات بتبويب المستحقات والحوالات؛ لن يُسمح باسترداد جديد قبل حسمه." });
      } else if (o.kind === "rejected") {
        if (actor) removeMarker(actor, mk.bookingId);
        setMarker(null);
        setNotice({ tone: "err", text: `رفض الخادم الطلب ولم يُنشأ أي استرداد: ${o.message}` });
      } else if (o.kind === "duplicate") {
        const dup = { ...mk, duplicate: true };
        if (actor) writeMarker(actor, dup);
        setMarker(dup);
        setNotice({ tone: "err", text: `${o.message}. قد يكون هناك طلب محفوظ بنفس المفتاح ببيانات مختلفة؛ راجع سجل الاستردادات قبل أي إجراء. لن نُنشئ مفتاحاً جديداً تلقائياً.` });
      } else {
        setNotice({ tone: "warn", text: `${o.message} لا تبدأ استرداداً جديداً؛ استخدم «التحقق من استرداد سابق» لإرسال الطلب نفسه بالمفتاح نفسه.` });
      }
      refresh();
    },
    onError: (e) => setNotice({ tone: "warn", text: `${e instanceof Error ? e.message : "خطأ غير متوقع"}؛ النتيجة غير معروفة. أعد التحقق بالطلب نفسه.` }),
    onSettled: () => { lock.current = false; },
  });

  const replay = () => {
    if (!marker || lock.current || m.isPending) return;
    lock.current = true; setNotice(null); m.mutate(marker);
  };
  const submit = () => {
    if (lock.current || m.isPending) return;
    if (marker) { setErr("يوجد طلب استرداد سابق لم تُعرف نتيجته؛ تحقق منه أولاً."); return; }
    const e = !actor ? "تعذّر التحقق من هوية المشرف؛ أعد تحميل الصفحة" : !d.dest ? "اختر وجهة الاسترداد" : d.dest === "card" && !cardOk ? "لا يمكن الاسترداد إلى البطاقة لهذا الحجز" : !(amountH > 0) || !Number.isSafeInteger(amountH) ? "أدخل مبلغا صحيحا" : amountH > max ? `الحد الأقصى ${sar(max)}` : !d.reason.trim() ? "اكتب سبب الاسترداد" : d.reason.length > 2000 ? "السبب لا يتجاوز ٢٠٠٠ حرف" : !confirm ? "أكد أنك تفهم أن العملية لا يمكن التراجع عنها" : null;
    setErr(e); if (e || !actor) return;
    const mk: RefundMarker = { requestKey: crypto.randomUUID(), bookingId: b.id, amountHalalas: amountH, destination: d.dest as RefundDestination, reason: d.reason.trim(), createdAt: new Date().toISOString() };
    if (!writeMarker(actor, mk)) { setErr("تعذّر حفظ مرجع الطلب في المتصفح؛ لم يُرسل الاسترداد حفاظاً على الأموال."); return; }
    lock.current = true;
    setMarker(mk); setNotice(null);
    m.mutate(mk);
  };

  const showButton = canRefund(b) || !!marker;
  if (!showButton && !result) return null;
  const openDialog = () => { if (!marker) setResult(null); setErr(null); setOpen(true); };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {showButton && <button type="button" className={`${ghostCls} px-3 py-1.5 text-xs ${marker ? "border-amber-500 text-amber-800" : ""}`} onClick={openDialog} data-testid={`button-refund-${b.id}`}>
        {marker ? <><RefreshCw className="h-3.5 w-3.5" aria-hidden /> التحقق من استرداد سابق</> : <><Undo2 className="h-3.5 w-3.5" aria-hidden /> استرداد</>}
      </button>}
      {result && !open && <span className={`text-xs font-semibold ${result.status === "succeeded" ? "text-emerald-700" : result.status === "failed" ? "text-destructive" : "text-amber-800"}`} data-testid={`text-refund-result-${b.id}`}>{result.status === "pending" ? "بانتظار التحقق من ميسر" : result.status === "succeeded" ? "تم الاسترداد" : `فشل الاسترداد${result.error ? `: ${result.error}` : ""}`}</span>}
      <Dialog open={open} onOpenChange={(o) => { if (!m.isPending) setOpen(o); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto text-right">
          <DialogHeader>
            <DialogTitle>استرداد مبلغ حجز #{b.id.toLocaleString("ar-SA")}</DialogTitle>
            <DialogDescription>{b.propertyName} - {b.packageName} - {fmtDT(b.startAt)}</DialogDescription>
          </DialogHeader>
          {marker ? (
            <div className="space-y-3" data-testid={`panel-refund-pending-${b.id}`}>
              <Notice tone="warn">يوجد طلب استرداد أُرسل سابقاً من هذا المتصفح ولم تُؤكَّد نتيجته. التحقق يعيد إرسال الطلب نفسه بالمفتاح نفسه ولن يُنشئ استرداداً مكرراً.</Notice>
              <dl className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 text-sm">
                <dt className="text-muted-foreground">المبلغ المرسل</dt><dd className="font-bold" data-testid="text-refund-frozen-amount">{sar(marker.amountHalalas)}</dd>
                <dt className="text-muted-foreground">الوجهة</dt><dd>{DEST_AR[marker.destination]}</dd>
                <dt className="text-muted-foreground">أُرسل في</dt><dd>{fmtDT(marker.createdAt)}</dd>
                <dt className="col-span-2 text-muted-foreground">السبب</dt><dd className="col-span-2 whitespace-pre-wrap">{marker.reason}</dd>
              </dl>
              {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnCls} disabled={m.isPending} onClick={replay} data-testid={`button-refund-verify-${b.id}`}>{m.isPending ? "جار التحقق" : "التحقق من استرداد سابق"}</button>
                <button type="button" className={ghostCls} disabled={m.isPending} onClick={() => setOpen(false)}>إغلاق</button>
              </div>
            </div>
          ) : result ? (
            <div className="space-y-3">
              {result.status === "succeeded" && <Notice tone="ok">تم الاسترداد بمبلغ {sar(result.amountHalalas)} {DEST_AR[result.destination]}.</Notice>}
              {result.status === "failed" && <Notice tone="err">فشل الاسترداد{result.error ? `: ${result.error}` : ""}. لم يتم تحويل أي مبلغ.</Notice>}
              <p className="text-xs text-muted-foreground">أي استرداد إضافي يُعد طلباً جديداً مستقلاً.</p>
              <div className="flex gap-2">
                {canRefund(b) && <button type="button" className={btnCls} onClick={() => { setResult(null); setD(newDraft()); setConfirm(false); }} data-testid={`button-refund-another-${b.id}`}>استرداد إضافي</button>}
                <button type="button" className={ghostCls} onClick={() => setOpen(false)}>إغلاق</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-muted p-2"><p className="text-muted-foreground">المدفوع</p><p className="font-bold">{sar(b.priceHalalas)}</p></div>
                <div className="rounded-xl bg-muted p-2"><p className="text-muted-foreground">المسترد سابقا</p><p className="font-bold">{sar(b.refundedHalalas ?? 0)}</p></div>
                <div className="rounded-xl bg-[#8C6246]/10 p-2"><p className="text-muted-foreground">المتاح للاسترداد</p><p className="font-bold">{sar(max)}</p></div>
              </div>
              <fieldset disabled={m.isPending} className="space-y-3">
                <div className="flex gap-2" role="radiogroup" aria-label="نوع الاسترداد">
                  {(["full", "partial"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={d.mode === k} onClick={() => setD({ ...d, mode: k })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold ${d.mode === k ? "border-[#8C6246] bg-[#8C6246] text-white" : "border-border"}`} data-testid={`radio-refund-${k}`}>{k === "full" ? `كامل المتاح (${sar(max)})` : "مبلغ جزئي"}</button>)}
                </div>
                {d.mode === "partial" && <Field label="المبلغ (⃁)" hint={`حتى ${sar(max)}`}><input type="number" min="0.01" step="0.01" max={max / 100} className={inputCls} value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} data-testid="input-refund-amount" /></Field>}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">وجهة الاسترداد</p>
                  {(["card", "wallet"] as const).map((k) => {
                    const dis = k === "card" && !cardOk;
                    return (
                      <label key={k} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${d.dest === k ? "border-[#8C6246] bg-[#8C6246]/5" : "border-border"} ${dis ? "opacity-50" : ""}`}>
                        <input type="radio" name={`dest-${b.id}`} className="mt-1" disabled={dis} checked={d.dest === k} onChange={() => setD({ ...d, dest: k })} data-testid={`radio-refund-dest-${k}`} />
                        <span><span className="font-bold">{DEST_AR[k]}</span><span className="block text-xs text-muted-foreground">{k === "card" ? (dis ? (b.paymentMethod === "wallet" ? "الحجز مدفوع من المحفظة" : "لا يوجد رقم عملية دفع حقيقي") : "إرجاع مال فعلي إلى بطاقة المالك عبر ميسر") : "رصيد يضاف لمحفظة المالك ويستخدم في المنصة فقط"}</span></span>
                      </label>
                    );
                  })}
                </div>
                <Field label="سبب الاسترداد (مطلوب)"><textarea rows={3} maxLength={2000} className={inputCls} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} data-testid="input-refund-reason" /><span className="block text-xs text-muted-foreground">{d.reason.length.toLocaleString("ar-SA")} / ٢٠٠٠</span></Field>
                <label className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm font-semibold">
                  <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="check-refund-confirm" />
                  {d.dest === "wallet" ? "أفهم أن هذا يضيف رصيدا حقيقيا لمحفظة المالك ولا يمكن التراجع عنه." : "أفهم أن هذا يعيد مالا فعليا إلى المالك ولا يمكن التراجع عنه."}
                </label>
              </fieldset>
              {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
              {err && <ErrorBox error={new Error(err)} />}
            </div>
          )}
          {!marker && !result && (
            <DialogFooter className="gap-2 sm:justify-start">
              <button type="button" className={btnCls} disabled={m.isPending} onClick={submit} data-testid={`button-confirm-refund-${b.id}`}>{m.isPending ? "جار الإرسال" : `تأكيد استرداد ${amountH > 0 ? sar(amountH) : ""}`}</button>
              <button type="button" className={ghostCls} disabled={m.isPending} onClick={() => setOpen(false)}>إغلاق</button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </span>
  );
}

export function ReconcileButton({ id }: { id: number }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => call<{ refund: Refund }>(`/admin/photography/refunds/${id}/reconcile`, "POST"),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ph-finance"] }); qc.invalidateQueries({ queryKey: ["ph-admin"] }); },
  });
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={`${ghostCls} px-2.5 py-1.5 text-xs`} disabled={m.isPending} onClick={() => m.mutate()} data-testid={`button-reconcile-${id}`}><RefreshCw className={`h-3.5 w-3.5 ${m.isPending ? "animate-spin" : ""}`} aria-hidden /> {m.isPending ? "جار التحقق" : "التحقق من الحالة"}</button>
      {m.isError && <span role="alert" className="text-xs text-destructive">{m.error instanceof Error ? m.error.message : "تعذر التحقق"}</span>}
      {m.data && m.data.refund.status === "pending" && <span className="text-xs text-amber-800">لا يزال بانتظار ميسر</span>}
    </span>
  );
}
