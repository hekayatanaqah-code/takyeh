import { useState, useMemo } from "react";
import { buildBankLedger, formatBankAmount, bankLedgerTotals, type LedgerDeposit, type LedgerExpense, type LedgerPayment, type LedgerServiceAppointment } from "@/lib/bankLedger";
import { useQuery } from "@tanstack/react-query";
import { useListQuickSales } from "@workspace/api-client-react";
import { BankLedgerSummary } from "@/components/owner/BankLedgerSummary";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatDualDate, HIJRI_MONTHS_AR } from "@/lib/hijri";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toAr } from "@/lib/utils";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { GREGORIAN_MONTHS_AR, getBookingMonthKey, getCalCorrespondenceHint, getCurrentFinanceMonth } from "@/components/owner/owner-calendar";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";
import { EXPENSE_CATS, PaginatedItems, PaginationBar } from "@/components/owner/finance-shared";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { toArN } from "@/components/owner/owner-formatting";


/* ── BankLedgerTab — Standalone Bank Account Ledger ──────────── */
export function BankLedgerTab() {
  const { unit } = useAdminFinance();
  const [activeTab, setActiveTab] = useState<"all" | "revenue" | "insurance" | "cash_deposit" | "expense">("all");
  const [bankCalType, setBankCalType] = useState<"hijri" | "gregorian">("hijri");
  const initialBankMonth = getCurrentFinanceMonth("hijri");
  const [bankYear, setBankYear] = useState<string>(() => initialBankMonth.split("-")[0]);
  const [bankMonth, setBankMonth] = useState<string>(() => initialBankMonth);
  const fmtN = formatBankAmount;

  const { data: allBookings = [], isLoading: bkLoading, isError: bkError, refetch: refetchLedgerBookings } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings-ledger", unit],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) throw new Error("تعذر تحميل حجوزات الحساب البنكي");
      return r.json();
    },
    enabled: unit.type !== "service",
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const { data: depositLogs = [], isLoading: logsLoading, isError: logsError, refetch: refetchLedgerLogs } = useQuery<LedgerDeposit[]>({
    queryKey: ["owner", "cash-deposit-logs-ledger"],
    queryFn: async () => {
      const r = await apiFetch("/owner/cash-deposit-logs");
      if (!r.ok) throw new Error("تعذر تحميل الإيداعات النقدية");
      return r.json();
    },
    enabled: unit.type !== "service",
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });

  const { data: ledgerExpenses = [], isLoading: expensesLoading, isError: expensesError, refetch: refetchLedgerExpenses } = useQuery<LedgerExpense[]>({
    queryKey: ["owner", "expenses"],
    queryFn: async () => {
      const response = await apiFetch("/owner/expenses");
      if (!response.ok) throw new Error("تعذر تحميل المصروفات");
      return response.json();
    },
    staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000,
  });
  const { data: ledgerPayments = [], isLoading: paymentsLoading, isError: paymentsError, refetch: refetchLedgerPayments } = useQuery<LedgerPayment[]>({
    queryKey: ["owner", "booking-payments-ledger"],
    queryFn: async () => {
      const response = await apiFetch("/owner/booking-payments");
      if (!response.ok) throw new Error("تعذر تحميل دفعات الحجوزات");
      return response.json();
    },
    enabled: unit.type !== "service", staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000,
  });
  const { data: ledgerServices = [], isLoading: servicesLoading, isError: servicesError, refetch: refetchLedgerServices } = useQuery<LedgerServiceAppointment[]>({
    queryKey: ["owner", "bank-ledger-services", unit.type === "service" ? unit.id : "all"],
    queryFn: async () => {
      let providerIds: number[];
      if (unit.type === "service") providerIds = [unit.id];
      else {
        const providersResponse = await apiFetch("/providers/my/approved");
        if (!providersResponse.ok) throw new Error("تعذر تحميل الخدمات");
        const providers: Array<{ id: number }> = await providersResponse.json();
        providerIds = providers.map(provider => provider.id);
      }
      const appointments = await Promise.all(providerIds.map(async providerId => {
        const response = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
        if (!response.ok) throw new Error("تعذر تحميل إيرادات الخدمة");
        return response.json() as Promise<LedgerServiceAppointment[]>;
      }));
      return appointments.flat();
    },
    enabled: unit.type !== "chalet", staleTime: 0, refetchOnMount: "always", refetchInterval: 60_000,
  });
  const ledgerQuickSalesQuery = useListQuickSales(unit.type === "service" ? { providerId: unit.id } : undefined, {
    query: { enabled: unit.type !== "chalet", staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000 },
  });
  const ledgerLoading = expensesLoading || (unit.type !== "service" && (bkLoading || logsLoading || paymentsLoading)) ||
    (unit.type !== "chalet" && (servicesLoading || ledgerQuickSalesQuery.isLoading));
  const ledgerFailed = expensesError || (unit.type !== "service" && (bkError || logsError || paymentsError)) ||
    (unit.type !== "chalet" && (servicesError || ledgerQuickSalesQuery.isError));
  const ledgerEntries = useMemo(() => buildBankLedger({
    scope: unit, bookings: allBookings, deposits: depositLogs, payments: ledgerPayments,
    expenses: ledgerExpenses, serviceAppointments: ledgerServices,
    quickSales: ledgerQuickSalesQuery.data,
    categoryLabels: Object.fromEntries(EXPENSE_CATS.map(category => [category.key, category.label])),
  }), [allBookings, depositLogs, ledgerPayments, ledgerExpenses, ledgerServices, ledgerQuickSalesQuery.data, unit]);

  const bankYearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(getCurrentFinanceMonth(bankCalType).split("-")[0]);
    for (const e of ledgerEntries) {
      if (!e.bookingDate) continue;
      years.add(getBookingMonthKey(e.bookingDate, bankCalType).split("-")[0]);
    }
    return Array.from(years).sort().reverse();
  }, [ledgerEntries, bankCalType]);

  const bankMonthOptions = useMemo(() => {
    const keys = new Set<string>();
    const currentMonth = getCurrentFinanceMonth(bankCalType);
    if (currentMonth.startsWith(bankYear)) keys.add(currentMonth);
    for (const e of ledgerEntries) {
      if (!e.bookingDate) continue;
      const key = getBookingMonthKey(e.bookingDate, bankCalType);
      if (bankYear && !key.startsWith(bankYear)) continue;
      keys.add(key);
    }
    return Array.from(keys).sort();
  }, [ledgerEntries, bankCalType, bankYear]);

  const filtered = useMemo(() => {
    let result = ledgerEntries;
    if (bankMonth) {
      result = result.filter(e => e.bookingDate && getBookingMonthKey(e.bookingDate, bankCalType) === bankMonth);
    } else if (bankYear) {
      result = result.filter(e => e.bookingDate && getBookingMonthKey(e.bookingDate, bankCalType).startsWith(bankYear));
    }
    if (activeTab !== "all") result = result.filter(e => e.type === activeTab);
    return result;
  }, [ledgerEntries, activeTab, bankCalType, bankYear, bankMonth]);

  return (
    <div className="space-y-4">
      <BankLedgerSummary entries={ledgerEntries} loading={ledgerLoading} failed={ledgerFailed} />
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <span className="text-2xl">🏦</span>
          <div>
            <h3 className="font-bold text-base text-foreground">سجل الحساب البنكي</h3>
            <p className="text-[11px] text-muted-foreground">كشف الحوالات والإيداعات والمصروفات المسحوبة</p>
          </div>
          <SectionGuideButton sectionKey="ledger" />
          {!ledgerLoading && !ledgerFailed && (
            <div className="ms-auto text-xs font-semibold text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
              {ledgerEntries.length} معاملة
            </div>
          )}
        </div>
        {/* ── Unified time filter bar ── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border overflow-x-auto">
          <div className="flex rounded-lg overflow-hidden border border-border shrink-0">
            {(["hijri", "gregorian"] as const).map(mode => (
              <button key={mode} type="button"
                onClick={() => {
                  const currentMonth = getCurrentFinanceMonth(mode);
                  setBankCalType(mode);
                  setBankYear(currentMonth.split("-")[0]);
                  setBankMonth(currentMonth);
                }}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${bankCalType === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >{mode === "hijri" ? "هجري" : "ميلادي"}</button>
            ))}
          </div>
          <Select value={bankYear || "__all__"} onValueChange={(yr) => { setBankYear(yr === "__all__" ? "" : yr); setBankMonth(""); }}>
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[7rem] shrink-0" dir="rtl">
              {bankYear
                ? <span className="text-sm font-medium">{bankCalType === "hijri" ? `${toArN(Number(bankYear))} هـ` : `${toArN(Number(bankYear))} م`}</span>
                : <span className="text-sm text-muted-foreground">كل السنوات</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="__all__"><span className="text-sm">كل السنوات</span></SelectItem>
              {bankYearOptions.map(yr => (
                <SelectItem key={yr} value={yr}>
                  {bankCalType === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={!bankYear ? "all" : (bankMonth || "all")}
            onValueChange={(v) => { if (bankYear) setBankMonth(v === "all" ? "" : v); }}
            disabled={!bankYear}
          >
            <SelectTrigger className="h-9 text-sm rounded-lg border-border w-[8rem] shrink-0" dir="rtl">
              {bankMonth && bankYear ? (() => {
                const ms = Number(bankMonth.split("-")[1]);
                return bankCalType === "hijri"
                  ? <span className="font-medium">{HIJRI_MONTHS_AR[ms - 1]}</span>
                  : <span className="font-medium">{GREGORIAN_MONTHS_AR[ms - 1]}</span>;
              })() : <span className="text-muted-foreground">كل الشهور</span>}
            </SelectTrigger>
            <SelectContent dir="rtl" align="end">
              <SelectItem value="all"><span className="text-sm">كل الشهور</span></SelectItem>
              {bankMonthOptions.map(key => {
                const [ys, ms] = key.split("-").map(Number);
                const primary = bankCalType === "hijri" ? `${HIJRI_MONTHS_AR[ms-1]} ${toArN(ys)} هـ` : `${GREGORIAN_MONTHS_AR[ms-1]} ${toArN(ys)} م`;
                const corr = getCalCorrespondenceHint(key, bankCalType);
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
        <div className="flex border-b border-border text-xs overflow-x-auto">
          {([
            ["all",          "🗂️ كل الحوالات"],
            ["revenue",      "إيرادات الحجوزات والمبيعات"],
            ["insurance",    "🔒 حوالات التأمينات"],
            ["cash_deposit", "💵 إيداعات نقدية"],
            ["expense",      "المصروفات المسحوبة 💸"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-4 py-3 font-semibold whitespace-nowrap transition-colors border-b-2 ${activeTab === id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {label}
            </button>
          ))}
        </div>
        {ledgerLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : ledgerFailed ? (
          <div role="alert" className="p-6 text-center space-y-3">
            <p className="text-sm text-destructive">تعذر تحميل بعض حركات الحساب. لم يُعرض رصيد ناقص.</p>
            <Button variant="outline" onClick={() => {
              void refetchLedgerExpenses();
              if (unit.type !== "service") { void refetchLedgerBookings(); void refetchLedgerLogs(); void refetchLedgerPayments(); }
              if (unit.type !== "chalet") { void refetchLedgerServices(); void ledgerQuickSalesQuery.refetch(); }
            }}>إعادة المحاولة</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-14">
            <div className="text-3xl mb-2">📭</div>لا توجد بيانات
          </div>
        ) : (
          <PaginatedItems items={filtered} resetKey={`${activeTab}|${bankCalType}|${bankYear}|${bankMonth}`}>
            {(pagination) => (
              <div ref={pagination.tableRef} className="scroll-mt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">تاريخ الحوالة</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">اسم العميل</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">رقم الحجز / البيعة</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">نوع الدفعة</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">الوصف</th>
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">المبلغ</th>
                  <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {pagination.paginatedItems.map(e => {
                  const _dualDate = e.bookingDate ? formatDualDate(e.bookingDate) : null;
                  const typeInfo = {
                    revenue:      { label: e.saleId ? "بيع سريع" : "🏠 حجز", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
                    insurance:    { label: "🔒 تأمين",       cls: "bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300" },
                    cash_deposit: { label: e.insuranceDeposit ? "💵 إيداع نقدي / تأمين" : "💵 إيداع نقدي", cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
                    expense:      { label: "💸 مصروف مسحوب", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
                  }[e.type];
                  const statusCls = e.type === "expense" ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : e.status === "مكتمل" || e.status === "تم الإيداع"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : e.status === "تم الرد" ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    : e.status === "محتجز"   ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
                  return (
                    <tr key={e.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 text-xs text-muted-foreground leading-tight whitespace-nowrap">
                        {_dualDate ? (
                          <>
                            <span className="block">{_dualDate.hijri.replace(/\s*هـ\s*$/, "")}</span>
                            <span className="block opacity-60">({_dualDate.gregorian})</span>
                          </>
                        ) : "—"}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-foreground">{e.clientName}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{e.saleId ? `#${toAr(e.saleId)}` : e.bookingId > 0 ? `#${toAr(e.bookingId)}` : "—"}</td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.cls}`}>{typeInfo.label}</span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-foreground max-w-[260px] break-words">{e.description}</td>
                      <td className="py-2.5 px-4 text-left">
                        <bdi dir="ltr" className={`font-bold tabular-nums whitespace-nowrap ${e.amount < 0 ? "text-red-700 dark:text-red-300" : "text-blue-600 dark:text-blue-400"}`}>{fmtN(e.amount, true)}</bdi>
                        <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>{e.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t-2 border-border">
                  <td colSpan={5} className="py-2.5 px-4 text-xs font-bold text-muted-foreground">صافي الحركات المعروضة</td>
                  <td className="py-2.5 px-4 text-left">
                    <bdi dir="ltr" className={`font-extrabold tabular-nums ${bankLedgerTotals(filtered).balance < 0 ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-400"}`}>{fmtN(bankLedgerTotals(filtered).balance)}</bdi>
                    <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
                  </table>
                </div>
                <PaginationBar
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  totalItems={filtered.length}
                  totalPages={pagination.totalPages}
                  onPageChange={pagination.goToPage}
                  onPageSizeChange={pagination.changePageSize}
                />
              </div>
            )}
          </PaginatedItems>
        )}
      </div>
    </div>
  );
}
