import type { GetOwnerDeposits200Item } from "@workspace/api-client-react";
import type { ArchiveExportTable } from "./bookingArchiveExport";
import { reportDualDate } from "./bookingArchiveReport";
import { toHijriComponents } from "./hijri";

export type InsuranceEntry = GetOwnerDeposits200Item;
export interface InsuranceFilters {
  status: "all" | "pending" | "resolved";
  month: string; year: string; chalet: string; search: string;
  calendar: "hijri" | "gregorian";
}

export function canSettleInsurance(entry: InsuranceEntry, now = Date.now()): boolean {
  return !entry.cancelledAt && !entry.insuranceRefunded && !!entry.checkoutAt
    && Number.isFinite(Date.parse(entry.checkoutAt)) && now >= Date.parse(entry.checkoutAt);
}

export function insuranceAmounts(entry: InsuranceEntry) {
  const amount = (value?: string | null) => {
    const result = value == null || value === "" ? 0 : Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`مبلغ التأمين غير صالح للحجز ${entry.id}`);
    return Math.round(result * 100) / 100;
  };
  const required = amount(entry.insuranceFee);
  const deducted = amount(entry.insuranceDeducted);
  if (deducted > required) throw new Error(`خصم التأمين يتجاوز المبلغ الأصلي للحجز ${entry.id}`);
  const received = entry.insuranceReceived === true ? required : 0;
  return {
    required, received, deducted,
    held: !entry.insuranceRefunded && received > 0 ? Math.round((received - deducted) * 100) / 100 : 0,
    returned: entry.insuranceRefunded ? Math.round((required - deducted) * 100) / 100 : 0,
  };
}

export function filterInsuranceEntries(entries: InsuranceEntry[], filters: InsuranceFilters): InsuranceEntry[] {
  const normalize = (value: string) => value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).toLowerCase();
  const query = normalize(filters.search.trim());
  const digits = query.replace(/\D/g, "");
  return entries.filter(entry => {
    if (filters.status === "pending" && entry.insuranceRefunded) return false;
    if (filters.status === "resolved" && !entry.insuranceRefunded) return false;
    if (filters.chalet !== "all" && String(entry.submissionId) !== filters.chalet) return false;
    if (filters.month || filters.year) {
      let yearMonth = entry.bookingDate.slice(0, 7);
      if (filters.calendar === "hijri") {
        const hijri = toHijriComponents(new Date(`${entry.bookingDate}T12:00:00`));
        yearMonth = `${hijri.year}-${String(hijri.month).padStart(2, "0")}`;
      }
      if (filters.month ? yearMonth !== filters.month : !yearMonth.startsWith(`${filters.year}-`)) return false;
    }
    return !query || normalize(entry.clientName).includes(query)
      || normalize(entry.clientPhone ?? "").includes(query)
      || !!digits && normalize(entry.clientPhone ?? "").replace(/\D/g, "").includes(digits);
  });
}

export function insuranceCheckoutTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "غير متاح";
  return new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function buildInsuranceReport(entries: InsuranceEntry[], preference: "hijri" | "gregorian"): ArchiveExportTable {
  return {
    kind: "insurance", title: "كشف التأمينات",
    headers: ["رقم الحجز", "العقار", "اسم العميل", "رقم الجوال", "تاريخ بداية الإقامة", "تاريخ الخروج", "وقت الخروج",
      "التأمين المطلوب (ر.س)", "التأمين المستلم (ر.س)", "المحتجز (ر.س)", "المخصوم (ر.س)", "المعاد (ر.س)",
      "حالة الاستلام", "حالة التسوية", "سبب الخصم", "توثيق الضرر"],
    numericColumns: [7, 8, 9, 10, 11],
    dateValues: [{ column: 4, values: entries.map(entry => entry.bookingDate) },
      { column: 5, values: entries.map(entry => entry.checkoutAt ?? "") }],
    summaryNote: "المحتجز من التأمين المستلم غير المسوّى فقط؛ المعاد والمخصوم وفق التسوية المسجلة.",
    rows: entries.map(entry => {
      const amounts = insuranceAmounts(entry);
      let proof = "لا توجد صور";
      if (entry.insuranceProofImages) {
        try {
          const images: unknown = JSON.parse(entry.insuranceProofImages);
          proof = Array.isArray(images) ? `${images.length} صورة` : "توثيق غير قابل للقراءة";
        } catch { proof = "توثيق غير قابل للقراءة"; }
      }
      return [entry.id, entry.chaletTitle || "عقار غير متاح", entry.clientName, entry.clientPhone ?? "",
        reportDualDate(entry.bookingDate, preference), entry.checkoutAt ? reportDualDate(entry.checkoutAt, preference) : "غير متاح",
        insuranceCheckoutTime(entry.checkoutAt), amounts.required, amounts.received, amounts.held, amounts.deducted, amounts.returned,
        entry.insuranceReceived === true ? "مستلم" : entry.insuranceReceived === false ? "غير مستلم" : "استلام غير موثق",
        entry.insuranceRefunded ? amounts.deducted > 0 ? "تمت التسوية بخصم" : "معاد بالكامل" : "بانتظار القرار",
        entry.insuranceDeductReason?.trim() || (amounts.deducted > 0 ? "سبب الخصم غير موثق" : "—"), proof];
    }),
  };
}
