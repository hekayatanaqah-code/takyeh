import assert from "node:assert/strict";
import { test } from "node:test";
import { financialEventDate, propertyPrincipal, servicePrincipal, isPropertyExpense } from "./financialPrincipal";
import { saudiWhatsappPhone } from "./saudiPhone";
import { serviceBookingReport } from "./serviceFinancialReport";
test("retained property and service cancellations are principal, never future debt or insurance", () => {
  const property = propertyPrincipal({ bookingDate: "2026-12-11", totalPrice: "500", depositPaid: "200",
    cancelledAt: "2026-11-02T09:00:00Z", cancelIncome: "200", cancelRefundAmount: "0" });
  const service = servicePrincipal({ dateStr: "2026-12-12", amount: "100", deposit: "30",
    status: "cancelled", cancelledAt: "2026-11-02T09:00:00Z", cancelRefundAmount: "0" });
  assert.deepEqual(property, { collected: 200, contractual: 200, outstanding: 0, date: "2026-11-02" });
  assert.deepEqual(service, { collected: 30, contractual: 30, outstanding: 0, date: "2026-11-02" });
  assert.equal(servicePrincipal({ amount: "100", deposit: "30", status: "cancelled", cancelRefundAmount: "30" }).collected, 0);
  assert.equal(propertyPrincipal({ depositPaid: "200", cancelledAt: "2026-11-02", cancelIncome: "0" }).collected, 0);
});
test("Saudi midnight and partial refunds retain the correct date and amount", () => {
  assert.equal(financialEventDate("2026-11-01T22:30:00Z"), "2026-11-02");
  assert.equal(servicePrincipal({ status: "cancelled", deposit: "30.50", cancelRefundAmount: "10.25" }).collected, 20.25);
  assert.equal(isPropertyExpense({ providerId: 421 }), false);
  assert.equal(isPropertyExpense({ providerId: null }), true);
});
test("legacy recorded revenue is not discarded because an old booking has a zero deposit", () => {
  assert.equal(propertyPrincipal({ totalPrice: null, depositPaid: "0", revenueAmount: "70.50" }).collected, 70.50);
  assert.equal(propertyPrincipal({ totalPrice: null, depositPaid: "0", revenueAmount: "70.50",
    cancelledAt: "2026-11-02", cancelRefundAmount: "20.25" }).collected, 50.25);
  assert.equal(propertyPrincipal({ totalPrice: "500", balanceCollected: true, depositPaid: "200",
    cancelledAt: "2026-11-02", cancelRefundAmount: "50" }).collected, 450);
});
test("service report includes retained money on cancellation date and respects payment scope", () => {
  const bookings = [
    { id: 1, providerId: 421, dateStr: "2026-11-05", status: "confirmed", amount: "100", deposit: "40", insuranceAmount: "20" },
    { id: 2, providerId: 421, dateStr: "2026-12-01", cancelledAt: "2026-11-02", status: "cancelled", amount: "100", deposit: "30", insuranceAmount: "20", cancelRefundAmount: "0" },
  ];
  const period = { calendar: "gregorian", year: "2026", month: "2026-11" } as const;
  const all = serviceBookingReport(bookings, 421, period, "all").summary;
  assert.equal(all.totalRevenue, 70);
  assert.equal(all.totalContractValue, 130);
  assert.equal(all.totalOutstanding, 60);
  assert.equal(all.totalInsurance, 20);
  assert.equal(serviceBookingReport(bookings, 421, period, "paid").summary.totalRevenue, 30);
  assert.equal(serviceBookingReport(bookings, 421, period, "unpaid").summary.totalRevenue, 40);
});
test("official WhatsApp accepts Arabic/Persian/local/international numbers without a fake fallback", () => {
  for (const input of ["٠٥٠٠٠٠٠٠٠٠", "۰۵۰۰۰۰۰۰۰۰", "+966 50 000 0000", "00966500000000"]) {
    assert.equal(saudiWhatsappPhone(input), "966500000000");
  }
  assert.equal(saudiWhatsappPhone(""), null);
  assert.equal(saudiWhatsappPhone("123"), null);
});
