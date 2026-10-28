export type ServiceCapabilities = {
  requiresInsurance?: boolean;
  insuranceAmount?: string | number | null;
  requiresContract?: boolean;
};

export function hasServiceInsurance(provider: ServiceCapabilities) {
  const amount = Number(provider.insuranceAmount);
  return provider.requiresInsurance === true && Number.isFinite(amount) && amount > 0;
}

export type ServiceDashboardTabId = "details" | "catalog" | "seasons" | "offers" | "reviews" | "calendar" | "quickSales" | "customers" | "messages" | "insurance" | "digitalContracts";

export function serviceDashboardTabs(providers: ServiceCapabilities[]): Array<{ id: ServiceDashboardTabId; label: string }> {
  return [
    { id: "details", label: "بيانات النشاط" },
    { id: "catalog", label: "الخدمات/المنتجات" },
    { id: "seasons", label: "المواسم والأعياد" },
    { id: "offers", label: "العروض والخصومات" },
    { id: "reviews", label: "التقييمات" },
    { id: "calendar", label: "التقويم والحجوزات" },
    { id: "quickSales", label: "المبيعات المفردة" },
    { id: "customers", label: "قاعدة العملاء" },
    { id: "messages", label: "إعدادات الرسائل الآلية" },
    ...(providers.some(hasServiceInsurance) ? [{ id: "insurance" as const, label: "إدارة التأمينات" }] : []),
    ...(providers.some(p => p.requiresContract) ? [{ id: "digitalContracts" as const, label: "العقود الرقمية" }] : []),
  ];
}
