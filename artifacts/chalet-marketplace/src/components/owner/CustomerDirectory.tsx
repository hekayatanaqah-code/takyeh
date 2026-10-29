import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { getOwnerCrmCustomers, type GetOwnerCrmCustomersParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { archivePageNumbers } from "@/lib/bookingArchive";
import { fromAr, toAr } from "@/lib/utils";
import { CustomerDate } from "./CustomerDate";
import type { CustomerCalendar } from "@/lib/customerPresentation";

type Scope = "all" | "chalet" | "service";
type Sort = "activity" | "bookings" | "revenue";

export function CustomerDirectory({ scope, providerId, selected, onSelect, calendar, guide }: {
  scope: Scope; providerId?: number; selected: string | null;
  onSelect: (phone: string) => void; calendar: CustomerCalendar; guide?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ search: "", source: "all" as Scope, sort: "activity" as Sort, page: 1 });
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(previous => previous.search === search ? previous : { ...previous, search, page: 1 });
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params: GetOwnerCrmCustomersParams = {
    scope, providerId, ...filters, search: filters.search.trim() || undefined,
  };
  const directory = useQuery({
    queryKey: ["owner", "crm-customers", params],
    queryFn: ({ signal }) => getOwnerCrmCustomers(params, { signal, credentials: "include" }),
    staleTime: 15_000, refetchInterval: 60_000,
  });
  const data = directory.data;
  const busy = directory.isFetching || search !== filters.search;
  const showSources = scope === "all";
  const goToPage = (page: number) => {
    setFilters(previous => ({ ...previous, page }));
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return <section ref={top} className="flex flex-col gap-3 min-w-0" aria-label="قائمة العملاء" data-testid="customer-directory" aria-busy={busy}>
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2"><h2 className="text-base font-bold text-foreground">عملائي</h2>{guide}</div>
      <span className="text-xs text-muted-foreground">{data ? `${toAr(data.totalCustomers)} عميل` : "جارٍ التحميل…"}</span>
    </div>
    {showSources && <div className="flex items-center gap-1.5 flex-wrap">
      {([{ key: "all", label: "الكل" }, { key: "chalet", label: "عقارات" }, { key: "service", label: "خدمات" }] as const).map(({ key, label }) =>
        <button key={key} type="button" aria-pressed={filters.source === key}
          onClick={() => setFilters(previous => ({ ...previous, source: key, page: 1 }))}
          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${filters.source === key
            ? key === "service" ? "bg-amber-500 text-white border-amber-500" : key === "chalet"
              ? "bg-primary text-primary-foreground border-primary" : "bg-foreground text-background border-foreground"
            : "border-border text-muted-foreground hover:border-foreground"}`}>{label}</button>)}
    </div>}
    <div className="relative">
      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input aria-label="البحث باسم العميل أو رقم الجوال" value={toAr(search)}
        onChange={event => setSearch(fromAr(event.target.value))} placeholder="ابحث بالاسم أو الجوال…"
        className="pr-9 text-sm" dir="rtl" />
    </div>
    <Select value={filters.sort} onValueChange={sort => setFilters(previous => ({ ...previous, sort: sort as Sort, page: 1 }))}>
      <SelectTrigger dir="rtl" aria-label="ترتيب قائمة العملاء" className="text-sm"><SelectValue /></SelectTrigger>
      <SelectContent dir="rtl">
        <SelectItem value="activity">الأحدث نشاطاً</SelectItem>
        <SelectItem value="bookings">الأكثر حجوزات</SelectItem>
        <SelectItem value="revenue">الأكثر إيراداً</SelectItem>
      </SelectContent>
    </Select>
    {filters.sort === "activity" && <p className="text-xs text-muted-foreground">أصحاب الحجوزات النشطة والقادمة أولاً، ثم الأحدث حجزاً.</p>}
    {directory.isError ? <div role="alert" className="text-center text-sm py-8">
      <p className="text-destructive">تعذّر تحميل قائمة العملاء.</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={() => { void directory.refetch(); }}>إعادة المحاولة</Button>
    </div> : !data ? <div className="flex justify-center py-16"><Loader2 aria-label="جارٍ تحميل العملاء" className="animate-spin text-primary w-6 h-6" /></div>
      : data.items.length === 0 ? <p role="status" className="text-center py-12 text-muted-foreground text-sm">
        {filters.search || filters.source !== "all" ? "لا توجد نتائج مطابقة" : "لا يوجد عملاء بعد — أضف أول حجز لعميلك"}
      </p> : <div className="flex flex-col gap-2">
        {data.items.map(customer => <button type="button" key={customer.client_phone || `name:${customer.client_name}`}
          data-testid="customer-directory-row" disabled={!customer.client_phone}
          onClick={() => onSelect(customer.client_phone)}
          className={`w-full text-start rounded-xl border px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/30 disabled:opacity-60 ${
            selected === customer.client_phone ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-foreground truncate">{customer.client_name}</p>
            <div className="flex items-center gap-1 shrink-0">
              {showSources && <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${
                customer.source === "both" ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400" : customer.source === "service"
                  ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-primary/10 text-primary"}`}>
                {customer.source === "both" ? "عقار + خدمة" : customer.source === "service" ? "خدمة" : "عقار"}
              </span>}
              <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                {toAr(customer.total_bookings)} {customer.source === "service" ? "موعد" : customer.total_bookings >= 3 && customer.total_bookings <= 10 ? "حجوزات" : "حجز"}
              </span>
              {!!customer.total_sales && <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">{toAr(customer.total_sales)} بيع سريع</span>}
            </div>
          </div>
          <p dir="ltr" className="text-xs text-muted-foreground mt-0.5 text-right">{toAr(customer.client_phone)}</p>
          {customer.providers.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 truncate">{customer.providers.join("، ")}</p>}
          <div className="mt-1">
            <p className="text-xs text-muted-foreground">آخر عملية:</p>
            <span className="text-xs leading-snug"><CustomerDate value={customer.last_booking_date} preference={calendar} /></span>
          </div>
        </button>)}
      </div>}
    {data && !directory.isError && <div className="border-t border-border pt-3 space-y-2">
      <p role="status" className="text-xs text-center text-muted-foreground">
        {busy && <Loader2 aria-label="جارٍ تحديث القائمة" className="inline-block w-3.5 h-3.5 animate-spin ml-1" />}
        {data.total ? `${toAr((data.page - 1) * data.pageSize + 1)}–${toAr(Math.min(data.page * data.pageSize, data.total))} من ${toAr(data.total)} عميل` : "٠ عميل"}
      </p>
      {data.totalPages > 1 && <nav aria-label="صفحات قائمة العملاء" className="flex flex-wrap justify-center items-center gap-1">
        <Button size="sm" variant="outline" disabled={busy || data.page <= 1} onClick={() => goToPage(data.page - 1)}>السابق</Button>
        {archivePageNumbers(data.page, data.totalPages).map((page, index) => page === "gap" ? <span key={`gap-${index}`}>…</span> :
          <Button key={page} size="sm" className="w-8 px-0" variant={page === data.page ? "default" : "outline"}
            disabled={busy} aria-current={page === data.page ? "page" : undefined} onClick={() => goToPage(page)}>{toAr(page)}</Button>)}
        <Button size="sm" variant="outline" disabled={busy || data.page >= data.totalPages} onClick={() => goToPage(data.page + 1)}>التالي</Button>
      </nav>}
    </div>}
  </section>;
}
