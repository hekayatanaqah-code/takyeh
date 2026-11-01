import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { finalizePropertyReportHtml, propertyPdfSliceRanges } from "./propertyReportLayout";
import { buildPropertyBookingDetailsHtml, buildPropertyReportClosingHtml, formatFinancialAmount } from "./financialReport";
import { escapeFinancialReportText } from "./financialReportActivity";

it("generates property-scoped, readable compact and detailed templates without clipping", () => {
  const source = readFileSync(new URL("../components/owner/financial-report-export.tsx", import.meta.url), "utf8");
  const builders = source.slice(source.indexOf(" const REPORT_CSS"), source.indexOf("/* ── Fresh PDF"));
  const js = ts.transpileModule(builders.replace(/^export /gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = {
    toAr: (value: unknown) => String(value).replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]),
    toHijriComponents: () => ({ day: 18, month: 5, year: 1448 }),
    HIJRI_MONTHS_AR: ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى"],
    formatAmount: formatFinancialAmount, formatAmountSigned: formatFinancialAmount, catMap: {},
    finalizePropertyReportHtml, buildPropertyBookingDetailsHtml, buildPropertyReportClosingHtml,
    escapeFinancialReportText, formatDateWithHijri: () => "١٨ جمادى الأولى ١٤٤٨ هـ | ٢٩ أكتوبر ٢٠٢٦ م",
  };
  const render = new Function(...Object.keys(deps), `${js}; return { buildMonthlyReportHtml, buildYearlyReportHtml };`)(...Object.values(deps));
  const financial = { totalRevenue: 123456, totalExpenses: 23456, netProfit: 100000, totalInsuranceHeld: 3200, totalInsuranceDeducted: 900, categoryTotals: { صيانة: 23456 } };
  const report = { platformBookings: 12, externalBookings: 18, occupancyRate: 95, totalDays: 29, daysInMonth: 31,
    dailyRevenue: Array.from({ length: 31 }, (_, i) => ({ day: i + 1, revenue: (i + 1) * 100 })),
    slotStats: { morning: 10, evening: 10, full_day: 9, unspecified: 1 } };
  const breakdown = { rows: Array.from({ length: 60 }, (_, i) => ({ id: i, name: `عميل ${i}`, date: "2026-10-29", base: 100, svc: 20, total: 120 })), totBase: 6000, totSvc: 1200, totTotal: 7200 };
  const yearly = { monthly: Array.from({ length: 12 }, (_, i) => ({ month: `1448-${String(i + 1).padStart(2, "0")}`, revenue: 10000, expenses: 1000, netProfit: 9000 })), totals: { revenue: 120000, expenses: 12000, netProfit: 108000 } };
  const logo = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="65"><text x="5" y="40" font-size="28">تكيّة</text></svg>');
  const fixtures = {
    monthly: render.buildMonthlyReportHtml("2026-10", "شاليه الاختبار للعائلات والمناسبات", report, financial, false, logo, breakdown, "جمادى الأولى ١٤٤٨ هـ", logo, true, "monthly.pdf", false),
    yearly: render.buildYearlyReportHtml("1448", "شاليه الاختبار", yearly, false, logo, logo, false, "hijri", false, undefined, true, "yearly.pdf", false),
    custom: render.buildYearlyReportHtml("١ محرم ١٤٤٨ هـ ← ٣٠ ذو الحجة ١٤٤٨ هـ", "شاليه الاختبار", yearly, false, logo, logo, true, "hijri", false, undefined, true, "custom.pdf", false),
    detailed: render.buildMonthlyReportHtml("2026-10", "شاليه الاختبار", report, financial, false, logo, breakdown, null, logo, true, "detail.pdf", true),
  };
  for (const [key, html] of Object.entries(fixtures)) {
    assert.ok(html.includes('class="property-report'));
    assert.ok(html.includes("الحسابات الختامية"));
    assert.ok(html.includes(".property-report .report-sub"));
    assert.equal(html.includes('class="property-report property-report-compact"'), key !== "detailed");
    assert.equal(html.includes('class="section-auto financial-booking-details"'), key === "detailed");
    if (process.env.REPORT_LAYOUT_DIR) {
      mkdirSync(process.env.REPORT_LAYOUT_DIR, { recursive: true });
      writeFileSync(`${process.env.REPORT_LAYOUT_DIR}/${key}.html`, html);
    }
  }
});

it("paginates detailed property exports without lost pixels or shrinking the text", () => {
  assert.deepEqual(propertyPdfSliceRanges(500, 1000, []), [{ start: 0, end: 500 }]);
  const pages = propertyPdfSliceRanges(3200, 1000, [900, 1800, 2700]);
  assert.deepEqual(pages, [{ start: 0, end: 900 }, { start: 900, end: 1800 }, { start: 1800, end: 2700 }, { start: 2700, end: 3200 }]);
  assert.equal(pages.reduce((sum, page) => sum + page.end - page.start, 0), 3200);
  assert.ok(pages.every(page => page.end - page.start <= 1000));
  assert.deepEqual(propertyPdfSliceRanges(2200, 1000, []), [{ start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 2200 }]);
});
