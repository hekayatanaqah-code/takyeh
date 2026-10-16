import { archiveTotals, type ArchiveCell, type ArchiveExportTable } from "./bookingArchiveExport";
import {
  reportAmount, reportDateRange, reportEscape, reportIssuedAt, reportPropertyTitle,
  type ArchiveReportContext,
} from "./bookingArchiveReport";

const TEAL = "#087f8c";
const TEAL_DARK = "#0b5560";
const BROWN = "#8c6246";
const INK = "#1d2a2e";

const STYLES = `
.archive-pdf-page{box-sizing:border-box;width:1200px;background:#ffffff;color:${INK};padding:24px 26px;direction:rtl;font-family:"Noto Sans Arabic","Segoe UI",Tahoma,sans-serif;font-size:18px;line-height:1.55;font-feature-settings:"locl" 1}
.archive-pdf-page *{box-sizing:border-box}
.archive-pdf-page .ap-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:14px;border-bottom:3px solid ${TEAL}}
.archive-pdf-page .ap-brand{display:flex;align-items:center;gap:14px}
.archive-pdf-page .ap-logo{height:64px;width:auto;max-width:150px;object-fit:contain}
.archive-pdf-page .ap-platform{font-size:15px;color:${BROWN};font-weight:700;letter-spacing:.2px}
.archive-pdf-page .ap-title{margin:2px 0 0;font-size:26px;font-weight:800;color:${TEAL_DARK};line-height:1.35}
.archive-pdf-page .ap-status{display:inline-block;margin-top:6px;padding:3px 12px;border:1px solid ${TEAL};border-radius:4px;color:${TEAL};font-size:16px;font-weight:700}
.archive-pdf-page .ap-owner{display:flex;align-items:center;gap:12px;text-align:left}
.archive-pdf-page .ap-owner-text{text-align:right}
.archive-pdf-page .ap-owner-name{font-size:19px;font-weight:700;color:${INK}}
.archive-pdf-page .ap-owner-phone{font-size:16px;color:${BROWN};direction:ltr;unicode-bidi:embed}
.archive-pdf-page .ap-property-logos{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0}
.archive-pdf-page .ap-property-logo{display:flex;align-items:center;gap:8px;font-size:15px}
.archive-pdf-page .ap-property-logo img{width:52px;height:48px;object-fit:contain}
.archive-pdf-page .ap-lbl{color:#8c6246;font-weight:700;font-size:15px}
.archive-pdf-page .ap-owner-phone-row{font-size:16px}
.archive-pdf-page .ap-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:14px 0 6px;padding:10px 14px;background:#f5efe7;border-right:4px solid ${BROWN};font-size:16px}
.archive-pdf-page .ap-meta b{color:${BROWN};font-weight:700;margin-left:6px}
.archive-pdf-page .ap-meta .ap-wide{grid-column:1/-1}
.archive-pdf-page .ap-note{margin:10px 0 0;padding:8px 14px;border:1px dashed ${BROWN};color:#5b3f2c;font-size:16px;background:#fbf7f2}
.archive-pdf-page .ap-section{margin-top:18px}
.archive-pdf-page .ap-section h3{margin:0 0 6px;font-size:18px;font-weight:800;color:${TEAL_DARK}}
.archive-pdf-page table{width:100%;border-collapse:collapse;table-layout:auto;font-size:18px}
.archive-pdf-page th{background:${TEAL};color:#fff;font-weight:700;padding:9px 8px;border:1px solid #6aa9b0;text-align:right;vertical-align:middle;white-space:normal;overflow-wrap:anywhere}
.archive-pdf-page td{padding:8px 8px;border:1px solid #cdd9db;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal}
.archive-pdf-page tbody tr:nth-child(even) td{background:#eef6f6}
.archive-pdf-page tbody tr:nth-child(odd) td{background:#ffffff}
.archive-pdf-page td.ap-num{text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.archive-pdf-page td.ap-neg{color:#b42318;font-weight:700}
.archive-pdf-page td.ap-key{font-weight:700;color:${TEAL_DARK}}
.archive-pdf-page tfoot td{background:#f2e8dc !important;font-weight:800;border-top:2px solid ${BROWN}}
.archive-pdf-page .ap-empty{padding:18px;text-align:center;color:#6b5b4e;border:1px solid #cdd9db}
.archive-pdf-page .ap-summary-note{margin-top:14px;font-size:16px;color:#4a3a2e}
.archive-pdf-page .ap-foot{display:flex;justify-content:space-between;gap:16px;margin-top:20px;padding-top:10px;border-top:1px solid ${BROWN};font-size:15px;color:#5b4a3d}
`;

const isNum = (v: ArchiveCell): v is number => typeof v === "number" && Number.isFinite(v);

function cell(value: ArchiveCell, monetary: boolean, key: boolean): string {
  if (monetary && isNum(value)) {
    return `<td class="ap-num${value < 0 ? " ap-neg" : ""}">${reportEscape(reportAmount(value))}</td>`;
  }
  const text = value == null ? "" : String(value);
  return `<td class="${key ? "ap-key" : ""}">${reportEscape(text)}</td>`;
}

