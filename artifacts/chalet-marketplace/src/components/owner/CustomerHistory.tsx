import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pin, Search } from "lucide-react";
import { getOwnerCrmHistory, type CrmCustomerSummary, type CrmHistoryRecord, type GetOwnerCrmHistoryParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { archiveDateRange, archivePageNumbers, EMPTY_ARCHIVE_FILTERS } from "@/lib/bookingArchive";
import { customerHistorySearch } from "@/lib/customerHistoryFilters";
import { fromAr, toAr } from "@/lib/utils";
import { CustomerDate } from "./CustomerDate";
import type { CustomerCalendar } from "@/lib/customerPresentation";

type HistoryTab = "bookings" | "contracts" | "insurance";
type HistoryStatus = "all" | "active" | "completed" | "cancelled";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PERIODS: Record<string, string> = { morning: "صباحي", evening: "مسائي", full_day: "يومي كامل", fullday: "يومي كامل" };

function bookingStatus(row: CrmHistoryRecord) {
  if (row.cancelled || row.cancelled_at) return { label: "ملغى", cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (row.is_active) return { label: "نشط / قادم", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" };
  return { label: "مكتمل", cls: "bg-muted text-muted-foreground" };
}

function insuranceStatus(row: CrmHistoryRecord) {
  if (row.insurance_refunded) return Number(row.insurance_deducted) > 0 ? "تمت التسوية بخصم" : "معاد بالكامل";
  if (!row.insurance_received) return "غير مستلم";
  return "بحوزة المالك";
}

export function CustomerHistory({ profile, providerId, calendar, onCalendarChange }: {
  profile: CrmCustomerSummary; providerId?: number;
  calendar: CustomerCalendar; onCalendarChange: (calendar: CustomerCalendar) => void;
}) {
  const [tab, setTab] = useState<HistoryTab>("bookings");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all" as HistoryStatus, period: "all" as "all" | "this-month" | "last-month", search: "", page: 1 });
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(previous => previous.search === search ? previous : { ...previous, search, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const range = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: filters.period }, Date.now(), calendar);
  const params: GetOwnerCrmHistoryParams = {
    phone: profile.clientPhone, providerId, tab, status: filters.status,
    page: filters.page, search: customerHistorySearch(filters.search) || undefined, ...range,
  };
  const history = useQuery({
    queryKey: ["owner", "crm-history", params],
    queryFn: ({ signal }) => getOwnerCrmHistory(params, { signal, credentials: "include" }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const data = history.data;
  const busy = history.isFetching || filters.search !== search;
  const tabs = [
    { id: "bookings", label: "سجل الحجوزات", count: profile.totalBookings },
    { id: "contracts", label: "العقود الرقمية", count: profile.contractCount },
    { id: "insurance", label: "سجل التأمينات", count: profile.insuranceCount },
  ] as const;
  const resetPage = () => setFilters(previous => ({ ...previous, page: 1 }));
  const timestampDay = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  return <section className="bg-card border border-border rounded-2xl overflow-hidden" aria-label="سجلات العميل" data-testid="customer-history">
    <div role="tablist" aria-label="نوع سجل العميل" className="flex border-b border-border bg-muted/20">
      {tabs.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
        onClick={() => { setTab(item.id); resetPage(); }}
        className={`flex-1 min-w-0 py-3 px-1 text-xs font-semibold flex flex-wrap items-center justify-center gap-1.5 border-b-2 ${tab === item.id ? "border-primary text-primary bg-background" : "border-transparent text-muted-foreground hover:bg-muted/40"}`}>
        {item.label}<span className="rounded-full px-1.5 bg-muted text-[10px]">{toAr(item.count)}</span>
      </button>)}
    </div>
    <div className="p-3 sm:p-4 space-y-3">
      <div className="relative">
        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="البحث في سجلات العميل" value={toAr(search)} onChange={event => setSearch(fromAr(event.target.value))}
          placeholder="رقم الحجز أو التاريخ (يوم/شهر/سنة)" className="pr-9" dir="rtl" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-border shrink-0" aria-label="التقويم">
          {(["hijri", "gregorian"] as const).map(mode => <button key={mode} type="button" aria-pressed={calendar === mode}
            onClick={() => { onCalendarChange(mode); resetPage(); }}
            className={`text-xs px-3 h-9 font-medium ${calendar === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
            {mode === "hijri" ? "هجري" : "ميلادي"}
          </button>)}
        </div>
        <Select value={filters.status} onValueChange={status => setFilters(previous => ({ ...previous, status: status as HistoryStatus, page: 1 }))}>
          <SelectTrigger aria-label="حالة سجلات العميل" dir="rtl" className="h-9 text-xs w-[145px]"><SelectValue /></SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">كل الحالات</SelectItem><SelectItem value="active">نشط / قادم</SelectItem>
            <SelectItem value="completed">مكتمل</SelectItem><SelectItem value="cancelled">ملغى</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.period} onValueChange={period => setFilters(previous => ({ ...previous, period: period as typeof previous.period, page: 1 }))}>
          <SelectTrigger aria-label="فترة سجلات العميل" dir="rtl" className="h-9 text-xs w-[145px]"><SelectValue /></SelectTrigger>
          <SelectContent dir="rtl"><SelectItem value="all">كل الفترات</SelectItem>
            <SelectItem value="this-month">هذا الشهر</SelectItem><SelectItem value="last-month">الشهر السابق</SelectItem>
          </SelectContent>
        </Select>
        {(search || filters.status !== "all" || filters.period !== "all") &&
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
            setSearch(""); setFilters({ status: "all", period: "all", search: "", page: 1 });
          }}>مسح الفلاتر</Button>}
        {busy && <Loader2 aria-label="جارٍ تحديث السجل" className="h-4 w-4 animate-spin text-primary" />}
      </div>
      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        {tab === "bookings" && <Pin className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
        {tab === "bookings" ? "الحجوزات النشطة والقادمة مثبتة أولًا؛ الأحدث أولًا داخل كل مجموعة." : "مرتّب من الأحدث إلى الأقدم."}
      </p>
      {history.isError ? <div role="alert" className="py-6 text-center text-sm">
        <p className="text-destructive">تعذّر تحميل السجلات؛ لم تتغير بيانات العميل.</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => { void history.refetch(); }}>إعادة المحاولة</Button>
      </div> : !data ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
        : data.items.length === 0 ? <p role="status" className="text-center text-sm text-muted-foreground py-8">لا توجد سجلات مطابقة للفلاتر الحالية.</p>
          : <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-xs text-right" aria-label={tabs.find(item => item.id === tab)!.label}>
              <thead className="bg-muted/30 text-muted-foreground"><tr>
                <th className="p-2 font-medium">رقم الحجز</th><th className="p-2 font-medium">التاريخ{tab === "bookings" ? " والمدة" : ""}</th>
                {tab !== "insurance" && <th className="p-2 font-medium">{providerId ? "الخدمة" : "العقار"}</th>}
                {tab === "bookings" && <th className="p-2 font-medium">الحالة</th>}
                <th className="p-2 font-medium">{tab === "contracts" ? "العقد" : tab === "insurance" ? "مبلغ التأمين" : "الإجمالي"}</th>
                {tab === "insurance" && <th className="p-2 font-medium">الحالة</th>}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {data.items.map(row => {
                  const status = bookingStatus(row);
                  return <tr key={row.id} data-testid={`customer-history-row-${row.id}`}
                    className={tab === "bookings" && row.is_active ? "bg-primary/[0.035]" : "hover:bg-muted/20"}>
                    <td className="p-2 align-top font-semibold text-primary">
                      <span dir="ltr">#{toAr(row.id)}</span>
                      {tab === "bookings" && row.is_active && <span className="flex items-center gap-1 mt-1 text-[10px]"><Pin className="w-3 h-3" />مثبت</span>}
                    </td>
                    <td className="p-2 align-top"><CustomerDate value={row.booking_date} preference={calendar} />
                      {tab === "bookings" && <>
                        <p className="text-muted-foreground mt-1">{row.duration_days ? `${toAr(row.duration_days)} يوم · ` : ""}{PERIODS[row.period ?? ""] ?? row.period ?? ""}</p>
                        {row.cancelled_at && <div className="mt-1"><p className="text-red-700">تم الإلغاء:</p><CustomerDate value={timestampDay(row.cancelled_at)} preference={calendar} /></div>}
                        {row.original_date && <div className="mt-1"><p className="text-blue-700">الموعد السابق:</p><CustomerDate value={row.original_date.slice(0, 10)} preference={calendar} /></div>}
                        {row.rescheduled_at && <div className="mt-1"><p className="text-blue-700">تاريخ التعديل:</p><CustomerDate value={timestampDay(row.rescheduled_at)} preference={calendar} /></div>}
                      </>}
                    </td>
                    {tab !== "insurance" && <td className="p-2 align-top max-w-[150px] break-words">{row.chalet_name || "—"}</td>}
                    {tab === "bookings" && <td className="p-2 align-top"><span className={`inline-flex rounded-full px-2 py-1 whitespace-nowrap ${status.cls}`}>{status.label}</span></td>}
                    <td className="p-2 align-top whitespace-nowrap">
                      {tab === "contracts" ? <a href={`${BASE}/${providerId ? "service-contract" : "contract"}/${row.id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex border border-primary/30 rounded-lg px-2.5 py-1 text-primary hover:bg-primary/10">عرض العقد</a>
                        : <span className="font-semibold">{toAr(Math.round(Number(tab === "insurance" ? row.insurance_fee : row.total_price)))} ر.س</span>}
                    </td>
                    {tab === "insurance" && <td className="p-2 align-top">{insuranceStatus(row)}</td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
      {data && <div className="space-y-2 border-t border-border pt-3">
        <p role="status" className="text-xs text-muted-foreground text-center">
          {data.total ? `${toAr((data.page - 1) * data.pageSize + 1)}–${toAr(Math.min(data.page * data.pageSize, data.total))} من ${toAr(data.total)} سجل` : "٠ سجل"}
        </p>
        {data.totalPages > 1 && <nav aria-label="صفحات سجل العميل" className="flex flex-wrap items-center justify-center gap-1">
          <Button size="sm" variant="outline" disabled={busy || data.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: data.page - 1 }))}>السابق</Button>
          {archivePageNumbers(data.page, data.totalPages).map((page, index) => page === "gap" ? <span key={`gap-${index}`}>…</span> :
            <Button key={page} size="sm" variant={page === data.page ? "default" : "outline"} aria-current={page === data.page ? "page" : undefined}
              disabled={busy} onClick={() => setFilters(previous => ({ ...previous, page }))} className="w-8 px-0">{toAr(page)}</Button>)}
          <Button size="sm" variant="outline" disabled={busy || data.page >= data.totalPages} onClick={() => setFilters(previous => ({ ...previous, page: data.page + 1 }))}>التالي</Button>
        </nav>}
      </div>}
    </div>
  </section>;
}
