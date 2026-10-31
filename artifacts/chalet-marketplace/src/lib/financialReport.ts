export const PROPERTY_REPORT_REVENUE_NOTE = "الإيرادات المحصّلة فعلياً: العربون والمتبقي عند تحصيله، مع التلفيات المحتسبة. تختلف عن إجمالي قيمة الحجوزات التعاقدية إذا بقيت مبالغ غير مدفوعة أو مؤجلة؛ ولا يشمل الإيراد التأمين القابل للاسترداد.";

/** Property detail visibility changes presentation only, never the supplied totals. */
export function buildPropertyReportClosingHtml(totals: { revenue: number; expenses: number; netProfit: number }) {
  return `<section class="section financial-closing"><h2 class="section-title">الحسابات الختامية</h2><table><tbody>
    <tr><td>إجمالي الإيرادات<span class="financial-revenue-note" style="display:block;font-size:13px;line-height:1.5;color:#374151;font-weight:400;margin-top:4px;max-width:480px">${PROPERTY_REPORT_REVENUE_NOTE}</span></td><td style="white-space:nowrap">${formatFinancialAmount(totals.revenue)}</td></tr>
    <tr><td>إجمالي المصروفات</td><td>${formatFinancialAmount(totals.expenses)}</td></tr>
    <tr class="total-row"><td>صافي الربح / الدخل النهائي</td><td>${formatFinancialAmount(totals.netProfit)}</td></tr>
    </tbody></table></section>`;
}

export function buildPropertyBookingDetailsHtml(
  showDetails: boolean,
  rows: { name: string; date: string; base: number; svc: number; total: number }[],
) {
  if (!showDetails || !rows.length) return "";
  const escape = (text: string) => text.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return `<section class="section-auto financial-booking-details"><h2 class="section-title">تفصيل الحجوزات</h2>
    <table><thead><tr><th>العميل</th><th>التاريخ</th><th>قيمة الإيجار</th><th>رسوم الخدمات</th><th>الإجمالي</th></tr></thead><tbody>
    ${rows.map(row => `<tr><td>${escape(row.name)}</td><td>${escape(row.date)}</td><td>${formatFinancialAmount(row.base)}</td><td>${formatFinancialAmount(row.svc)}</td><td>${formatFinancialAmount(row.total)}</td></tr>`).join("")}
    </tbody></table></section>`;
}

export type FinancialReportCalendar = "hijri" | "gregorian";

/** Isolate the sign and Eastern digits together so RTL cannot move the minus. */
export function formatFinancialAmount(value: number) {
  const digits = Math.abs(Math.round(value)).toLocaleString("ar-SA", { numberingSystem: "arab" });
  return `\u2066${value < 0 ? "-" : ""}${digits}\u2069 ر.س`;
}

export function financialPeriodOptions(keys: string[], calendar: FinancialReportCalendar, today = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    calendar: calendar === "hijri" ? "islamic-umalqura" : "gregory",
    year: "numeric", month: "2-digit", timeZone: "Asia/Riyadh",
  }).formatToParts(today);
  const current = `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value.padStart(2, "0")}`;
  const months = [...new Set(keys)].filter(key => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && key <= current).sort().reverse();
  return { months, years: [...new Set(months.map(key => key.slice(0, 4)))] };
}

export function reconcileFinancialMonth(months: string[], selected: string) {
  return months.includes(selected) ? selected : months.find(key => key.startsWith(`${selected.slice(0, 4)}-`)) ?? months[0];
}

