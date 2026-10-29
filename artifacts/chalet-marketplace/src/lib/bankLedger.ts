import { isExpenseInScope, type ExpenseScope } from "./expenseScope";

export type BankLedgerScope = ExpenseScope;

export interface LedgerBooking {
  id: number; submissionId?: number | null; clientName: string; bookingDate: string;
  depositPaid?: string | null; totalPrice?: string | null; balanceCollected: boolean;
  paymentMethod?: string | null; cancelledAt?: string | null;
  insuranceReceived?: boolean | null; insuranceFee?: string | null;
  insurancePaymentMethod?: string | null; insuranceRefunded: boolean;
}
export interface LedgerDeposit {
  id: number; submissionId: number | null; bookingId?: number | null;
  amount: string; note: string | null; createdAt: string;
}
export interface LedgerExpense {
  id: number; submissionId: number | null; providerId?: number | null;
  category: string; customCategory: string | null; dateStr: string; amount: string; notes: string | null;
}
export interface LedgerPayment {
  id: number; bookingId: number; amount: string; paymentDate: string; method: string;
}
export interface LedgerServiceAppointment {
  id: number; providerId: number; clientName: string; dateStr: string;
  deposit: string | null; paymentMethod: string | null; cashDeposited: boolean;
  cancelledAt?: string | null; status: string;
}
export interface LedgerQuickSale {
  id: number; providerId: number; providerName: string; clientName: string;
  dateStr: string; paymentMethod: "cash" | "bank"; status: "completed" | "cancelled"; total: number;
  items: Array<{ name: string; quantity: number }>;
}
export interface BankLedgerEntry {
  id: string; bookingId: number; clientName: string; description: string; bookingDate: string;
  saleId?: number;
  type: "revenue" | "insurance" | "cash_deposit" | "expense";
  amount: number; status: string; insuranceDeposit?: boolean;
}

function cents(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("قيمة مالية غير صالحة في سجل الحساب البنكي");
  return Math.round(amount * 100);
}

