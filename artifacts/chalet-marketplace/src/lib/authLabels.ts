export const AUTH_LABELS = {
  identifier: "رقم الجوال أو البريد الإلكتروني",
  identifierPlaceholder: "أدخل رقم جوالك أو بريدك الإلكتروني",
  password: "كلمة المرور",
  passwordPlaceholder: "أدخل كلمة المرور",
  showPassword: "إظهار كلمة المرور",
  hidePassword: "إخفاء كلمة المرور",
};

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => DIGITS[c] ?? c);
}

export type IdentifierKind = "email" | "phone" | "other";

/** Normalizes a public identifier: email lowercased, Saudi mobile as 05XXXXXXXX. */
export function normalizeIdentifier(raw: string): { value: string; kind: IdentifierKind } {
  const t = toWesternDigits(raw.trim());
  if (t.includes("@")) return { value: t.toLowerCase(), kind: "email" };
  if (/^[+\d\s()-]+$/.test(t)) {
    let d = t.replace(/\D/g, "");
    if (d.startsWith("00966")) d = d.slice(5);
    else if (d.startsWith("966")) d = d.slice(3);
    if (/^5\d{8}$/.test(d)) d = "0" + d;
    if (/^05\d{8}$/.test(d)) return { value: d, kind: "phone" };
    return { value: t, kind: "other" };
  }
  return { value: t, kind: "other" };
}
