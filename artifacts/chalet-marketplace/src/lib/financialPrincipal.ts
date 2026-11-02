/** Refundable insurance is deliberately absent from these principal calculations. */
export function financialEventDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
type Property = {
  bookingDate?: string; cancelledAt?: string | Date | null;
  totalPrice?: string | number | null; revenueAmount?: string | number | null;
  depositPaid?: string | number | null; balanceCollected?: boolean | null;
  cancelIncome?: string | number | null; cancelRefundAmount?: string | number | null;
};
export function propertyPrincipal(b: Property) {
  const total = Number(b.totalPrice ?? b.revenueAmount ?? b.depositPaid ?? 0);
  const paid = b.totalPrice == null ? Number(b.revenueAmount ?? b.depositPaid ?? 0)
    : b.balanceCollected ? total : Number(b.depositPaid ?? 0);
  const collected = b.cancelledAt ? Math.max(0, Number(b.cancelIncome ?? (paid - Number(b.cancelRefundAmount ?? 0)))) : paid;
  return { collected, contractual: b.cancelledAt ? collected : total,
    outstanding: b.cancelledAt ? 0 : Math.max(0, total - collected),
    date: b.cancelledAt ? financialEventDate(b.cancelledAt) : b.bookingDate ?? "" };
}
type Service = { dateStr?: string | null; status?: string | null; cancelledAt?: string | Date | null;
  amount?: string | number | null; deposit?: string | number | null; cancelRefundAmount?: string | number | null };
export function servicePrincipal(a: Service) {
  const total = Number(a.amount ?? 0), paid = Number(a.deposit ?? 0);
  const collected = a.status === "cancelled" ? Math.max(0, paid - Number(a.cancelRefundAmount ?? 0)) : paid;
  return { collected, contractual: a.status === "cancelled" ? collected : total,
    outstanding: a.status === "cancelled" ? 0 : Math.max(0, total - paid),
    date: a.status === "cancelled" ? financialEventDate(a.cancelledAt) || a.dateStr || "" : a.dateStr || "" };
}
export function isPropertyExpense(expense: { providerId?: number | null }) {
  return expense.providerId == null;
}