function renderTable(
  caption: string, cols: number[], table: ArchiveExportTable, rows: ArchiveCell[][],
  totals: (number | null)[] | null,
): string {
  const money = new Set(table.numericColumns);
  const head = `<thead><tr>${cols.map(c => `<th scope="col">${reportEscape(table.headers[c] ?? "")}</th>`).join("")}</tr></thead>`;
  const body = rows.length
    ? rows.map(r => `<tr>${cols.map((c, i) => cell(r[c] ?? "", money.has(c), i === 0)).join("")}</tr>`).join("")
    : `<tr><td class="ap-empty" colspan="${cols.length}">${totals ? "ملخص جميع السجلات المطابقة" : "لا توجد سجلات مطابقة"}</td></tr>`;
  let foot = "";
  if (totals && cols.some(c => money.has(c))) {
    let labelled = false;
    foot = `<tfoot><tr>${cols.map(c => {
      const t = totals[c];
      if (money.has(c) && typeof t === "number") {
        return `<td class="ap-num${t < 0 ? " ap-neg" : ""}">${reportEscape(reportAmount(t))}</td>`;
      }
      if (!labelled) { labelled = true; return `<td>الإجمالي (كل السجلات المطابقة)</td>`; }
      return `<td></td>`;
    }).join("")}</tr></tfoot>`;
  }
  return `<section class="ap-section"><h3>${reportEscape(caption)}</h3><table dir="rtl">${head}<tbody>${body}</tbody>${foot}</table></section>`;
}

export function buildArchivePdfPage({ table, context, rows, includeSummary, pageNumber, totalPages, columns, sectionTitle }: {
  table: ArchiveExportTable; context: ArchiveReportContext; rows: ArchiveCell[][];
  includeSummary: boolean; pageNumber: number; totalPages: number;
  columns?: number[]; sectionTitle?: string;
}): string {
  const money = table.numericColumns.filter(c => c >= 0 && c < table.headers.length);
  const financial = money.length > 0;
  const totals = includeSummary && financial && !columns?.length ? archiveTotals(table) : null;
  const all = table.headers.map((_, i) => i);
  const idCol = 0;
  const clientCol = table.headers.findIndex(h => h.includes("اسم العميل"));
  const keyCols = [idCol, ...(clientCol > 0 ? [clientCol] : [])];

  let sections = "";
  if (columns && columns.length) {
    const cols = columns.filter(c => c >= 0 && c < table.headers.length);
    const groupTotals = includeSummary && cols.some(c => money.includes(c)) ? archiveTotals(table) : null;
    sections = renderTable(sectionTitle || "تفاصيل السجلات", cols, table, rows, groupTotals);
  } else if (!financial) {
    sections = renderTable("تفاصيل السجلات", all, table, rows, null);
  } else {
    const identity = all.filter(c => !money.includes(c));
    sections += renderTable("بيانات الحجز", identity, table, rows, null);
    const groupSize = money.length > 9 ? 6 : money.length;
    const groups: number[][] = [];
    for (let i = 0; i < money.length; i += groupSize) groups.push(money.slice(i, i + groupSize));
    groups.forEach((g, i) => {
      const cols = [...keyCols.filter(c => !g.includes(c)), ...g];
      const caption = groups.length > 1 ? `البيانات المالية (${i + 1} من ${groups.length})` : "البيانات المالية";
      sections += renderTable(caption, cols, table, rows, totals);
    });
  }

  const ownerLogo = context.ownerLogoUrl
    ? `<img class="ap-logo" src="${reportEscape(context.ownerLogoUrl)}" alt="${reportEscape(context.ownerName)}" />` : "";
  const insuranceNote = financial && table.headers.some(h => h.includes("التأمين"))
    ? `<p class="ap-note">التأمين مستقل عن الإيجار والتحصيلات، ولا يمثل إيراداً من الإيجار. المبالغ بالريال السعودي، والقيم السالبة تظهر باللون الأحمر بين قوسين.</p>`
    : "";

  return `<div class="archive-pdf-page" dir="rtl" lang="ar"><style>${STYLES}</style>
<header class="ap-head">
  <div class="ap-brand">
    <img class="ap-logo" src="${reportEscape(context.platformLogoUrl)}" alt="منصة تكيّة" />
    <div>
      <div class="ap-platform">منصة تكيّة — تقرير رسمي</div>
      <h1 class="ap-title">${reportEscape(reportPropertyTitle(context))}</h1>
      <span class="ap-status">${reportEscape(table.title)}</span>
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
${insuranceNote}
${sections}
${includeSummary && table.summaryNote ? `<p class="ap-summary-note">${reportEscape(table.summaryNote)}</p>` : ""}
<footer class="ap-foot">
  <span>صفحة ${reportEscape(pageNumber.toLocaleString("ar-SA"))} من ${reportEscape(totalPages.toLocaleString("ar-SA"))}</span>
  <span>${reportEscape(context.ownerName)}</span>
  <span>جميع الحقوق محفوظة لمنصة تكيّة</span>
</footer>
</div>`;
}
