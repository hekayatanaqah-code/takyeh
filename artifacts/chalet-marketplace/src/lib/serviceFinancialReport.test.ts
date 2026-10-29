import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuickSale } from "@workspace/api-client-react";
import { buildServiceFinancialReport, serviceExpensesForPeriod, serviceReportRows, serviceReportSourceLabels } from "./serviceFinancialReport";
import { revenueMonthKey } from "./revenuePeriod";
import { buildActivitySummaryReportHtml } from "./financialReport";
import { ServiceFinancialReportPanels } from "../components/owner/ServiceFinancialReportPanels";

const summary = { totalRevenue: 100.1, totalDeposits: 100.1, totalInsurance: 50, byProvider: [
  { id: 10, name: "خدمة", revenue: 100.1, deposits: 100.1, insurance: 50 },
] };
const sales = [{ id: 1, providerId: 10, providerName: "خدمة", total: 35.9, status: "completed" },
  { id: 2, providerId: 10, providerName: "خدمة", total: 999, status: "cancelled" }] as QuickSale[];
const expenses = [
  { id: 1, providerId: 10, dateStr: "2026-10-28", amount: "25.75", category: "مواد" },
  { id: 2, providerId: 10, dateStr: "2026-10-28", amount: "10.15", category: "تشغيل" },
  { id: 3, providerId: 20, dateStr: "2026-10-28", amount: "500", category: "خدمة أخرى" },
  { id: 4, submissionId: 10, dateStr: "2026-10-28", amount: "500", category: "عقار" },
  { id: 5, dateStr: "2026-10-28", amount: "500", category: "عام غير موزع" },
  { id: 6, providerId: 10, dateStr: "2025-01-01", amount: "500", category: "فترة أخرى" },
];

it("scopes expenses to the exact service and period in both calendars without distributing general/property expenses", () => {
  for (const calendar of ["hijri", "gregorian"] as const) {
    const month = revenueMonthKey("2026-10-28", calendar);
    assert.deepEqual(serviceExpensesForPeriod(expenses, 10, { calendar, month, year: month.slice(0, 4) }).map(row => row.id), [1, 2]);
  }
});

it("recalculates all three source scopes in halalas, with no insurance/deposit duplication and unchanged expenses", () => {
  const scopedExpenses = expenses.slice(0, 2);
  for (const [source, revenue, net, deposit] of [
    ["all", 136, 100.1, 100.1], ["bookings", 100.1, 64.2, 100.1], ["quick_sales", 35.9, 0, 0],
  ] as const) {
    const report = buildServiceFinancialReport(summary, sales, scopedExpenses, source)!;
    assert.equal(report.totalRevenue, revenue);
    assert.equal(report.totalExpenses, 35.9);
    assert.equal(report.netProfit, net);
    assert.equal(report.totalDeposits, deposit);
    assert.equal(report.totalInsurance, source === "quick_sales" ? 0 : 50);
    assert.equal(report.byProvider.reduce((sum, provider) => sum + provider.revenue, 0), revenue);
    const rows = serviceReportRows(report, source);
    assert.equal(rows.some(row => row.label.includes("إيرادات حجوزات")), source !== "quick_sales");
    assert.equal(rows.some(row => row.label.includes("إيرادات المبيعات")), source !== "bookings");
  }
  assert.equal(summary.totalRevenue, 100.1);
});

it("retains expense-only losses and does not need booking data for a sales-only report", () => {
  assert.equal(buildServiceFinancialReport(undefined, sales, [], "all"), undefined);
  assert.equal(buildServiceFinancialReport(undefined, sales, [], "quick_sales")!.totalRevenue, 35.9);
  const report = buildServiceFinancialReport({ totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [] }, [], expenses.slice(0, 2), "all")!;
  assert.equal(report.netProfit, -35.9);
});

it("renders matching scope, summary, expenses, source details and final income in the page and print/PDF", () => {
  for (const source of ["all", "bookings", "quick_sales"] as const) {
    const report = buildServiceFinancialReport(summary, sales, expenses.slice(0, 2), source)!;
    const rows = serviceReportRows(report, source);
    const details = [
      ...(source !== "quick_sales" ? [{ title: "تفاصيل الحجوزات", headers: ["العميل"], rows: [["<عميل حجز>"]] }] : []),
      ...(source !== "bookings" ? [{ title: "تفاصيل البيع السريع", headers: ["العميل"], rows: [["<عميل بيع>"]] }] : []),
      { title: "تفاصيل المصروفات", headers: ["التصنيف", "المبلغ"], rows: [["مواد", "٣٥٫٩٠ ر.س"]] },
    ];
    const closingRows = rows.filter(row => /^(إجمالي|المصروفات|صافي)/.test(row.label));
    const page = renderToStaticMarkup(createElement(ServiceFinancialReportPanels, { rows, details, closingRows }));
    assert.ok(page.indexOf('data-testid="service-report-summary"') < page.indexOf('data-testid="service-report-details"'));
    assert.ok(page.indexOf("تفاصيل المصروفات") < page.indexOf("الحسابات الختامية"));
    assert.equal(page.includes("&lt;عميل حجز&gt;"), source !== "quick_sales");
    assert.equal(page.includes("&lt;عميل بيع&gt;"), source !== "bookings");
    for (const forPrint of [false, true]) {
      const html = buildActivitySummaryReportHtml({ title: "التقرير المالي - خدمة", period: "فترة اختبار", activityName: "خدمة",
        fileName: "test.pdf", rows, detailSections: details, closingRows,
        scopeLabel: `نطاق التقرير: ${serviceReportSourceLabels[source]}`, logo: null, css: "", forPrint });
      assert.ok(html.includes(serviceReportSourceLabels[source]));
      assert.ok(html.indexOf("تفاصيل المصروفات") < html.indexOf("الحسابات الختامية"));
      assert.equal(html.includes("&lt;عميل حجز&gt;"), source !== "quick_sales");
      assert.equal(html.includes("&lt;عميل بيع&gt;"), source !== "bookings");
      assert.ok(html.includes("صافي الربح / الدخل النهائي"));
    }
  }
});
