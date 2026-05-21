export type PermKey =
  | "dashboardAccess"
  | "bookingsControl"
  | "financialAccess"
  | "insuranceManagement"
  | "chaletManagement"
  | "pricingControl"
  | "availabilityControl"
  | "customerData"
  | "accountSettings";

export type StaffPermissions = Partial<Record<PermKey, boolean>>;

export const PERM_LABELS: Record<PermKey, { label: string; description: string; icon: string }> = {
  dashboardAccess:      { label: "عرض الإحصائيات",           description: "الوصول إلى لوحة الملخص والأرقام العامة",               icon: "📊" },
  bookingsControl:      { label: "إدارة الحجوزات",            description: "عرض التقويم وإضافة وتعديل وإلغاء الحجوزات",            icon: "📅" },
  financialAccess:      { label: "التقارير المالية",           description: "عرض الإيرادات والمصروفات والتقارير المالية",           icon: "💰" },
  insuranceManagement:  { label: "التأمينات والودائع",         description: "استرداد أو خصم وديعة الضمان",                         icon: "🔒" },
  chaletManagement:     { label: "إدارة الشاليه",             description: "تعديل بيانات الشاليه والصور والمرافق والمراجعات",      icon: "🏡" },
  pricingControl:       { label: "التحكم في الأسعار",          description: "تعديل الأسعار الأساسية وإعداد مواسم الأسعار",         icon: "🏷️" },
  availabilityControl:  { label: "التحكم في التوفر",           description: "حجب وفتح الأيام للصيانة أو الاستخدام الخاص",          icon: "🚫" },
  customerData:         { label: "بيانات العملاء",             description: "الوصول إلى قائمة العملاء وسجلات الحجوزات",             icon: "👥" },
  accountSettings:      { label: "إعدادات الحساب",            description: "تعديل البيانات البنكية وإعدادات المنصة",              icon: "⚙️" },
};

export const ALL_PERM_KEYS = Object.keys(PERM_LABELS) as PermKey[];

/* Map tabs → required permission key (undefined = owner-only) */
export const TAB_PERMISSION: Record<string, PermKey | "__owner__"> = {
  chalets:  "chaletManagement",
  seasons:  "pricingControl",
  calendar: "bookingsControl",
  revenue:  "financialAccess",
  expenses: "financialAccess",
  staff:    "__owner__",
  reports:  "financialAccess",
  deposits: "insuranceManagement",
  reviews:       "customerData",
  notifications: "__owner__",
  messageSettings: "__owner__",
  services:      "chaletManagement",
  customers:     "customerData",
  profile:          "__owner__",
  contractSettings: "__owner__",
};
