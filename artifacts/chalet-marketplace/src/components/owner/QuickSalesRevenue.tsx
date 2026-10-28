import type { QuickSale } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDualDate } from "@/lib/hijri";
import { quickSalesTotal, type RevenueSource } from "@/lib/quickSalesRevenue";

const amount = (value: number) => value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RevenueSourceFilter({ value, onChange }: { value: RevenueSource; onChange: (value: RevenueSource) => void }) {
  return <div className="flex flex-wrap items-center gap-2" dir="rtl">
    <span className="text-sm font-medium" id="revenue-source-label">نوع الإيراد</span>
    <Select dir="rtl" value={value} onValueChange={value => onChange(value as RevenueSource)}>
      <SelectTrigger aria-labelledby="revenue-source-label" className="w-52 text-right"><SelectValue /></SelectTrigger>
      <SelectContent dir="rtl" align="start">
        <SelectItem value="all">الحجوزات والمبيعات المفردة</SelectItem>
        <SelectItem value="bookings">الحجوزات فقط</SelectItem>
        <SelectItem value="quick_sales">المبيعات المفردة فقط</SelectItem>
      </SelectContent>
    </Select>
  </div>;
}

export function QuickSalesRevenueDetails({ sales }: { sales: QuickSale[] }) {
  return <section className="rounded-2xl border border-border bg-card p-4 space-y-3" dir="rtl">
    <h3 className="font-bold text-sm">المبيعات المفردة المشمولة في الإيرادات</h3>
    <p className="text-xs text-muted-foreground">عمليات محصّلة بالكامل، مستقلة عن الحجوزات والعقود. العمليات الملغاة غير محتسبة.</p>
    {!sales.length ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مبيعات مفردة للفترة المحددة</p> :
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[540px] text-sm text-right">
          <thead><tr className="border-b">{["العملية / العميل", "النشاط", "التاريخ", "طريقة التحصيل", "المحصّل"].map(label =>
            <th key={label} className="p-3 text-xs text-muted-foreground">{label}</th>)}</tr></thead>
          <tbody>{sales.map(sale => {
            const date = formatDualDate(sale.dateStr);
            return <tr key={sale.id} className="border-b border-border/50">
              <td className="p-3">{sale.clientName || "بيع مباشر"} <span className="text-muted-foreground">#{sale.id.toLocaleString("ar-SA", { useGrouping: false })}</span></td>
              <td className="p-3">{sale.providerName}</td>
              <td className="p-3 text-xs"><div>{date.hijri}</div><div className="text-muted-foreground">{date.gregorian}</div></td>
              <td className="p-3">{sale.paymentMethod === "cash" ? "نقدي" : "بنكي"}</td>
              <td className="p-3 font-semibold tabular-nums">{amount(sale.total)} ⃁</td>
            </tr>;
          })}</tbody>
          <tfoot><tr><th colSpan={4} className="p-3">إجمالي المبيعات المفردة</th><td className="p-3 font-bold tabular-nums">{amount(quickSalesTotal(sales))} ⃁</td></tr></tfoot>
        </table>
      </div>}
  </section>;
}
