import assert from "node:assert/strict";
import { it } from "node:test";
import { propertyBookingBreakdown, propertyReportDetailsHtml } from "./propertyFinancialReport";
import { buildActivitySummaryReportHtml, finalizeFinancialReportHtml } from "./financialReport";

const booking = { id: 1, clientName: "<عميل>", bookingDate: "2026-10-01",
  totalPrice: "500.75", depositPaid: "100.25", balanceCollected: false,
  bookedAddons: [{ price: "50.15", unit: "حبة" }, { price: "5", unit: "خدمة مجانية" }] };
it("separates quoted rent/services from collections, retaining halalas and excluding cancellations", () => {
  const result = propertyBookingBreakdown([booking, { ...booking, id: 2, cancelledAt: "2026-10-02" }]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.totBase, 450.6);
  assert.equal(result.totSvc, 50.15);
  assert.equal(result.totTotal, 500.75);
  assert.equal(result.totCollected, 100.25);
});
it("counts fully collected and legacy bookings without counting add-ons twice", () => {
  const result = propertyBookingBreakdown([{ ...booking, balanceCollected: true },
    { ...booking, id: 2, totalPrice: null, revenueAmount: "25.25", bookedAddons: [] }]);
  assert.equal(result.totCollected, 526);
  assert.equal(result.totTotal, 526);
});
it("renders booking details, final accounts and safe customer text in both report paths", () => {
  const details = propertyReportDetailsHtml(propertyBookingBreakdown([booking]),
    { totalRevenue: 110.25, totalExpenses: 120.5, netProfit: -10.25, totalInsuranceDeducted: 10, totalWithdrawals: 20 },
    date => date);
  const monthly = finalizeFinancialReportHtml(`<html><head></head><body>${details}</body></html>`);
  const unified = buildActivitySummaryReportHtml({ title: "التقرير المالي", period: "الشهر",
    activityName: "جميع الأنشطة", fileName: "report.pdf", rows: [], forPrint: true, logo: null, css: "",
    propertyDetailsHtml: details });
  for (const html of [monthly, unified]) {
    for (const label of ["تفصيل الحجوزات", "قيمة الإيجار", "رسوم الخدمات", "المحصّل", "الحسابات الختامية", "صافي الربح النهائي", "مسحوبات شخصية"])
      assert.ok(html.includes(label));
    assert.ok(html.includes("&lt;عميل&gt;"));
    assert.ok(!html.includes("<عميل>"));
    assert.ok(html.includes("financial-negative"));
  }
});
it("keeps expenses and negative profit visible in a month without bookings", () => {
  const html = propertyReportDetailsHtml(propertyBookingBreakdown([]),
    { totalRevenue: 0, totalExpenses: 25, netProfit: -25 }, date => date);
  assert.ok(html.includes("لا توجد حجوزات"));
  assert.ok(html.includes("صافي الربح النهائي"));
});