/** Build one signed statement. Cash is a bank credit only when actually deposited. */
export function buildBankLedger(input: {
  scope: BankLedgerScope; bookings: LedgerBooking[]; deposits: LedgerDeposit[];
  expenses: LedgerExpense[]; payments: LedgerPayment[]; serviceAppointments?: LedgerServiceAppointment[];
  quickSales?: LedgerQuickSale[];
  categoryLabels?: Record<string, string>;
}): BankLedgerEntry[] {
  const { scope, bookings, deposits, expenses, payments, categoryLabels = {} } = input;
  const entries: BankLedgerEntry[] = [];
  const hasInstallments = new Set(payments.map(payment => payment.bookingId));
  const scopedBookings = scope.type === "service" ? [] : bookings.filter(booking =>
    !booking.cancelledAt && (scope.type === "all" || (
      scope.submissionId != null && booking.submissionId === scope.submissionId
    )));
  const bookingsById = new Map(scopedBookings.map(booking => [booking.id, booking]));
  const isBankMethod = (method: string | null | undefined) => method === "transfer" || method === "pos";

  for (const booking of scopedBookings) {
    const deposit = cents(booking.depositPaid);
    const total = cents(booking.totalPrice) || deposit;
    // Installment rows already represent the balance; never add it again from the booking flag.
    const balance = !hasInstallments.has(booking.id) && booking.balanceCollected ? Math.max(0, total - deposit) : 0;
    if (isBankMethod(booking.paymentMethod) && deposit + balance > 0) {
      entries.push({
        id: `booking-${booking.id}`, bookingId: booking.id, clientName: booking.clientName,
        description: "إيراد حجز — تحويل بنكي / شبكة", bookingDate: booking.bookingDate,
        type: "revenue", amount: (deposit + balance) / 100,
        status: booking.balanceCollected || deposit >= total ? "مكتمل" : "جزئي",
      });
    }
    if (booking.insuranceReceived && cents(booking.insuranceFee) > 0 && (booking.insurancePaymentMethod ?? "transfer") === "transfer") {
      entries.push({
        id: `insurance-${booking.id}`, bookingId: booking.id, clientName: booking.clientName,
        description: "إيداع تأمين — تحويل بنكي", bookingDate: booking.bookingDate, type: "insurance",
        amount: cents(booking.insuranceFee) / 100, status: booking.insuranceRefunded ? "تم الرد" : "محتجز",
      });
    }
  }
  for (const payment of payments) {
    const booking = bookingsById.get(payment.bookingId);
    if (!booking || !isBankMethod(payment.method) || cents(payment.amount) <= 0) continue;
    entries.push({
      id: `payment-${payment.id}`, bookingId: booking.id, clientName: booking.clientName,
      description: "دفعة حجز — تحويل بنكي / شبكة", bookingDate: payment.paymentDate,
      type: "revenue", amount: cents(payment.amount) / 100, status: "مكتمل",
    });
  }
  for (const deposit of deposits) {
    if (scope.type === "service" || (scope.type === "chalet" && (
      scope.submissionId == null || deposit.submissionId !== scope.submissionId
    ))) continue;
    const booking = deposit.bookingId ? bookingsById.get(deposit.bookingId) : undefined;
    const insuranceDeposit = (deposit.note ?? "").replace(/[أإآ]/g, "ا").includes("تامين");
    entries.push({
      id: `deposit-${deposit.id}`, bookingId: deposit.bookingId ?? 0,
      clientName: booking?.clientName ?? "—", description: deposit.note || "إيداع نقدي",
      bookingDate: deposit.createdAt.slice(0, 10), type: "cash_deposit",
      amount: cents(deposit.amount) / 100, status: "تم الإيداع", insuranceDeposit,
    });
  }
  for (const appointment of input.serviceAppointments ?? []) {
    if (scope.type === "chalet" || (scope.type === "service" && appointment.providerId !== scope.id) ||
      appointment.cancelledAt || appointment.status === "cancelled" || cents(appointment.deposit) <= 0) continue;
    if (!isBankMethod(appointment.paymentMethod) && !(appointment.paymentMethod === "cash" && appointment.cashDeposited)) continue;
    entries.push({
      id: `service-${appointment.id}`, bookingId: appointment.id, clientName: appointment.clientName,
      description: "إيراد حجز خدمة", bookingDate: appointment.dateStr, type: "revenue",
      amount: cents(appointment.deposit) / 100, status: "مكتمل",
    });
  }
  for (const expense of expenses) {
    if (!isExpenseInScope(expense, scope)) continue;
    const category = expense.customCategory || categoryLabels[expense.category] || expense.category;
    entries.push({
      id: `expense-${expense.id}`, bookingId: 0, clientName: "—",
      description: [category, expense.notes].filter(Boolean).join(" — "),
      bookingDate: expense.dateStr, type: "expense",
      amount: -Math.abs(cents(expense.amount)) / 100, status: "تم الصرف",
    });
  }
  for (const sale of input.quickSales ?? []) {
    if (scope.type === "chalet" || (scope.type === "service" && sale.providerId !== scope.id) ||
      sale.status !== "completed" || sale.paymentMethod !== "bank" || cents(sale.total) <= 0) continue;
    entries.push({
      id: `quick-sale-${sale.id}`, bookingId: 0, saleId: sale.id, clientName: sale.clientName || "عميل مباشر",
      description: `بيع سريع — تحويل بنكي — ${sale.providerName} — ${sale.items.map(item => `${item.name} × ${item.quantity.toLocaleString("ar-SA", { useGrouping: false })}`).join("، ")}`,
      bookingDate: sale.dateStr, type: "revenue", amount: cents(sale.total) / 100, status: "مكتمل",
    });
  }
  return entries.sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || a.id.localeCompare(b.id));
}

export function bankLedgerTotals(entries: readonly BankLedgerEntry[]) {
  let deposited = 0, withdrawn = 0;
  for (const entry of entries) {
    const amount = cents(entry.amount);
    if (amount < 0) withdrawn -= amount;
    else deposited += amount;
  }
  return { deposited: deposited / 100, withdrawn: withdrawn / 100, balance: (deposited - withdrawn) / 100 };
}

/** Isolate the numeric run with bdi in the UI so a minus sign cannot drift in RTL. */
export function formatBankAmount(amount: number, showPositive = false) {
  const absolute = Math.abs(amount);
  return `${amount < 0 ? "-" : showPositive && amount > 0 ? "+" : ""}${absolute.toLocaleString("ar-SA", {
    minimumFractionDigits: Number.isInteger(absolute) ? 0 : 2, maximumFractionDigits: 2,
  })}`;
}
