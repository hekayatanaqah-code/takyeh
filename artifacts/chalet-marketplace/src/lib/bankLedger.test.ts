import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bankLedgerTotals, buildBankLedger, formatBankAmount,
  type LedgerBooking, type LedgerExpense, type LedgerDeposit, type LedgerQuickSale,
} from "./bankLedger";

const booking = (patch: Partial<LedgerBooking> = {}): LedgerBooking => ({
  id: 171, submissionId: 7, clientName: "عميل اختبار", bookingDate: "2026-10-18",
  depositPaid: "500", totalPrice: "1000", balanceCollected: false,
  paymentMethod: "transfer", insuranceRefunded: false, ...patch,
});
const expense = (patch: Partial<LedgerExpense> = {}): LedgerExpense => ({
  id: 1, submissionId: 7, providerId: null, category: "maintenance", customCategory: null,
  dateStr: "2026-10-18", amount: "150", notes: "إصلاح المضخة", ...patch,
});
const deposit = (patch: Partial<LedgerDeposit> = {}): LedgerDeposit => ({
  id: 1, submissionId: 7, bookingId: 171, amount: "200", note: "إيداع تأمين كاش — عميل اختبار",
  createdAt: "2026-10-18T08:00:00Z", ...patch,
});
function build(options: Partial<Parameters<typeof buildBankLedger>[0]> = {}) {
  return buildBankLedger({
    scope: { type: "all" }, bookings: [booking()], deposits: [], expenses: [],
    payments: [], categoryLabels: { maintenance: "الصيانة", withdrawal: "مسحوبات شخصية" }, ...options,
  });
}

test("bank summary equals deposited income minus recorded expenses", () => {
  const rows = build({ deposits: [deposit()], expenses: [expense()] });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 700, withdrawn: 150, balance: 550 });
  const debit = rows.find(row => row.type === "expense")!;
  assert.equal(debit.amount, -150);
  assert.equal(debit.description, "الصيانة — إصلاح المضخة");
});

test("expense-only account shows a negative balance and includes personal withdrawals", () => {
  const rows = build({ bookings: [], expenses: [expense(), expense({ id: 2, category: "withdrawal", amount: "25" })] });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 0, withdrawn: 175, balance: -175 });
  assert.ok(rows.every(row => row.type === "expense" && row.amount < 0));
});

test("insurance cash deposits have a nonempty insurance badge classification and booking link", () => {
  const row = build({ deposits: [deposit()] }).find(row => row.id === "deposit-1")!;
  assert.equal(row.insuranceDeposit, true);
  assert.equal(row.bookingId, 171);
  assert.equal(row.clientName, "عميل اختبار");
  assert.match(row.description, /تأمين/);
  assert.equal(build({ deposits: [deposit({ note: null })] }).find(row => row.id === "deposit-1")!.insuranceDeposit, false);
});

test("unbanked cash is excluded; a cash deposit log is counted exactly once", () => {
  const cashBooking = booking({ paymentMethod: "cash", balanceCollected: true });
  assert.equal(build({ bookings: [cashBooking] }).length, 0);
  const rows = build({ bookings: [cashBooking], deposits: [deposit({ amount: "1000", note: "إيداع نقدي" })] });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 1000, withdrawn: 0, balance: 1000 });
});

test("installments suppress inferred legacy balance and respect each payment method", () => {
  const rows = build({
    bookings: [booking({ balanceCollected: true })],
    payments: [
      { id: 1, bookingId: 171, amount: "350", method: "transfer", paymentDate: "2026-10-19" },
      { id: 2, bookingId: 171, amount: "150", method: "cash", paymentDate: "2026-10-20" },
    ],
  });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 850, withdrawn: 0, balance: 850 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].bookingDate, "2026-10-19");
});

test("legacy full bank payments continue to include deposit plus balance", () => {
  assert.equal(bankLedgerTotals(build({ bookings: [booking({ balanceCollected: true })] })).deposited, 1000);
});

test("property scope excludes other properties and services but retains owner-level expenses", () => {
  const rows = build({
    scope: { type: "chalet", submissionId: 7 },
    bookings: [booking(), booking({ id: 172, submissionId: 8 })],
    deposits: [deposit(), deposit({ id: 2, submissionId: 8 })],
    expenses: [expense(), expense({ id: 2, submissionId: 8 }), expense({ id: 3, submissionId: null, category: "salaries", amount: "50" }), expense({ id: 4, submissionId: null, providerId: 9 })],
  });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 700, withdrawn: 200, balance: 500 });
  assert.equal(build({ scope: { type: "chalet" } }).length, 0);
});

test("service scope cannot leak property records or another provider", () => {
  const service = { id: 1, providerId: 9, clientName: "عميل خدمة", dateStr: "2026-10-18", deposit: "600", paymentMethod: "transfer", cashDeposited: false, status: "confirmed" };
  const rows = build({
    scope: { type: "service", id: 9 }, deposits: [deposit()],
    serviceAppointments: [service, { ...service, id: 2, providerId: 10 }],
    expenses: [expense(), expense({ id: 2, submissionId: null, providerId: 9, amount: "100" })],
  });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 600, withdrawn: 100, balance: 500 });
  assert.ok(rows.every(row => row.id === "service-1" || row.id === "expense-2"));
});

