export const FINANCIAL_REPORT_MARGINS_MM = { top: 8, right: 10, bottom: 8, left: 10 } as const;

export type ReportBlock = { top: number; bottom: number };
export type ReportTable = ReportBlock & { headerTop: number; headerBottom: number };
export type ReportPageSlice = {
  start: number; end: number; repeatHeader: boolean; tableHeader?: ReportBlock;
};

/** All measurements use capture pixels, not CSS pixels or millimetres. */
export function financialReportPageSlices(
  height: number, pageHeight: number, breaks: number[], protectedBlocks: ReportBlock[],
  headerBottom: number, tables: ReportTable[],
): ReportPageSlice[] {
  if (!(height > 0) || !(pageHeight > 0)) return [];
  const points = [...new Set(breaks.map(Math.floor))].filter(y => y > 0 && y < height).sort((a, b) => a - b);
  const pages: ReportPageSlice[] = [];
  let start = 0;
  while (start < height) {
    const repeatHeader = start > 0 && headerBottom > 0 && headerBottom < pageHeight / 3;
    const continuing = tables.find(table => table.headerBottom <= start && table.bottom > start);
    const tableHeader = continuing && continuing.headerBottom - continuing.headerTop < pageHeight / 4
      ? { top: continuing.headerTop, bottom: continuing.headerBottom } : undefined;
    const reserved = (repeatHeader ? headerBottom + 16 : 0)
      + (tableHeader ? tableHeader.bottom - tableHeader.top + 12 : 0);
    const capacity = Math.max(1, Math.floor(pageHeight - reserved));
    const limit = Math.min(height, start + capacity);
    const fitsBlock = (block: ReportBlock) => block.bottom - block.top <= capacity;
    const safe = (y: number) => !protectedBlocks.some(block => fitsBlock(block) && block.top < y && y < block.bottom);
    let end = limit;
    if (limit < height) {
      const candidates = points.filter(y => y > start && y <= limit && safe(y));
      end = candidates.at(-1) ?? limit;
      // Move a fitting closing section/row to the next page instead of cutting it.
      const crossed = protectedBlocks.filter(block => fitsBlock(block) && block.top > start
        && block.top < end && block.bottom > end);
      if (crossed.length) end = Math.floor(Math.min(...crossed.map(block => block.top)));
    }
    if (end <= start) end = limit;
    pages.push({ start, end, repeatHeader, tableHeader });
    start = end;
  }
  return pages;
}

/** Shared by native print for services and every property-report period. */
export const FINANCIAL_PAGE_BREAK_CSS = `
@page{size:A4 portrait;margin:${FINANCIAL_REPORT_MARGINS_MM.top}mm ${FINANCIAL_REPORT_MARGINS_MM.right}mm ${FINANCIAL_REPORT_MARGINS_MM.bottom}mm ${FINANCIAL_REPORT_MARGINS_MM.left}mm!important;@top-left{content:none}@top-center{content:none}@top-right{content:none}@bottom-left{content:none}@bottom-center{content:none}@bottom-right{content:none}}
@media print{
 html,body,body.property-report{margin:0!important;padding:0!important;max-height:none!important;overflow:visible!important;}
 .page,.property-report .page{width:100%!important;max-width:100%!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;}
 body:not(.property-report-compact) .page{display:block!important;}
 .header,.financial-closing,.property-report .financial-closing,.summary-section,.footer-accounts,.kpi-card,.financial-summary-table,.current-period-notice,.financial-report-scope{
   page-break-inside:avoid!important;break-inside:avoid!important;
 }
 h1,h2,h3,.section-title{page-break-inside:avoid!important;break-inside:avoid!important;page-break-after:avoid!important;break-after:avoid-page!important;}
 table{page-break-inside:avoid;break-inside:avoid;margin:8px 0 16px!important;}
 .section-auto,.financial-sales-details{
   page-break-inside:auto!important;break-inside:auto!important;
 }
 thead,.property-report thead{display:table-header-group!important;page-break-inside:avoid!important;break-inside:avoid!important;page-break-after:avoid!important;break-after:avoid-page!important;}
 tfoot{display:table-row-group!important;}
 tr,.total-row{page-break-inside:avoid!important;break-inside:avoid!important;}
 th,td{overflow:visible!important;}
 thead tr th{border-top:0!important;padding-top:8px!important;padding-bottom:8px!important;}
 .footer,.property-report .footer{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;page-break-inside:avoid!important;break-inside:avoid!important;margin-top:12px!important;}
 p{orphans:3;widows:3;}
}
`;
