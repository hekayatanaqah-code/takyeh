import { z } from "zod";

const canonicalDigits = (value: string) => value
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

/** Employee forms use local Saudi numbers; public login/recovery normalization is unchanged. */
export const staffMobileSchema = z.string({ required_error: "رقم الجوال مطلوب" })
  .regex(/^[0-9٠-٩۰-۹]{10}$/, "رقم الجوال يجب أن يتكون من ١٠ أرقام فقط تبدأ بـ ٠٥")
  .transform(canonicalDigits)
  .refine(value => /^05\d{8}$/.test(value), "رقم الجوال يجب أن يبدأ بـ ٠٥");

export const staffNationalIdSchema = z.string()
  .regex(/^(?:[0-9٠-٩۰-۹]{10})?$/, "رقم الهوية / الإقامة يجب أن يتكون من ١٠ أرقام بالضبط")
  .transform(canonicalDigits);