test("consolidated balance includes each provider once and removes uncollected/cancelled rows", () => {
  const service = { id: 1, providerId: 9, clientName: "عميل خدمة", dateStr: "2026-10-18", deposit: "400", paymentMethod: "cash", cashDeposited: true, status: "confirmed" };
  const rows = build({
    bookings: [booking(), booking({ id: 172, cancelledAt: "2026-10-18" })],
    serviceAppointments: [service, { ...service, id: 2, cashDeposited: false }, { ...service, id: 3, status: "cancelled" }],
  });
  assert.equal(bankLedgerTotals(rows).deposited, 900);
});

test("halalas are retained and empty balances stay zero", () => {
  assert.deepEqual(bankLedgerTotals(build({ bookings: [] })), { deposited: 0, withdrawn: 0, balance: 0 });
  assert.deepEqual(bankLedgerTotals(build({ bookings: [booking({ depositPaid: "125.50" })], expenses: [expense({ amount: "0.20" })] })), {
    deposited: 125.5, withdrawn: 0.2, balance: 125.3,
  });
});

test("signed Eastern-Arabic presentation has a stable leading minus and retained halalas", () => {
  assert.equal(formatBankAmount(-150), "-١٥٠");
  assert.equal(formatBankAmount(-125.5), "-١٢٥٫٥٠");
  assert.equal(formatBankAmount(150, true), "+١٥٠");
});

test("changing table filters cannot mutate the all-time summary input", () => {
  const rows = build({ expenses: [expense()] });
  const before = bankLedgerTotals(rows);
  const debits = rows.filter(row => row.type === "expense");
  assert.equal(bankLedgerTotals(debits).balance, -150);
  assert.deepEqual(bankLedgerTotals(rows), before);
});

const quickSale = (patch: Partial<LedgerQuickSale> = {}): LedgerQuickSale => ({
  id: 171, providerId: 9, providerName: "نشاط اختباري", clientName: "عميل بيع مباشر",
  dateStr: "2025-01-01", paymentMethod: "bank", status: "completed", total: 125.75,
  items: [{ name: "منتج اختباري", quantity: 2 }], ...patch,
});

test("bank quick sales credit the ledger once alongside bookings with distinct identities and full details", () => {
  const rows = build({ quickSales: [quickSale()], expenses: [expense({ amount: "25.50" })] });
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 625.75, withdrawn: 25.5, balance: 600.25 });
  const row = rows.find(entry => entry.id === "quick-sale-171")!;
  assert.equal(row.saleId, 171);
  assert.equal(row.bookingId, 0);
  assert.equal(row.clientName, "عميل بيع مباشر");
  assert.equal(row.bookingDate, "2025-01-01");
  assert.equal(row.type, "revenue");
  assert.match(row.description, /بيع سريع — تحويل بنكي — نشاط اختباري — منتج اختباري × ٢/);
  assert.equal(rows.filter(entry => entry.id === "booking-171").length, 1);
});

test("cash and cancelled quick sales never add a bank credit", () => {
  const rows = build({ bookings: [], quickSales: [
    quickSale({ paymentMethod: "cash" }), quickSale({ id: 172, status: "cancelled" }),
  ] });
  assert.equal(rows.length, 0);
  assert.deepEqual(bankLedgerTotals(rows), { deposited: 0, withdrawn: 0, balance: 0 });
});

test("bank quick sales respect provider, property and consolidated scopes", () => {
  const sales = [quickSale(), quickSale({ id: 172, providerId: 10, total: 50.25 })];
  const rows = build({ scope: { type: "service", id: 9 }, quickSales: sales });
  assert.equal(rows.length, 1);
  assert.equal(bankLedgerTotals(rows).balance, 125.75);
  assert.equal(build({ bookings: [], scope: { type: "chalet", submissionId: 7 }, quickSales: sales }).length, 0);
  assert.equal(bankLedgerTotals(build({ bookings: [], quickSales: sales })).balance, 176);
});

test("cancellation removes the sale credit and full-history balance is independent of the table period", () => {
  const args = { bookings: [], expenses: [expense({ amount: "25.50" })] };
  const before = build({ ...args, quickSales: [quickSale()] });
  assert.equal(bankLedgerTotals(before).balance, 100.25);
  assert.equal(before.filter(entry => entry.bookingDate.startsWith("2026")).some(entry => entry.saleId), false);
  assert.equal(bankLedgerTotals(before).deposited, 125.75);
  const after = build({ ...args, quickSales: [quickSale({ status: "cancelled" })] });
  assert.deepEqual(bankLedgerTotals(after), { deposited: 0, withdrawn: 25.5, balance: -25.5 });
});
