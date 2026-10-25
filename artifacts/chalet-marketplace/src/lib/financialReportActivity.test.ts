import assert from "node:assert/strict";
import { it } from "node:test";
import { escapeFinancialReportText, financialReportTitle, scopeServiceFinancialReport } from "./financialReportActivity";
import { buildActivitySummaryReportHtml } from "./financialReport";

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
