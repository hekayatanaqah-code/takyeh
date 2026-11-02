export type GuideActivity = "property" | "service";
export type GuideActivityScope = GuideActivity | "both";
export type GuideSection = { key: string; label: string };
export function resolveGuideActivity({ activity, context, providerId, financeType }: {
  activity?: GuideActivityScope; context?: GuideActivityScope | null; providerId?: number | null;
  financeType?: "service" | "chalet" | "all";
}): GuideActivityScope {
  return activity ?? (providerId || financeType === "service" ? "service"
    : financeType === "chalet" ? "property" : context ?? "property");
}

export function sectionGuidesFor<T extends { section_key: string }>(guides: T[], key: string): T[] {
  return guides.filter(guide => guide.section_key === key);
}

export type GuideCatalogGroup = {
  activity: GuideActivity;
  title: string;
  description: string;
  sections: GuideSection[];
  financeTitle: string;
  financeOverview: GuideSection;
  financeSections: GuideSection[];
};

/** Existing property keys are persisted identifiers, not navigation IDs. */
export function sectionGuideKey(key: string, activity: GuideActivity): string {
  return activity === "service" && !key.startsWith("service_") ? `service_${key}` : key;
}

const financeSections: GuideSection[] = [
  { key: "revenues", label: "الإيرادات" }, { key: "expenses", label: "المصروفات" },
  { key: "ledger", label: "سجل الحساب البنكي" }, { key: "reports", label: "التقارير المالية" },
  { key: "employees", label: "الموظفون" }, { key: "transactions", label: "سجل المعاملات المالية" },
  { key: "notifications", label: "الإشعارات" }, { key: "support", label: "مركز الدعم" },
];
const propertySections: GuideSection[] = [
  { key: "dashboard", label: "الصفحة الرئيسية" }, { key: "chalets", label: "إدارة عقاراتي والشاليهات" },
  { key: "seasons", label: "المواسم والأعياد" }, { key: "reviews", label: "التقييمات" },
  { key: "calendar", label: "التقويم والحجوزات" }, { key: "deposits", label: "إدارة التأمينات" },
  { key: "customers", label: "قاعدة العملاء" }, { key: "services", label: "إدارة الخدمات والمرافق العقارية" },
  { key: "messageSettings", label: "إعدادات الرسائل الآلية وواتساب" }, { key: "digitalContracts", label: "العقود الرقمية" },
];
const serviceSections: GuideSection[] = [
  { key: "dashboard", label: "الصفحة الرئيسية" }, { key: "management", label: "إدارة خدماتي والمنتجات" },
  { key: "details", label: "تفاصيل النشاط الخدمي" }, { key: "catalog", label: "المنتجات والخدمات" },
  { key: "seasons", label: "المواسم والأسعار" }, { key: "offers", label: "العروض والخصومات" },
  { key: "reviews", label: "التقييمات" }, { key: "calendar", label: "التقويم والحجوزات" },
  { key: "quickSales", label: "المبيعات المفردة والبيع السريع" }, { key: "customers", label: "قاعدة العملاء" },
  { key: "messageSettings", label: "إعدادات الرسائل الآلية وواتساب" },
  { key: "deposits", label: "إدارة التأمينات" }, { key: "digitalContracts", label: "العقود الرقمية" },
];
export const SECTION_GUIDE_GROUPS: GuideCatalogGroup[] = [
  {
    activity: "property", title: "شروحات العقارات", description: "شروحات إدارة العقارات والشاليهات، وشؤونها الإدارية والمالية.",
    sections: propertySections, financeTitle: "الشؤون الإدارية والمالية (للعقارات)",
    financeOverview: { key: "adminFinance", label: "شرح الشؤون الإدارية والمالية للعقارات" }, financeSections,
  },
  {
    activity: "service", title: "شروحات الخدمات", description: "شروحات الأنشطة الخدمية والمنتجات، وشؤونها الإدارية والمالية المستقلة.",
    sections: serviceSections.map(section => ({ ...section, key: sectionGuideKey(section.key, "service") })),
    financeTitle: "الشؤون الإدارية والمالية (للخدمات)",
    financeOverview: { key: "service_adminFinance", label: "شرح الشؤون الإدارية والمالية للخدمات" },
    financeSections: financeSections.map(section => ({ ...section, key: sectionGuideKey(section.key, "service") })),
  },
];

export const SERVICE_TAB_GUIDE_KEYS: Record<string, string> = {
  details: "details", catalog: "catalog", quickSales: "quickSales", offers: "offers", seasons: "seasons",
  calendar: "calendar", insurance: "deposits", reviews: "reviews", customers: "customers",
  messages: "messageSettings", digitalContracts: "digitalContracts",
};
