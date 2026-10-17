/** Logical right-to-left order; Excel itself mirrors A/B/... through its worksheet view. */
export function archiveAccountingOrder(headers: string[], financial: boolean): number[] {
  const order = [
    "رقم الحجز", "العقار", "اسم العميل", "رقم الجوال", "تاريخ بداية الإقامة", "عدد الأيام", "الفترة",
    "الإيجار (⃁)", "العربون المسجل (⃁)", "التحصيلات من الإيجار (⃁)", "المتبقي (⃁)",
    "حالة التأمين", "التأمين المستحق (⃁)", "التأمين المستلم (⃁)", "خصم التلفيات (⃁)",
    "المسترد عند الإلغاء (⃁)", "الدخل المحتفظ به (⃁)", "سبب الإلغاء",
  ];
  return (financial ? [...order.filter(title => headers.includes(title)), ...headers.filter(title => !order.includes(title))] : headers)
    .map(title => headers.indexOf(title));
}
