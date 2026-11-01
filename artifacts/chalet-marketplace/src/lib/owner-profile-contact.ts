export function contactDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\D/g, "");
}

export function contactPhoneInput(value: string): string {
  return contactDigits(value).slice(0, 10);
}

export function localContactPhone(value: string): string {
  const digits = contactDigits(value);
  if (digits.startsWith("00966")) return `0${digits.slice(5)}`;
  if (digits.startsWith("966")) return `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

export function profileContactErrors(phone: string, email: string) {
  return {
    phone: !phone.trim() ? "رقم الجوال مطلوب." : !/^05\d{8}$/.test(phone) ? "أدخل رقم جوال من ١٠ أرقام يبدأ بـ ٠٥." : "",
    email: !email.trim() ? "البريد الإلكتروني مطلوب." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "أدخل بريداً إلكترونياً صحيحاً." : "",
  };
}
