import assert from "node:assert/strict";
import { it } from "node:test";
import { escapeFinancialReportText, financialReportTitle, scopeServiceFinancialReport, defaultFinancialReportActivity, loneFinancialReportActivity, includeQuickSalesInReport } from "./financialReportActivity";
import { buildActivitySummaryReportHtml } from "./financialReport";
import type { QuickSale } from "@workspace/api-client-react";
import { quickSalesForPeriod } from "./quickSalesRevenue";
import { revenueMonthKey } from "./revenuePeriod";
import { readFileSync } from "node:fs";

it("keeps the service summary before provider and sales details, and waits for booking data", () => {
  const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  const serviceSection = dashboard.slice(dashboard.indexOf("{/* ── Services Report ── */}"), dashboard.indexOf("{/* ── Unified Report ── */}"));
  assert.ok(serviceSection.includes("!serviceDataLoading && !serviceDataError"));
  assert.ok(serviceSection.includes("<ServiceFinancialReportPanels"));
  assert.ok(serviceSection.includes('details={serviceReportMode === "detailed" ? serviceReportDetails : []} closingRows={serviceClosingRows}'));
  assert.ok(dashboard.includes("reportActivityOverride ?? defaultFinancialReportActivity(currentActivity, properties, services)"));
});

it("defaults to the current or lone activity without preventing an explicit all-activity filter", () => {
  const service = { type: "service", id: 10, name: "النشاط الحالي" } as const;
  assert.equal(defaultFinancialReportActivity(service, [], [{ id: 20, businessName: "آخر" }]), service);
  assert.deepEqual(defaultFinancialReportActivity({ type: "all" }, [], [{ id: 10, businessName: "النشاط الحالي" }]), service);
  assert.deepEqual(defaultFinancialReportActivity({ type: "all" }, [{ id: 15, submissionId: 50, nameAr: "عقار" }], []),
    { type: "chalet", id: 15, submissionId: 50, name: "عقار" });
  assert.deepEqual(defaultFinancialReportActivity({ type: "all" }, [], [{ id: 10 }, { id: 20 }]), { type: "all" });
});

it("fixes the sole financial activity and only offers switching for multiple activities", () => {
  const service = loneFinancialReportActivity([], [{ id: 10, businessName: "كيكة الحلون" }]);
  assert.deepEqual(service, { type: "service", id: 10, name: "كيكة الحلون" });
  assert.deepEqual(loneFinancialReportActivity([{ id: 15, submissionId: 50, nameAr: "عقار" }], []),
    { type: "chalet", id: 15, submissionId: 50, name: "عقار" });
  assert.equal(loneFinancialReportActivity([], []), null);
  assert.equal(loneFinancialReportActivity([], [{ id: 10 }, { id: 20 }]), null);
  assert.equal(loneFinancialReportActivity([{ id: 10, submissionId: 50 }], [{ id: 10 }]), null);
  const dashboard = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.ok(dashboard.includes("loneReportActivity ?? (reportActivityOverride ??"));
  const selector = readFileSync(new URL("../components/FinancialReportActivitySelect.tsx", import.meta.url), "utf8");
  const fixedBranch = selector.slice(selector.indexOf("if (loneActivity"), selector.indexOf('<label htmlFor="financial-report-activity"'));
  assert.ok(selector.includes('data-testid="financial-report-activity-fixed"'));
  assert.ok(!fixedBranch.includes("<Select"));
});

it("keeps the current service in a mixed owner's report without changing the property default", () => {
  const properties = [{ id: 10, submissionId: 50, nameAr: "عقار مستقل" }];
  const services = [{ id: 10, businessName: "كيكة الحلون" }, { id: 20, businessName: "خدمة أخرى" }];
  const currentService = { type: "service", id: 10, name: "كيكة الحلون" } as const;
  assert.equal(defaultFinancialReportActivity(currentService, properties, services), currentService);
  const currentProperty = { type: "chalet", id: 10, submissionId: 50, name: "عقار مستقل" } as const;
  assert.equal(defaultFinancialReportActivity(currentProperty, properties, services), currentProperty);
  assert.deepEqual(defaultFinancialReportActivity({ type: "all" }, properties, services), { type: "all" });
});

