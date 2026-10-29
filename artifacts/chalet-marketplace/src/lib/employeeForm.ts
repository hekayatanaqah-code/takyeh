import { employeeToday } from "./employeeDate";

export const STAFF_JOB_TITLES = [
  "استقبال / خدمة عملاء",
  "مشرف / مدير",
  "نظافة وتشغيل",
  "صيانة",
  "حارس / أمن",
] as const;

export const EMPTY_NEW_STAFF_FORM = {
  name: "", baseSalary: "", nationalId: "", phoneNum: "05",
  birthDate: "", hireDate: "", email: "", jobTitle: "", customJobTitle: "",
};

/** Evaluate when the add dialog opens, not at module load or when editing an employee. */
export function newStaffForm(now = new Date()) {
  return { ...EMPTY_NEW_STAFF_FORM, hireDate: employeeToday(now) };
}

/**
 * Keep canonical digits in state; render Arabic-Indic digits at the input.
 * Do not add native maxLength: it truncates pasted raw text before sanitation.
 */
export function employeeDigits(value: string): string {
  return allEmployeeDigits(value).slice(0, 10);
}

function allEmployeeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[^0-9]/g, "");
}

/** Fixed local prefix, including after clearing, pasting or editing the prefix. */
export function employeeMobileInput(value: string): string {
  let digits = allEmployeeDigits(value);
  if (digits.startsWith("00966")) digits = digits.slice(5);
  else if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("05")) return digits.slice(0, 10);
  if (digits.startsWith("5")) return `0${digits}`.slice(0, 10);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `05${digits}`.slice(0, 10);
}

export function validEmployeeMobile(value: string): boolean {
  return /^05\d{8}$/.test(value);
}

/** Identity remains optional, but a supplied value must contain exactly ten digits. */
export function validEmployeeNationalId(value: string): boolean {
  return value === "" || /^\d{10}$/.test(value);
}
