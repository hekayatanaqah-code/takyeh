export type FinancialReportCalendar = "hijri" | "gregorian";

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
.financial-money{display:inline-flex;align-items:baseline;gap:.25em;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;direction:rtl;unicode-bidi:isolate;letter-spacing:normal!important;font-variant-ligatures:normal;}
.financial-money bdi{white-space:nowrap!important;word-break:keep-all!important;letter-spacing:normal!important;}
.financial-money .financial-currency{direction:rtl;font-size:.85em;}
.page{min-height:1100px;display:flex;flex-direction:column;}
.footer{margin-top:auto;padding-top:12px;text-align:center;direction:rtl;flex-shrink:0;}
@page{size:A4 portrait;margin:0!important;@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}
@media print{
 html,body{margin:0!important;padding:0!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
 .page{box-sizing:border-box;width:100%!important;min-height:296mm;padding:12mm 12mm 20mm!important;}
 .footer{position:fixed;bottom:5mm;left:12mm;right:12mm;background:white;margin:0!important;padding:3mm 0 0!important;border-top:1px solid #eee;font-size:11px!important;color:#666!important;}
}`;

/** Keep the Arabic currency abbreviation and the entire amount in one shaped, isolated run. */
export function finalizeFinancialReportHtml(html: string) {
  return html.split(/(<[^>]*>)/g).map((part, index) => index % 2 ? part : part.replace(
    /(\(?[0-9٠-٩][0-9٠-٩٬٫.,]*)\s+ر\.س\.?(\)?)/g,
    (_, number: string, closing: string) => `<span class="financial-money"><bdi dir="ltr">${number}${closing}</bdi><bdi class="financial-currency" dir="rtl">ر.س</bdi></span>`,
  )).join("").replace("</head>", `<style>${FINANCIAL_PRINT_CSS}</style></head>`)
    .replace("window.onload=function(){window.print();}", "window.onload=async function(){await document.fonts.ready;window.focus();window.print();}");
}

export function resolveReportCalendar(preference?: string | null, cachedPreference?: string | null): FinancialReportCalendar {
  if (preference === "hijri" || preference === "gregorian") return preference;
  return cachedPreference === "hijri" ? "hijri" : "gregorian";
}

export function buildActivitySummaryReportHtml(options: {
  title: string; period: string; activityName: string; fileName: string;
  rows: { label: string; amount: number }[];
  forPrint: boolean; logo: string | null; css: string;
}) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return finalizeFinancialReportHtml(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(options.fileName.replace(/\.pdf$/, ""))}</title>
    <style>${options.css}@page{size:A4;margin:12mm}@media print{.page{width:100%;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
    <body><main class="page"><header class="header"><div class="header-brand">${options.logo ? `<img alt="تكية" src="${escape(options.logo)}" style="width:90px;height:auto">` : '<div class="brand-name">تكية</div>'}</div>
    <div class="header-center"><h1 class="report-title">${escape(options.title)}</h1><p class="report-sub">${escape(options.activityName)}</p><p class="report-sub">${escape(options.period)}</p></div></header>
    <table><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${options.rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 }))} ر.س</td></tr>`).join("")}</tbody></table>
    <footer class="footer">منصة تكيّة — تقرير مالي</footer></main>
    ${options.forPrint ? '<script>window.addEventListener("load",async()=>{await document.fonts.ready;setTimeout(()=>{window.focus();window.print()},250)})</script>' : ""}</body></html>`);
}
