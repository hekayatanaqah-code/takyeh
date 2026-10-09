export const STAFF_JOB_TITLES = [
  "استقبال / خدمة عملاء",
  "مشرف / مدير",
  "نظافة وتشغيل",
  "صيانة",
  "حارس / أمن",
] as const;

export const EMPTY_NEW_STAFF_FORM = {
  name: "", baseSalary: "", nationalId: "", phoneNum: "",
  birthDate: "", hireDate: "", email: "", jobTitle: "", customJobTitle: "",
};

/** Keep canonical digits in form state; the input renders Arabic-Indic digits. */
export function employeeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[^0-9]/g, "")
    .slice(0, 10);
}
