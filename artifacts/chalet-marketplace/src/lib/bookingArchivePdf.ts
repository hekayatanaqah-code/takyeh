import { archiveTotals, type ArchiveCell, type ArchiveExportTable } from "./bookingArchiveExport";
import { archivePdfColumns, type ArchivePdfColumn } from "./bookingArchivePdfColumns";
import {
  reportAmount, reportDateRange, reportEscape, reportIssuedAt, reportPropertyTitle, reportShortDate,
  type ArchiveReportContext,
} from "./bookingArchiveReport";

const TEAL = "#087f8c";
const TEAL_DARK = "#0b5560";
const BROWN = "#8c6246";
const INK = "#1d2a2e";

const STYLES = `
.archive-pdf-page{box-sizing:border-box;width:1200px;background:#ffffff;color:${INK};padding:20px 22px;direction:rtl;text-align:right;font-family:Arial,Tahoma,"Noto Sans Arabic",sans-serif;font-size:16px;line-height:1.4}
.archive-pdf-page *{box-sizing:border-box;letter-spacing:0!important;font-kerning:normal}
.archive-pdf-page .ap-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:10px;border-bottom:2px solid ${TEAL}}
.archive-pdf-page .ap-brand{display:flex;align-items:center;gap:14px}
.archive-pdf-page .ap-logo{height:48px;width:auto;max-width:120px;object-fit:contain}
.archive-pdf-page .ap-platform{font-size:13px;color:${BROWN};font-weight:700}
.archive-pdf-page .ap-title{margin:2px 0 0;font-size:23px;font-weight:700;color:${TEAL_DARK};line-height:1.35}
.archive-pdf-page .ap-status{display:block;margin-top:4px;color:${TEAL};font-size:16px;font-weight:700}
.archive-pdf-page .ap-owner{display:flex;align-items:center;gap:12px;text-align:left}
.archive-pdf-page .ap-owner-text{text-align:right}
.archive-pdf-page .ap-owner-name{font-size:19px;font-weight:700;color:${INK}}
.archive-pdf-page .ap-owner-phone{font-size:16px;color:${BROWN};direction:ltr;unicode-bidi:embed}
.archive-pdf-page .ap-property-logos{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0}
.archive-pdf-page .ap-property-logo{display:flex;align-items:center;gap:8px;font-size:15px}
.archive-pdf-page .ap-property-logo img{width:52px;height:48px;object-fit:contain}
.archive-pdf-page .ap-lbl{color:#8c6246;font-weight:700;font-size:15px}
.archive-pdf-page .ap-owner-phone-row{font-size:16px}
.archive-pdf-page .ap-meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin:10px 0 6px;padding:8px 10px;background:#f5efe7;font-size:14px}
.archive-pdf-page .ap-meta b{color:${BROWN};font-weight:700;margin-left:6px}
.archive-pdf-page .ap-meta .ap-wide{grid-column:1/-1}
.archive-pdf-page .ap-note{margin:10px 0 0;padding:8px 14px;border:1px dashed ${BROWN};color:#5b3f2c;font-size:16px;background:#fbf7f2}
.archive-pdf-page .ap-section{margin-top:10px}
.archive-pdf-page .ap-section h3{margin:0 0 6px;font-size:16px;font-weight:700;color:${TEAL_DARK}}
.archive-pdf-page table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--ap-table-font,16px);line-height:1.35}
.archive-pdf-page th{background:${TEAL};color:#fff;font-weight:700;padding:7px 4px;border:1px solid #6aa9b0;text-align:right;vertical-align:middle;white-space:normal;overflow-wrap:normal;font-size:.9em}
.archive-pdf-page td{padding:5px 4px;border:1px solid #cdd9db;vertical-align:middle;white-space:normal;overflow-wrap:break-word;word-break:normal}
.archive-pdf-page tr{break-inside:avoid;page-break-inside:avoid}
.archive-pdf-page .ap-value{display:inline}
.archive-pdf-page .ap-money{display:inline-block;white-space:nowrap;font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.archive-pdf-page .ap-phone{direction:ltr;unicode-bidi:isolate;display:inline-block;white-space:nowrap}
.archive-pdf-page .ap-date{white-space:nowrap;unicode-bidi:isolate}
.archive-pdf-page .ap-negative{color:#b42318;font-weight:700}
.archive-pdf-page tbody tr:nth-child(even) td{background:#eef6f6}
.archive-pdf-page tbody tr:nth-child(odd) td{background:#ffffff}
.archive-pdf-page td.ap-num{text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.archive-pdf-page td.ap-neg{color:#b42318;font-weight:700}
.archive-pdf-page td.ap-key{font-weight:700;color:${TEAL_DARK}}
.archive-pdf-page tfoot td{background:#f2e8dc !important;font-weight:800;border-top:2px solid ${BROWN}}
.archive-pdf-page .ap-empty{padding:18px;text-align:center;color:#6b5b4e;border:1px solid #cdd9db}
.archive-pdf-page .ap-summary-note{margin:8px 0 0;font-size:13px;color:#4a3a2e}
.archive-pdf-page .ap-foot{display:flex;justify-content:space-between;gap:16px;margin-top:12px;padding-top:7px;border-top:1px solid ${BROWN};font-size:13px;color:#5b4a3d}
`;

