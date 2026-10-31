import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuickSale } from "@workspace/api-client-react";
import { buildServiceFinancialReport, serviceExpensesForPeriod, serviceReportRows, serviceReportSourceLabels,
  serviceBookingReport, serviceSalesForPaymentFilter, serviceReportDate, serviceReportStatus,
  serviceReportPaymentLabels, serviceReportPeriodForView, type ServiceReportBooking } from "./serviceFinancialReport";
import { readFileSync } from "node:fs";
import { revenueMonthKey } from "./revenuePeriod";
import { buildActivitySummaryReportHtml } from "./financialReport";
import { ServiceFinancialReportPanels } from "../components/owner/ServiceFinancialReportPanels";
import { ServiceReportFilters } from "../components/owner/ServiceReportFilters";
import { quickSalesForPeriod } from "./quickSalesRevenue";
import { isInRevenuePeriod } from "./revenuePeriod";

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

const appointments: ServiceReportBooking[] = [
  { id: 101, providerId: 10, dateStr: "2026-10-28", status: "confirmed", amount: "100.10", deposit: "25.05", insuranceAmount: "500" },
  { id: 102, providerId: 10, dateStr: "2026-10-28", status: "confirmed", amount: "80.20", deposit: "80.20", insuranceAmount: "1000" },
  { id: 103, providerId: 10, dateStr: "2026-10-28", status: "pending", amount: "60", deposit: "0", insuranceAmount: "700" },
  { id: 104, providerId: 10, dateStr: "2026-10-28", status: "cancelled", amount: "500", deposit: "400", insuranceAmount: "300" },
  { id: 105, providerId: 20, dateStr: "2026-10-28", status: "confirmed", amount: "900", deposit: "900" },
  { id: 106, providerId: 10, dateStr: "2026-12-28", status: "confirmed", amount: "900", deposit: "900" },
];

it("uses the identical service, period and payment selection for booking totals and details in either calendar", () => {
  const original = JSON.stringify(appointments);
  for (const calendar of ["gregorian", "hijri"] as const) {
    const month = calendar === "gregorian" ? "2026-10" : revenueMonthKey("2026-10-28", "hijri");
    const period = { calendar, year: month.slice(0, 4), month };
    const expected = {
      all: { ids: [101, 102, 103], collected: 105.25, contractual: 240.3, outstanding: 135.05, insurance: 2200 },
      unpaid: { ids: [101, 103], collected: 25.05, contractual: 160.1, outstanding: 135.05, insurance: 1200 },
      paid: { ids: [102], collected: 80.2, contractual: 80.2, outstanding: 0, insurance: 1000 },
    };
    for (const payment of ["all", "unpaid", "paid"] as const) {
      const selected = serviceBookingReport(appointments, 10, period, payment);
      const wanted = expected[payment];
      assert.equal(selected.hasInvalidAmounts, false);
      assert.deepEqual(selected.bookings.map(booking => booking.id), wanted.ids);
      assert.equal(selected.summary.totalRevenue, wanted.collected);
      assert.equal(selected.summary.totalContractValue, wanted.contractual);
      assert.equal(selected.summary.totalOutstanding, wanted.outstanding);
      assert.equal(selected.summary.totalInsurance, wanted.insurance);
      const noInsurance = serviceBookingReport(appointments.map(booking => ({ ...booking, insuranceAmount: "0" })), 10, period, payment);
      assert.equal(noInsurance.summary.totalRevenue, wanted.collected);
      assert.equal(noInsurance.summary.totalOutstanding, wanted.outstanding);
      for (const source of ["all", "bookings", "quick_sales"] as const) {
        const filteredSales = serviceSalesForPaymentFilter(sales, payment);
        const report = buildServiceFinancialReport(selected.summary, filteredSales, expenses.slice(0, 2), source)!;
        const bookingRevenue = source === "quick_sales" ? 0 : wanted.collected;
        const saleRevenue = source === "bookings" || payment === "unpaid" ? 0 : 35.9;
        assert.equal(report.totalRevenue, Math.round((bookingRevenue + saleRevenue) * 100) / 100);
        assert.equal(report.totalOutstanding, source === "quick_sales" ? 0 : wanted.outstanding);
        assert.equal(report.totalExpenses, 35.9);
        assert.equal(report.netProfit, (Math.round(report.totalRevenue * 100) - 3590) / 100);
        assert.equal(report.totalContractValue, Math.round(((source === "quick_sales" ? 0 : wanted.contractual) + saleRevenue) * 100) / 100);
        assert.equal(serviceReportRows(report, source, "compact").length, 5);
      }
    }
  }
  assert.equal(JSON.stringify(appointments), original);
});

