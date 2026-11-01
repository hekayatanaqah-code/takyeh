import { payrollPeriodLabel } from "@/lib/payrollPeriods";
import { formatDateWithHijri, toHijriComponents } from "@/lib/hijri";
import { saudiCurrencyHtml } from "@/lib/saudiCurrencyFont";
import type { StaffPermissions } from "@/lib/staffPermissions";
import { toArN } from "@/components/owner/owner-formatting";


/* ── Salary Voucher HTML Builders ──────────────────────── */
export interface VoucherData {
  voucherNo: string;
  logId?: number;
  staffName: string;
  ownerName: string;
  month: string;
  paidAt: string;
  baseSalary: number;
  bonus: number;
  deduction: number;
  net: number;
  notes?: string;
  bonusNotes?: string;
  deductionNotes?: string;
  generalNotes?: string;
  paymentMethod?: "cash" | "bank";
  iban?: string;
}

function fmtMonthForPrint(ym: string, calMode: "hijri" | "gregorian"): string {
  return payrollPeriodLabel(ym, calMode);
}

function fmtDateForPrint(iso: string, calMode: "hijri" | "gregorian"): string {
  return formatDateWithHijri(iso);
}

export function buildSalaryVoucherHtml(v: VoucherData, calMode: "hijri" | "gregorian"): string {
  const monthStr = fmtMonthForPrint(v.month, calMode);
  const dateStr  = fmtDateForPrint(v.paidAt, calMode);
  return saudiCurrencyHtml(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>مسيّر رواتب – ${v.staffName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background:#fff; color:#111; direction:rtl; }
  .page { max-width: 794px; margin: 0 auto; padding: 40px 48px; min-height: 1123px; position: relative; page-break-inside: avoid; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #b8860b; padding-bottom: 18px; margin-bottom: 24px; }
  .brand-name { font-size: 26px; font-weight: 800; color: #b8860b; }
  .brand-sub  { font-size: 12px; color: #666; margin-top: 3px; }
  .voucher-badge { background: #b8860b; color: #fff; border-radius: 10px; padding: 8px 18px; text-align: center; }
  .voucher-badge-title { font-size: 15px; font-weight: 700; }
  .voucher-badge-no   { font-size: 11px; opacity: .85; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .meta-item { background: #faf9f6; border: 1px solid #e8e2d0; border-radius: 8px; padding: 10px 14px; }
  .meta-label { font-size: 11px; color: #888; margin-bottom: 3px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #111; }
  .salary-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 14px; }
  .salary-table th { background: #b8860b; color: #fff; padding: 10px 14px; text-align: right; font-weight: 600; }
  .salary-table td { padding: 10px 14px; border-bottom: 1px solid #ede9dd; }
  .salary-table tr:nth-child(even) td { background: #faf9f6; }
  .salary-table .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #b8860b; background: #fffbf0; }
  .pos { color: #16a34a; }
  .neg { color: #dc2626; }
  .notes-box { background: #faf9f6; border: 1px solid #e8e2d0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; color: #444; }
  .notes-box strong { color: #111; display: block; margin-bottom: 4px; }
  .row-note { font-size: 11px; color: #666; font-weight: 400; margin-top: 2px; }
  .payment-box { display: flex; align-items: center; gap: 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; }
  .payment-label { color: #0369a1; font-weight: 600; }
  .payment-value { color: #111; font-weight: 700; }
  .payment-iban { color: #555; font-size: 12px; margin-top: 2px; direction: ltr; text-align: right; }
  .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; }
  .sig-box { display: flex; flex-direction: column; gap: 8px; }
  .sig-label { font-size: 13px; font-weight: 600; color: #555; }
  .sig-name  { font-size: 15px; font-weight: 700; color: #111; }
  .sig-line  { border-bottom: 1.5px solid #999; margin-top: 40px; }
  .sig-caption { font-size: 11px; color: #999; }
  .footer { position: absolute; bottom: 32px; right: 0; left: 0; text-align: center; font-size: 11px; color: #aaa; }
  @page { margin: 0; size: A4; }
  @media print {
    html, body { height: auto; overflow: visible; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { min-height: auto; padding: 20mm 15mm; margin: 0; max-width: 100%; page-break-inside: avoid; break-inside: avoid; }
    .footer { position: static; margin-top: 24px; padding-top: 8px; border-top: 1px solid #eee; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">منصة تكية الإلكترونية</div>
    </div>
    <div class="voucher-badge">
      <div class="voucher-badge-title">إشعار راتب</div>
      <div class="voucher-badge-no"># ${v.voucherNo}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">اسم الموظف</div><div class="meta-value">${v.staffName}</div></div>
    <div class="meta-item"><div class="meta-label">صاحب العمل</div><div class="meta-value">${v.ownerName}</div></div>
    <div class="meta-item"><div class="meta-label">فترة الراتب</div><div class="meta-value">${monthStr}</div></div>
    <div class="meta-item"><div class="meta-label">تاريخ الصرف</div><div class="meta-value">${dateStr}</div></div>
  </div>
  <table class="salary-table">
    <thead><tr><th>البند</th><th>المبلغ (ر.س)</th></tr></thead>
    <tbody>
      <tr><td>الراتب الأساسي</td><td>${v.baseSalary.toLocaleString("ar-SA")}</td></tr>
      ${v.bonus > 0 ? `<tr><td>مكافأة / بدل${v.bonusNotes ? `<div class="row-note">${v.bonusNotes}</div>` : ""}</td><td class="pos">+${v.bonus.toLocaleString("ar-SA")}</td></tr>` : ""}
      ${v.deduction > 0 ? `<tr><td>خصم${v.deductionNotes ? `<div class="row-note">${v.deductionNotes}</div>` : ""}</td><td class="neg">-${v.deduction.toLocaleString("ar-SA")}</td></tr>` : ""}
    </tbody>
    <tfoot><tr class="total-row"><td>الصافي المستحق</td><td>${v.net.toLocaleString("ar-SA")} ر.س</td></tr></tfoot>
  </table>
  ${v.generalNotes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${v.generalNotes}</div>` : (v.notes && !v.bonusNotes && !v.deductionNotes ? `<div class="notes-box"><strong>ملاحظات:</strong> ${v.notes}</div>` : "")}
  ${v.paymentMethod ? `<div class="payment-box">
    <div>
      <div class="payment-label">طريقة السداد</div>
      <div class="payment-value">${v.paymentMethod === "bank" ? "تحويل بنكي" : "كاش (نقداً)"}</div>
      ${v.paymentMethod === "bank" && v.iban ? `<div class="payment-iban">IBAN: ${v.iban}</div>` : ""}
    </div>
  </div>` : ""}
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-label">توقيع صاحب العمل</div>
      <div class="sig-name">${v.ownerName}</div>
      <div class="sig-line"></div>
      <div class="sig-caption">مفوَّض بالصرف</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">توقيع الموظف / إقرار الاستلام</div>
      <div class="sig-name">${v.staffName}</div>
      <div class="sig-line"></div>
      <div class="sig-caption">التوقيع بما يفيد الاستلام</div>
    </div>
  </div>
  <div class="footer">
    تم إصدار هذا المسيّر إلكترونياً عبر منصة تكية · ${toArN(toHijriComponents(new Date()).year)} هـ - ${toArN(new Date().getFullYear())} م
  </div>
</div>
</body></html>`);
}


/* ── Staff & Salaries Tab ────────────────────────── */
export interface StaffMember { id: number; name: string; username: string | null; baseSalary: string; isActive: boolean; permissions: StaffPermissions; createdAt: string; }
export interface SalaryLog {
  id: number;
  staffId: number;
  staffName?: string;
  baseSalary?: string;
  month: string;
  bonus: string;
  deduction: string;
  notes: string | null;
  paidAt?: string | null;
  expenseId?: number | null;
}

/** next payment month string after lastPaidMonth (YYYY-MM) */
export function nextDueMonth(lastPaidMonth: string | null): string {
  if (!lastPaidMonth) return new Date().toISOString().slice(0, 7);
  const [y, m] = lastPaidMonth.split("-").map(Number);
  const d = new Date(y, m, 1); // month is 0-indexed, so m is already next
  return d.toISOString().slice(0, 7);
}

function monthLabel(ym: string) {
  return new Date(ym + "-15").toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

/* ── Bulk Voucher HTML Builder ─────────────────────── */
export function buildBulkVouchersHtml(logs: any[], ownerName: string, calMode: "hijri" | "gregorian"): string {
  if (logs.length === 0) return "";
  const pages: string[] = [];
  for (const log of logs) {
    const base = Number(log.baseSalary ?? 0);
    const bonus = Number(log.bonus);
    const deduction = Number(log.deduction);
    const net = base + bonus - deduction;
    const paidAtStr = log.paidAt ? String(log.paidAt) : new Date().toISOString();
    const voucherNo = `SAL-${log.month.replace("-","")}-${log.staffId}`;
    const dateStr  = fmtDateForPrint(paidAtStr, calMode);
    const monthStr = fmtMonthForPrint(log.month, calMode);
    pages.push(`
<div class="page" style="page-break-after:always;">
  <div class="header">
    <div class="brand"><div class="brand-name">حكاية أناقة</div><div class="brand-sub">منصة إدارة العقارات – القصيم</div></div>
    <div class="badge"><div class="badge-title">مسيّر رواتب</div><div class="badge-no"># ${voucherNo}</div></div>
  </div>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">اسم الموظف</div><div class="meta-val">${log.staffName ?? "—"}</div></div>
    <div class="meta-item"><div class="meta-label">صاحب العمل</div><div class="meta-val">${ownerName}</div></div>
    <div class="meta-item"><div class="meta-label">فترة الراتب</div><div class="meta-val">${monthStr}</div></div>
    <div class="meta-item"><div class="meta-label">تاريخ الصرف</div><div class="meta-val">${dateStr}</div></div>
  </div>
  <table class="sal-table">
    <thead><tr><th>البند</th><th>المبلغ (ر.س)</th></tr></thead>
    <tbody>
      <tr><td>الراتب الأساسي</td><td>${base.toLocaleString("ar-SA")}</td></tr>
      ${bonus > 0 ? `<tr><td>مكافأة</td><td class="green">+${bonus.toLocaleString("ar-SA")}</td></tr>` : ""}
      ${deduction > 0 ? `<tr><td>خصم</td><td class="red">-${deduction.toLocaleString("ar-SA")}</td></tr>` : ""}
    </tbody>
    <tfoot><tr><td>الصافي</td><td class="net">${net.toLocaleString("ar-SA")} ر.س</td></tr></tfoot>
  </table>
  ${log.notes ? `<div class="notes">ملاحظات: ${log.notes}</div>` : ""}
  <div class="sigs"><div class="sig"><div class="sig-line"></div><p>توقيع صاحب العمل</p></div><div class="sig"><div class="sig-line"></div><p>توقيع الموظف</p></div></div>
</div>`);
  }
  return saudiCurrencyHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; color:#111; }
.page { max-width:794px; margin:0 auto; padding:40px 48px; min-height:1123px; position:relative; }
.header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #b8860b; padding-bottom:16px; margin-bottom:20px; }
.brand-name { font-size:24px; font-weight:800; color:#b8860b; }
.brand-sub { font-size:11px; color:#888; }
.badge { background:#b8860b; color:#fff; border-radius:10px; padding:8px 18px; text-align:center; }
.badge-title { font-size:14px; font-weight:700; }
.badge-no { font-size:10px; opacity:.8; }
.meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; }
.meta-item { background:#faf9f6; border:1px solid #e8e2d0; border-radius:8px; padding:10px 12px; }
.meta-label { font-size:10px; color:#999; margin-bottom:2px; }
.meta-val { font-size:13px; font-weight:600; }
.sal-table { width:100%; border-collapse:collapse; margin-bottom:20px; }
.sal-table th,.sal-table td { padding:10px 14px; border:1px solid #e8e2d0; text-align:right; }
.sal-table thead { background:#b8860b; color:#fff; }
.sal-table tfoot { background:#fff9ed; font-weight:700; }
.green { color:#15803d; } .red { color:#dc2626; } .net { font-size:15px; color:#b8860b; }
.notes { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; font-size:12px; margin-bottom:20px; }
.sigs { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:30px; }
.sig { text-align:center; } .sig-line { height:1px; background:#ccc; margin-bottom:8px; } .sig p { font-size:11px; color:#888; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>${pages.join("")}</body></html>`);
}


export function buildMasterPayrollHtml(filterMonth: string, logs: any[], ownerName: string, calMode: "hijri" | "gregorian", hijriFilter?: { year: number; month: number }): string {
  let filtered: any[];
  if (hijriFilter) {
    filtered = logs.filter(l => {
      const d = new Date((l.month ?? "") + "-15");
      if (isNaN(d.getTime())) return false;
      const h = toHijriComponents(d);
      return h.year === hijriFilter.year && h.month === hijriFilter.month;
    });
  } else {
    filtered = filterMonth ? logs.filter((l) => l.month === filterMonth) : logs;
  }
  if (filtered.length === 0) {
    const monthStr = filterMonth ? fmtMonthForPrint(filterMonth, calMode) : "";
    return saudiCurrencyHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<style>body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;margin:0;padding:0;background:#fff;}
.wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:12px;color:#888;}
.icon{font-size:48px;opacity:.4;}
.msg{font-size:16px;font-weight:600;color:#555;}
.sub{font-size:13px;color:#aaa;}
</style></head><body>
<div class="wrap">
  <div class="icon">📋</div>
  <div class="msg">لا توجد رواتب مسجلة للفترة المحددة</div>
  ${monthStr ? `<div class="sub">${monthStr}</div>` : ""}
</div>
</body></html>`);
  }
  const total = filtered.reduce((s: number, l: any) => {
    const base = Number(l.baseSalary ?? 0);
    return s + base + Number(l.bonus) - Number(l.deduction);
  }, 0);
  const monthStr = filterMonth ? fmtMonthForPrint(filterMonth, calMode) : "كل الشهور";
  const dateNow  = fmtDateForPrint(new Date().toISOString(), calMode);
  const rows = filtered.map((l: any, i: number) => {
    const base = Number(l.baseSalary ?? 0);
    const bonus = Number(l.bonus);
    const deduction = Number(l.deduction);
    const net = base + bonus - deduction;
    return `<tr>
      <td>${toArN(i + 1)}</td>
      <td>${l.staffName ?? "—"}</td>
      <td>${base.toLocaleString("ar-SA")}</td>
      <td style="color:#15803d">${bonus > 0 ? `+${bonus.toLocaleString("ar-SA")}` : "—"}</td>
      <td style="color:#dc2626">${deduction > 0 ? `-${deduction.toLocaleString("ar-SA")}` : "—"}</td>
      <td style="font-weight:700;color:#b8860b">${net.toLocaleString("ar-SA")}</td>
    </tr>`;
  }).join("");
  return saudiCurrencyHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; color:#111; padding:40px 48px; }
h1 { font-size:22px; color:#b8860b; font-weight:800; margin-bottom:4px; }
.sub { font-size:12px; color:#888; margin-bottom:6px; }
.meta-row { display:flex; gap:32px; margin-bottom:20px; font-size:12px; color:#555; }
table { width:100%; border-collapse:collapse; margin-bottom:16px; }
th,td { padding:10px 12px; border:1px solid #e0d8c0; text-align:right; font-size:13px; }
thead { background:#b8860b; color:#fff; }
tfoot { background:#fff9ed; font-weight:700; }
.sig-row { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:40px; }
.sig { text-align:center; } .sig-line { height:1px; background:#ccc; margin-bottom:8px; } .sig p { font-size:11px; color:#888; }
@page { size: auto; margin: 0mm; }
@media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:10mm 12mm; } }
</style></head><body>
<h1>منصة تكية الإلكترونية — كشف صرف الرواتب الجماعي</h1>
<div class="meta-row">
  <span>الشهر: <strong>${monthStr}</strong></span>
  <span>صاحب العمل: <strong>${ownerName}</strong></span>
  <span>تاريخ الطباعة: <strong>${dateNow}</strong></span>
</div>
<table>
  <thead><tr><th>#</th><th>اسم الموظف</th><th>الأساسي</th><th>مكافأة</th><th>خصم</th><th>الصافي (ر.س)</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5" style="text-align:right">الإجمالي</td><td style="color:#b8860b;font-size:15px">${total.toLocaleString("ar-SA")}</td></tr></tfoot>
</table>
<div class="sig-row">
  <div class="sig"><div class="sig-line"></div><p>توقيع صاحب العمل</p></div>
  <div class="sig"><div class="sig-line"></div><p>المدير المالي / المراجع</p></div>
</div>
</body></html>`);
}