const isNum = (v: ArchiveCell): v is number => typeof v === "number" && Number.isFinite(v);

function cell(column: ArchivePdfColumn, row: ArchiveCell[], table: ArchiveExportTable, summary = false, dates?: Map<number, string>): string {
  const values = column.fields.filter(field => !summary || table.numericColumns.includes(field.index)).map(field => {
    const value = row[field.index] ?? "";
    const monetary = table.numericColumns.includes(field.index);
    const text = monetary && isNum(value) ? reportAmount(value).replace(" ر.س", "") : dates?.get(field.index) ?? String(value);
    const classes = monetary ? `ap-money${isNum(value) && value < 0 ? " ap-negative" : ""}`
      : table.headers[field.index] === "رقم الجوال" ? "ap-phone" : dates?.has(field.index) ? "ap-date" : "";
    return `<span class="ap-value" data-field="${field.index}"><span class="${classes}">${reportEscape(text)}</span></span>`;
  }).join("");
  return `<td${column.fields[0].index === 0 ? ' class="ap-key"' : ""}>${values}</td>`;
}

function renderTable(
  caption: string, columns: ArchivePdfColumn[], table: ArchiveExportTable, rows: ArchiveCell[][],
  totals: (number | null)[] | null, context: ArchiveReportContext,
): string {
  const money = new Set(table.numericColumns);
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const colgroup = `<colgroup>${columns.map(column => `<col style="width:${column.width * 100 / width}%">`).join("")}</colgroup>`;
  const head = `<thead><tr>${columns.map(column => `<th scope="col">${reportEscape(column.title)}</th>`).join("")}</tr></thead>`;
  const positions = new Map(table.rows.map((row, index) => [row, index]));
  const body = rows.length
    ? rows.map(r => {
      const position = positions.get(r);
      const dates = new Map((table.dateValues ?? []).flatMap(({ column, values }) =>
        position != null && values[position] ? [[column, reportShortDate(values[position], context.calendarPreference)] as [number, string]] : []));
      return `<tr data-booking-row="true">${columns.map(column => cell(column, r, table, false, dates)).join("")}</tr>`;
    }).join("")
    : `<tr><td class="ap-empty" colspan="${columns.length}">${totals ? "ملخص جميع السجلات المطابقة" : "لا توجد سجلات مطابقة"}</td></tr>`;
  let foot = "";
  if (totals && money.size) {
    const firstMoney = columns.findIndex(column => column.fields.some(field => money.has(field.index)));
    const totalValues = totals.map(value => value ?? "");
    foot = `<tfoot><tr><td colspan="${firstMoney}">الإجمالي (كل السجلات المطابقة)</td>${columns.slice(firstMoney)
      .map(column => cell(column, totalValues, table, true)).join("")}</tr></tfoot>`;
  }
  return `<section class="ap-section"><h3>${reportEscape(caption)}</h3><table dir="rtl">${colgroup}${head}<tbody>${body}</tbody>${foot}</table></section>`;
}

