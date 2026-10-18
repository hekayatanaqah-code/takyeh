import { bankLedgerTotals, formatBankAmount, type BankLedgerEntry } from "@/lib/bankLedger";
import { Skeleton } from "@/components/ui/skeleton";
import OwnerStatAmount from "./OwnerStatAmount";

export function BankLedgerSummary({ entries, loading, failed }: {
  entries: BankLedgerEntry[]; loading: boolean; failed: boolean;
}) {
  const totals = bankLedgerTotals(entries);
  return (
    <section aria-label="ملخص الرصيد البنكي" className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "إجمالي الإيرادات المودعة (+)", amount: totals.deposited, cls: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-900" },
          { label: "إجمالي المصروفات المسحوبة (-)", amount: -totals.withdrawn, cls: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-900" },
          { label: "صافي الرصيد البنكي الحالي", amount: totals.balance, cls: totals.balance < 0 ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300", border: "border-border" },
        ].map(card => (
          <div key={card.label} className={`min-w-0 rounded-2xl border bg-card p-4 space-y-3 ${card.border}`}>
            <h4 className="text-sm font-semibold text-foreground">{card.label}</h4>
            {loading ? <Skeleton className="h-10 w-28" /> : failed ? (
              <p className="text-sm font-semibold text-destructive">تعذّر حساب الرصيد</p>
            ) : (
              <div dir="ltr" className="text-right">
                <OwnerStatAmount amount={formatBankAmount(card.amount, card.label.includes("(+)"))} className={`${card.cls} justify-end text-[1.75rem] sm:text-3xl`} />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        الرصيد حسب جميع العمليات المسجلة للوحدة المختارة، ويشمل إيداعات التأمين والنقد. تُخصم المصروفات المسجلة؛ فلاتر الجدول لا تغيّر هذا الرصيد.
      </p>
    </section>
  );
}
