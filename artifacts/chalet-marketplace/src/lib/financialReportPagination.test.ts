import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { financialReportPageSlices, FINANCIAL_PAGE_BREAK_CSS, FINANCIAL_REPORT_MARGINS_MM } from "./financialReportPagination";
import { buildActivitySummaryReportHtml } from "./financialReport";
import { finalizePropertyReportHtml } from "./propertyReportLayout";

it("preserves every original pixel and reserves space for continuation headers", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ top: 200 + i * 80, bottom: 280 + i * 80 }));
  const closing = { top: 3400, bottom: 3750 };
  const pages = financialReportPageSlices(3800, 1000, rows.flatMap(row => [row.top, row.bottom]).concat([3400, 3750]),
    [...rows, closing], 120, [{ top: 160, bottom: 3400, headerTop: 160, headerBottom: 200 }]);
  assert.ok(pages.length > 3);
  assert.equal(pages[0].repeatHeader, false);
  assert.equal(pages[0].start, 0);
  assert.equal(pages.at(-1)!.end, 3800);
  pages.forEach((page, index) => {
    assert.equal(page.start, index ? pages[index - 1].end : 0);
    const reserved = (page.repeatHeader ? 136 : 0) + (page.tableHeader ? 52 : 0);
    assert.ok(page.end - page.start + reserved <= 1000);
    assert.ok(![...rows, closing].some(block => block.top < page.end && page.end < block.bottom));
  });
  assert.ok(pages.slice(1).every(page => page.repeatHeader));
  assert.ok(pages.some(page => page.tableHeader?.top === 160));
  assert.ok(pages.some(page => page.start <= closing.top && page.end >= closing.bottom));
  assert.equal(pages.reduce((sum, page) => sum + page.end - page.start, 0), 3800);
});

it("moves fitting tables and headings with their first row to the next page", () => {
  const pages = financialReportPageSlices(1800, 1000, [600, 700, 760, 900, 1100, 1200, 1700],
    [{ top: 600, bottom: 1200 }, { top: 1200, bottom: 1500 }], 100, []);
  assert.equal(pages[0].end, 600);
  assert.equal(pages[1].start, 600);
  assert.ok(pages.some(page => page.start <= 600 && page.end >= 1200));
  assert.ok(pages.some(page => page.start <= 1200 && page.end >= 1500));
});

it("keeps short reports on one page and safely handles oversized content without loops or data loss", () => {
  assert.deepEqual(financialReportPageSlices(500, 1000, [], [], 100, []),
    [{ start: 0, end: 500, repeatHeader: false, tableHeader: undefined }]);
  assert.deepEqual(financialReportPageSlices(0, 1000, [], [], 100, []), []);
  const pages = financialReportPageSlices(2400, 1000, [], [{ top: 0, bottom: 2400 }], 100, []);
  assert.equal(pages.reduce((sum, page) => sum + page.end - page.start, 0), 2400);
  assert.ok(pages.every(page => page.end > page.start));
});

it("applies final native-print rules to services and properties after their legacy layout rules", () => {
  const service = buildActivitySummaryReportHtml({ title: "التقرير المالي - خدمة", activityName: "خدمة", period: "فترة",
    fileName: "تقرير.pdf", rows: [], closingRows: [], detailSections: [], forPrint: false, logo: null, css: "" });
  for (const html of [service, finalizePropertyReportHtml("<html><head></head><body><div class=\"page\"></div></body></html>", true),
    finalizePropertyReportHtml("<html><head></head><body><div class=\"page\"></div></body></html>", false)]) {
    assert.ok(html.includes(FINANCIAL_PAGE_BREAK_CSS));
    assert.ok(html.includes("page-break-inside:avoid!important;break-inside:avoid!important"));
    assert.ok(html.includes("display:table-header-group!important"));
    assert.ok(html.includes("break-after:avoid-page!important"));
    assert.ok(html.includes("max-height:none!important;overflow:visible!important"));
    assert.ok(html.includes("position:static!important"));
    assert.ok(html.includes("margin:8mm 10mm 8mm 10mm!important"));
    assert.ok(html.includes(".summary-section,.footer-accounts"));
    assert.ok(!html.includes("@page{size:A4 portrait;margin:10mm!important"));
  }
  const source = readFileSync(new URL("../components/owner/financial-report-export.tsx", import.meta.url), "utf8");
  assert.ok(source.includes("financialReportPageSlices(canvas.height"));
  assert.ok(source.includes('!iDoc.body.classList.contains("property-report-compact") && canvas.height > pageHeightCanvasPx'));
  assert.ok(source.includes("headerSpace + tableSpace + end - start"));
  assert.ok(source.includes("const margins = FINANCIAL_REPORT_MARGINS_MM"));
  assert.ok(source.includes("A4_H_MM - margins.top - margins.bottom"));
  assert.ok(source.includes('"JPEG", margins.left, margins.top'));
  assert.deepEqual(FINANCIAL_REPORT_MARGINS_MM, { top: 8, right: 10, bottom: 8, left: 10 });
});
