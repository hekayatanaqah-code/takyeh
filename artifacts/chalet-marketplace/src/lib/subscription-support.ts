export const SUBSCRIPTION_SUPPORT_MESSAGE = "مرحباً، لدي استفسار حول الاشتراكات والباقات في منصة تكيّة.";

/** Use only the configured public contact; never substitute a fictional number. */
export function subscriptionSupportLink(configuredPhone: string | null | undefined): string | null {
  let number = (configuredPhone ?? "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");
  if (number.startsWith("00")) number = number.slice(2);
  if (/^05\d{8}$/.test(number)) number = `966${number.slice(1)}`;
  else if (/^5\d{8}$/.test(number)) number = `966${number}`;
  if (!/^[1-9]\d{7,14}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(SUBSCRIPTION_SUPPORT_MESSAGE)}`;
}
