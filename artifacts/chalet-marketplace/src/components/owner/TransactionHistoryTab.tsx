import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { transactionHistoryTotals, type FinancialTransaction } from "@/lib/transactionHistory";
import { XCircle, ListChecks } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatDualDate, HIJRI_MONTHS_AR } from "@/lib/hijri";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { GREGORIAN_MONTHS_AR, getBookingMonthKey, getCalCorrespondenceHint, getCurrentFinanceMonth } from "@/components/owner/owner-calendar";
import { apiFetch } from "@/components/owner/owner-api";
import { PaginationBar, useListPagination } from "@/components/owner/finance-shared";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { toArN } from "@/components/owner/owner-formatting";


export function TransactionHistoryTab() {
  const { unit } = useAdminFinance();
  const qcHist = useQueryClient();
  const { toast } = useToast();
  const [histCalType, setHistCalType] = useState<"hijri" | "gregorian">("hijri");
  const initialHistMonth = getCurrentFinanceMonth("hijri");
  const [histYear, setHistYear] = useState<string>(() => initialHistMonth.split("-")[0]);
  const [histMonth, setHistMonth] = useState<string>(() => initialHistMonth);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const submissionId = unit.type === "chalet" ? unit.submissionId : undefined;

  const markDeposited = async (itemId: string) => {
    const bookingId = itemId.startsWith("b-") ? Number(itemId.slice(2)) : null;
    if (!bookingId) return;
    setUpdatingId(itemId);
    try {
      const r = await apiFetch(`/owner/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ cashDeposited: true }),
      });
      if (r.ok) {
        toast({ title: "تم التحديث", description: "تم نقل المبلغ إلى الرصيد البنكي" });
        qcHist.invalidateQueries({ queryKey: ["owner", "transaction-history"] });
        qcHist.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
        qcHist.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      }
    } finally { setUpdatingId(null); }
  };

  const [receiptLightboxTx, setReceiptLightboxTx] = useState<string | null>(null);

  const { data: allItems = [], isLoading, isError, refetch } = useQuery<FinancialTransaction[]>({
    queryKey: ["owner", "transaction-history", unit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (unit.type === "chalet" && !submissionId) throw new Error("تعذّر تحديد العقار");
      if (submissionId) params.set("submissionId", String(submissionId));
      if (unit.type === "service") params.set("providerId", String(unit.id));
      const r = await apiFetch(`/owner/transaction-history?${params}`);
      if (!r.ok) throw new Error("تعذّر تحميل سجل المعاملات");
      return r.json();
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
  });

  /* Build year/month option lists from fetched data (client-side dual calendar) */
  const histYearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(getCurrentFinanceMonth(histCalType).split("-")[0]);
    for (const e of allItems) {
      if (!e.date) continue;
      years.add(getBookingMonthKey(e.date, histCalType).split("-")[0]);
    }
    return Array.from(years).sort().reverse();
  }, [allItems, histCalType]);

  const histMonthOptions = useMemo(() => {
    const keys = new Set<string>();
    const currentMonth = getCurrentFinanceMonth(histCalType);
    if (currentMonth.startsWith(histYear)) keys.add(currentMonth);
    for (const e of allItems) {
      if (!e.date) continue;
      const key = getBookingMonthKey(e.date, histCalType);
      if (histYear && !key.startsWith(histYear)) continue;
      keys.add(key);
    }
    return Array.from(keys).sort().reverse();
  }, [allItems, histCalType, histYear]);

  const items = useMemo(() => allItems.filter(e => {
    if (!e.date) return true;
    const key = getBookingMonthKey(e.date, histCalType);
    if (histMonth) return key === histMonth;
    if (histYear) return key.startsWith(histYear);
    return true;
  }), [allItems, histCalType, histYear, histMonth]);
  const historyPagination = useListPagination(items, `${histCalType}|${histYear}|${histMonth}`);

  const typeLabel = (t: string, method: string) => {
    if (t === "income") {
      const m = method === "transfer" ? "حوالة" : method === "pos" ? "شبكة" : "كاش";
      return { text: `إيراد — ${m}`, cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" };
    }
    if (t === "refund") return { text: "مسترجع", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
    if (t === "withdrawal") return { text: "مسحوبات شخصية", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
    return { text: "مصروف", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  };

  const statusLabel = (s: string) => {
    if (s === "unpaid") return { text: "غير محصّل", cls: "text-amber-700 dark:text-amber-400" };
    if (s === "collected") return { text: "مدفوع بالكامل", cls: "text-blue-600 dark:text-blue-400" };
    if (s === "deposit_only") return { text: "عربون", cls: "text-amber-600 dark:text-amber-400" };
    if (s === "cancelled") return { text: "ملغي", cls: "text-slate-400 dark:text-slate-500" };
    if (s === "refunded") return { text: "مُسترجَع", cls: "text-orange-600 dark:text-orange-400" };
    return { text: "مدفوع", cls: "text-slate-500" };
  };

  const { income: totalIn, refunds: totalRefunds, expenses: totalOut, net, receivables } = transactionHistoryTotals(items);
  const showTotal = (value: number) => isLoading || isError ? "—" : value.toLocaleString("ar-SA");

  return (
    <div className="space-y-4">
      {/* Header card with dual calendar filter */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <ListChecks className="w-4 h-4 text-slate-600 shrink-0" />
          <div>
            <h3 className="font-bold text-base text-foreground">سجل المعاملات المالية</h3>
            <p className="text-[11px] text-muted-foreground">سجل مفصّل لجميع الإيرادات والمصروفات</p>
          </div>
          <SectionGuideButton sectionKey="transactions" />
          {!isLoading && !isError && (
            <div className="ms-auto text-xs font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
              {items.length} معاملة
            </div>
          )}
        </div>
        {/* Calendar toggle + year + month selectors */}
        <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto">
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {(["hijri", "gregorian"] as const).map(mode => (
              <button key={mode} type="button"
                 onClick={() => {
                   const currentMonth = getCurrentFinanceMonth(mode);
                   setHistCalType(mode);
                   setHistYear(currentMonth.split("-")[0]);
                   setHistMonth(currentMonth);
                 }}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${histCalType === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{mode === "hijri" ? "هجري" : "ميلادي"}</button>
            ))}
          </div>
           <Select value={histYear || "__all__"} onValueChange={yr => { setHistYear(yr === "__all__" ? "" : yr); setHistMonth(""); }}>
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
              {histYear
                ? <span className="text-sm font-medium">{histCalType === "hijri" ? `${toArN(Number(histYear))} هـ` : `${toArN(Number(histYear))} م`}</span>
                : <span className="text-sm text-muted-foreground">كل السنوات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
              {histYearOptions.map(yr => (
                <SelectItem key={yr} value={yr}>
                  {histCalType === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={!histYear ? "all" : (histMonth || "all")}
              onValueChange={v => { if (histYear) setHistMonth(v === "all" ? "" : v); }}
            disabled={!histYear}
          >
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl">
              {histMonth && histYear ? (() => {
                const ms = Number(histMonth.split("-")[1]);
                return histCalType === "hijri"
                  ? <span className="font-medium">{HIJRI_MONTHS_AR[ms - 1]}</span>
                  : <span className="font-medium">{GREGORIAN_MONTHS_AR[ms - 1]}</span>;
               })() : <span className="text-sm text-muted-foreground">كل الشهور</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
               <SelectItem value="all"><span className="text-sm">كل الشهور</span></SelectItem>
              {histMonthOptions.map(key => {
                const [ys, ms] = key.split("-").map(Number);
                const primary = histCalType === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                const corr = getCalCorrespondenceHint(key, histCalType);
                return (
                  <SelectItem key={key} value={key} textValue={primary}>
                    <div style={{width:"100%",direction:"rtl"}}>
                      <div style={{fontWeight:"600",fontSize:"13px",textAlign:"right"}}>{primary}</div>
                      {corr && <div style={{fontSize:"11px",color:"#888",textAlign:"right",marginTop:"1px"}}>{corr}</div>}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards — 3 cards: إيرادات / مسترجع / مصروفات */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-3.5">
          <div className="text-sm text-green-700 dark:text-green-400 font-semibold">الإيرادات بعد الاستردادات</div>
          <div className="text-xl font-extrabold text-green-700 dark:text-green-300 tabular-nums mt-0.5">{showTotal(totalIn)} <span className="text-xs font-normal">ر.س</span></div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-900/10 p-3.5">
          <div className="text-xs text-orange-700 dark:text-orange-400 font-semibold">إجمالي المسترجع</div>
          <div className="text-xl font-extrabold text-orange-700 dark:text-orange-300 tabular-nums mt-0.5">{showTotal(totalRefunds)} <span className="text-xs font-normal">ر.س</span></div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 p-3.5">
          <div className="text-xs text-red-700 dark:text-red-400 font-semibold">إجمالي المصروفات</div>
          <div className="text-xl font-extrabold text-red-700 dark:text-red-300 tabular-nums mt-0.5">{showTotal(totalOut)} <span className="text-xs font-normal">ر.س</span></div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
          <div className="text-sm text-foreground font-semibold">صافي الدخل</div>
          <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${net < 0 ? "text-red-700 dark:text-red-400" : "text-foreground"}`}>{showTotal(net)} <span className="text-xs font-normal">ر.س</span></div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3.5">
          <div className="text-sm text-amber-800 dark:text-amber-300 font-semibold">المبالغ المتبقية</div>
          <div className="text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums mt-0.5">{showTotal(receivables)} <span className="text-xs font-normal">ر.س</span></div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">الإجماليات تخص النشاط والفترة المعروضين. صافي الدخل = المحصّل − المسترجع − المصروفات والمسحوبات. المبالغ المتبقية والتأمينات القابلة للاسترداد ليست إيراداً محصّلاً، والإيداع البنكي لا يكرر الإيراد.</p>

      {/* Table */}
      {isError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-destructive">
          تعذّر تحميل سجل المعاملات. لم تُعرض أرقام صفرية بديلة.
          <Button variant="outline" size="sm" className="ms-3" onClick={() => void refetch()}>إعادة المحاولة</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <div className="text-3xl mb-2">📭</div>لا توجد معاملات في هذه الفترة
        </div>
      ) : (
         <div ref={historyPagination.tableRef} className="rounded-2xl border border-border overflow-hidden scroll-mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-muted/50 text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-right">التاريخ</th>
                  <th className="px-4 py-3 text-right">النوع</th>
                  <th className="px-4 py-3 text-right">طريقة الدفع</th>
                  <th className="px-4 py-3 text-right">البيان</th>
                  <th className="px-4 py-3 text-left">المبلغ</th>
                  <th className="px-4 py-3 text-right">الحالة / إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                 {historyPagination.paginatedItems.map(item => {
                  const tl = typeLabel(item.type, item.method);
                  const sl = statusLabel(item.status);
                  const isIncome = item.type === "income";
                  const isCancelled = item.status === "cancelled";
                  const cashPending = isIncome && item.method === "cash" && item.cashDeposited === false && !isCancelled;
                  const needsDeposit = cashPending && /^b-\d+$/.test(item.id);
                  const isUpdating = updatingId === item.id;
                  const methodBadge = isIncome
                    ? item.method === "transfer"
                      ? { icon: "🏦", label: "تحويل", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" }
                      : item.method === "pos"
                        ? { icon: "💳", label: "شبكة", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" }
                        : { icon: "💵", label: "كاش", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" }
                    : null;
                  const arabicLabel = item.label
                    .replace(/\bWithdrawal\b/gi, "سحب نقدي")
                    .replace(/\bwithdraw\b/gi, "سحب نقدي")
                    .replace(/\bExpense\b/gi, "مصروف")
                    .replace(/\bIncome\b/gi, "إيراد")
                    .replace(/\bBooking\b/gi, "حجز")
                    .replace(/\bRefund\b/gi, "استرداد")
                    .replace(/\bCancellation\b/gi, "إلغاء")
                    .replace(/\bDeposit\b/gi, "عربون")
                    .replace(/\bCleaning\b/gi, "تنظيف")
                    .replace(/\bMaintenance\b/gi, "صيانة");
                  const { hijri: _dHijri, gregorian: _dGreg } = formatDualDate(item.date);
                  return (
                    <tr key={item.id} className={`hover:bg-muted/30 transition-colors ${needsDeposit ? "bg-amber-50/40 dark:bg-amber-950/10" : ""} ${isCancelled ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap leading-tight">
                        <span className="block">{_dHijri.replace(/\s*هـ\s*$/, "")}</span>
                        <span className="block opacity-60">({_dGreg})</span>
                      </td>
                      <td className="px-4 py-3 space-y-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tl.cls}`}>{tl.text}</span>
                        {cashPending && (
                          <div>
                            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">💵 سيولة يدوية</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {methodBadge ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${methodBadge.cls}`}>
                            {methodBadge.icon} {methodBadge.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-[130px] break-words whitespace-normal">
                        <div className="text-foreground font-medium text-sm">{arabicLabel}</div>
                        {item.bookingId ? (
                          <span className="inline-flex items-center mt-0.5 text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                            #{item.bookingId}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-left font-bold tabular-nums whitespace-nowrap">
                        {isCancelled ? (
                          <span className="text-muted-foreground/60 line-through text-sm">
                            {item.amount > 0 ? item.amount.toLocaleString("ar-SA") : "—"}
                          </span>
                        ) : (
                          <span className="inline-flex items-baseline gap-1.5">
                            <span className={`text-base leading-none font-extrabold ${isIncome ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                              {isIncome ? "+" : "−"}
                            </span>
                            <span className="text-foreground">{item.amount.toLocaleString("ar-SA")}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {needsDeposit ? (
                            <button
                              onClick={() => markDeposited(item.id)}
                              disabled={isUpdating}
                              className="inline-flex items-center gap-1 rounded-lg border border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-[11px] font-bold px-2.5 py-1.5 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50"
                            >
                              {isUpdating ? "..." : "✓ تم الإيداع"}
                            </button>
                          ) : (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`text-xs font-semibold ${sl.cls}`}>{sl.text}</span>
                              {item.remainingBalance && item.remainingBalance > 0 ? (
                                <span className="text-[10px] text-muted-foreground leading-tight">
                                  المتبقي: {item.remainingBalance.toLocaleString("ar-SA")} ر.س
                                </span>
                              ) : null}
                            </div>
                          )}
                          {item.paymentReceiptUrl && (
                            <button
                              type="button"
                              onClick={() => setReceiptLightboxTx(item.paymentReceiptUrl!)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              🧾 عرض الإيصال
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
           <PaginationBar
             page={historyPagination.page}
             pageSize={historyPagination.pageSize}
             totalItems={items.length}
             totalPages={historyPagination.totalPages}
             onPageChange={historyPagination.goToPage}
             onPageSizeChange={historyPagination.changePageSize}
           />
        </div>
      )}

      {/* Receipt Lightbox */}
      {receiptLightboxTx && (
        <Dialog open onOpenChange={() => setReceiptLightboxTx(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-0" dir="ltr">
            <img src={receiptLightboxTx} alt="إيصال" className="max-h-[82vh] w-full object-contain rounded" />
            <button type="button" onClick={() => setReceiptLightboxTx(null)} className="absolute top-3 left-3 text-white/70 hover:text-white bg-black/40 rounded-full p-1 transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
