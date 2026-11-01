import type { ArchiveFilters } from "../components/owner/BookingArchiveControls";
import type { ArchiveExportTable, ArchiveCell } from "./bookingArchiveExport";
import { archiveDateRange, getArchiveDateError } from "./bookingArchive";
import { serviceBookingMatches, type OperationalServiceBooking } from "./serviceBookingOperations";
import { reportDualDate, type ReportCalendar } from "./bookingArchiveReport";

export type ServiceArchiveTab = "completed" | "cancelled";
export type ServiceArchiveAppointment = OperationalServiceBooking & {
  providerId: number;
  clientName?: string | null;
  clientPhone?: string | null;
  serviceAddress?: string | null;
  insuranceAmount?: string | number | null;
  insuranceStatus?: string | null;
  cancelRefundAmount?: string | number | null;
  cancelReason?: string | null;
};

const latinDigits = (value: string) => value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** Service-only, Saudi-day archive; the operational list's filters never restrict it. */
export function filterServiceBookingArchive(
  appointments: ServiceArchiveAppointment[], providerId: number, tab: ServiceArchiveTab,
  filters: ArchiveFilters, calendar: ReportCalendar, now: number,
) {
  if (getArchiveDateError(filters, now)) return [];
  const range = archiveDateRange(filters, now, calendar);
  const search = latinDigits(filters.search.trim().toLowerCase());
  return appointments.filter(appointment => {
    if (appointment.providerId !== providerId || !serviceBookingMatches(appointment, tab, "all", "all", now)) return false;
    if (range.from && appointment.dateStr < range.from) return false;
    if (range.to && appointment.dateStr > range.to) return false;
    return !search || [appointment.clientName, appointment.clientPhone, String(appointment.id), appointment.serviceAddress]
      .some(value => latinDigits(String(value ?? "").toLowerCase()).includes(search));
  }).sort((a, b) => b.dateStr.localeCompare(a.dateStr) || b.id - a.id);
}

function amount(value: string | number | null | undefined, required = false): ArchiveCell {
  if (value == null || value === "") return required ? "غير مسجل" : 0;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("توجد قيمة مالية غير صحيحة في حجوزات الخدمة");
  return number;
}

/** Export all filtered service records, never property rows or just the displayed page. */
export function buildServiceBookingArchiveTable(
  appointments: ServiceArchiveAppointment[], serviceName: string, tab: ServiceArchiveTab, calendar: ReportCalendar,
): ArchiveExportTable {
  const headers = ["رقم الحجز", "الخدمة", "اسم العميل", "رقم الجوال", "تاريخ الخدمة", "المدة",
    "قيمة الخدمة (⃁)", "المحصل من الخدمة (⃁)", "المتبقي (⃁)", "التأمين المستحق (⃁)", "حالة التأمين"];
  if (tab === "cancelled") headers.push("المسترد عند الإلغاء (⃁)", "سبب الإلغاء");
  const rows = appointments.map(appointment => {
    const total = amount(appointment.amount, true);
    const paid = amount(appointment.deposit) as number;
    const insurance = amount(appointment.insuranceAmount);
    const unit = ({ days: "يوم", hours: "ساعة", minutes: "دقيقة" } as Record<string, string>)[appointment.durationUnit ?? ""] ?? "";
    const row: ArchiveCell[] = [
      appointment.id, serviceName, appointment.clientName ?? "", appointment.clientPhone ?? "",
      reportDualDate(appointment.dateStr, calendar),
      appointment.duration ? `${appointment.duration} ${unit}`.trim() : "غير محددة",
      total, paid, tab === "cancelled" ? 0 : typeof total === "number" ? Math.max(0, total - paid) : "غير مسجل",
      insurance,
      Number(insurance) === 0 ? "لا يوجد" : ({ pending: "لم يستلم", received: "مستلم", refunded: "مسترد", deducted: "مخصوم", retained: "محتفظ به" } as Record<string, string>)[appointment.insuranceStatus ?? ""] ?? "غير محددة",
    ];
    if (tab === "cancelled") row.push(amount(appointment.cancelRefundAmount), appointment.cancelReason ?? "");
    return row;
  });
  return {
    title: `أرشيف حجوزات الخدمات — ${tab === "completed" ? "المكتملة" : "الملغاة"}`,
    headers, rows,
    numericColumns: [6, 7, 8, 9, ...(tab === "cancelled" ? [11] : [])].filter(column => rows.every(row => typeof row[column] === "number")),
    dateValues: [{ column: 4, values: appointments.map(appointment => appointment.dateStr) }],
    summaryNote: "التأمين القابل للاسترداد منفصل عن قيمة الخدمة والمبالغ المحصلة والمتبقية. لا تُعرض إجماليات للحقول التي تتضمن قيماً غير مسجلة.",
  };
}
