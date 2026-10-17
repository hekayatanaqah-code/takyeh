import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Upload, FileCheck2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { call, sar, fmtDT, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice } from "./shared";
import { formatIban } from "./finance";
import { Money, MonthPicker, StatementView, TransferHistory, RefundStatusPill, currentMonth, monthLabel, DEST_AR, type Statement, type Transfer, type Refund } from "./money";
import { ReconcileButton } from "./refunds";

interface FinPhotographer { id: number; name: string; iban: string | null; bankName: string | null; pendingHalalas: number; availableHalalas: number; paidHalalas: number; recoverableHalalas: number; netDueHalalas: number; statement: Statement }
interface Finance { month: string; photographers: FinPhotographer[]; transfers: Transfer[]; refunds: Refund[]; totals: { pendingHalalas: number; availableHalalas: number; paidHalalas: number } }

const MAX_RECEIPT = 10 * 1024 * 1024;
const RECEIPT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function SettleModal({ p, onClose }: { p: FinPhotographer; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState((p.availableHalalas / 100).toFixed(2));
  const [ref, setRef] = useState(""); const [date, setDate] = useState(localNow());
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{ file: File; receiptId: number } | null>(null);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "recording">("idle");
  const busy = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const amountH = Math.round(Number(amount) * 100);

  const m = useMutation({
    mutationFn: async () => {
      let receiptId = uploaded && uploaded.file === file ? uploaded.receiptId : null;
      if (receiptId == null) {
        setStage("uploading");
        const f = file!;
        const u = await call<{ uploadURL: string; objectPath: string; uploadProof: string }>("/admin/photography/receipt/upload-url", "POST", { name: f.name, size: f.size, contentType: f.type });
        const r = await fetch(u.uploadURL, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        if (!r.ok) throw new Error("تعذر رفع الإيصال، لم يتم تسجيل الحوالة");
        const c = await call<{ receiptId: number }>("/admin/photography/receipt/complete", "POST", { objectPath: u.objectPath, uploadProof: u.uploadProof });
        receiptId = c.receiptId; setUploaded({ file: f, receiptId });
      }
      setStage("recording");
      return call<Transfer>(`/admin/photography/photographers/${p.id}/transfers`, "POST", { amountHalalas: amountH, reference: ref.trim(), transferredAt: new Date(date).toISOString(), receiptId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ph-finance"] });
      qc.invalidateQueries({ queryKey: ["ph-admin"] });
      qc.invalidateQueries({ queryKey: ["ph-transfers", p.id] });
      onClose();
    },
    onSettled: () => { busy.current = false; setStage("idle"); },
  });

  const pick = (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (!RECEIPT_TYPES.includes(f.type)) return setErr("الإيصال يجب أن يكون PDF أو JPG أو PNG أو WebP");
    if (f.size > MAX_RECEIPT) return setErr("حجم الإيصال يتجاوز ١٠ ميجابايت");
    setErr(null); setFile(f);
  };
  const submit = () => {
    if (busy.current || m.isPending) return;
    const t = new Date(date).getTime();
    const e = !(amountH > 0) ? "أدخل مبلغا صحيحا" : amountH > p.availableHalalas ? `المبلغ أكبر من المتاح (${sar(p.availableHalalas)})` : !ref.trim() ? "أدخل مرجع حوالة مصرف الإنماء" : !date || Number.isNaN(t) ? "أدخل تاريخ ووقت التحويل" : t > Date.now() ? "وقت التحويل لا يمكن أن يكون في المستقبل" : !file ? "إرفاق إيصال الحوالة مطلوب" : !ack ? "أكد أن الحوالة نفذت فعلا من البنك" : null;
    setErr(e); if (e) return;
    busy.current = true; m.mutate();
  };
  const frozen = m.isPending;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !frozen) onClose(); }}>
      <DialogContent dir="rtl" className="max-h-[92dvh] overflow-y-auto text-right">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-[#8C6246]" aria-hidden /> تسجيل حوالة بنكية يدوية</DialogTitle>
          <DialogDescription>{p.name}</DialogDescription>
        </DialogHeader>
        <Notice tone="warn">هذه الشاشة لا تحول أي أموال. التحويل يدوي وليس تلقائيا: سجّل فقط حوالة نفذتها بنفسك مسبقا من حساب المنصة في مصرف الإنماء، مع مرجعها وإيصالها.</Notice>
        <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm sm:grid-cols-2">
          <p>البنك: <span className="font-semibold">{p.bankName || "غير مسجل"}</span></p>
          <p>الآيبان: <span dir="ltr" className="font-mono text-xs">{p.iban ? formatIban(p.iban) : "غير مسجل"}</span></p>
          <p className="sm:col-span-2">المتاح للتحويل: <span className="font-bold">{sar(p.availableHalalas)}</span></p>
        </div>
        <fieldset disabled={frozen} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="المبلغ المحول (⃁)"><input type="number" min="0.01" step="0.01" max={p.availableHalalas / 100} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-settle-amount" /></Field>
            <Field label="مرجع حوالة مصرف الإنماء"><input dir="ltr" className={`${inputCls} font-mono`} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="input-settle-reference" /></Field>
          </div>
          <Field label="تاريخ ووقت التحويل الفعلي"><input type="datetime-local" max={localNow()} className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-settle-date" /></Field>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">إيصال الحوالة (مطلوب)</p>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid="input-settle-receipt" aria-label="اختر الإيصال" />
            <button type="button" onClick={() => fileRef.current?.click()} className={`flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-3 text-start text-sm ${file ? "border-[#8C6246] bg-[#8C6246]/5" : "border-border"}`} data-testid="button-pick-receipt">
              {file ? <FileCheck2 className="h-5 w-5 shrink-0 text-[#8C6246]" aria-hidden /> : <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold" dir="ltr">{file ? file.name : "اختر ملف الإيصال"}</span><span className="text-xs text-muted-foreground">{file ? `${(file.size / 1048576).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ميجابايت${uploaded?.file === file ? " - مرفوع" : ""}` : "PDF أو JPG أو PNG أو WebP حتى ١٠ ميجابايت"}</span></span>
            </button>
          </div>
          <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="check-settle-ack" /> أؤكد أن هذه الحوالة نُفذت فعلا خارج المنصة إلى آيبان المصور أعلاه.</label>
        </fieldset>
        {stage !== "idle" && <Notice tone="warn">{stage === "uploading" ? "جار رفع الإيصال..." : "جار تسجيل الحوالة..."}</Notice>}
        {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
        <DialogFooter className="gap-2 sm:justify-start">
          <button type="button" className={btnCls} disabled={frozen} onClick={submit} data-testid="button-confirm-settle">{frozen ? "جار الحفظ" : "تأكيد تسجيل الحوالة"}</button>
          <button type="button" className={ghostCls} disabled={frozen} onClick={onClose}>إلغاء</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FinanceTab() {
  const [month, setMonth] = useState(currentMonth);
  const q = useQuery({ queryKey: ["ph-finance", month], queryFn: () => call<Finance>(`/admin/photography/finance?month=${month}`), refetchInterval: 30000, placeholderData: (prev) => prev });
  const [settle, setSettle] = useState<FinPhotographer | null>(null);
  const [stmtId, setStmtId] = useState<number | null>(null);
  if (q.isLoading) return <Skel />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const ready = d.photographers.filter((p) => p.availableHalalas > 0);
  const negative = d.photographers.filter((p) => p.recoverableHalalas > 0 || p.netDueHalalas < 0);
  const stmt = d.photographers.find((p) => p.id === stmtId) ?? d.photographers[0];
  const refunds = [...d.refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="space-y-6" data-testid="panel-finance">
      <div className="grid gap-3 sm:grid-cols-3">
        {([["معلقة (جلسات مؤكدة لم تُسلّم)", d.totals.pendingHalalas, "pending", "bg-amber-500/10"], ["متاحة للتحويل", d.totals.availableHalalas, "available", "bg-[#8C6246]/10"], ["مدفوعة للمصورين", d.totals.paidHalalas, "paid", "bg-emerald-500/10"]] as const).map(([l, v, k, c]) => (
          <div key={k} className={`rounded-2xl border border-border p-4 ${c}`}><p className="text-xs font-semibold text-muted-foreground">{l}</p><p className="mt-1 text-xl font-bold"><Money h={v} testId={`text-total-${k}`} /></p></div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="font-bold">جاهز للتحويل</h3>
        {ready.length === 0 ? <Empty title="لا توجد مستحقات جاهزة للتحويل" text="تصبح الأرباح متاحة بعد اكتمال الجلسة وتأكيد تسليمها." /> : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>{["المصور", "البنك", "الآيبان", "معلق", "متاح", "مدفوع", ""].map((h, i) => <th key={i} className="whitespace-nowrap p-3 text-start">{h}</th>)}</tr></thead>
              <tbody>{ready.map((p) => (
                <tr key={p.id} className="border-t border-border" data-testid={`row-ready-${p.id}`}>
                  <td className="p-3 font-bold">{p.name}</td>
                  <td className="p-3">{p.bankName || <span className="text-muted-foreground">غير مسجل</span>}</td>
                  <td className="p-3"><span dir="ltr" className="font-mono text-xs">{p.iban ? formatIban(p.iban) : "—"}</span></td>
                  <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">{sar(p.pendingHalalas)}</td>
                  <td className="whitespace-nowrap p-3 font-bold" data-testid={`text-available-${p.id}`}>{sar(p.availableHalalas)}</td>
                  <td className="whitespace-nowrap p-3 tabular-nums">{sar(p.paidHalalas)}</td>
                  <td className="p-3">{p.iban ? <button type="button" className={`${btnCls} whitespace-nowrap px-3 py-2`} onClick={() => setSettle(p)} data-testid={`button-settle-${p.id}`}>تسوية وتحويل</button> : <span className="text-xs text-destructive">لا يوجد آيبان</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {negative.length > 0 && (
          <div className="space-y-1 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="list-recoverable">
            <p className="flex items-center gap-2 font-bold text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden /> مبالغ مستحقة الاسترجاع من مصورين (لا تحويل)</p>
            {negative.map((p) => <p key={p.id}>{p.name}: <Money h={-Math.abs(p.recoverableHalalas || p.netDueHalalas)} /></p>)}
          </div>
        )}
      </section>

      <section className="space-y-3"><h3 className="font-bold">سجل الحوالات</h3><TransferHistory transfers={d.transfers} showName id="admin" /></section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">سجل الاستردادات</h3><MonthPicker id="refunds" value={month} onChange={setMonth} /></div>
        {refunds.length === 0 ? <Empty title={`لا توجد استردادات في ${monthLabel(month)}`} /> : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>{["الحجز", "المبلغ", "الوجهة", "الحالة", "السبب", "التاريخ", ""].map((h, i) => <th key={i} className="whitespace-nowrap p-3 text-start">{h}</th>)}</tr></thead>
              <tbody>{refunds.map((r) => (
                <tr key={r.id} className="border-t border-border align-top" data-testid={`row-refund-${r.id}`}>
                  <td className="p-3">#{(r.bookingId ?? 0).toLocaleString("ar-SA")}</td>
                  <td className="whitespace-nowrap p-3 font-bold tabular-nums">{sar(r.amountHalalas)}</td>
                  <td className="p-3 text-xs">{DEST_AR[r.destination]}</td>
                  <td className="p-3"><RefundStatusPill s={r.status} />{r.status === "failed" && r.error && <p className="mt-1 text-xs text-destructive">{r.error}</p>}</td>
                  <td className="max-w-[16rem] p-3 text-xs">{r.reason}</td>
                  <td className="whitespace-nowrap p-3 text-xs">{fmtDT(r.createdAt)}{r.completedAt && <span className="block text-muted-foreground">اكتمل {fmtDT(r.completedAt)}</span>}</td>
                  <td className="p-3">{r.status === "pending" && <ReconcileButton id={r.id} />}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {d.photographers.length > 0 && stmt && (
        <div className="space-y-2">
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">كشف حساب المصور
            <select className={`${inputCls} w-auto`} value={stmt.id} onChange={(e) => setStmtId(Number(e.target.value))} data-testid="select-statement-photographer">
              {d.photographers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <StatementView id={`admin-${stmt.id}`} title={`كشف حساب ${stmt.name}`} month={month} onMonthChange={setMonth} statement={stmt.statement} loading={q.isPlaceholderData}
            extra={<p className={`${cardCls} p-3 text-sm`}>الرصيد الحالي: معلق {sar(stmt.pendingHalalas)} - متاح <Money h={stmt.availableHalalas} /> - مدفوع {sar(stmt.paidHalalas)}{stmt.recoverableHalalas > 0 && <> - مستحق استرجاعه <Money h={-stmt.recoverableHalalas} /></>}</p>} />
        </div>
      )}
      {settle && <SettleModal key={settle.id} p={settle} onClose={() => setSettle(null)} />}
    </div>
  );
}
