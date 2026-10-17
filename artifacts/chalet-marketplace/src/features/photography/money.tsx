import { useRef, useState, type ReactNode } from "react";
import { Download, Eye, FileText, Printer, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { API, sar, fmtDT, ghostCls, cardCls, inputCls, Empty, StatusPill, type Booking } from "./shared";

/* ---------- Types ---------- */
export interface Statement { count: number; totalHalalas: number; commissionHalalas: number; netHalalas: number; refundedHalalas: number; bookings: Booking[] }
export interface Transfer { id: number; photographerId?: number; photographerName?: string; amountHalalas: number; reference: string; transferredAt: string; receiptId: number | null; receiptName: string | null; receiptUrl?: string | null }
export type RefundDestination = "card" | "wallet";
export type RefundStatus = "pending" | "succeeded" | "failed";
export interface Refund { id: number; bookingId?: number; amountHalalas: number; destination: RefundDestination; status: RefundStatus; reason?: string; error?: string | null; createdAt: string; completedAt: string | null }
export interface Balances { pendingHalalas: number; availableHalalas: number; paidHalalas: number; recoverableHalalas?: number; netDueHalalas?: number }

export const DEST_AR: Record<RefundDestination, string> = { card: "إلى البطاقة عبر ميسر", wallet: "رصيد في محفظة المالك" };
export const REFUND_STATUS_AR: Record<RefundStatus, string> = { pending: "بانتظار التحقق من ميسر", succeeded: "تم الاسترداد", failed: "فشل الاسترداد" };
export const FIN_STATUS_AR: Record<string, string> = { paid: "مدفوع", refund_pending: "استرداد بانتظار التحقق من ميسر", partially_refunded: "مسترد جزئيا", refunded: "مسترد بالكامل", refund_failed: "فشل الاسترداد" };
export const PAY_METHOD_AR: Record<string, string> = { card: "بطاقة (ميسر)", wallet: "رصيد المحفظة" };

/* ---------- Money formatting ---------- */
/** Accounting format: negatives in parentheses. */
export const acct = (h: number) => (h < 0 ? `(${sar(Math.abs(h))})` : sar(h));
export function Money({ h, className = "", testId }: { h: number; className?: string; testId?: string }) {
  return <span className={`tabular-nums ${h < 0 ? "font-bold text-destructive" : ""} ${className}`} data-testid={testId}>{acct(h)}</span>;
}

/* ---------- Months ---------- */
const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" });
export const currentMonth = () => monthFmt.format(new Date()).slice(0, 7);
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 15)));
};
export function MonthPicker({ value, onChange, id }: { value: string; onChange: (m: string) => void; id: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold">
      <span>الشهر</span>
      <input type="month" dir="ltr" className={`${inputCls} w-auto`} value={value} max={currentMonth()} onChange={(e) => e.target.value && onChange(e.target.value)} data-testid={`input-month-${id}`} />
    </label>
  );
}

/* ---------- Receipts ---------- */
export const receiptHref = (id: number, download = false) => `${API}/photography/receipts/${id}${download ? "?download=1" : ""}`;
const isPdf = (name: string | null) => !!name && /\.pdf$/i.test(name);

