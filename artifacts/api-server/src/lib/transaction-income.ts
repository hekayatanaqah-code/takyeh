export function monetaryCents(value: string | number | null | undefined): number {
  const result = Math.round(Number(value ?? 0) * 100);
  if (!Number.isSafeInteger(result)) throw new Error("قيمة مالية غير صحيحة");
  return result;
}
export function ledgerDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

/** Services store cumulative principal collected in deposit, separately from insurance. */
export function serviceTransactionEntries(appointments: Array<{
  id: number; providerId: number; clientName: string; dateStr: string;
  amount: string | null; deposit: string | null; paymentMethod: string | null;
  paymentReceiptUrl: string | null; cashDeposited: boolean; status: string;
  cancelledAt: Date | null; cancelRefundAmount: string | null;
}>, names: Map<number, string>) {
  return appointments.flatMap(appointment => {
    const collected = monetaryCents(appointment.deposit);
    const remaining = Math.max(0, monetaryCents(appointment.amount) - collected);
    const cancelled = !!appointment.cancelledAt || appointment.status === "cancelled";
    const label = `${names.get(appointment.providerId) ?? "خدمة"} — ${appointment.clientName}`;
    const common = { source: "service_booking", providerId: appointment.providerId,
      appointmentId: appointment.id, bookingId: null, method: appointment.paymentMethod ?? "cash",
      paymentReceiptUrl: appointment.paymentReceiptUrl, cashDeposited: appointment.cashDeposited };
    const entries = [{
      ...common, id: `s-${appointment.id}`, date: appointment.dateStr, type: "income",
      label: `${!cancelled && collected === 0 && remaining > 0 ? "مستحق خدمة" : "إيراد خدمة"} — ${label}`,
      amount: collected / 100, status: cancelled && collected === 0 ? "cancelled" : collected === 0 ? "unpaid" : remaining > 0 && !cancelled ? "deposit_only" : "collected",
      remainingBalance: cancelled ? null : remaining / 100,
    }];
    if (cancelled && monetaryCents(appointment.cancelRefundAmount) > 0) {
      entries.push({ ...common, id: `s-${appointment.id}-ref`,
        date: appointment.cancelledAt ? ledgerDate(appointment.cancelledAt) : appointment.dateStr,
        type: "refund", label: `استرداد خدمة — ${label}`,
        amount: monetaryCents(appointment.cancelRefundAmount) / 100, status: "refunded", remainingBalance: null });
    }
    return entries;
  });
}

export function quickSaleTransactionEntries(sales: Array<{
  id: number; providerId: number; providerName: string; clientName: string;
  dateStr: string; total: string; paymentMethod: string; status: string;
}>) {
  return sales.map(sale => ({
    id: `q-${sale.id}`, source: "quick_sale", providerId: sale.providerId,
    bookingId: null, date: sale.dateStr, type: "income",
    label: `بيع سريع — ${sale.providerName} — ${sale.clientName || "عميل"}`,
    amount: monetaryCents(sale.total) / 100, method: sale.paymentMethod === "bank" ? "transfer" : "cash",
    status: sale.status === "cancelled" ? "cancelled" : "collected",
    cashDeposited: sale.paymentMethod === "bank", paymentReceiptUrl: null, remainingBalance: null,
  }));
}
