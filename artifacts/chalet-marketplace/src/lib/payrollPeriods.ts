import { HIJRI_MONTHS_AR, toHijriComponents } from "./hijri";

type PayrollCalendar = "gregorian" | "hijri";
interface PayrollRecord {
  id: number;
  month: string;
  paidAt?: string | null;
}

/** Salary periods are stored as Gregorian YYYY-MM; Hijri display uses their midpoint. */
export function payrollPeriod(month: string, calendar: PayrollCalendar) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (calendar === "gregorian") return { year, month: monthNumber };
  const hijri = toHijriComponents(new Date(`${month}-15T12:00:00`));
  return { year: hijri.year, month: hijri.month };
}

export function payrollPeriodLabel(month: string, calendar: PayrollCalendar): string {
  const period = payrollPeriod(month, calendar);
  if (!period) return "—";
  if (calendar === "hijri") {
    return `${HIJRI_MONTHS_AR[period.month - 1]} ${period.year.toLocaleString("ar-SA", { useGrouping: false })} هـ`;
  }
  return new Date(`${month}-15T12:00:00`).toLocaleDateString("ar-SA", {
    calendar: "gregory", year: "numeric", month: "long",
  });
}

export function paidPayrollRecords<T extends PayrollRecord>(records: readonly T[]): T[] {
  return records.filter(record => record.id > 0 && !!record.paidAt && payrollPeriod(record.month, "gregorian"));
}

export function paidPayrollPeriods(records: readonly PayrollRecord[], calendar: PayrollCalendar) {
  const periods = new Map<string, { year: number; month: number }>();
  for (const record of paidPayrollRecords(records)) {
    const period = payrollPeriod(record.month, calendar)!;
    periods.set(`${period.year}-${period.month}`, period);
  }
  return [...periods.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

/** Re-evaluate on every opening so a mounted dashboard never reuses last month's default. */
export function currentSalaryMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}

export function hasStaffPlatformAccess(member: { username: string | null; isActive: boolean }): boolean {
  return member.isActive && !!member.username?.trim();
}
