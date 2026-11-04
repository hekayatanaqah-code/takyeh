import { Wallet } from "lucide-react";
import type { FinancialSelection } from "@/lib/financialSelection";
import { transactionChannels, serviceInsuranceCustody } from "@/lib/financialSelection";
import { isInRevenuePeriod, type RevenuePeriod } from "@/lib/revenuePeriod";
import type { RevenueSource } from "@/lib/quickSalesRevenue";
import { useFinancialTransactions } from "./useFinancialTransactions";
import { RiyalIcon } from "@/components/icons/RiyalIcon";

type InsuranceBooking = { dateStr?: string | null; insuranceAmount?: string | number | null;
  insuranceStatus?: string | null; insuranceDeductAmount?: string | number | null };

export function ServiceCollectionChannels({ selection, period, source, bookings, loading = false }: {
  selection: FinancialSelection; period: RevenuePeriod; source: RevenueSource; bookings: InsuranceBooking[];
  loading?: boolean;
}) {
  const query = useFinancialTransactions(selection);
  const rows = (query.data ?? []).filter(row => isInRevenuePeriod(row.date, period)
    && (source === "all" || (source === "quick_sales" ? row.source === "quick_sale" : row.source !== "quick_sale")));
  const channels = transactionChannels(rows);
  const held = source === "quick_sales" ? 0 : serviceInsuranceCustody(bookings, period);
  const unavailable = query.isLoading || query.isError || loading;
  const money = (amount: number) => unavailable ? "—" : amount.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
  return <section dir="rtl" className="overflow-hidden rounded-2xl border border-border bg-card" data-testid="service-collection-channels">
    <div className="flex items-center gap-2 border-b px-5 py-4"><Wallet className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-bold">توزيع قنوات التحصيل</h3></div>
    <p className="px-5 py-3 text-sm leading-7 text-foreground/80">تحصيل الخدمات والمبيعات حسب الفترة ونوع الإيراد المختارين. التأمينات عهدة مستقلة ولا تدخل في الإيرادات.</p>
    {query.isError && <p role="alert" className="px-5 pb-3 text-destructive">تعذّر تحميل توزيع التحصيل. <button className="underline" onClick={() => void query.refetch()}>إعادة المحاولة</button></p>}
    <dl className="divide-y divide-border">
      {[
        ["الحساب البنكي / حوالات", channels.bank],
        ["كاش مودع بالبنك", channels.depositedCash],
        ["كاش لم يودع", channels.cash],
        ["عهدة التأمينات القابلة للاسترداد", held],
      ].map(([label, amount]) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-4">
        <dt className="text-sm font-semibold">{label}</dt>
        <dd className="flex items-center gap-1 font-bold tabular-nums">{money(Number(amount))}<RiyalIcon className="h-4 w-4" /></dd>
      </div>)}
    </dl>
  </section>;
}
