import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import BookingArchiveControls, { type ArchiveFilters } from "./BookingArchiveControls";
import BookingArchivePagination from "./BookingArchivePagination";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "./owner-api";
import { archiveCalendarMonth, archiveCalendarYear, archiveCalendarYears, archiveDateRange, EMPTY_ARCHIVE_FILTERS, getArchiveDateError } from "@/lib/bookingArchive";
import { filterServiceBookingArchive, buildServiceBookingArchiveTable, type ServiceArchiveAppointment, type ServiceArchiveTab } from "@/lib/serviceBookingArchive";
import type { ReportCalendar } from "@/lib/bookingArchiveReport";
import takyahLogoSrc from "@/assets/platform-logo.png";

type Props = {
  providerId: number;
  serviceName: string;
  appointments: ServiceArchiveAppointment[];
  now: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  renderBooking: (appointment: ServiceArchiveAppointment) => ReactNode;
};

export function ServiceBookingArchive({ providerId, serviceName, appointments, now, loading, error, onRetry, renderBooking }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ServiceArchiveTab>("completed");
  const [filters, setFilters] = useState<ArchiveFilters>({ ...EMPTY_ARCHIVE_FILTERS });
  const [calendar, setCalendar] = useState<ReportCalendar>("hijri");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const profile = useQuery<{ fullName?: string; phone?: string; reportsCalPref?: ReportCalendar; bookingsCalPref?: ReportCalendar }>({
    queryKey: ["owner", "profile-btype"],
    queryFn: async () => {
      const response = await apiFetch("/owner/profile");
      if (!response.ok) throw new Error("تعذر تحميل بيانات الحساب");
      return response.json();
    },
  });
  const preferred = profile.data?.reportsCalPref ?? profile.data?.bookingsCalPref ?? "hijri";
  useEffect(() => {
    setCalendar(preferred);
    setFilters(previous => ({
      ...previous,
      year: previous.period === "month" || previous.period === "year" ? String(archiveCalendarYear(preferred)) : "",
      month: previous.period === "month" ? String(archiveCalendarMonth(preferred)) : "",
    }));
    setPage(1);
  }, [preferred]);
  const matches = useMemo(() => filterServiceBookingArchive(appointments, providerId, tab, filters, calendar, now),
    [appointments, providerId, tab, filters, calendar, now]);
  const totalPages = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.min(page, totalPages);
  const items = matches.slice((currentPage - 1) * 10, currentPage * 10);
  const years = archiveCalendarYears(appointments.filter(a => a.providerId === providerId).map(a => a.dateStr.slice(0, 4)), calendar, now);
  const failed = error || profile.isError;
  const busy = loading || profile.isLoading;

  async function exportArchive(format: "xlsx" | "pdf") {
    if (exporting || failed || busy || !matches.length || getArchiveDateError(filters, now)) return;
    setExporting(true);
    try {
      const table = buildServiceBookingArchiveTable(matches, serviceName, tab, calendar);
      const { exportArchiveFile } = await import("@/lib/bookingArchiveExport");
      await exportArchiveFile(format, table, {
        propertyNames: [serviceName], ownerName: profile.data?.fullName || "غير مسجل", ownerPhone: profile.data?.phone || "",
        platformLogoUrl: takyahLogoSrc, calendarPreference: calendar, ...archiveDateRange(filters, now, calendar),
        search: filters.search.trim() || undefined, issuedAt: new Date().toISOString(),
      });
    } catch (cause) {
      toast({ title: "تعذر تصدير أرشيف الخدمة", description: cause instanceof Error ? cause.message : "حاول مرة أخرى.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return <section dir="rtl" className="min-w-0 bg-card border border-border rounded-2xl overflow-hidden scroll-mt-24" data-testid="service-booking-archive">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
      className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors">
      <span className="flex items-center gap-2"><Archive className="w-4 h-4" />الأرشيف</span>
      {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
    </button>
    {open && <div className="border-t border-border">
      <div dir="rtl" className="flex gap-1 px-5 pt-4">
        {([["completed", "المكتملة"], ["cancelled", "الملغاة"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${tab === value
              ? value === "completed" ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"
              : "text-muted-foreground hover:bg-muted/40"}`}>{label}</button>)}
      </div>
      <div className="space-y-4 p-3 sm:p-5">
        <BookingArchiveControls filters={filters} onChange={value => { setFilters(value); setPage(1); }}
          years={years} total={matches.length} loading={busy || failed} exporting={exporting} onExport={exportArchive}
          calendarMode={calendar} onCalendarModeChange={value => {
            setCalendar(value);
            setFilters(previous => ({ ...previous,
              year: previous.period === "year" || previous.period === "month" ? String(archiveCalendarYear(value)) : "",
              month: previous.period === "month" ? String(archiveCalendarMonth(value)) : "",
            }));
            setPage(1);
          }} />
        {failed ? <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm space-y-2">
          <p>تعذر تحميل أرشيف الخدمة أو بيانات الحساب. لا تعني هذه الحالة عدم وجود حجوزات.</p>
          <Button variant="outline" onClick={() => { onRetry(); void profile.refetch(); }}>إعادة المحاولة</Button>
        </div> : busy ? <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
          : getArchiveDateError(filters, now) ? null
          : !matches.length ? <p className="p-8 text-center text-sm text-muted-foreground">لا توجد حجوزات تطابق فلاتر الأرشيف.</p>
          : <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map(renderBooking)}</div>}
        {!busy && !failed && matches.length > 0 && <BookingArchivePagination page={currentPage} total={matches.length} loading={false}
          label="صفحات أرشيف حجوزات الخدمات" onChange={setPage} />}
      </div>
    </div>}
  </section>;
}