it("flags missing or invalid booking prices rather than reporting fake zeros", () => {
  for (const amount of [null, "", "not-a-number", "-1"]) {
    const selected = serviceBookingReport([{ ...appointments[0], amount }], 10, {
      calendar: "gregorian", year: "2026", month: "2026-10",
    }, "all");
    assert.equal(selected.hasInvalidAmounts, true);
  }
});

it("compact/detailed page and print exports retain the same closing amounts and only detailed mode includes requests", () => {
  const selected = serviceBookingReport(appointments, 10, { calendar: "gregorian", year: "2026", month: "2026-10" }, "all");
  const report = buildServiceFinancialReport(selected.summary, serviceSalesForPaymentFilter(sales, "all"), expenses.slice(0, 2), "all")!;
  const detail = { title: "تفاصيل الطلبات", headers: ["رقم", "الحالة", "قيمة الحجز", "المحصّل", "المتبقي"], rows: [
    ["١٠١", serviceReportStatus("confirmed"), "١٠٠٫١٠", "٢٥٫٠٥", "٧٥٫٠٥"],
  ] };
  for (const mode of ["compact", "detailed"] as const) {
    const rows = serviceReportRows(report, "all", mode);
    const closingRows = serviceReportRows(report, "all", "compact");
    const details = mode === "detailed" ? [detail] : [];
    const page = renderToStaticMarkup(createElement(ServiceFinancialReportPanels, { rows, details, closingRows }));
    assert.equal(page.includes(detail.title), mode === "detailed");
    assert.ok(page.includes("المبالغ المتبقية"));
    assert.ok(page.includes("القيمة التعاقدية"));
    for (const forPrint of [false, true]) {
      const html = buildActivitySummaryReportHtml({
        title: "التقرير المالي", period: serviceReportDate("2026-10-28", true), activityName: "خدمة",
        fileName: "٢٠٢٦-١٠.pdf", rows, closingRows, detailSections: mode === "detailed" ? details : undefined,
        scopeLabel: `حالة السداد: ${serviceReportPaymentLabels.all}`, logo: null, css: "", forPrint,
      });
      assert.equal(html.includes(detail.title), mode === "detailed");
      assert.ok(html.includes("المبالغ المتبقية"));
      assert.ok(html.includes("صافي الربح / الدخل النهائي"));
      assert.ok(!html.includes("confirmed"));
      assert.ok(!html.includes("October"));
    }
  }
});

it("uses Arabic statuses and numeric dual-calendar dates in report output and wires all controls to that output", () => {
  for (const firstHijri of [true, false]) {
    const date = serviceReportDate("2026-10-28", firstHijri);
    assert.ok(!/[A-Za-z]/.test(date));
    assert.ok(date.includes("هـ") && date.includes("م"));
    assert.match(date, /[٠-٩]/);
  }
  for (const status of ["confirmed", "pending", "cancelled", "legacy_internal_status"]) {
    assert.ok(!/[A-Za-z]/.test(serviceReportStatus(status)));
  }
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('useState<ServiceReportMode>("compact")'));
  assert.ok(source.includes("onPaymentChange={setServiceReportPayment}"));
  assert.ok(source.includes("serviceReportRows(serviceClosing, serviceReportSource, serviceReportMode)"));
  assert.ok(source.includes('detailSections: serviceReportMode === "detailed" ? serviceReportDetails : undefined'));
  assert.ok(source.includes('expense.customCategory || catMap[expense.category]?.label || "أخرى"'));
  assert.ok(source.includes("serviceReportSource, serviceReportPayment, serviceReportMode, showPropertyReportDetails"));
});

it("uses monthly, annual and inclusive custom periods for all service sources in either calendar", () => {
  const dates = ["2025-12-31", "2026-01-01", "2026-10-28", "2026-12-31", "2027-01-01"];
  const bookings = dates.map((dateStr, index) => ({
    id: index, providerId: 10, dateStr, status: "confirmed", amount: "100", deposit: "60", insuranceAmount: "500",
  }));
  const recordedExpenses = dates.map((dateStr, id) => ({ id, providerId: 10, dateStr, amount: "10", category: "other" }));
  const recordedSales = dates.map((dateStr, id) => ({
    id, providerId: 10, dateStr, total: 20, status: "completed", providerName: "خدمة",
  })) as QuickSale[];
  for (const calendar of ["hijri", "gregorian"] as const) {
    const month = revenueMonthKey("2026-10-28", calendar);
    const year = month.slice(0, 4);
    for (const mode of ["monthly", "yearly", "custom"] as const) {
      const period = serviceReportPeriodForView(mode, calendar, month, year, "2026-01-01", "2026-12-31");
      const expectedDates = dates.filter(date => mode === "custom"
        ? date >= "2026-01-01" && date <= "2026-12-31"
        : mode === "monthly" ? revenueMonthKey(date, calendar) === month : revenueMonthKey(date, calendar).startsWith(`${year}-`));
      const selected = serviceBookingReport(bookings, 10, period, "all");
      const selectedExpenses = serviceExpensesForPeriod(recordedExpenses, 10, period);
      const selectedSales = quickSalesForPeriod(recordedSales, { type: "service", id: 10, name: "خدمة" }, period);
      assert.deepEqual(selected.bookings.map(row => row.dateStr), expectedDates);
      assert.deepEqual(selectedExpenses.map(row => row.dateStr), expectedDates);
      assert.deepEqual(selectedSales.map(row => row.dateStr), expectedDates);
      const report = buildServiceFinancialReport(selected.summary, selectedSales, selectedExpenses, "all")!;
      assert.equal(report.totalRevenue, expectedDates.length * 80);
      assert.equal(report.netProfit, expectedDates.length * 70);
      assert.equal(report.totalOutstanding, expectedDates.length * 40);
      for (const forPrint of [true, false]) {
        const html = buildActivitySummaryReportHtml({ title: "التقرير المالي", period: mode === "yearly" ? `عام ${year}` : "فترة مختارة",
          activityName: "خدمة", fileName: "تقرير.pdf", rows: serviceReportRows(report, "all", "compact"),
          logo: null, css: "", forPrint });
        assert.ok(html.includes("صافي الربح / الدخل النهائي"));
      }
    }
  }
});