export const FINANCIAL_PRINT_CSS = `
body{font-family:'Segoe UI',Tahoma,'Noto Naskh Arabic',sans-serif!important;color:#2b2420!important;background:#fbf8f4!important;font-feature-settings:"kern","liga","calt";}
.page{width:750px;min-height:1100px;margin:0 auto;padding:30px 30px 24px!important;background:#fffdfa!important;display:flex;flex-direction:column;}
.header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:20px;padding:6px 0 18px!important;margin-bottom:22px!important;border-bottom:2px solid #8C6246!important;}
.header-brand img{max-height:76px;width:auto!important;object-fit:contain;}
.header-center{flex:1;text-align:center;}
.report-title{font-size:22px!important;font-weight:800!important;color:#3f2a1d!important;margin:0 0 6px!important;letter-spacing:0!important;}
.report-sub{font-size:14px!important;line-height:1.65!important;color:#292524!important;font-weight:500!important;margin:4px 0!important;}
.financial-report-scope{font-size:14px!important;line-height:1.8!important;color:#292524!important;font-weight:500!important;text-align:right!important;margin:0 0 18px!important;padding:12px 14px;border:1px solid #d6c8ba;border-radius:8px;background:#faf6f0;overflow-wrap:anywhere;}
.brand-sub,.qr-caption,.kpi-note{font-size:13px!important;line-height:1.5!important;color:#374151!important;}
.current-period-notice{font-size:14px!important;line-height:1.65!important;color:#78350f!important;}
.section-title{color:#7a5238!important;border-color:#c9ab92!important;}
table{width:100%!important;border-collapse:collapse!important;font-size:14px!important;line-height:1.6;table-layout:auto;}
thead th{background:#f3ebe3!important;color:#5a3a26!important;font-weight:700!important;padding:10px 12px!important;border-bottom:1.5px solid #8C6246!important;text-align:right;}
tbody td{padding:9px 12px!important;border-bottom:1px solid #ece3da!important;vertical-align:middle;}
tbody tr:nth-child(even) td{background:#fcf8f4!important;}
td:not(:first-child),th:not(:first-child){font-variant-numeric:tabular-nums;white-space:nowrap;}
.financial-amount-col{text-align:left!important;width:34%;}
tr.total-row td,tr.financial-total td{background:#f3ebe3!important;font-weight:800!important;border-top:1.5px solid #8C6246!important;border-bottom:1.5px solid #8C6246!important;}
tr.financial-net td{background:#efe4d8!important;font-weight:800!important;font-size:13.5px!important;border-top:2px solid #6f4a33!important;border-bottom:3px double #6f4a33!important;}
.financial-summary-meta{display:flex;justify-content:flex-end;flex-wrap:wrap;font-size:14px;line-height:1.65;color:#292524;margin:0 0 14px;}
.financial-money{display:inline-flex;align-items:baseline;gap:.25em;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;direction:rtl;unicode-bidi:isolate;letter-spacing:normal!important;font-variant-ligatures:normal;font-variant-numeric:tabular-nums;}
.financial-money bdi{white-space:nowrap!important;word-break:keep-all!important;letter-spacing:normal!important;font-family:Tahoma,Arial,sans-serif!important;font-variant-numeric:lining-nums tabular-nums;font-feature-settings:"sups" 0,"subs" 0,"onum" 0;vertical-align:baseline;}
.financial-thousands{position:relative;top:.18em;}
.financial-money .financial-currency{direction:rtl;font-size:.85em;}
.financial-money.financial-negative,.financial-money.financial-negative bdi{color:#b42318!important;}
.footer{margin-top:auto;padding-top:12px;text-align:center;direction:rtl;flex-shrink:0;border-top:1px solid #e6d9cc;color:#8a7b70!important;font-size:11px!important;}
@page{size:A4 portrait;margin:0!important;@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}
@media print{
 html,body{margin:0!important;padding:0!important;background:#fffdfa!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
 .page{box-sizing:border-box;width:100%!important;min-height:296mm;padding:14mm 15mm 22mm!important;}
 tr{break-inside:avoid;}
 .footer{position:fixed;bottom:6mm;left:15mm;right:15mm;background:#fffdfa;margin:0!important;padding:3mm 0 0!important;border-top:1px solid #e6d9cc;font-size:11px!important;color:#8a7b70!important;}
}`;

