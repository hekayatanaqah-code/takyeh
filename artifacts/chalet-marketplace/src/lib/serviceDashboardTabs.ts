export type ServiceCapabilities = {
  requiresInsurance?: boolean;
  insuranceAmount?: string | number | null;
  requiresContract?: boolean;
};

export function hasServiceInsurance(provider: ServiceCapabilities) {
  const amount = Number(provider.insuranceAmount);
  return provider.requiresInsurance === true && Number.isFinite(amount) && amount > 0;
}

export function serviceDashboardTabs(providers: ServiceCapabilities[]) {
  return [
    { id: "details", label: "بيانات النشاط" },
    { id: "catalog", label: "الخدمات/المنتجات" },
    { id: "seasons", label: "المواسم والأعياد" },
    { id: "offers", label: "العروض والخصومات" },
    { id: "reviews", label: "التقييمات" },
    { id: "calendar", label: "التقويم والحجوزات" },
    { id: "customers", label: "قاعدة العملاء" },
    { id: "messages", label: "إعدادات الرسائل الآلية" },
    ...(providers.some(hasServiceInsurance) ? [{ id: "insurance", label: "إدارة التأمينات" }] : []),
    ...(providers.some(p => p.requiresContract) ? [{ id: "digitalContracts", label: "العقود الرقمية" }] : []),
  ];
}
