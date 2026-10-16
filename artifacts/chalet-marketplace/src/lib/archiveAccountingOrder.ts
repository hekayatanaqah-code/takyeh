/** Logical right-to-left order; Excel itself mirrors A/B/... through its worksheet view. */
export function archiveAccountingOrder(headers: string[], financial: boolean): number[] {
  const order = [
    "رقم الحجز", "العقار", "اسم العميل", "رقم الجوال", "تاريخ بداية الإقامة", "عدد الأيام", "الفترة",
    "الإيجار (ر.س)", "العربون المسجل (ر.س)", "التحصيلات من الإيجار (ر.س)", "المتبقي (ر.س)",
    "حالة التأمين", "التأمين المستحق (ر.س)", "التأمين المستلم (ر.س)", "خصم التلفيات (ر.س)",
    "المسترد عند الإلغاء (ر.س)", "الدخل المحتفظ به (ر.س)", "سبب الإلغاء",
  ];
  return (financial ? [...order.filter(title => headers.includes(title)), ...headers.filter(title => !order.includes(title))] : headers)
    .map(title => headers.indexOf(title));
}