export function ReceiptCell({ t }: { t: Transfer }) {
  const [open, setOpen] = useState(false);
  if (t.receiptId == null) return <span className="text-xs text-muted-foreground" data-testid={`text-legacy-transfer-${t.id}`}>حوالة قديمة دون إيصال</span>;
  const id = t.receiptId;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <button type="button" className={`${ghostCls} px-2.5 py-1.5 text-xs`} onClick={() => setOpen(true)} data-testid={`button-preview-receipt-${t.id}`}><Eye className="h-3.5 w-3.5" aria-hidden /> معاينة</button>
      <a className={`${ghostCls} px-2.5 py-1.5 text-xs`} href={receiptHref(id, true)} download={t.receiptName ?? undefined} data-testid={`link-download-receipt-${t.id}`}><Download className="h-3.5 w-3.5" aria-hidden /> تنزيل</a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-3 rounded-2xl">
          <div>
            <DialogTitle className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-[#8C6246]" aria-hidden /> إيصال الحوالة</DialogTitle>
            <DialogDescription>{sar(t.amountHalalas)} - مرجع <span dir="ltr" className="font-mono">{t.reference}</span> - {fmtDT(t.transferredAt)}</DialogDescription>
          </div>
          <div className="min-h-[50dvh] flex-1 overflow-auto rounded-xl border border-border bg-muted/40">
            {open && (isPdf(t.receiptName)
              ? <iframe title="إيصال الحوالة" src={receiptHref(id)} className="h-[65dvh] w-full rounded-xl" data-testid={`frame-receipt-${t.id}`} />
              : <img src={receiptHref(id)} alt={`إيصال الحوالة ${t.reference}`} className="mx-auto max-h-[65dvh] object-contain" data-testid={`img-receipt-${t.id}`} />)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground" dir="ltr">{t.receiptName}</span>
            <a className={ghostCls} href={receiptHref(id, true)} download={t.receiptName ?? undefined}><Download className="h-4 w-4" aria-hidden /> تنزيل الإيصال</a>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}

export function TransferHistory({ transfers, showName = false, id }: { transfers: Transfer[]; showName?: boolean; id: string }) {
  if (transfers.length === 0) return <Empty title="لا توجد حوالات مسجلة" text="ستظهر هنا كل حوالة بنكية يدوية بعد تسجيلها مع إيصالها." />;
  const rows = [...transfers].sort((a, b) => b.transferredAt.localeCompare(a.transferredAt));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border" data-testid={`table-transfers-${id}`}>
      <table className="w-full text-sm">
        <thead className="bg-muted"><tr>{[...(showName ? ["المصور"] : []), "المبلغ", "مرجع الحوالة", "تاريخ التحويل", "الحالة", "الإيصال"].map((h) => <th key={h} className="whitespace-nowrap p-3 text-start">{h}</th>)}</tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id} className="border-t border-border" data-testid={`row-transfer-${t.id}`}>
            {showName && <td className="p-3 font-semibold">{t.photographerName ?? "—"}</td>}
            <td className="whitespace-nowrap p-3 font-bold tabular-nums">{sar(t.amountHalalas)}</td>
            <td className="p-3"><span dir="ltr" className="font-mono text-xs">{t.reference}</span></td>
            <td className="whitespace-nowrap p-3 text-xs">{fmtDT(t.transferredAt)}</td>
            <td className="p-3"><span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700">تم الدفع</span></td>
            <td className="p-3"><ReceiptCell t={t} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------- Export ---------- */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printNode(node: HTMLElement | null, title: string) {
  if (!node) return;
  const w = window.open("", "_blank", "noopener=no,width=900,height=700");
  if (!w) { window.print(); return; }
  const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map((n) => n.outerHTML).join("");
  w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title.replace(/</g, "")}</title>${styles}<style>body{padding:24px;background:#fff}[data-noprint]{display:none!important}</style></head><body>${node.outerHTML}</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}

/* ---------- Statement ---------- */
const halToSar = (h: number) => (h / 100).toFixed(2);
export function StatementView({ statement, month, onMonthChange, title, id, loading, extra }: { statement?: Statement; month: string; onMonthChange: (m: string) => void; title: string; id: string; loading?: boolean; extra?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const s = statement;
  const csv = () => s && downloadCsv(`statement-${id}-${month}.csv`, ["رقم الحجز", "التاريخ", "النشاط", "الباقة", "المبلغ (⃁)", "العمولة (⃁)", "الصافي (⃁)", "المسترد (⃁)", "الحالة"],
    s.bookings.map((b) => [b.id, fmtDT(b.startAt), b.propertyName, b.packageName, halToSar(b.priceHalalas), halToSar(b.commissionHalalas), halToSar(b.photographerEarningsHalalas), halToSar(b.refundedHalalas ?? 0), b.deliveredAt ? "تم التسليم" : b.status]));
  const kpis: [string, ReactNode, string][] = s ? [
    ["عدد الجلسات", s.count.toLocaleString("ar-SA"), "count"],
    ["الإجمالي", sar(s.totalHalalas), "gross"],
    ["عمولة المنصة", sar(s.commissionHalalas), "commission"],
    ["الصافي", <Money key="n" h={s.netHalalas} />, "net"],
    ["المسترد", sar(s.refundedHalalas), "refunded"],
  ] : [];
  return (
    <section ref={ref} className={`${cardCls} space-y-4`} data-testid={`statement-${id}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="font-bold">{title}</h3><p className="text-xs text-muted-foreground">كشف {monthLabel(month)} - بتوقيت السعودية</p></div>
        <div className="flex flex-wrap items-center gap-2" data-noprint>
          <MonthPicker id={id} value={month} onChange={onMonthChange} />
          <button type="button" className={`${ghostCls} px-3`} disabled={!s} onClick={() => printNode(ref.current, `${title} ${month}`)} data-testid={`button-print-${id}`}><Printer className="h-4 w-4" aria-hidden /> طباعة</button>
          <button type="button" className={`${ghostCls} px-3`} disabled={!s || s.bookings.length === 0} onClick={csv} data-testid={`button-csv-${id}`}><FileSpreadsheet className="h-4 w-4" aria-hidden /> CSV</button>
        </div>
      </div>
      {loading || !s ? <div className="h-24 animate-pulse rounded-2xl bg-muted" aria-busy="true" /> : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {kpis.map(([l, v, k]) => <div key={k} className="rounded-xl border border-border bg-[#8C6246]/[0.04] p-3"><dt className="text-[11px] font-semibold text-muted-foreground">{l}</dt><dd className="mt-1 font-bold tabular-nums" data-testid={`text-statement-${id}-${k}`}>{v}</dd></div>)}
          </dl>
          {extra}
          {s.bookings.length === 0 ? <Empty title="لا توجد جلسات في هذا الشهر" /> : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr>{["الموعد", "النشاط / الباقة", "المبلغ", "العمولة", "الصافي", "المسترد", "الحالة"].map((h) => <th key={h} className="whitespace-nowrap p-2.5 text-start">{h}</th>)}</tr></thead>
                <tbody>{s.bookings.map((b) => (
                  <tr key={b.id} className="border-t border-border" data-testid={`row-statement-${id}-${b.id}`}>
                    <td className="whitespace-nowrap p-2.5 text-xs">{fmtDT(b.startAt)}</td>
                    <td className="p-2.5"><p className="font-semibold">{b.propertyName}</p><p className="text-xs text-muted-foreground">{b.packageName}</p></td>
                    <td className="whitespace-nowrap p-2.5 tabular-nums">{sar(b.priceHalalas)}</td>
                    <td className="whitespace-nowrap p-2.5 tabular-nums">{sar(b.commissionHalalas)}</td>
                    <td className="whitespace-nowrap p-2.5"><Money h={b.photographerEarningsHalalas} /></td>
                    <td className="whitespace-nowrap p-2.5 tabular-nums">{b.refundedHalalas ? sar(b.refundedHalalas) : "—"}</td>
                    <td className="p-2.5"><StatusPill s={b.deliveredAt ? "completed" : b.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function RefundStatusPill({ s }: { s: RefundStatus }) {
  const c = s === "succeeded" ? "bg-emerald-500/15 text-emerald-700" : s === "failed" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-800";
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{REFUND_STATUS_AR[s]}</span>;
}
