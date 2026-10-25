export type FinancialReportCalendar = "hijri" | "gregorian";

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
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(options.fileName.replace(/\.pdf$/, ""))}</title>
    <style>${options.css}@page{size:A4;margin:12mm}@media print{.page{width:100%;padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
    <body><main class="page"><header class="header"><div class="header-brand">${options.logo ? `<img alt="تكية" src="${escape(options.logo)}" style="width:90px;height:auto">` : '<div class="brand-name">تكية</div>'}</div>
    <div class="header-center"><h1 class="report-title">${escape(options.title)}</h1><p class="report-sub">${escape(options.activityName)}</p><p class="report-sub">${escape(options.period)}</p></div></header>
    <table><thead><tr><th>البيان</th><th>المبلغ</th></tr></thead><tbody>${options.rows.map(row => `<tr><td>${escape(row.label)}</td><td>${escape(row.amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 }))} ر.س</td></tr>`).join("")}</tbody></table>
    <footer class="footer">منصة تكية — تقرير مالي</footer></main>
    ${options.forPrint ? '<script>window.addEventListener("load",async()=>{await document.fonts.ready;setTimeout(()=>{window.focus();window.print()},250)})</script>' : ""}</body></html>`;
}