/** Keep the Arabic currency abbreviation and the entire amount in one shaped, isolated run. */
export function finalizeFinancialReportHtml(html: string) {
  return html.split(/(<[^>]*>)/g).map((part, index) => index % 2 ? part : part.replace(
    /([(\-−\u061C\u200F\u2066]*[0-9٠-٩][0-9٠-٩٬٫.,]*-?)\u2069?\s+ر\.س\.?(\)?)/g,
    (_, raw: string, closing: string) => {
      const digits = raw.replace(/[(\-−\u061C\u200F\u2066]/g, "");
      const negative = raw.includes("(") || /[-−]/.test(raw);
      const shown = `${negative ? "-" : ""}${digits}`.replace(/٬/g, '<span class="financial-thousands">٬</span>');
      return `<span class="financial-money${negative ? " financial-negative" : ""}"><bdi dir="ltr">${shown}</bdi><bdi class="financial-currency" dir="rtl">ر.س</bdi></span>${negative || !closing ? "" : closing}`;
    },
  )).join("").replace("</head>", `<style>${FINANCIAL_PRINT_CSS}</style></head>`)
    .replace("window.onload=function(){window.print();}", "window.onload=async function(){await document.fonts.ready;window.focus();window.print();}");
}

export function resolveReportCalendar(preference?: string | null, cachedPreference?: string | null): FinancialReportCalendar {
  // Stored legacy Gregorian preferences must not override the platform default.
  return "hijri";
}

export function buildActivitySummaryReportHtml(options: {
  title: string; period: string; activityName: string; fileName: string;
  rows: { label: string; amount: number; emphasis?: "total" | "net" }[];
  generatedAt?: string;
  forPrint: boolean; logo: string | null; css: string;
  details?: { title: string; headers: string[]; rows: string[][] };
  detailSections?: { title: string; headers: string[]; rows: string[][]; emptyMessage?: string }[];
  scopeLabel?: string;
  closingRows?: { label: string; amount: number }[];
}) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return finalizeFinancialReportHtml(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(options.fileName.replace(/\.pdf$/, ""))}</title>
    <style>${options.css}@page{size:A4;margin:12mm}@media print{.page{width:100%;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
    <body><main class="page"><header class="header"><div class="header-brand">${options.logo ? `<img alt="تكية" src="${escape(options.logo)}" style="width:110px;height:auto">` : '<div class="brand-name">تكية</div>'}</div>
    <div class="header-center"><h1 class="report-title">${escape(options.title)}</h1><p class="report-sub">${escape(options.period)}</p></div></header>
    ${options.generatedAt ? `<div class="financial-summary-meta"><span>تاريخ الإصدار: ${escape(options.generatedAt)}</span></div>` : ""}
    ${options.scopeLabel ? `<p class="financial-report-scope">${escape(options.scopeLabel)}</p>` : ""}
    <table class="financial-summary-table"><thead><tr><th>البيان</th><th class="financial-amount-col">المبلغ</th></tr></thead><tbody>${options.rows.map(row => {
      const emphasis = row.emphasis ?? (/^(صافي|الصافي)/.test(row.label) ? "net" : /^(إجمالي|الإجمالي)/.test(row.label) ? "total" : "");
      const amount = Math.abs(row.amount).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
      return `<tr${emphasis ? ` class="financial-${emphasis}"` : ""}><td>${escape(row.label)}</td><td class="financial-amount-col">${row.amount < 0 ? "-" : ""}${escape(amount)} ر.س</td></tr>`;
    }).join("")}</tbody></table>
    ${(options.detailSections ?? (options.details ? [{ ...options.details, emptyMessage: "لا توجد مبيعات فردية مكتملة خلال الفترة المختارة." }] : [])).map(section => `<section class="financial-sales-details"><h2 class="section-title">${escape(section.title)}</h2>
    <table><thead><tr>${section.headers.map(header => `<th>${escape(header)}</th>`).join("")}</tr></thead>
    <tbody>${section.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    ${!section.rows.length ? `<p>${escape(section.emptyMessage ?? "لا توجد سجلات خلال الفترة المختارة.")}</p>` : ""}</section>`).join("")}
    ${options.details || options.detailSections ? `
    <style>.financial-sales-details{margin-top:22px}.financial-sales-details table{font-size:11px!important;table-layout:fixed!important}
    .financial-sales-details td,.financial-sales-details th{white-space:normal!important;overflow-wrap:anywhere;padding:6px!important}
    .financial-sales-details thead{display:table-header-group}</style>` : ""}
    ${options.closingRows ? `<section class="financial-closing"><h2 class="section-title">الحسابات الختامية</h2><table><tbody>${options.closingRows.map(row =>
      `<tr class="${row.label.startsWith("صافي") ? "financial-net" : ""}"><td>${escape(row.label)}</td><td class="financial-amount-col">${row.amount < 0 ? "-" : ""}${escape(Math.abs(row.amount).toLocaleString("ar-SA", { maximumFractionDigits: 2 }))} ر.س</td></tr>`).join("")}</tbody></table></section>` : ""}
    <footer class="footer">منصة تكيّة — تقرير مالي</footer></main>
    ${options.forPrint ? '<script>window.addEventListener("load",async()=>{await document.fonts.ready;setTimeout(()=>{window.focus();window.print()},250)})</script>' : ""}</body></html>`);
}
