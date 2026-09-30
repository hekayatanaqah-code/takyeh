export type AdminPermKey =
  | "chaletApprovals"
  | "globalFinancials"
  | "userManagement"
  | "platformSettings"
  | "supportDisputes"
  | "serviceListings"
  | "serviceCatalog"
  | "financeSettings"
  | "subscriberManagement";

export type AdminStaffPermissions = Partial<Record<AdminPermKey, boolean>>;

export const ADMIN_PERM_LABELS: Record<AdminPermKey, { label: string; description: string; icon: string }> = {
  chaletApprovals:  { label: "طلبات العقارات والخدمات", description: "قوائم العقارات والخدمات الجديدة والموافقة عليها", icon: "" },
  globalFinancials: { label: "الإحصائيات العامة", description: "عرض أعداد العقارات والخدمات والحسابات والتنبيهات؛ الأرقام المالية الكلية للمشرف العام فقط", icon: "" },
  userManagement:   { label: "إدارة المستخدمين", description: "إدارة الملاك وحساباتهم", icon: "" },
  platformSettings: { label: "العقارات والإعدادات", description: "فئات ومواقع ومرافق العقارات، المواسم، وإعدادات الموقع", icon: "" },
  supportDisputes:  { label: "الدعم والتقييمات", description: "صندوق الوارد ورسائل التواصل وتقييمات العملاء", icon: "" },
  serviceListings: { label: "قائمة الخدمات", description: "عرض الخدمات المنشورة وإضافتها وتعديلها وحذفها", icon: "" },
  serviceCatalog: { label: "فئات ومواقع الخدمات", description: "إدارة فئات الخدمات ومدنها ومناطقها", icon: "" },
  financeSettings: { label: "إعدادات المالية", description: "خطط الاشتراك وفئات المصروفات؛ ميزانية المنصة للمشرف العام فقط", icon: "" },
  subscriberManagement: { label: "قائمة المشتركين", description: "عرض المشتركين وإدارة بيانات الاشتراك", icon: "" },
};

export const ALL_ADMIN_PERM_KEYS = Object.keys(ADMIN_PERM_LABELS) as AdminPermKey[];

export const ADMIN_TAB_PERMISSION: Record<string, AdminPermKey | "__superadmin__"> = {
  overview:              "globalFinancials",
  chalets:               "chaletApprovals",
  submissions:           "chaletApprovals",
  services:              "serviceListings",
  serviceSubmissions:    "chaletApprovals",
  globalSeasons:         "platformSettings",
  platformRevenue:       "__superadmin__",
  serviceCategories:     "serviceCatalog",
  expenseCategories:     "financeSettings",
  locations:             "platformSettings",
  serviceLocations:      "serviceCatalog",
  amenities:             "platformSettings",
  categories:            "platformSettings",
  owners:                "userManagement",
  plans:                 "financeSettings",
  reviews:               "supportDisputes",
  ownerInbox:            "supportDisputes",
  contactInquiries:      "supportDisputes",
  waSubscribers:         "subscriberManagement",
  siteSettings:          "platformSettings",
  auditLogs:             "__superadmin__",
  adminStaff:            "__superadmin__",
  directAdd:             "__superadmin__",
};

// Existing staff keep their pre-upgrade access until an explicit new-key choice is saved.
export const ADMIN_LEGACY_PERMISSION: Partial<Record<AdminPermKey, AdminPermKey>> = {
  serviceListings: "chaletApprovals",
  serviceCatalog: "platformSettings",
  financeSettings: "platformSettings",
};

export function hasAdminPermission(permissions: AdminStaffPermissions, key: AdminPermKey): boolean {
  if (permissions[key] !== undefined) return permissions[key] === true;
  const legacyKey = ADMIN_LEGACY_PERMISSION[key];
  return legacyKey ? permissions[legacyKey] === true : false;
}
