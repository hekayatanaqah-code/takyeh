import { finalizeFinancialReportHtml } from "./financialReport";
import { FINANCIAL_PAGE_BREAK_CSS } from "./financialReportPagination";

/** Appended after shared report styles, so property layout cannot affect services. */
export const PROPERTY_REPORT_CSS = `
.property-report{background:#fff!important;color:#252525!important;font-size:14px;line-height:1.5;}
.property-report .page{min-height:0!important;width:750px;max-width:100%;padding:20px 24px!important;background:#fff!important;}
.property-report .header{gap:12px;padding:0 0 10px!important;margin-bottom:12px!important;}
.property-report .header-brand img{max-height:62px!important;}
.property-report .qr-img{width:64px;height:64px;}
.property-report .report-title{font-size:20px!important;line-height:1.4;}
.property-report .report-sub,.property-report .brand-sub,.property-report .qr-caption,
.property-report .kpi-label,.property-report .kpi-note,.property-report .slot-chip,
.property-report .current-period-notice{font-size:13px!important;line-height:1.5;color:#374151!important;}
.property-report [style*="font-size:10"],.property-report [style*="font-size:11"],
.property-report [style*="font-size:12"]{font-size:13px!important;line-height:1.5!important;color:#374151!important;}
.property-report .section,.property-report .section-auto{margin:0 0 12px;}
.property-report .section-title{font-size:15px!important;margin-bottom:7px;}
.property-report .kpi-card{padding:9px 10px!important;}
.property-report .kpi-value{font-size:20px!important;line-height:1.3;}
.property-report table{font-size:14px!important;margin:6px 0!important;}
.property-report table th,.property-report table td{height:auto!important;min-height:30px;padding:7px 10px!important;line-height:1.5!important;border-top-width:0!important;white-space:normal;}
.property-report .financial-closing{break-inside:avoid;page-break-inside:avoid;}
.property-report .financial-closing td:last-child{white-space:nowrap;font-weight:700;}
.property-report .footer{position:static!important;margin:4px 0 0!important;padding:8px 0 0!important;font-size:13px!important;color:#4b5563!important;}
.property-report svg{max-width:100%;}
.property-report svg text{font-size:12px;fill:#374151;}
.property-report-compact .page{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 14px;align-content:start;}
.property-report-compact .page>*{min-width:0;margin-bottom:0!important;}
.property-report-compact .page>.section{order:1;}
.property-report-compact .page>.section:has(svg){order:2;}
.property-report-compact .page>.financial-closing{order:3;}
.property-report-compact .page>.footer{order:4;}
.property-report-compact .header,.property-report-compact .current-period-notice,
.property-report-compact .page>.section:first-of-type,.property-report-compact .page>div.section:first-of-type,
.property-report-compact .page>.header + .section,
.property-report-compact .page>.current-period-notice + .section,
.property-report-compact .section:has(svg),.property-report-compact .financial-closing,
.property-report-compact .footer{grid-column:1/-1;}
.property-report-compact .page>.header + .section .kpi-grid{grid-template-columns:repeat(4,minmax(0,1fr));}
.property-report-compact .slot-row{gap:5px;}
.property-report-compact .slot-chip{padding:4px 7px;}
@page{size:A4 portrait;margin:10mm!important;}
@media print{
 html:has(.property-report),body.property-report{margin:0!important;padding:0!important;max-height:none!important;overflow:visible!important;background:#fff!important;}
 .property-report .page{width:100%!important;max-width:100%!important;min-height:0!important;padding:0!important;margin:0 auto!important;}
 .property-report .header{break-inside:avoid;page-break-inside:avoid;}
 .property-report .footer{left:auto!important;right:auto!important;bottom:auto!important;}
 .property-report-compact .page{break-inside:avoid;page-break-inside:avoid;}
 .property-report thead{display:table-header-group;}
 .property-report .section-auto{break-inside:auto;page-break-inside:auto;}
}`;

export function finalizePropertyReportHtml(html: string, showDetails: boolean) {
  return finalizeFinancialReportHtml(html)
    .replace("<body>", `<body class="property-report${showDetails ? "" : " property-report-compact"}">`)
    .replace("</head>", `<style>${PROPERTY_REPORT_CSS}${FINANCIAL_PAGE_BREAK_CSS}</style></head>`);
}

/** Keep detailed property exports legible instead of shrinking many pages to one. */
export function propertyPdfSliceRanges(height: number, pageHeight: number, preferredBreaks: number[]) {
  const breaks = [...new Set(preferredBreaks.map(Math.floor))].filter(y => y > 0 && y < height).sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  while (start < height) {
    const limit = Math.min(height, start + pageHeight);
    const end = limit === height ? height
      : breaks.filter(y => y > start + pageHeight * 0.35 && y <= limit).at(-1) ?? limit;
    ranges.push({ start, end });
    start = end;
  }
  return ranges;
}
