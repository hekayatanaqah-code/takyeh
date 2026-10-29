import { escapeFinancialReportText } from "./financialReportActivity";

type Booking = {
  id: number; clientName: string; bookingDate: string; cancelledAt?: unknown;
  totalPrice?: string | number | null; revenueAmount?: string | number | null;
  depositPaid?: string | number | null; balanceCollected?: boolean | null;
  bookedAddons?: unknown;
};
export type PropertyBookingBreakdown = ReturnType<typeof propertyBookingBreakdown>;
const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);

/** Contract values and actual collections are distinct; quoted add-on prices are line totals. */
export function propertyBookingBreakdown(bookings: Booking[]) {
  const rows = bookings.filter(b => !b.cancelledAt).map(b => {
    const total = cents(b.totalPrice ?? b.revenueAmount ?? b.depositPaid);
    const addons = (b.bookedAddons ?? []) as { price: string | number; unit: string }[];
    const svc = Math.min(total, addons.filter(a => a.unit !== "خدمة مجانية")
      .reduce((sum, a) => sum + Math.max(0, cents(a.price)), 0));
    const collected = b.totalPrice != null
      ? (b.balanceCollected ? total : cents(b.depositPaid))
      : cents(b.revenueAmount ?? b.depositPaid);
    return { id: b.id, name: b.clientName, date: b.bookingDate,
      base: (total - svc) / 100, svc: svc / 100, total: total / 100, collected: collected / 100 };
  }).filter(row => row.total > 0 || row.collected > 0);
  const sum = (key: "base" | "svc" | "total" | "collected") =>
    rows.reduce((total, row) => total + cents(row[key]), 0) / 100;
  return { rows, totBase: sum("base"), totSvc: sum("svc"), totTotal: sum("total"), totCollected: sum("collected") };
}

export function propertyReportDetailsHtml(
  breakdown: PropertyBookingBreakdown,
  financial: { totalRevenue: number; totalExpenses: number; netProfit: number; totalInsuranceDeducted?: number; totalWithdrawals?: number },
  dateLabel: (date: string) => string,
  includeBookings = true,
) {
  const escape = escapeFinancialReportText;
  const money = (amount: number) => `${amount.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
  const rows = [
    ["إجمالي قيمة الحجوزات (إيجار + خدمات)", breakdown.totTotal],
    ["المحصّل من الحجوزات — ضمن الإيرادات وليس إضافة عليها", breakdown.totCollected],
    ["إيرادات التلفيات — ضمن الإيرادات", financial.totalInsuranceDeducted ?? 0],
    ["إجمالي الإيرادات المحصّلة", financial.totalRevenue],
    ["إجمالي المصروفات والمسحوبات المسجلة", financial.totalExpenses],
    ["منها مسحوبات شخصية — مشمولة أعلاه ولا تُخصم مرتين", financial.totalWithdrawals ?? 0],
    ["صافي الربح النهائي = الإيرادات − المصروفات", financial.netProfit],
  ] as const;
  return `<section class="section-auto financial-property-details">${includeBookings ? `<h2 class="section-title">تفصيل الحجوزات</h2>
    <p>قيمة الحجوزات تعاقدية؛ الربح يعتمد على المحصّل فعليًا. التأمين القابل للإعادة ليس إيرادًا.</p>
    <table><thead><tr>${["العميل", "التاريخ", "قيمة الإيجار", "رسوم الخدمات", "الإجمالي", "المحصّل"].map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${breakdown.rows.map(row => `<tr><td>${escape(row.name)}</td><td>${escape(dateLabel(row.date))}</td>
    ${[row.base, row.svc, row.total, row.collected].map(value => `<td>${money(value)}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr class="total-row"><td colspan="2">الإجمالي</td>${[breakdown.totBase, breakdown.totSvc, breakdown.totTotal, breakdown.totCollected].map(value => `<td>${money(value)}</td>`).join("")}</tr></tfoot></table>
    ${breakdown.rows.length ? "" : "<p>لا توجد حجوزات غير ملغاة خلال الفترة المختارة.</p>"}` : ""}
    <h2 class="section-title">الحسابات الختامية</h2><table><tbody>${rows.map(([label, value], index) =>
      `<tr${index === rows.length - 1 ? ' class="financial-net"' : ""}><td>${label}</td><td>${money(value)}</td></tr>`).join("")}</tbody></table></section>
    <style>.financial-property-details{margin-top:20px;overflow-x:auto}.financial-property-details h2{font-weight:700;margin:16px 0 8px}.financial-property-details table{width:100%;border-collapse:collapse;font-size:12px!important;table-layout:fixed!important}
    .financial-property-details td,.financial-property-details th{white-space:normal!important;overflow-wrap:anywhere;padding:6px!important}
    .financial-property-details td{border-bottom:1px solid #e6d9cc}.financial-property-details .financial-net{font-weight:800}
    .financial-property-details thead{display:table-header-group}.financial-property-details tfoot{display:table-row-group}</style>`;
}