it("keeps Hijri annual boundaries distinct from Gregorian years and rejects incomplete custom ranges", () => {
  const lastDay = "2026-06-15";
  const nextDay = "2026-06-16";
  assert.notEqual(revenueMonthKey(lastDay, "hijri").slice(0, 4), revenueMonthKey(nextDay, "hijri").slice(0, 4));
  const period = serviceReportPeriodForView("yearly", "hijri", "", revenueMonthKey(lastDay, "hijri").slice(0, 4), "", "");
  assert.equal(isInRevenuePeriod(lastDay, period), true);
  assert.equal(isInRevenuePeriod(nextDay, period), false);
  for (const [from, to] of [["", ""], ["2026-01-01", ""], ["", "2026-01-02"], ["2026-01-03", "2026-01-01"]]) {
    assert.equal(isInRevenuePeriod("2026-01-02", serviceReportPeriodForView("custom", "hijri", "", "", from, to)), false);
  }
  const oneDay = serviceReportPeriodForView("custom", "hijri", "", "", lastDay, lastDay);
  assert.equal(isInRevenuePeriod(lastDay, oneDay), true);
  assert.equal(isInRevenuePeriod(nextDay, oneDay), false);
});

it("groups service filters with readable explanations and connects periods to page/export readiness", () => {
  for (const mode of ["compact", "detailed"] as const) {
    const html = renderToStaticMarkup(createElement(ServiceReportFilters, {
      source: "all", payment: "all", mode, disabled: true,
      onSourceChange() {}, onPaymentChange() {}, onModeChange() {},
    }));
    for (const label of ["نطاق التقرير", "حالة السداد", "طريقة العرض", "مختصر", "تفصيلي", "تُطبّق هذه الخيارات"]) assert.ok(html.includes(label));
    assert.ok(html.includes("text-base font-medium leading-8 text-foreground"));
    assert.ok(html.includes('data-testid="service-report-source"'));
    assert.match(html, new RegExp(`aria-pressed="true" data-testid="service-report-mode-${mode}"`));
    assert.ok(html.includes("<fieldset disabled="));
  }
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('(repUnit.type === "service" || !isActivitySummary) && <ServiceReportPeriodControls'));
  const controls = readFileSync(new URL("../components/owner/ServiceReportPeriodControls.tsx", import.meta.url), "utf8");
  assert.ok(controls.includes('annual={props.mode === "yearly"} prominent'));
  assert.ok(controls.includes('service-report-period-${mode}'));
  assert.ok(controls.includes('props.mode === "yearly" ? "grid-cols-2" : "grid-cols-3"'));
  assert.ok(controls.includes("min-h-24"));
  assert.equal((controls.match(/<CalendarDays /g) ?? []).length, 2);
  assert.ok(controls.includes('placeholder="اضغط لاختيار تاريخ البداية"'));
  assert.ok(controls.includes('placeholder="اضغط لاختيار تاريخ النهاية"'));
  assert.ok(controls.includes("selectOnOpen={false}"));
  assert.ok(controls.includes("maxDate={props.to || props.today}"));
  assert.ok(controls.includes("minDate={props.from || props.earliestDate || undefined}"));
  assert.ok(source.includes('repUnit.type === "service" ? servicePeriodReady'));
  assert.ok(source.includes("period: servicePeriodLabel"));
  assert.ok(source.includes("isYearlyHijri, customFrom, customTo, selectedSubmissionId"));
  assert.ok(source.includes('repUnit.type === "service" && servicePeriodReady && serviceClosing'));
});

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
