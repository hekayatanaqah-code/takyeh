import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDualDate } from "@/lib/hijri";
import type { FinancialSelection } from "@/lib/financialSelection";
import { buildActivitySummaryReportHtml } from "@/lib/financialReport";
import { isInRevenuePeriod } from "@/lib/revenuePeriod";
import { revenueMonthLabel } from "@/lib/revenueMonthLabel";
import { revenueFilterPeriod, type RevenueFilterMode } from "@/lib/revenueFilterPeriod";
import { transactionHistoryTotals } from "@/lib/transactionHistory";
import { useFinancialTransactions } from "./useFinancialTransactions";
import { RevenueFilterBar } from "./RevenueFilterBar";
import { getBookingMonthKey, getCurrentFinanceMonth, getLocalDateStr } from "./owner-calendar";
import { REPORT_CSS, htmlToPdfBlob } from "./financial-report-export";
import { PaginatedItems, PaginationBar } from "./finance-shared";

export function GroupedFinancialReport({ selection, calendarPreference }: {
  selection: FinancialSelection; calendarPreference?: "hijri" | "gregorian";
}) {
  const query = useFinancialTransactions(selection);
  const [calendar, setCalendar] = useState<"hijri" | "gregorian">(calendarPreference ?? "hijri");
  const [mode, setMode] = useState<RevenueFilterMode>("monthly");
  const [month, setMonth] = useState(() => getCurrentFinanceMonth(calendarPreference ?? "hijri"));
  const [year, setYear] = useState(() => month.slice(0, 4));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [details, setDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const allRows = query.data ?? [];
  const monthKeys = [...new Set([getCurrentFinanceMonth(calendar),
    ...allRows.map(row => getBookingMonthKey(row.date, calendar))])].sort().reverse();
  const years = [...new Set(monthKeys.map(key => key.slice(0, 4)))];
  const period = revenueFilterPeriod(mode, calendar, year, month, from, to);
  const invalidRange = mode === "custom" && (!from || !to || from > to);
  const rows = invalidRange ? [] : allRows.filter(row => isInRevenuePeriod(row.date, period));
  const totals = transactionHistoryTotals(rows);
  const activityName = selection === null ? "جميع الأنشطة" : selection.map(activity => activity.name).join("، ");
  const title = `التقرير المالي - ${activityName}`;
  const money = (amount: number) => amount.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateLabel = (date: string) => {
    if (!date) return "—";
    const dual = formatDualDate(date);
    return calendar === "hijri" ? `${dual.hijri} — ${dual.gregorian}` : `${dual.gregorian} — ${dual.hijri}`;
  };
  const typeLabel = (type: string) => ({ income: "إيراد", expense: "مصروف", withdrawal: "سحب شخصي", refund: "استرداد" })[type] ?? "معاملة";
  const periodLabel = mode === "all" ? "جميع الفترات" : mode === "custom" ? `${dateLabel(from)} إلى ${dateLabel(to)}`
    : mode === "yearly" ? `${year.replace(/\d/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)])} ${calendar === "hijri" ? "هـ" : "م"}`
    : revenueMonthLabel(month, calendar).primary;
  const summary = [
    { label: "الإيرادات المحصّلة فعلياً بعد الاستردادات — دون التأمين", amount: totals.income },
    { label: "المصروفات والسحوبات المسجلة", amount: totals.expenses },
    { label: "المبالغ المتبقية غير المحصّلة — لا تدخل في الدخل", amount: totals.receivables },
    { label: "صافي الدخل النهائي", amount: totals.net, emphasis: "net" as const },
  ];
  const headers = ["التاريخ", "النوع", "البيان", "المبلغ", "المتبقي"];
  const detailRows = rows.map(row => [dateLabel(row.date), typeLabel(row.type), row.label,
    `${money(row.amount)} ر.س`, `${money(row.remainingBalance ?? 0)} ر.س`]);
  const unavailable = query.isLoading || query.isError || invalidRange;
  async function exportReport(kind: "print" | "pdf") {
    if (unavailable || exporting) return;
    setExporting(true); setExportError("");
    try {
      const html = buildActivitySummaryReportHtml({
        title, activityName, period: periodLabel, fileName: "التقرير المالي.pdf", rows: summary,
        generatedAt: dateLabel(getLocalDateStr()), forPrint: kind === "print", logo: null, css: REPORT_CSS,
        scopeLabel: "يشمل الأنشطة المختارة فقط. المصروفات المشتركة تُحتسب مرة واحدة، والتأمين القابل للاسترداد ليس إيراداً.",
        ...(details ? { details: { title: "تفاصيل المعاملات المالية", headers, rows: detailRows } } : {}),
        closingRows: summary,
      });
      if (kind === "print") {
        const popup = window.open("", "_blank", "width=900,height=1200");
        if (!popup) throw new Error("يرجى السماح بفتح نافذة الطباعة");
        popup.onload = () => { void popup.document.fonts.ready.then(() => popup.print()); };
        popup.document.write(html); popup.document.close();
      } else {
        const { blob } = await htmlToPdfBlob(html, "التقرير المالي.pdf");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "التقرير المالي.pdf"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch { setExportError("تعذّر تجهيز التقرير. تحقق من السماح بالنوافذ المنبثقة ثم حاول مجدداً."); }
    finally { setExporting(false); }
  }
  return <div dir="rtl" className="space-y-5" data-testid="grouped-financial-report">
    <h2 className="text-lg font-bold">{title}</h2>
    <RevenueFilterBar mode={mode} onModeChange={setMode} calendar={calendar}
      onCalendarChange={value => { setCalendar(value); const current = getCurrentFinanceMonth(value); setMonth(current); setYear(current.slice(0, 4)); }}
      years={years} year={year} onYearChange={value => { setYear(value); setMonth(monthKeys.find(key => key.startsWith(`${value}-`)) ?? `${value}-01`); }}
      months={monthKeys.filter(key => key.startsWith(`${year}-`))} month={month} onMonthChange={setMonth}
      monthLabel={revenueMonthLabel} from={from} to={to} onFromChange={setFrom} onToChange={setTo} today={getLocalDateStr()} />
    {query.isError && <p role="alert" className="text-destructive">تعذّر تحميل بيانات الأنشطة المختارة. التصدير متوقف لتجنب أرقام ناقصة. <button className="underline" onClick={() => void query.refetch()}>إعادة المحاولة</button></p>}
    {invalidRange && <p role="status">اختر تاريخ البداية والنهاية بترتيب صحيح لعرض التقرير.</p>}
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3"><input type="checkbox" checked={details} onChange={event => setDetails(event.target.checked)} />عرض تفصيلي للحجوزات والمعاملات والمصروفات</label>
      <Button variant="outline" disabled={unavailable || exporting} onClick={() => void exportReport("print")}><Printer className="ml-2 h-4 w-4" />طباعة</Button>
      <Button disabled={unavailable || exporting} onClick={() => void exportReport("pdf")}><Download className="ml-2 h-4 w-4" />تنزيل التقرير</Button>
    </div>
    {exportError && <p role="alert" className="text-destructive">{exportError}</p>}
    <p className="text-base leading-8">الإيرادات هي الأموال المحصّلة فعلياً بعد الاستردادات، وليست قيمة العقود غير المسددة. المصروفات المشتركة تُحسب مرة واحدة فقط، والتأمينات ليست إيراداً.</p>
    <div className="grid gap-3 sm:grid-cols-2">{summary.map(item => <div key={item.label} className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{item.label}</h3><p className="mt-2 text-xl font-bold" dir="rtl">{unavailable ? "—" : `${money(item.amount)} ر.س`}</p>
    </div>)}</div>
    {details && !unavailable && <PaginatedItems items={rows} resetKey={`${calendar}|${mode}|${year}|${month}|${from}|${to}|${activityName}`}>
      {pagination => <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto"><table className="w-full text-right text-sm">
          <thead><tr>{headers.map(header => <th className="p-3" key={header}>{header}</th>)}</tr></thead>
          <tbody>{pagination.paginatedItems.map(row => <tr key={row.id} className="border-t">
            {[dateLabel(row.date), typeLabel(row.type), row.label, `${money(row.amount)} ر.س`, `${money(row.remainingBalance ?? 0)} ر.س`]
              .map((cell, index) => <td key={index} className="p-3">{cell}</td>)}</tr>)}</tbody>
        </table></div>
        <PaginationBar page={pagination.page} pageSize={pagination.pageSize} totalItems={rows.length} totalPages={pagination.totalPages}
          onPageChange={pagination.goToPage} onPageSizeChange={pagination.changePageSize} />
      </div>}
    </PaginatedItems>}
    <section className="footer-accounts rounded-xl border bg-card p-5"><h3 className="mb-3 font-bold">الحسابات الختامية</h3>
      {summary.map(item => <div key={item.label} className="flex justify-between gap-4 py-2 text-sm"><span>{item.label}</span><strong>{unavailable ? "—" : `${money(item.amount)} ر.س`}</strong></div>)}
    </section>
  </div>;
}
