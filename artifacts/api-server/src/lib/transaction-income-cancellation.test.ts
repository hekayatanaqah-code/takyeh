import assert from "node:assert/strict";
import { test } from "node:test";
import { serviceTransactionEntries } from "./transaction-income";

test("cancelled future appointments recognize collections and refunds in the same Saudi cancellation period", () => {
  const rows = serviceTransactionEntries([{
    id: 1, providerId: 1, clientName: "عميل تجريبي", dateStr: "2027-05-01",
    amount: "100", deposit: "30", paymentMethod: "cash", paymentReceiptUrl: null,
    cashDeposited: false, status: "cancelled", cancelledAt: new Date("2026-11-01T22:30:00Z"),
    cancelRefundAmount: "10",
  }], new Map([[1, "خدمة تجريبية"]]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2026-11-02");
  assert.equal(rows[1].date, "2026-11-02");
  assert.equal(rows[0].remainingBalance, null);
  assert.equal(rows[0].amount - rows[1].amount, 20);
});
