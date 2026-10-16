import type { ArchiveExportTable } from "./bookingArchiveExport";
import { archiveAccountingOrder } from "./archiveAccountingOrder";

export interface ArchivePdfColumn {
  title: string;
  width: number;
  fields: { index: number; label?: string }[];
}

/** All source fields remain horizontal: no stacked labels, financial sub-tables or lost amounts. */
export function archivePdfColumns(table: ArchiveExportTable): ArchivePdfColumn[] {
  const compactLabels: Record<string, string> = {
    "اسم العميل": "العميل", "رقم الجوال": "الجوال", "تاريخ بداية الإقامة": "الإقامة",
    "عدد الأيام": "الأيام", "التحصيلات من الإيجار (ر.س)": "التحصيلات",
    "العربون المسجل (ر.س)": "العربون", "التأمين المستحق (ر.س)": "التأمين المستحق",
    "التأمين المستلم (ر.س)": "التأمين المستلم", "خصم التلفيات (ر.س)": "التلفيات",
    "المسترد عند الإلغاء (ر.س)": "المسترد", "الدخل المحتفظ به (ر.س)": "دخل الإلغاء",
  };
  const widths: Record<string, number> = {
    "رقم الحجز": 60, "العقار": 145, "اسم العميل": 145, "رقم الجوال": 118,
    "تاريخ بداية الإقامة": 130, "عدد الأيام": 52, "الفترة": 76, "حالة التأمين": 110,
    "سبب الإلغاء": 160, "سبب التعديل": 170,
    "الموعد السابق": 130, "الموعد الجديد": 130, "تاريخ التعديل": 130,
  };
  return archiveAccountingOrder(table.headers, table.numericColumns.length > 0).map(index => ({
    title: compactLabels[table.headers[index]] ?? table.headers[index].replace(" (ر.س)", ""),
    width: widths[table.headers[index]] ?? 99, fields: [{ index }],
  }));
}