export function buildArchivePdfPage({ table, context, rows, includeSummary, pageNumber, totalPages, width = 1200 }: {
  table: ArchiveExportTable; context: ArchiveReportContext; rows: ArchiveCell[][];
  includeSummary: boolean; pageNumber: number; totalPages: number;
  width?: number;
}): string {
  const money = table.numericColumns.filter(c => c >= 0 && c < table.headers.length);
  const financial = money.length > 0;
  const totals = includeSummary && financial ? archiveTotals(table) : null;
  const sections = renderTable(financial ? "سجل الحجوزات والبيانات المالية — المبالغ بالريال السعودي" : "تفاصيل إعادة الجدولة",
    archivePdfColumns(table), table, rows, totals, context);

  const ownerLogo = context.ownerLogoUrl
    ? `<img class="ap-logo" src="${reportEscape(context.ownerLogoUrl)}" alt="${reportEscape(context.ownerName)}" />` : "";
  return `<div class="archive-pdf-page" style="width:${width}px;--ap-table-font:${width >= 1800 ? 18 : 16}px" dir="rtl" lang="ar"><style>${STYLES}</style>
<header class="ap-head">
  <div class="ap-brand">
    <img class="ap-logo" src="${reportEscape(context.platformLogoUrl)}" alt="منصة تكيّة" />
    <div>
      <div class="ap-platform">منصة تكيّة — تقرير رسمي</div>
      <h1 class="ap-title">${reportEscape(reportPropertyTitle(context))}</h1>
      <div class="ap-status">${reportEscape(table.title)}</div>
    </div>
  </div>
  <div class="ap-owner">
    <div class="ap-owner-text">
      <div class="ap-owner-name"><span class="ap-lbl">المالك / النشاط:</span> ${reportEscape(context.ownerName)}</div>
      <div class="ap-owner-phone-row"><span class="ap-lbl">الجوال:</span> <span class="ap-owner-phone">${reportEscape(context.ownerPhone?.trim() || "غير مسجل")}</span></div>
    </div>
    ${ownerLogo}
  </div>
</header>
${context.propertyLogos?.length ? `<div class="ap-property-logos">${context.propertyLogos.map(logo => `<div class="ap-property-logo"><img src="${reportEscape(logo.url)}" alt="${reportEscape(logo.name)}" /><span>${reportEscape(logo.name)}</span></div>`).join("")}</div>` : ""}
<div class="ap-meta">
  <div><b>الفترة:</b>${reportEscape(reportDateRange(context))}</div>
  <div><b>تاريخ الإصدار:</b>${reportEscape(reportIssuedAt(context))}</div>
  <div><b>عدد السجلات المطابقة:</b>${reportEscape(table.rows.length.toLocaleString("ar-SA"))}</div>
  <div><b>سجلات هذه الصفحة:</b>${reportEscape(rows.length.toLocaleString("ar-SA"))}</div>
  ${context.search ? `<div class="ap-wide"><b>بحث:</b>${reportEscape(context.search)}</div>` : ""}
</div>
${sections}
${includeSummary && table.summaryNote ? `<p class="ap-summary-note">${reportEscape(table.summaryNote)}</p>` : ""}
<footer class="ap-foot">
  <span>صفحة ${reportEscape(pageNumber.toLocaleString("ar-SA"))} من ${reportEscape(totalPages.toLocaleString("ar-SA"))}</span>
  <span>${reportEscape(context.ownerName)}</span>
  <span>جميع الحقوق محفوظة لمنصة تكيّة</span>
</footer>
</div>`;
}
