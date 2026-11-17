export function getFooterPartnerPortal(
  isHomepage: boolean,
  isLoading: boolean,
  isAuthenticated: boolean,
) {
  if (!isHomepage || isLoading) return null;
  return isAuthenticated
    ? {
        href: "/dashboard",
        label: "لوحة التحكم",
        description: "انتقل إلى لوحة التحكم لإدارة وجهاتك وخدماتك وحجوزاتك",
      }
    : {
        href: "/login",
        label: "دخول الشركاء",
        description: "بوابة الشركاء - دخول أصحاب الوجهات ومزودي الخدمات لإدارة الحجوزات والخدمات",
      };
}
