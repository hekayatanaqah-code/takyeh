export type AdminPermKey =
  | "chaletApprovals"
  | "globalFinancials"
  | "userManagement"
  | "platformSettings"
  | "supportDisputes";

export type AdminStaffPermissions = Partial<Record<AdminPermKey, boolean>>;

export const ADMIN_PERM_LABELS: Record<AdminPermKey, { label: string; description: string; icon: string }> = {
  chaletApprovals:  { label: "موافقة الشاليهات",       description: "قبول أو رفض الشاليهات ومزودي الخدمات الجدد",     icon: "🏡" },
  globalFinancials: { label: "التقارير المالية العامة", description: "عرض إيرادات جميع الشاليهات على المنصة",           icon: "💰" },
  userManagement:   { label: "إدارة المستخدمين",        description: "إدارة حسابات الملاك والضيوف وخطط الاشتراك",      icon: "👥" },
  platformSettings: { label: "إعدادات المنصة",          description: "تعديل الفئات والمواقع والإعدادات العامة للموقع", icon: "⚙️" },
  supportDisputes:  { label: "الدعم والنزاعات",          description: "إدارة الشكاوى وخلافات التأمينات بين الأطراف",    icon: "🛡️" },
};

export const ALL_ADMIN_PERM_KEYS = Object.keys(ADMIN_PERM_LABELS) as AdminPermKey[];

export const ADMIN_TAB_PERMISSION: Record<string, AdminPermKey | "__superadmin__"> = {
  overview:              "globalFinancials",
  submissions:           "chaletApprovals",
  services:              "chaletApprovals",
  platformRevenue:       "__superadmin__",
  serviceCategories:     "platformSettings",
  expenseCategories:     "platformSettings",
  locations:             "platformSettings",
  amenities:             "platformSettings",
  categories:            "platformSettings",
  owners:                "userManagement",
  plans:                 "platformSettings",
  reviews:               "supportDisputes",
  siteSettings:          "platformSettings",
  adminStaff:            "__superadmin__",
};
