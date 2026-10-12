import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call, sar, cardCls, ErrorBox, Notice } from "./shared";
import { Money, StatementView, TransferHistory, currentMonth, type Balances, type Statement, type Transfer } from "./money";

interface PortalStatement extends Balances { statement: Statement; transfers: Transfer[] }

export function EarningsSummary({ e }: { e: Partial<Balances> & { netDueHalalas?: number; transferredHalalas?: number } }) {
  const pending = e.pendingHalalas ?? 0;
  const available = e.availableHalalas ?? e.netDueHalalas ?? 0;
  const paid = e.paidHalalas ?? e.transferredHalalas ?? 0;
  const recoverable = e.recoverableHalalas ?? 0;
  const cards: [string, string, number, string][] = [
    ["معلقة", "جلسات مدفوعة ومؤكدة لم تُسلّم بعد", pending, "pending"],
    ["متاحة", "أرباح جلسات مكتملة ومسلّمة ناقص المحوّل", available, "available"],
    ["مدفوعة", "حوالات بنكية سُجلت لك", paid, "paid"],
  ];
  return (
    <section className="space-y-2" data-testid="section-earnings-summary">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(([l, h, v, k]) => (
          <div key={k} className={`${cardCls} ${k === "available" ? "border-[#8C6246]/40 bg-[#8C6246]/[0.05]" : ""}`}>
            <p className="text-xs font-bold text-muted-foreground">{l}</p>
            <p className="mt-1 text-xl font-bold"><Money h={v} testId={`text-earnings-${k}`} /></p>
            <p className="mt-1 text-[11px] text-muted-foreground">{k === "available" && available === 0 && paid > 0 ? <span className="font-bold text-emerald-700" data-testid="text-earnings-settled">تمت التسوية - لا مستحقات متاحة حاليا</span> : h}</p>
          </div>
        ))}
      </div>
      {(available < 0 || recoverable > 0) && <Notice tone="err">عليك مبلغ مستحق للمنصة <Money h={-(recoverable || Math.abs(available))} /> نتيجة استرداد بعد تحويل سابق. سيُخصم من أرباحك القادمة ولن تُحوَّل لك مبالغ حتى تسويته.</Notice>}
    </section>
  );
}

export function PortalStatementSection() {
  const [month, setMonth] = useState(currentMonth);
  const q = useQuery({ queryKey: ["ph-portal-statement", month], queryFn: () => call<PortalStatement>(`/photography/portal/statement?month=${month}`), refetchInterval: 30000, placeholderData: (prev) => prev });
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-5">
      <StatementView id="portal" title="كشف حسابي الشهري" month={month} onMonthChange={setMonth} statement={q.data?.statement} loading={q.isLoading || q.isPlaceholderData} />
      <section className="space-y-3"><h3 className="font-bold">سجل الحوالات وإيصالاتها</h3>
        {q.isLoading ? <div className="h-20 animate-pulse rounded-2xl bg-muted" /> : <TransferHistory transfers={q.data?.transfers ?? []} id="portal" />}
        <p className="text-xs text-muted-foreground">الحوالات تتم يدويا من تكية إلى الآيبان المسجل في ملفك. إجمالي المحوّل: {sar(q.data?.paidHalalas ?? 0)}.</p>
      </section>
    </div>
  );
}
