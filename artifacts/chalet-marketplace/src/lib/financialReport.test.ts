import assert from "node:assert/strict";
import { it } from "node:test";
import { buildActivitySummaryReportHtml, buildPropertyBookingDetailsHtml, buildPropertyReportClosingHtml, resolveReportCalendar, financialPeriodOptions, reconcileFinancialMonth, finalizeFinancialReportHtml, formatFinancialAmount } from "./financialReport";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { finalizePropertyReportHtml } from "./propertyReportLayout";

it("property print/PDF builders hide details by default but retain identical closing totals", () => {
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  const builderSource = source.slice(source.indexOf("function buildMonthlyReportHtml("), source.indexOf("/* ── Fresh PDF"));
  const js = ts.transpileModule(builderSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = {
    toAr: (v: unknown) => String(v), toHijriComponents: () => ({ day: 1, month: 1, year: 1448 }),
    HIJRI_MONTHS_AR: ["محرم"], formatAmount: formatFinancialAmount, formatAmountSigned: formatFinancialAmount,
    catMap: {}, REPORT_CSS: "", buildRevBarSvg: () => "", buildMonthlyBarChartSvg: () => "",
    finalizeFinancialReportHtml, finalizePropertyReportHtml, buildPropertyBookingDetailsHtml, buildPropertyReportClosingHtml,
    escapeFinancialReportText: (s: string) => s, formatDateWithHijri: (s: string) => s,
  };
  const builders = new Function(...Object.keys(deps), `${js}; return { buildMonthlyReportHtml, buildYearlyReportHtml };`)(...Object.values(deps));
  const totals = { revenue: 100, expenses: 150, netProfit: -50 };
  const financial = { totalRevenue: 100, totalExpenses: 150, netProfit: -50, categoryTotals: { صيانة: 150 } };
  const breakdown = { rows: [{ id: 1, name: "<عميل>", date: "2026-10-29", base: 100, svc: 0, total: 100 }], totBase: 100, totSvc: 0, totTotal: 100 };
  for (const forPrint of [false, true]) {
    const monthly = (showDetails?: boolean) => builders.buildMonthlyReportHtml("2026-10", "عقار", null, financial, forPrint, null, breakdown, null, null, false, "report.pdf", showDetails);
    const yearly = (showDetails?: boolean) => builders.buildYearlyReportHtml("2026", "عقار", { monthly: [{ month: "2026-10", ...totals }], totals }, forPrint, null, null, false, "gregorian", false, undefined, false, "report.pdf", showDetails);
    const custom = (showDetails?: boolean) => builders.buildYearlyReportHtml("فترة مخصصة", "عقار", { monthly: [{ month: "2026-10-29", ...totals }], totals }, forPrint, null, null, true, "gregorian", true, 7, false, "report.pdf", showDetails);
    for (const render of [monthly, yearly, custom]) {
      const compact = render();
      const detailed = render(true);
      assert.ok(compact.includes("الحسابات الختامية"));
      assert.ok(detailed.includes("الحسابات الختامية"));
      assert.equal(compact.match(/<section class="section financial-closing">[\s\S]*?<\/section>/)?.[0],
        detailed.match(/<section class="section financial-closing">[\s\S]*?<\/section>/)?.[0]);
      assert.equal(compact.includes("window.print"), forPrint);
    }
    assert.ok(!monthly().includes("تفصيل الحجوزات"));
    assert.ok(!monthly().includes("توزيع المصروفات"));
    assert.ok(monthly(true).includes("&lt;عميل&gt;"));
    assert.ok(monthly(true).includes("توزيع المصروفات"));
    assert.ok(!yearly().includes("تفاصيل الإيرادات والمصروفات"));
    assert.ok(yearly(true).includes("تفاصيل الإيرادات والمصروفات"));
    assert.ok(!custom().includes("تفاصيل الإيرادات والمصروفات"));
    assert.ok(custom(true).includes("تفاصيل الإيرادات والمصروفات"));
  }
  assert.equal(buildPropertyBookingDetailsHtml(true, []), "");
  assert.ok(source.includes('useState(false);\n  const includesServiceBookings'));
  assert.ok(source.includes('!isActivitySummary && <label'));
  assert.ok(source.includes('data-testid="property-report-closing"'));
});

it("uses the platform Hijri default even for legacy Gregorian preferences", () => {
  assert.equal(resolveReportCalendar("hijri", "gregorian"), "hijri");
  assert.equal(resolveReportCalendar("gregorian", "hijri"), "hijri");
  assert.equal(resolveReportCalendar(undefined, "hijri"), "hijri");
  assert.equal(resolveReportCalendar(undefined, "invalid"), "hijri");
});

it("uses the requested period and activity in both print and PDF summaries, escaping names", () => {
  const base = { title: "التقرير الموحّد", period: "جمادى الأولى ١٤٤٨ هـ", activityName: '<script>نشاط</script>',
    fileName: "تقرير.pdf", rows: [{ label: "إيرادات الخدمات", amount: 1500 }], logo: null, css: "" };
  const pdf = buildActivitySummaryReportHtml({ ...base, forPrint: false });
  const print = buildActivitySummaryReportHtml({ ...base, forPrint: true });
  for (const html of [pdf, print]) {
    assert(html.includes(base.period));
    assert(html.includes("إيرادات الخدمات"));
    assert(html.includes("&lt;script&gt;نشاط&lt;/script&gt;"));
    assert(html.replace(/<[^>]*>/g, "").includes((1500).toLocaleString("ar-SA", { maximumFractionDigits: 2 })));
  }
  assert(!pdf.includes("window.print"));
  assert(print.includes("window.print"));
});

it("shows only real nonfuture months and years in descending order without inventing the current month", () => {
  const options = financialPeriodOptions(["2025-04", "2026-01", "2025-12", "2025-04", "2030-01", "invalid"], "gregorian", new Date("2026-10-25T10:00:00Z"));
  assert.deepEqual(options, { months: ["2026-01", "2025-12", "2025-04"], years: ["2026", "2025"] });
  assert.deepEqual(financialPeriodOptions([], "hijri"), { months: [], years: [] });
  assert.equal(reconcileFinancialMonth(options.months, "2025-10"), "2025-12");
  assert.equal(reconcileFinancialMonth(options.months, "2024-12"), "2026-01");
  assert.equal(reconcileFinancialMonth(options.months, "2025-04"), "2025-04");
  assert.equal(reconcileFinancialMonth([], "2025-04"), undefined);
});

it("preserves Hijri years and excludes future Hijri months using Saudi local time", () => {
  const options = financialPeriodOptions(["1447-09", "1446-12", "1499-01", "1447-08"], "hijri", new Date("2026-10-25T10:00:00Z"));
  assert.deepEqual(options.months, ["1447-09", "1447-08", "1446-12"]);
  assert.deepEqual(options.years, ["1447", "1446"]);
});

it("isolates entire currency blocks, converts legacy parentheses to a leading minus and suppresses browser margin boxes", () => {
  const html = finalizeFinancialReportHtml('<html><head></head><body><p>١٬٢٠٠ ر.س</p><p>(٥٠ ر.س)</p><script>window.onload=function(){window.print();}</script></body></html>');
  assert(html.includes('<bdi dir="ltr">١<span class="financial-thousands">٬</span>٢٠٠</bdi><bdi class="financial-currency" dir="rtl">ر.س</bdi>'));
  assert(html.includes('<bdi dir="ltr">-٥٠</bdi>'));
  assert(html.includes("margin:0!important"));
  assert(html.includes("@bottom-center{content:none}"));
  assert(html.includes("await document.fonts.ready"));
  assert(html.includes("white-space:nowrap"));
});

it("keeps the minus before Eastern digits in RTL and in print without parentheses", () => {
  assert.equal(formatFinancialAmount(-11799), "\u2066-١١٬٧٩٩\u2069 ر.س");
  assert.equal(formatFinancialAmount(0), "\u2066٠\u2069 ر.س");
  const html = finalizeFinancialReportHtml(`<html><head></head><body>${formatFinancialAmount(-11799)}</body></html>`);
  assert(html.includes('<bdi dir="ltr">-١١<span class="financial-thousands">٬</span>٧٩٩</bdi>'));
  assert(!html.includes("(-"));
  assert(html.includes('"sups" 0'));
});
