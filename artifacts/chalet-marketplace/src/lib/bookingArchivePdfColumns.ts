import type { ArchiveExportTable } from "./bookingArchiveExport";

export interface ArchivePdfColumn {
  title: string;
  width: number;
  fields: { index: number; label?: string }[];
}

/**
 * One booking = one row. Related values share a cell, never a separate table/page.
 * Every source column is retained, including refunds/reasons on cancelled bookings.
 */
export function archivePdfColumns(table: ArchiveExportTable): ArchivePdfColumn[] {
  if (!table.numericColumns.length) {
    return table.headers.map((title, index) => ({
      title, width: title.includes("سبب") ? 1.6 : title.includes("الموعد") || title.includes("تاريخ") ? 1.35 : 1,
      fields: [{ index }],
    }));
  }
  const indexOf = (header: string) => table.headers.indexOf(header);
  const definitions: { title: string; width: number; fields: [string, string?][] }[] = [
    { title: "رقم الحجز", width: 48, fields: [["رقم الحجز"]] },
    { title: "العقار", width: 100, fields: [["العقار"]] },
    { title: "العميل", width: 100, fields: [["اسم العميل"]] },
    { title: "الجوال", width: 100, fields: [["رقم الجوال"]] },
    { title: "تاريخ الإقامة", width: 120, fields: [["تاريخ بداية الإقامة"], ["عدد الأيام", "عدد الأيام"]] },
    { title: "الفترة", width: 63, fields: [["الفترة"]] },
    { title: "الإيجار", width: 95, fields: [["الإيجار (ر.س)"]] },
    { title: "التحصيلات / العربون", width: 112, fields: [["التحصيلات من الإيجار (ر.س)", "المحصل"], ["العربون المسجل (ر.س)", "العربون"]] },
    { title: "المتبقي", width: 95, fields: [["المتبقي (ر.س)"]] },
    { title: "حالة التأمين", width: 144, fields: [["حالة التأمين"], ["التأمين المستحق (ر.س)", "المستحق"], ["التأمين المستلم (ر.س)", "المستلم"]] },
    { title: "حسم التلفيات", width: 95, fields: [["خصم التلفيات (ر.س)"]] },
  ];
  const columns = definitions.map(({ fields, ...column }) => ({
    ...column, fields: fields.map(([header, label]) => ({ index: indexOf(header), label })).filter(field => field.index >= 0),
  })).filter(column => column.fields.length);
  const covered = new Set(columns.flatMap(column => column.fields.map(field => field.index)));
  table.headers.forEach((title, index) => {
    if (!covered.has(index)) columns.push({
      title: title.replace(" (ر.س)", ""), width: title.includes("سبب") ? 140 : 100, fields: [{ index, label: undefined }],
    });
  });
  return columns;
}
