import assert from "node:assert/strict";
import { test } from "node:test";
import { ledgerDate, monetaryCents, quickSaleTransactionEntries, serviceTransactionEntries } from "./transaction-income";

const appointment = {
  id: 1, providerId: 9, clientName: "عميل اختبار", dateStr: "2026-11-01",
  amount: "1000.00", deposit: "350.50", paymentMethod: "cash", paymentReceiptUrl: null,
  cashDeposited: false, status: "confirmed", cancelledAt: null, cancelRefundAmount: "0",
};
test("service rows use cumulative principal once and separate remaining contractual balances", () => {
  const rows = serviceTransactionEntries([appointment], new Map([[9, "نشاط اختبار"]]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 350.5);
  assert.equal(rows[0].remainingBalance, 649.5);
  assert.equal(rows[0].cashDeposited, false);
});
test("service cancellation retains received principal, records the refund, and removes receivables", () => {
  const rows = serviceTransactionEntries([{ ...appointment, status: "cancelled", cancelRefundAmount: "100.25",
    cancelledAt: new Date("2026-10-31T22:00:00Z") }], new Map());
  assert.equal(rows[0].amount, 350.5);
  assert.equal(rows[0].remainingBalance, null);
  assert.equal(rows[1].type, "refund");
  assert.equal(rows[1].amount, 100.25);
  assert.equal(rows[1].date, "2026-11-01");
});
test("both cash and bank sales retain their real source and cancellations are visibly excluded", () => {
  const rows = quickSaleTransactionEntries([{ id: 1, providerId: 9, providerName: "اختبار", clientName: "عميل",
    dateStr: "2026-11-01", total: "125.75", paymentMethod: "bank", status: "cancelled" }]);
  assert.equal(rows[0].method, "transfer");
  assert.equal(rows[0].status, "cancelled");
  assert.equal(rows[0].amount, 125.75);
  assert.equal(ledgerDate("2026-11-01"), "2026-11-01");
  assert.equal(monetaryCents("0.29"), 29);
  assert.throws(() => monetaryCents("not-a-number"));
});