it("adds cash and bank sales once with exact cents, excluding cancellations and other activities/periods", () => {
  const summary = { totalRevenue: 100.1, totalDeposits: 100.1, totalInsurance: 50, byProvider: [
    { id: 10, name: "خدمة", revenue: 100.1, deposits: 100.1, insurance: 50 },
  ] };
  const sales = [
    { id: 1, providerId: 10, providerName: "خدمة", dateStr: "2026-10-28", total: 25.75, status: "completed", paymentMethod: "bank" },
    { id: 2, providerId: 10, providerName: "خدمة", dateStr: "2026-10-29", total: 10.15, status: "completed", paymentMethod: "cash" },
    { id: 3, providerId: 10, providerName: "خدمة", dateStr: "2026-10-29", total: 999, status: "cancelled" },
    { id: 4, providerId: 20, providerName: "أخرى", dateStr: "2026-10-29", total: 500, status: "completed" },
    { id: 5, providerId: 10, providerName: "خدمة", dateStr: "2025-01-01", total: 500, status: "completed" },
  ] as QuickSale[];
  const service = { type: "service", id: 10, name: "خدمة" } as const;
  for (const calendar of ["gregorian", "hijri"] as const) {
    const month = revenueMonthKey("2026-10-28", calendar);
    const scoped = quickSalesForPeriod(sales, service, { calendar, year: month.slice(0, 4), month });
    const report = includeQuickSalesInReport(summary, scoped)!;
    assert.equal(report.quickSalesRevenue, 35.9);
    assert.equal(report.bookingRevenue, 100.1);
    assert.equal(report.totalRevenue, 136);
    assert.equal(report.byProvider[0].revenue, 136);
    assert.equal(report.totalDeposits, 100.1);
    assert.equal(report.totalInsurance, 50);
    assert.equal(summary.totalRevenue, 100.1);
  }
  const onlySales = includeQuickSalesInReport({ totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [] }, [sales[0]])!;
  assert.equal(onlySales.byProvider[0].revenue, 25.75);
  assert.equal(onlySales.totalRevenue, 25.75);
  assert.equal(includeQuickSalesInReport(undefined, sales), undefined);
});

it("the actual print and PDF templates retain sale details, amounts and safely escaped item/customer text", () => {
  for (const forPrint of [false, true]) {
    const html = buildActivitySummaryReportHtml({
      title: "التقرير المالي - خدمة", period: "جمادى الأولى ١٤٤٨ هـ", activityName: "خدمة",
      fileName: "report.pdf", rows: [
        { label: "المبيعات الفردية (البيع السريع)", amount: 25.75 },
        { label: "إجمالي الإيرادات الموحّدة", amount: 125.85 },
      ],
      details: { title: "تفاصيل المبيعات الفردية (البيع السريع)", headers: ["رقم البيع", "العميل", "البنود", "المبلغ"],
        rows: [["٢٩", "<عميل>", "كيك × ٢", "٢٥٫٧٥ ر.س"]] },
      logo: null, css: "", forPrint,
    });
    assert.ok(html.includes("تفاصيل المبيعات الفردية"));
    assert.ok(html.includes("٢٩"));
    assert.ok(html.includes("&lt;عميل&gt;"));
    assert.ok(html.includes("كيك × ٢"));
    assert.ok(html.includes("٢٥٫٧٥"));
    assert.ok(html.includes("١٢٥٫٨٥"));
    assert.ok(html.indexOf("إجمالي الإيرادات الموحّدة") < html.indexOf("تفاصيل المبيعات الفردية"));
    assert.equal(html.includes("window.print()"), forPrint);
  }
});

it("defaults the report title to all activities and uses the exact selected activity name", () => {
  assert.equal(financialReportTitle({ type: "all" }), "التقرير المالي - جميع الأنشطة");
  assert.equal(financialReportTitle({ type: "chalet", id: 10, submissionId: 99, name: "شاليه الياسمين" }), "التقرير المالي - شاليه الياسمين");
  assert.equal(financialReportTitle({ type: "service", id: 10, name: "ضيافة النخيل" }), "التقرير المالي - ضيافة النخيل");
  assert.equal(escapeFinancialReportText('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

it("scopes service totals to the selected provider without mixing matching property IDs or mutating cached all-activity data", () => {
  const summary = { totalRevenue: 1200, totalDeposits: 1000, totalInsurance: 90, byProvider: [
    { id: 10, name: "الأولى", revenue: 300, deposits: 200, insurance: 20 },
    { id: 99, name: "الثانية", revenue: 900, deposits: 800, insurance: 70 },
  ] };
  assert.equal(scopeServiceFinancialReport(summary, { type: "all" }), summary);
  assert.deepEqual(scopeServiceFinancialReport(summary, { type: "service", id: 10, name: "الأولى" }), {
    totalRevenue: 300, totalDeposits: 200, totalInsurance: 20, byProvider: [summary.byProvider[0]],
  });
  assert.deepEqual(scopeServiceFinancialReport(summary, { type: "service", id: 500, name: "بدون بيانات" }), {
    totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [],
  });
  assert.equal(summary.byProvider.length, 2);
  assert.equal(summary.totalRevenue, 1200);
});

it("exports the chosen activity title, clear totals and accounting losses in the actual report template", () => {
  const title = financialReportTitle({ type: "service", id: 10, name: "ضيافة النخيل" });
  const html = buildActivitySummaryReportHtml({
    title, period: "جمادى الأولى ١٤٤٨ هـ", activityName: "ضيافة النخيل", fileName: "report.pdf",
    rows: [{ label: "إجمالي الإيرادات", amount: 300 }, { label: "صافي الربح", amount: -150 }],
    logo: null, forPrint: false, css: "",
  });
  assert(html.includes(title));
  assert(html.includes('class="financial-total"'));
  assert(html.includes('class="financial-net"'));
  assert(html.includes("financial-negative"));
  assert(html.includes("<bdi dir=\"ltr\">-١٥٠</bdi>"));
  assert(!html.includes("شاليه الياسمين"));
});
