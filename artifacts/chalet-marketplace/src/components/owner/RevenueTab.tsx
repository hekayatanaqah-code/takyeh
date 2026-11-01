import { useEffect, useState, useMemo } from "react";
import { effectiveRevenueSource, quickSalesForPeriod, quickSalesTotal, type RevenueSource } from "@/lib/quickSalesRevenue";
import { useListQuickSales } from "@workspace/api-client-react";
import { formatDualDate, HIJRI_MONTHS_AR, toHijriComponents, getHijriMonthGregorianRange } from "@/lib/hijri";
import { revenueFilterPeriod, type RevenueFilterMode } from "@/lib/revenueFilterPeriod";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueries } from "@tanstack/react-query";
import { isInRevenuePeriod, revenueMonthKey, revenueSalesTitle } from "@/lib/revenuePeriod";
import { serviceRevenueBookings, serviceRevenueTotals } from "@/lib/serviceRevenue";
import { cashBreakdownTotal } from "@/lib/revenueLiquidity";
import { Clock, Trash2, RotateCcw, TrendingUp, Wallet, Receipt, Loader2, Banknote } from "lucide-react";
import { RevenueFilterBar } from "@/components/owner/RevenueFilterBar";
import { revenueMonthLabel } from "@/lib/revenueMonthLabel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import OwnerStatAmount from "@/components/owner/OwnerStatAmount";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { QuickSalesRevenueDetails } from "@/components/owner/QuickSalesRevenue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReceivablesMonthSelect } from "@/components/owner/ReceivablesMonthSelect";
import { toAr } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAdminFinance } from "@/components/owner/OwnerDashboardContexts";
import { getCurrentFinanceMonth, getLocalDateStr } from "@/components/owner/owner-calendar";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";
import { toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { PaginatedItems, PaginationBar } from "@/components/owner/finance-shared";
import { fromEasternArabic, toEasternArabic } from "@/components/owner/SubscriptionAccountBanner";
import { ProofViewerDialog } from "@/components/owner/PropertyBookingDialogs";


export function RevenueTab() {
  const { unit } = useAdminFinance();
  const [selectedRevenueSource, setRevenueSource] = useState<RevenueSource>("all");
  const quickSalesQuery = useListQuickSales(undefined, { query: {
    enabled: unit.type !== "chalet", staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
  } });
  const activityQuickSales = (quickSalesQuery.data ?? []).filter(sale =>
    unit.type === "all" || (unit.type === "service" && sale.providerId === unit.id));
  const _nowRev = new Date();
  const currentMonth = `${_nowRev.getFullYear()}-${String(_nowRev.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth]     = useState(currentMonth);
  const [calType, setCalType]                 = useState<"gregorian" | "hijri">("hijri");
  const [selectedHijriMonth, setSelectedHijriMonth] = useState(() => getCurrentFinanceMonth("hijri"));
  const [serviceSelectedMonth, setServiceSelectedMonth] = useState(currentMonth);
  const [serviceSelectedHijriMonth, setServiceSelectedHijriMonth] = useState(() => getCurrentFinanceMonth("hijri"));
  const [serviceRevenueYear, setServiceRevenueYear] = useState(() => String(toHijriComponents(new Date()).year));
  const [revenueMode, setRevenueMode] = useState<RevenueFilterMode>("monthly");
  const [revenueFrom, setRevenueFrom] = useState("");
  const [revenueTo, setRevenueTo] = useState("");
  const [filter, setFilter] = useState<"all" | "deposit" | "balance" | "damage" | "cancellation" | "refund" | "insurance">("all");
  const [svcFilter, setSvcFilter] = useState<"all" | "deposit" | "balance" | "damage">("all");
  const [proofTarget, setProofTarget] = useState<OwnerBooking | null>(null);
  const [reviewSentRevIds, setReviewSentRevIds] = useState<Set<number>>(new Set());
  const [reviewPendingRevId, setReviewPendingRevId] = useState<number | null>(null);
  const [refundModal, setRefundModal] = useState<{ booking: OwnerBooking; maxAmount: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundType, setRefundType] = useState<"partial" | "full">("partial");
  const [refundPending, setRefundPending] = useState(false);
  const { toast } = useToast();

  const { data: revOwnerChalets = [] } = useQuery<{ id: number; submissionId: number | null; nameAr: string; waReviewTemplate?: string | null }[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: siteSettingsCache = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/page-content`);
      if (!r.ok) return {};
      const rows: { key: string; value: string }[] = await r.json();
      return Object.fromEntries(rows.map((x) => [x.key, x.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const fmtN = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
  const fmtDualDate = (dateStr: string) => {
    const { hijri, gregorian } = formatDualDate(dateStr);
    return `${hijri.replace(/\s*هـ\s*$/, "")} (${gregorian})`;
  };

  const financialSubmissionId = unit.type === "chalet" ? (unit as any).submissionId : undefined;

  // This endpoint supplies all-time cash custody only; sales use the filtered
  // booking dataset below, including annual and all-time periods.
  const effectiveMonth = selectedMonth || currentMonth;

  const [cashBreakdownOpen, setCashBreakdownOpen] = useState(false);
  const [depositCashOpen, setDepositCashOpen] = useState(false);
  const [depositingCash, setDepositingCash] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [revSubTab, setRevSubTab] = useState<"monthly" | "receivables">("monthly");
  const showAllFuture = revSubTab === "receivables";
  const [pendingFilterMonth, setPendingFilterMonth] = useState<string>("");
  const [pendingCalType, setPendingCalType] = useState<"hijri" | "gregorian">("hijri");
  const [revYear, setRevYear] = useState<string>(() => {
    const mode = "hijri";
    return mode === "hijri" ? String(toHijriComponents(new Date()).year) : String(new Date().getFullYear());
  });
  const [pendingYear, setPendingYear] = useState<string>(() => String(toHijriComponents(new Date()).year));
  const revenuePeriod = useMemo(() => revenueFilterPeriod(revenueMode, calType, revYear,
    calType === "hijri" ? selectedHijriMonth : selectedMonth, revenueFrom, revenueTo),
  [revenueMode, calType, revYear, selectedHijriMonth, selectedMonth, revenueFrom, revenueTo]);
  const salesTitle = revenueSalesTitle(revenuePeriod);

  const { data: financial, isLoading: finLoading, refetch: refetchFinancial } = useQuery<{
    totalRevenue: number; totalDeposits: number; totalPendingBalance: number;
    totalInsuranceHeld: number; totalInsuranceDeducted: number;
    totalExpenses?: number; netProfit?: number;
    pendingRevenue?: number; realizedRevenue?: number; totalFutureValue?: number;
    totalCancellationIncome?: number; totalRefundedToClients?: number;
    totalCashCollected?: number; confirmedRevenue?: number; floatingCash?: number;
    insuranceVault?: number; allTimeRefundsIssued?: number; allTimeCancelIncome?: number;
    cashOnHand?: number; totalWithdrawals?: number;
    cashBreakdown?: { clientName: string; date: string; amount: number; source: string; paymentId?: number; bookingId?: number }[];
  }>({
    queryKey: ["owner", "financial-summary-rev", effectiveMonth, financialSubmissionId ?? "all", calType === "hijri" ? selectedHijriMonth : ""],
    queryFn: async () => {
      const params = new URLSearchParams({ month: effectiveMonth });
      if (financialSubmissionId) params.set("submissionId", String(financialSubmissionId));
      if (calType === "hijri" && selectedHijriMonth) {
        const [year, month] = selectedHijriMonth.split("-");
        params.set("hijriYear", year);
        params.set("hijriMonth", String(Number(month)));
      }
      const r = await apiFetch(`/owner/financial-summary?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: allBookings = [], isLoading: bkLoading, refetch: refetchBookings } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings-revenue"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const revenueProvidersQ = useQuery<{ id: number; businessName: string }[]>({
    queryKey: ["owner", "revenue-service-providers"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/approved");
      if (!r.ok) throw new Error("تعذّر تحميل أنشطة الخدمات");
      return r.json();
    },
    enabled: unit.type === "all",
    refetchInterval: 30_000,
  });
  const revenueProviders = revenueProvidersQ.data ?? [];
  const propertyOnlyRevenue = unit.type === "chalet" || (unit.type === "all"
    && revOwnerChalets.length > 0 && revenueProvidersQ.isSuccess && revenueProviders.length === 0
    && quickSalesQuery.isSuccess && activityQuickSales.length === 0);
  const revenueSource = effectiveRevenueSource(selectedRevenueSource, propertyOnlyRevenue);
  const revenueSourceScopeReady = unit.type !== "all"
    || (revenueProvidersQ.isSuccess && quickSalesQuery.isSuccess);
  // Share the calendar cache so booking/payment invalidation updates revenue.
  const revenueProviderIds = unit.type === "service" ? [unit.id]
    : unit.type === "all" ? revenueProviders.map(provider => provider.id) : [];
  const serviceRevenueQueries = useQueries({
    queries: revenueProviderIds.map(providerId => ({
      queryKey: ["service-appointments", providerId],
      queryFn: async (): Promise<any[]> => {
        const r = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
        if (!r.ok) throw new Error("تعذّر تحميل حجوزات الخدمة");
        return r.json();
      },
      staleTime: 0,
      refetchOnMount: "always" as const,
      refetchInterval: 30_000,
    })),
  });
  const serviceAppts = serviceRevenueQueries.flatMap(query => query.data ?? []);
  const svcLoading = (unit.type === "all" && revenueProvidersQ.isLoading)
    || serviceRevenueQueries.some(query => query.isLoading);
  const svcError = (unit.type === "all" && revenueProvidersQ.isError)
    || serviceRevenueQueries.some(query => query.isError);
  const serviceOnlyRevenue = unit.type === "service"
    || (unit.type === "all" && revOwnerChalets.length === 0 && revenueProviders.length > 0);
  const serviceRevenueDates = serviceAppts
    .filter(a => a.status !== "cancelled" && a.dateStr)
    .map(a => a.dateStr as string)
    .concat(activityQuickSales.filter(sale => sale.status === "completed").map(sale => sale.dateStr));

  const { data: depositLogs = [], refetch: refetchDepositLogs } = useQuery<Array<{ id: number; ownerId: number; submissionId: number | null; amount: string; note: string | null; createdAt: string }>>({
    queryKey: ["owner", "cash-deposit-logs"],
    queryFn: async () => {
      const r = await apiFetch("/owner/cash-deposit-logs");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // ── All-time revenue breakdown (kept for reference) ──────────────────────
  const revBreakdown = useMemo(() => {
    const scopedBookings = unit.type === "chalet"
      ? allBookings.filter(b => (b as any).chaletId === (unit as any).id)
      : allBookings;
    let totalBaseRent = 0, totalServices = 0;
    for (const b of scopedBookings) {
      const addons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
      const svc = addons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0)
        .reduce((s, a) => s + Math.round(Number(a.price)), 0);
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice)
        : b.revenueAmount != null && Number(b.revenueAmount) > 0 ? Number(b.revenueAmount)
        : Number(b.depositPaid ?? 0);
      totalBaseRent += Math.max(0, tp - svc);
      totalServices += svc;
    }
    const total = totalBaseRent + totalServices;
    return { base: Math.round(totalBaseRent), services: Math.round(totalServices), total: Math.round(total) };
  }, [allBookings, unit]);

  const allReceivables = useMemo(() => {
    let scoped = allBookings;
    if (unit.type === "chalet") {
      const subId = (unit as any).submissionId;
      if (subId) scoped = allBookings.filter(bk => bk.submissionId === subId);
    }
    return scoped
      .filter(bk => {
        if (bk.cancelledAt) return false;
        if (bk.balanceCollected) return false;
        const dep = Number(bk.depositPaid ?? 0);
        const tp = bk.totalPrice != null && Number(bk.totalPrice) > 0 ? Number(bk.totalPrice) : dep;
        return Math.max(0, tp - dep) > 0;
      })
      .map(bk => {
        const dep = Number(bk.depositPaid ?? 0);
        const tp = bk.totalPrice != null && Number(bk.totalPrice) > 0 ? Number(bk.totalPrice) : dep;
        return { ...bk, remaining: Math.max(0, tp - dep) };
      })
      .sort((a, bk) => (a.bookingDate ?? "").localeCompare(bk.bookingDate ?? ""));
  }, [allBookings, unit]);

  /* ── Revenue tab: cascading year/month options ── */
  const revGregYearOptions = useMemo(() => {
    const years = new Set<string>();
    years.add(String(new Date().getFullYear()));
    allBookings.forEach(bk => { if (bk.bookingDate) years.add(bk.bookingDate.slice(0, 4)); });
    serviceRevenueDates.forEach(date => years.add(date.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [allBookings, serviceRevenueDates]);

  const revHijriYearOptions = useMemo(() => {
    const years = new Set<number>();
    years.add(toHijriComponents(new Date()).year);
    allBookings.forEach(bk => {
      if (bk.bookingDate) years.add(toHijriComponents(new Date(bk.bookingDate + "T00:00:00")).year);
    });
    serviceRevenueDates.forEach(date => years.add(toHijriComponents(new Date(`${date}T12:00:00`)).year));
    return Array.from(years).sort().reverse();
  }, [allBookings, serviceRevenueDates]);

  const revMonthsForYear = useMemo(() => {
    if (!revYear) return [];
    if (calType === "gregorian") {
      const months = new Set<string>();
      const curYear = String(new Date().getFullYear());
      if (revYear === curYear) months.add(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`);
      allBookings.forEach(bk => {
        if (bk.bookingDate?.startsWith(revYear + "-")) months.add(bk.bookingDate.slice(0, 7));
      });
      serviceRevenueDates.forEach(date => {
        if (date.startsWith(`${revYear}-`)) months.add(date.slice(0, 7));
      });
      return Array.from(months).sort().reverse();
    } else {
      const months = new Map<string, Date>();
      const now = new Date();
      if (revYear === String(toHijriComponents(now).year)) months.set(getCurrentFinanceMonth("hijri"), now);
      allBookings.forEach(bk => {
        if (!bk.bookingDate) return;
        const d = new Date(bk.bookingDate + "T00:00:00");
        if (String(toHijriComponents(d).year) === revYear) {
          const key = revenueMonthKey(bk.bookingDate, "hijri");
          if (!months.has(key)) months.set(key, d);
        }
      });
      serviceRevenueDates.forEach(date => {
        const d = new Date(`${date}T12:00:00`);
        if (String(toHijriComponents(d).year) === revYear) {
          const key = revenueMonthKey(date, "hijri");
          if (!months.has(key)) months.set(key, d);
        }
      });
      return Array.from(months.entries()).sort(([,a],[,b]) => b.getTime()-a.getTime()).map(([k]) => k);
    }
  }, [allBookings, serviceRevenueDates, calType, revYear]);

  /* ── Receivables tab: cascading year/month options ── */
  const pendingAvailableMonths = useMemo(() => {
    const months = new Set<string>();
    if (pendingCalType === "gregorian") {
      months.add(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`);
    } else {
      const h = toHijriComponents(new Date());
      months.add(`${h.year}-${String(h.month).padStart(2,"0")}`);
    }
    allReceivables.forEach(bk => {
      if (!bk.bookingDate) return;
      if (pendingCalType === "gregorian") {
        months.add(bk.bookingDate.slice(0, 7));
      } else {
        const h = toHijriComponents(new Date(bk.bookingDate + "T00:00:00"));
        months.add(`${h.year}-${String(h.month).padStart(2, "0")}`);
      }
    });
    return Array.from(months).sort().reverse();
  }, [allReceivables, pendingCalType]);

  const pendingMonthParts = (ym: string): { primary: string; secondary: string } => {
    const [y, m] = ym.split("-").map(Number);
    const gregMonthName = (gy: number, gm: number) =>
      new Date(gy, gm, 15).toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
    if (pendingCalType === "hijri") {
      const primary = `${HIJRI_MONTHS_AR[m - 1]} ${toArN(y)} هـ`;
      const { start, end } = getHijriMonthGregorianRange(y, m);
      let secondary = "";
      if (start && end) {
        const s = new Date(start + "T00:00:00");
        const e = new Date(end + "T00:00:00");
        const sY = s.getFullYear(), sM = s.getMonth();
        const eY = e.getFullYear(), eM = e.getMonth();
        if (sY === eY && sM === eM) secondary = `${gregMonthName(sY, sM)} ${toArN(sY)}`;
        else if (sY === eY) secondary = `${gregMonthName(sY, sM)} / ${gregMonthName(eY, eM)} ${toArN(sY)}`;
        else secondary = `${gregMonthName(sY, sM)} ${toArN(sY)} / ${gregMonthName(eY, eM)} ${toArN(eY)}`;
      }
      return { primary, secondary };
    }
    const primary = `${gregMonthName(y, m - 1)} ${toArN(y)}`;
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const h1 = toHijriComponents(firstDay);
    const h2 = toHijriComponents(lastDay);
    let secondary = "";
    if (h1.year === h2.year && h1.month === h2.month) {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} هـ`;
    } else if (h1.year === h2.year) {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h1.year)} هـ`;
    } else {
      secondary = `${HIJRI_MONTHS_AR[h1.month - 1]} ${toArN(h1.year)} / ${HIJRI_MONTHS_AR[h2.month - 1]} ${toArN(h2.year)} هـ`;
    }
    return { primary, secondary };
  };

  const pendingYearOptions = useMemo(() => {
    const years = new Set<string>();
    pendingAvailableMonths.forEach(ym => years.add(ym.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [pendingAvailableMonths]);

  const pendingMonthsForYear = useMemo(() =>
    pendingYear ? pendingAvailableMonths.filter(ym => ym.startsWith(pendingYear + "-")) : pendingAvailableMonths,
  [pendingAvailableMonths, pendingYear]);

  const filteredReceivables = useMemo(() => {
    let result = allReceivables;
    if (pendingCalType === "gregorian") {
      if (pendingFilterMonth) result = result.filter(bk => bk.bookingDate?.startsWith(pendingFilterMonth));
      else if (pendingYear) result = result.filter(bk => bk.bookingDate?.startsWith(pendingYear + "-"));
    } else {
      if (pendingFilterMonth) {
        result = result.filter(bk => {
          if (!bk.bookingDate) return false;
          const h = toHijriComponents(new Date(bk.bookingDate + "T00:00:00"));
          return `${h.year}-${String(h.month).padStart(2,"0")}` === pendingFilterMonth;
        });
      } else if (pendingYear) {
        result = result.filter(bk => {
          if (!bk.bookingDate) return false;
          const h = toHijriComponents(new Date(bk.bookingDate + "T00:00:00"));
          return String(h.year) === pendingYear;
        });
      }
    }
    return result;
  }, [allReceivables, pendingFilterMonth, pendingYear, pendingCalType]);

  const { data: cancelledBookings = [] } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings", "cancelled"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings/cancelled");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: ownerRefunds = [], refetch: refetchRefunds } = useQuery<Array<{
    id: number; bookingId: number; amount: string; type: string; reason: string | null; createdAt: string;
  }>>({
    queryKey: ["owner", "refunds"],
    queryFn: async () => {
      const r = await apiFetch("/owner/refunds");
      if (!r.ok) return [];
      return r.json();
    },
  });

  interface FutureBookingEntry {
    id: number; clientName: string; clientPhone: string | null;
    bookingDate: string; checkoutDate: string; durationDays: number;
    period: string | null; depositPaid: number; totalPrice: number | null;
    balanceCollected: boolean; insuranceFee: number; remainingBalance: number;
    chaletName: string; submissionId: number | null;
  }

  const { data: futureSummary, isLoading: futureLoading, refetch: refetchFuture } = useQuery<{
    globalTotalCashCollected: number;
    totalCancellationIncome: number;
    totalRefundedToClients: number;
    futureCashInHand: number;
    futureRemainingBalance: number;
    futureCount: number;
    futureBookings: FutureBookingEntry[];
  }>({
    queryKey: ["owner", "future-cash-summary"],
    queryFn: async () => {
      const r = await apiFetch("/owner/future-cash-summary");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 60_000,
  });

  const serviceGregorianMonths = useMemo(() => {
    const months = new Set<string>();
    serviceRevenueDates.forEach((dateStr) => {
      const appointment = { dateStr };
      if (/^\d{4}-\d{2}-\d{2}$/.test(appointment.dateStr ?? "")) {
        months.add(appointment.dateStr.slice(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [serviceRevenueDates]);

  const serviceHijriMonths = useMemo(() => {
    const months = new Map<string, { key: string; year: number; month: number; sampleDate: Date }>();
    serviceRevenueDates.forEach((dateStr) => {
      const appointment = { dateStr };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment.dateStr ?? "")) return;
      const sampleDate = new Date(`${appointment.dateStr}T12:00:00`);
      const hijri = toHijriComponents(sampleDate);
      const key = `${hijri.year}-${String(hijri.month).padStart(2, "0")}`;
      if (!months.has(key)) months.set(key, { key, year: hijri.year, month: hijri.month, sampleDate });
    });
    return Array.from(months.values()).sort((a, b) => b.sampleDate.getTime() - a.sampleDate.getTime());
  }, [serviceRevenueDates]);

  const serviceYearOptions = useMemo(() => {
    if (calType === "gregorian") {
      return Array.from(new Set(serviceGregorianMonths.map((month) => month.slice(0, 4)))).sort().reverse();
    }
    return Array.from(new Set(serviceHijriMonths.map((month) => String(month.year)))).sort().reverse();
  }, [calType, serviceGregorianMonths, serviceHijriMonths]);

  const serviceMonthsForYear = useMemo(() => {
    if (calType === "gregorian") {
      return serviceGregorianMonths.filter((month) => month.startsWith(`${serviceRevenueYear}-`));
    }
    return serviceHijriMonths.filter((month) => String(month.year) === serviceRevenueYear).map((month) => month.key);
  }, [calType, serviceGregorianMonths, serviceHijriMonths, serviceRevenueYear]);

  useEffect(() => {
    if (!serviceOnlyRevenue || serviceYearOptions.length === 0 || !serviceRevenueYear) return;
    if (!serviceYearOptions.includes(serviceRevenueYear)) {
      setServiceRevenueYear(serviceYearOptions[0]);
      return;
    }
    if (calType === "gregorian") {
      if (serviceSelectedMonth && !serviceMonthsForYear.includes(serviceSelectedMonth)) {
        const firstMonth = serviceGregorianMonths.find((month) => month.startsWith(`${serviceRevenueYear}-`));
        if (firstMonth) setServiceSelectedMonth(firstMonth);
      }
    } else if (serviceSelectedHijriMonth && !serviceMonthsForYear.includes(serviceSelectedHijriMonth)) {
      const firstMonth = serviceHijriMonths.find((month) => String(month.year) === serviceRevenueYear);
      if (firstMonth) setServiceSelectedHijriMonth(firstMonth.key);
    }
  }, [
    serviceOnlyRevenue,
    serviceMonthsForYear,
    calType,
    serviceYearOptions,
    serviceRevenueYear,
    serviceGregorianMonths,
    serviceHijriMonths,
    serviceSelectedMonth,
    serviceSelectedHijriMonth,
  ]);

  const combinedServiceBookings = revenueSource === "quick_sales" ? [] : serviceRevenueBookings(serviceAppts, unit, revenuePeriod);
  const combinedServiceTotals = serviceRevenueTotals(combinedServiceBookings);
  const combinedQuickSales = revenueSource === "bookings" ? [] : quickSalesForPeriod(activityQuickSales, unit, revenuePeriod);
  const combinedQuickTotal = quickSalesTotal(combinedQuickSales);

  // Filter bookings to selected month + optional chalet unit filter
  const monthBookings = useMemo(() => {
    if (unit.type !== "chalet" && revenueSource === "quick_sales") return [];
    let filtered = allBookings.filter(b => isInRevenuePeriod(b.bookingDate, revenuePeriod));
    // FIX: ownerBookingsTable has submissionId, NOT chaletId
    if (unit.type === "chalet") {
      const subId = (unit as any).submissionId;
      if (subId) filtered = filtered.filter(b => b.submissionId === subId);
    }
    return filtered;
  }, [allBookings, revenuePeriod, unit, revenueSource]);

  // ── Monthly revenue breakdown: base rent + services for selected month ───
  // Computed directly from allBookings (not monthBookings) with correct submissionId filter
  const monthRevBreakdown = useMemo(() => {
    const filtered = monthBookings;
    // Step 3: compute breakdown
    let base = 0, services = 0;
    for (const b of filtered) {
      const addons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
      const svc = addons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0)
        .reduce((s, a) => s + Math.round(Number(a.price)), 0);
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice)
        : b.revenueAmount != null && Number(b.revenueAmount) > 0 ? Number(b.revenueAmount)
        : Number(b.depositPaid ?? 0);
      base += Math.max(0, tp - svc);
      services += svc;
    }
    const result = { base: Math.round(base), services: Math.round(services), total: Math.round(base + services) };
    console.log(`[تكية REV] ${calType==="hijri"?selectedHijriMonth:selectedMonth} | all:${allBookings.length} → filtered:${filtered.length} | إيجار:${result.base} خدمات:${result.services} إجمالي:${result.total}`);
    return result;
  }, [monthBookings]);

  // Service-unit: use the exact selected Gregorian or Hijri period.
  const selectedServicePeriod = revenueFilterPeriod(revenueMode, calType, serviceRevenueYear,
    calType === "gregorian" ? serviceSelectedMonth : serviceSelectedHijriMonth, revenueFrom, revenueTo);
  const monthSvcAppts = revenueSource === "quick_sales" ? [] : serviceRevenueBookings(serviceAppts, unit, selectedServicePeriod);
  const serviceQuickSales = revenueSource === "bookings" ? [] : quickSalesForPeriod(activityQuickSales, unit, selectedServicePeriod);
  const serviceQuickTotal = quickSalesTotal(serviceQuickSales);

  // Build revenue rows: each booking can generate 1-3 rows
  interface RevenueRow {
    bookingId: number;
    clientName: string;
    bookingDate: string;
    type: "deposit" | "balance" | "damage" | "cancellation" | "refund" | "insurance";
    amount: number;
    reason?: string;
    proofImages?: string | null;
    booking: OwnerBooking;
    isPending?: boolean;
    refundId?: number;
    isFullPayment?: boolean;
  }

  /* Cancelled bookings with income, filtered to the selected period */
  const allCancelledBookings = useMemo(() => {
    let cancelled = cancelledBookings.filter(b => b.cancelledAt && b.cancelIncome && Number(b.cancelIncome) > 0);
    cancelled = cancelled.filter(b => isInRevenuePeriod(b.cancelledAt?.slice(0, 10), revenuePeriod));
    if (unit.type === "chalet") {
      const subId = (unit as any).submissionId;
      if (subId) cancelled = cancelled.filter(b => b.submissionId === subId);
    }
    return cancelled;
  }, [cancelledBookings, revenuePeriod, unit]);

  const today = getLocalDateStr();

  // Revenue log always uses the month-filtered set so the table totals
  // match the summary cards exactly.
  const revenueLogBookings = useMemo(() => monthBookings, [monthBookings]);

  // For chalet view: all cancelled bookings with income (not just selected month)
  const revenueLogCancelled = useMemo(() => {
    if (unit.type === "chalet") {
      return cancelledBookings.filter(b =>
        ((b as any).chaletId === (unit as any).id || b.submissionId === (unit as any).submissionId) &&
        b.cancelIncome && Number(b.cancelIncome) > 0
      );
    }
    return allCancelledBookings;
  }, [unit, cancelledBookings, allCancelledBookings]);

  const rows = useMemo<RevenueRow[]>(() => {
    const result: RevenueRow[] = [];
    for (const b of revenueLogBookings) {
      if (b.cancelledAt) continue; // cancelled bookings shown as cancellation rows, not regular rows
      const dep = Math.round(Number(b.depositPaid ?? 0));
      const total = b.totalPrice ? Math.round(Number(b.totalPrice)) : null;

      // Calculate checkout date for pending/realized distinction
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      const checkoutDate = new Date(sy, sm - 1, sd + (b.durationDays ?? 1));
      const checkoutStr = `${checkoutDate.getFullYear()}-${String(checkoutDate.getMonth() + 1).padStart(2, "0")}-${String(checkoutDate.getDate()).padStart(2, "0")}`;
      const isPending = checkoutStr > today;

      // Deposit row (always, if deposit recorded)
      if (dep > 0) {
        const isFullPayment = total !== null && total > 0 && dep === total;
        result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "deposit", amount: dep, booking: b, isPending, isFullPayment });
      } else if (b.revenueAmount && !b.totalPrice) {
        result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "deposit", amount: Math.round(Number(b.revenueAmount)), booking: b, isPending });
      }

      // Remaining / balance row (only if collected)
      if (total !== null && dep > 0 && b.balanceCollected) {
        const rem = Math.max(0, total - dep);
        if (rem > 0) result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "balance", amount: rem, booking: b, isPending });
      }

      // Insurance fee row — only show if insurance was actually received at booking time
      if (b.insuranceFee && Number(b.insuranceFee) > 0 && (b as any).insuranceReceived === true) {
        result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "insurance", amount: Math.round(Number(b.insuranceFee)), booking: b, isPending });
      }

      // Damage deduction row
      if (b.insuranceDeducted && Number(b.insuranceDeducted) > 0) {
        result.push({
          bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate,
          type: "damage", amount: Math.round(Number(b.insuranceDeducted)),
          reason: b.insuranceDeductReason ?? undefined,
          proofImages: b.insuranceProofImages, booking: b,
        });
      }
    }
    // Cancellation income rows
    for (const b of revenueLogCancelled) {
      result.push({
        bookingId: b.id, clientName: b.clientName,
        bookingDate: b.cancelledAt?.slice(0, 10) ?? b.bookingDate,
        type: "cancellation",
        amount: Math.round(Number(b.cancelIncome ?? 0)),
        reason: b.cancelReason ?? undefined,
        booking: b,
        isPending: false,
      });
    }
    // Refund rows issued by the owner
    for (const rf of ownerRefunds) {
      const booking = revenueLogBookings.find(b => b.id === rf.bookingId)
        ?? cancelledBookings.find(b => b.id === rf.bookingId);
      if (!booking) continue;
      result.push({
        bookingId: rf.bookingId,
        clientName: booking.clientName,
        bookingDate: rf.createdAt.slice(0, 10),
        type: "refund" as const,
        amount: -Math.round(Number(rf.amount)),
        reason: rf.reason ?? undefined,
        booking,
        isPending: false,
        refundId: rf.id,
      });
    }
    return result;
  }, [revenueLogBookings, revenueLogCancelled, ownerRefunds, cancelledBookings, today]);

  const filteredRows = filter === "all" ? rows : rows.filter(r => r.type === filter);

  const TYPE_META: Record<string, { label: string; emoji: string; cls: string }> = {
    deposit:      { label: "عربون",        emoji: "💵", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    balance:      { label: "متبقي محصّل",  emoji: "✅", cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    insurance:    { label: "تأمين",        emoji: "🔒", cls: "bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300" },
    damage:       { label: "خصم تلفيات",  emoji: "✂️", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    cancellation: { label: "إيراد إلغاء", emoji: "❌", cls: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
    refund:       { label: "استرداد",      emoji: "↩️", cls: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  };

  const loading = finLoading || bkLoading || svcLoading || (unit.type !== "chalet" && quickSalesQuery.isLoading);

  const big3 = useMemo(() => {
    const sales = monthBookings.reduce((s, b) => {
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice)
        : b.revenueAmount != null && Number(b.revenueAmount) > 0 ? Number(b.revenueAmount)
        : Number(b.depositPaid ?? 0);
      return s + tp;
    }, 0);
    const collected = monthBookings.reduce((s, b) => {
      const dep = Number(b.depositPaid ?? 0);
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice) : dep;
      const bal = b.balanceCollected ? Math.max(0, tp - dep) : 0;
      return s + dep + bal;
    }, 0);
    const pending = monthBookings.reduce((s, b) => {
      if (b.cancelledAt) return s;
      const dep = Number(b.depositPaid ?? 0);
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice) : dep;
      const rem = b.balanceCollected ? 0 : Math.max(0, tp - dep);
      return s + rem;
    }, 0);
    return {
      sales: Math.round(sales + combinedServiceTotals.sales) + combinedQuickTotal,
      collected: Math.round(collected + combinedServiceTotals.collected) + combinedQuickTotal,
      pending: Math.round(pending + combinedServiceTotals.pending),
    };
  }, [monthBookings, combinedServiceTotals.sales, combinedServiceTotals.collected, combinedServiceTotals.pending, combinedQuickTotal]);

  const channels = useMemo(() => {
    // Use allBookings for bankTransfers (preserves all-time bank position)
    // Outstanding cash is all-time custody, exactly as listed in the details dialog.
    let scoped = allBookings;
    if (unit.type === "chalet") {
      const subId = (unit as any).submissionId;
      if (subId) scoped = allBookings.filter(b => b.submissionId === subId);
    }
    let scopedLogs = depositLogs;
    if (unit.type === "chalet") {
      const subId = (unit as any).submissionId;
      if (subId) scopedLogs = depositLogs.filter(l => l.submissionId === subId);
    }
    let bankTransfers = 0, totalCashOnHand = 0, insuranceCustody = 0;
    for (const b of scoped) {
      if (b.cancelledAt) continue;
      const dep = Number(b.depositPaid ?? 0);
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice) : dep;
      const bal = b.balanceCollected ? Math.max(0, tp - dep) : 0;
      const total = dep + bal;
      if (b.paymentMethod === "cash") {
        totalCashOnHand += total;
      } else {
        bankTransfers += total;
      }
      if (b.insuranceReceived && !b.insuranceRefunded && Number(b.insuranceFee ?? 0) > 0) {
        const insAmt = Math.round(Number(b.insuranceFee));
        const insMethod = b.insurancePaymentMethod ?? "transfer";
        if (insMethod === "cash") {
          totalCashOnHand += insAmt;
        } else {
          bankTransfers += insAmt;
        }
        insuranceCustody += insAmt;
      }
    }
    const totalDeposited = scopedLogs.reduce((s, l) => s + Math.round(Number(l.amount)), 0);
    const bankRounded = Math.round(bankTransfers);
    return {
      bankTransfers: bankRounded,
      cashDeposited: totalDeposited,
      cashUndeposited: cashBreakdownTotal(financial?.cashBreakdown ?? []),
      cashOnHand: Math.round(totalCashOnHand),
      insuranceCustody: Math.round(insuranceCustody),
    };
  }, [allBookings, depositLogs, unit, financial?.cashBreakdown]);

  const filterYear = serviceOnlyRevenue ? serviceRevenueYear : revYear;
  const filterMonth = serviceOnlyRevenue
    ? calType === "hijri" ? serviceSelectedHijriMonth : serviceSelectedMonth
    : calType === "hijri" ? selectedHijriMonth : selectedMonth;
  const filterYears = serviceOnlyRevenue ? serviceYearOptions
    : calType === "hijri" ? revHijriYearOptions.map(String) : revGregYearOptions;
  const filterMonths = serviceOnlyRevenue ? serviceMonthsForYear : revMonthsForYear;
  const setFilterMonth = (month: string) => {
    if (serviceOnlyRevenue) {
      if (calType === "hijri") setServiceSelectedHijriMonth(month);
      else setServiceSelectedMonth(month);
    } else if (calType === "hijri") setSelectedHijriMonth(month);
    else setSelectedMonth(month);
  };
  // Year changes must select a real month rather than silently show a whole year
  // while the visible period control still says "شهري".
  useEffect(() => {
    if (revenueMode === "monthly" && filterMonths.length && !filterMonths.includes(filterMonth)) {
      const month = filterMonths[0];
      if (serviceOnlyRevenue) {
        if (calType === "hijri") setServiceSelectedHijriMonth(month);
        else setServiceSelectedMonth(month);
      } else if (calType === "hijri") setSelectedHijriMonth(month);
      else setSelectedMonth(month);
    }
  }, [revenueMode, filterMonths, filterMonth, serviceOnlyRevenue, calType]);
  const revenueHeader = <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
      <h2 className="text-lg font-bold text-foreground">
        {unit.type === "chalet" || unit.type === "service" ? `إيرادات: ${unit.name}`
          : serviceOnlyRevenue ? revenueProviders.length === 1 ? `إيرادات: ${revenueProviders[0].businessName}` : "إيرادات الخدمات"
          : "الإيرادات"}
      </h2>
      <SectionGuideButton sectionKey="revenues" />
    </div>
    {!serviceOnlyRevenue && <div className="flex flex-wrap gap-2">
      <div role="group" aria-label="عرض الإيرادات" className="flex rounded-xl border border-border bg-muted/60 p-1 text-sm">
        {([["monthly", "الحسابات الشهرية"], ["receivables", "متبقي مستحقات الضيوف"]] as const).map(([tab, label]) =>
          <button key={tab} type="button" aria-pressed={revSubTab === tab} onClick={() => setRevSubTab(tab)}
            className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 font-bold transition-colors ${revSubTab === tab ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-background"}`}>
            {label}
            {tab === "receivables" && allReceivables.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-950">{toArN(allReceivables.length)}</span>}
          </button>)}
      </div>
    </div>}
    {(serviceOnlyRevenue || !showAllFuture) && <RevenueFilterBar
      mode={revenueMode} onModeChange={setRevenueMode} calendar={calType}
      onCalendarChange={mode => {
        setCalType(mode);
        const newYear = mode === "hijri" ? String(toHijriComponents(new Date()).year) : String(new Date().getFullYear());
        if (serviceOnlyRevenue) {
          const years = mode === "gregorian" ? serviceGregorianMonths.map(month => month.slice(0, 4))
            : serviceHijriMonths.map(month => String(month.year));
          setServiceRevenueYear(years[0] || newYear);
          setServiceSelectedMonth("");
          setServiceSelectedHijriMonth("");
        } else {
          setRevYear(newYear);
          setSelectedMonth(currentMonth);
          setSelectedHijriMonth(getCurrentFinanceMonth("hijri"));
        }
        localStorage.setItem("revCalType", mode);
      }}
      years={filterYears} year={filterYear} onYearChange={year => {
        if (serviceOnlyRevenue) setServiceRevenueYear(year);
        else setRevYear(year);
        setFilterMonth("");
      }}
      months={filterMonths} month={filterMonth} onMonthChange={setFilterMonth}
      monthLabel={revenueMonthLabel} from={revenueFrom} to={revenueTo}
      onFromChange={setRevenueFrom} onToChange={setRevenueTo}
      today={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })}
      propertyOnly={propertyOnlyRevenue}
      source={revenueSourceScopeReady ? revenueSource : undefined}
      onSourceChange={revenueSourceScopeReady ? setRevenueSource : undefined} />}
  </div>;

  if (svcError || (unit.type !== "chalet" && quickSalesQuery.isError)) {
    return <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 space-y-3" dir="rtl">
      <p className="text-sm font-semibold">تعذّر تحميل إيرادات الخدمات أو المبيعات المفردة. لا يمكن عرض الإجماليات كاملة حالياً.</p>
      <Button variant="outline" onClick={() => {
        if (unit.type === "all") void revenueProvidersQ.refetch();
        serviceRevenueQueries.forEach(query => { void query.refetch(); });
        void quickSalesQuery.refetch();
      }}>إعادة المحاولة</Button>
    </div>;
  }

  if ((serviceOnlyRevenue || !showAllFuture) && revenueMode === "custom"
    && (!revenueFrom || !revenueTo || revenueFrom > revenueTo)) {
    return <div className="space-y-5" dir="rtl">{revenueHeader}
      <p role="status" className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-base font-medium leading-8 text-foreground">
        {!revenueFrom || !revenueTo ? "اختر تاريخ البداية والنهاية لعرض إيرادات الفترة المحددة."
          : "يجب أن يكون تاريخ النهاية مساويًا لتاريخ البداية أو بعدها."}
      </p>
    </div>;
  }

  /* ── SERVICE UNIT: render service appointments revenue ── */
  if (serviceOnlyRevenue) {
    // Build revenue rows mirroring chalet row structure
    interface SvcRow { apptId: number; clientName: string; dateStr: string; type: "deposit" | "balance" | "damage"; amount: number; note?: string; isFullPayment?: boolean; }
    const svcRows: SvcRow[] = [];
    for (const a of monthSvcAppts) {
      const amt = Math.round(Number(a.amount ?? 0));
      const dep = Math.round(Number(a.deposit ?? 0));
      const insDeduct = Math.round(Number(a.insuranceDeductAmount ?? 0));
      if (dep > 0) svcRows.push({ apptId: a.id, clientName: a.clientName, dateStr: a.dateStr, type: "deposit", amount: dep, isFullPayment: amt > 0 && dep === amt });
      if (amt > dep && amt > 0) svcRows.push({ apptId: a.id, clientName: a.clientName, dateStr: a.dateStr, type: "balance", amount: amt - dep });
      if (insDeduct > 0) svcRows.push({ apptId: a.id, clientName: a.clientName, dateStr: a.dateStr, type: "damage", amount: insDeduct, note: a.insuranceDeductNote ?? undefined });
    }
    const filteredSvcRows = svcFilter === "all" ? svcRows : svcRows.filter(r => r.type === svcFilter);

    const svcSales = monthSvcAppts.reduce((s, a) => s + Math.round(Number(a.amount ?? 0)), 0) + serviceQuickTotal;
    const svcCollected = monthSvcAppts.reduce((s, a) => s + Math.round(Number(a.deposit ?? 0)), 0) + serviceQuickTotal;
    const svcPending   = monthSvcAppts.reduce((s, a) => {
      const amt = Math.round(Number(a.amount ?? 0)); const dep = Math.round(Number(a.deposit ?? 0));
      return s + Math.max(0, amt - dep);
    }, 0);

    const activeServiceMonth = selectedServicePeriod.month;
    const servicePeriod = selectedServicePeriod;

    return (
      <div className="space-y-5" dir="rtl">
        {revenueHeader}
        {/* KPI cards — same financial definitions used for properties */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Receipt className="w-3.5 h-3.5 text-blue-600" />
              {revenueSalesTitle(servicePeriod)}
            </div>
            {svcLoading || quickSalesQuery.isLoading ? <Skeleton className="h-7 w-24" /> : (
              <OwnerStatAmount amount={fmtN(svcSales)} className="text-blue-700 dark:text-blue-400" />
            )}
            <div className="text-sm font-medium leading-relaxed text-foreground/80">إجمالي الحجوزات والمبيعات وفق نوع الإيراد المختار {servicePeriod.range ? "بين التاريخين المحددين" : activeServiceMonth ? "في الشهر المحدد" : servicePeriod.year ? "في السنة المحددة" : "لكامل الفترة"}</div>
          </div>
          <div className="bg-green-50/60 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <RiyalIcon className="w-3.5 h-3.5 text-green-600" />
              المبالغ المحصّلة
            </div>
            {svcLoading || quickSalesQuery.isLoading ? <Skeleton className="h-7 w-24" /> : (
              <OwnerStatAmount amount={fmtN(svcCollected)} className="text-green-700 dark:text-green-400" />
            )}
            <div className="text-sm font-medium leading-relaxed text-foreground/80">إجمالي العربون أو المبلغ المدفوع المسجل</div>
          </div>
          <div className="bg-card border border-amber-200 rounded-2xl p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              مستحقات معلقة
            </div>
            {svcLoading ? <Skeleton className="h-7 w-24" /> : (
              <OwnerStatAmount amount={fmtN(svcPending)} className="text-amber-600 dark:text-amber-400" />
            )}
            <div className="text-sm font-medium leading-relaxed text-foreground/80">متبقي لم يُحصّل من ضيوف الخدمات حتى الآن</div>
          </div>
        </div>

        {revenueSource !== "bookings" && <QuickSalesRevenueDetails sales={serviceQuickSales} />}
        {/* Revenue log — bookings remain separate from direct sales. */}
        <div className={revenueSource === "quick_sales" ? "hidden" : "bg-card border border-border rounded-2xl p-4 space-y-3"}>
          <div className="flex items-center gap-2 flex-wrap">
            <Receipt className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-sm text-foreground">سجل إيرادات الخدمة</h3>
            <div className="ms-auto flex gap-1 flex-wrap">
              {([["all", "الكل"], ["deposit", "عربون"], ["balance", "متبقي"], ["damage", "تلفيات"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setSvcFilter(v)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${svcFilter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {svcLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredSvcRows.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">لا توجد إيرادات للفترة المحددة</div>
          ) : (
            <PaginatedItems items={filteredSvcRows} resetKey={`${JSON.stringify(selectedServicePeriod)}|${svcFilter}`}>
              {(pagination) => (
                <div ref={pagination.tableRef} className="scroll-mt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">العميل</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">التاريخ</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">النوع</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">المبلغ</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map((row, i) => {
                    const { hijri, gregorian } = formatDualDate(row.dateStr);
                    const meta = row.type === "balance"
                      ? { label: "متبقي مستحق", emoji: "", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" }
                      : TYPE_META[row.type];
                    return (
                      <tr key={`${row.apptId}-${row.type}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium">{row.clientName}</td>
                        <td className="py-2.5 px-3 text-xs">
                          <div className="font-medium">{hijri}</div>
                          <div className="text-muted-foreground">{gregorian}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
                            {row.type === "deposit" && row.isFullPayment ? "💰" : meta.emoji}
                            {row.type === "deposit" && row.isFullPayment ? "كامل المبلغ" : meta.label}
                          </span>
                          {row.note && <div className="text-[10px] text-muted-foreground mt-0.5">{row.note}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-left font-bold text-base tabular-nums">
                          <span className={row.type === "damage" ? "text-red-600" : row.type === "balance" ? "text-amber-600" : "text-blue-600"}>
                            {fmtN(row.amount)}
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            row.type === "deposit" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                            row.type === "balance" ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            {row.type === "deposit" ? "محصّل" : row.type === "balance" ? "مستحق" : "مخصوم"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30">
                    <td colSpan={3} className="py-2 px-3 text-xs font-bold text-muted-foreground">المجموع</td>
                    <td className="py-2 px-3 text-left font-extrabold text-base text-primary tabular-nums">
                      {fmtN(filteredSvcRows.reduce((s, r) => s + r.amount, 0))} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
                    </table>
                  </div>
                  <PaginationBar
                    page={pagination.page}
                    pageSize={pagination.pageSize}
                    totalItems={filteredSvcRows.length}
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

  return (
    <div className="space-y-5" dir="rtl">

      {revenueHeader}

      {/* ══════════════ ALL RECEIVABLES VIEW ══════════════ */}
      {showAllFuture && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border flex-wrap">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <h3 className="font-bold text-sm text-foreground">المبالغ المتبقية على الضيوف</h3>
            {/* Calendar type toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border text-xs ms-1">
              {(["gregorian", "hijri"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    const newYear = mode === "hijri" ? String(toHijriComponents(new Date()).year) : String(new Date().getFullYear());
                    setPendingCalType(mode); setPendingYear(newYear); setPendingFilterMonth("");
                  }}
                  className={`px-3 py-1.5 font-medium transition-colors ${pendingCalType === mode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  {mode === "gregorian" ? "ميلادي" : "هجري"}
                </button>
              ))}
            </div>
            {/* Year dropdown */}
            {pendingYearOptions.length > 0 && (
              <Select value={pendingYear} onValueChange={yr => { setPendingYear(yr); setPendingFilterMonth(""); }}>
                <SelectTrigger className="h-9 text-sm rounded-lg border-border w-28" dir="rtl">
                  <SelectValue placeholder="السنة" />
                </SelectTrigger>
                <SelectContent dir="rtl" align="end">
                  {pendingYearOptions.map(yr => (
                    <SelectItem key={yr} value={yr}>
                      {pendingCalType === "hijri" ? `${toArN(Number(yr))} هـ` : `${toArN(Number(yr))} م`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Month dropdown — data-driven, only months with activity */}
            {pendingMonthsForYear.length > 0 && (
              <ReceivablesMonthSelect
                mode={pendingCalType}
                value={pendingFilterMonth || "__all__"}
                onValueChange={v => setPendingFilterMonth(v === "__all__" ? "" : v)}
                months={pendingMonthsForYear}
                monthParts={pendingMonthParts}
              />
            )}
            {filteredReceivables.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full ms-auto font-semibold">
                {filteredReceivables.length} ضيف
              </span>
            )}
          </div>
          {bkLoading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filteredReceivables.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">✅ لا توجد مستحقات معلقة</div>
          ) : (
            <PaginatedItems items={filteredReceivables} resetKey={`${pendingCalType}|${pendingYear}|${pendingFilterMonth}`}>
              {(pagination) => (
                <div ref={pagination.tableRef} className="scroll-mt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">اسم المستأجر</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">رقم الحجز</th>
                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-muted-foreground">التاريخ</th>
                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-muted-foreground">المبلغ المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginatedItems.map(bk => {
                    const _bkDual = bk.bookingDate ? formatDualDate(bk.bookingDate) : null;
                    const _hijriStr = _bkDual?.hijri.replace(/\s*هـ\s*$/, "") ?? "";
                    const _gregStr  = _bkDual?.gregorian ?? "";
                    return (
                      <tr key={bk.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{bk.clientName}</td>
                        <td className="py-3 px-4 text-muted-foreground">#{bk.id}</td>
                        <td className="py-3 px-4 text-xs leading-tight whitespace-nowrap">
                          {_bkDual ? (
                            pendingCalType === "gregorian" ? (
                              <>
                                <span className="block font-semibold text-foreground">{_gregStr}</span>
                                <span className="block opacity-60 text-muted-foreground">({_hijriStr})</span>
                              </>
                            ) : (
                              <>
                                <span className="block font-semibold text-foreground">{_hijriStr}</span>
                                <span className="block opacity-60 text-muted-foreground">({_gregStr})</span>
                              </>
                            )
                          ) : "—"}
                        </td>
                        <td className="py-3 px-4 text-left">
                          <span className="font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{fmtN(bk.remaining)}</span>
                          <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t-2 border-border">
                    <td colSpan={3} className="py-2.5 px-4 text-xs font-bold text-muted-foreground">إجمالي المبالغ المتبقية</td>
                    <td className="py-2.5 px-4 text-left">
                      <span className="font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">{fmtN(filteredReceivables.reduce((s, bk) => s + bk.remaining, 0))}</span>
                      <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                    </td>
                  </tr>
                </tfoot>
                    </table>
                  </div>
                  <PaginationBar
                    page={pagination.page}
                    pageSize={pagination.pageSize}
                    totalItems={filteredReceivables.length}
                    totalPages={pagination.totalPages}
                    onPageChange={pagination.goToPage}
                    onPageSizeChange={pagination.changePageSize}
                  />
                </div>
              )}
            </PaginatedItems>
          )}
        </div>
      )}

      {/* ══════════════ MONTHLY VIEW (hidden when all-future active) ══════════════ */}
      {!showAllFuture && <>

      {/* ── THE BIG 3: Core Financial Metrics ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border-2 border-blue-300 dark:border-blue-700 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wide">
            <Receipt className="w-4 h-4" />
            {salesTitle}
          </div>
          {loading ? <Skeleton className="h-10 w-32" /> : (
            <OwnerStatAmount amount={fmtN(big3.sales)} className="text-blue-700 dark:text-blue-400" />
          )}
          <div className="text-sm font-medium leading-relaxed text-foreground/80">
            {revenuePeriod.range ? "إجمالي المبيعات والحجوزات بين التاريخين المحددين" : revenuePeriod.month ? "إجمالي المبيعات والحجوزات المختارة في الشهر" : revenuePeriod.year ? "إجمالي المبيعات والحجوزات المختارة في السنة" : "إجمالي المبيعات والحجوزات المختارة منذ بدء التشغيل"}
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20 border-2 border-green-300 dark:border-green-700 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-xs font-bold uppercase tracking-wide">
            <RiyalIcon className="w-4 h-4" />
            المبالغ المحصّلة
          </div>
          {loading ? <Skeleton className="h-10 w-32" /> : (
            <OwnerStatAmount amount={fmtN(big3.collected)} className="text-green-700 dark:text-green-400" />
          )}
          <div className="text-sm font-medium leading-relaxed text-foreground/80">تحويل بنكي + نقدي — عربون + متبقي محصّل</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border-2 border-amber-300 dark:border-amber-700 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wide">
            <Clock className="w-4 h-4" />
            مستحقات معلقة
          </div>
          {loading ? <Skeleton className="h-10 w-32" /> : (
            <OwnerStatAmount amount={fmtN(big3.pending)} className="text-amber-700 dark:text-amber-400" />
          )}
          <div className="text-sm font-medium leading-relaxed text-foreground/80">متبقٍ لم يُحصَّل من الضيوف حتى الآن</div>
        </div>
      </div>

      {unit.type === "all" && combinedServiceBookings.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-3" data-testid="combined-service-revenue">
          <h3 className="font-bold text-sm text-foreground">حجوزات الخدمات المشمولة في الإيرادات</h3>
          <PaginatedItems items={combinedServiceBookings} resetKey={JSON.stringify(revenuePeriod)}>
            {(pagination) => <div ref={pagination.tableRef} className="scroll-mt-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead><tr className="border-b border-border text-right">
                    {["الحجز / العميل", "الخدمة", "التاريخ", "قيمة الحجز", "المحصّل", "المتبقي"].map(label =>
                      <th key={label} className="p-3 text-xs font-semibold text-muted-foreground">{label}</th>)}
                  </tr></thead>
                  <tbody>{pagination.paginatedItems.map((a: any) => <tr key={a.id} className="border-b border-border/50">
                    <td className="p-3">{a.clientName} <span className="text-xs text-muted-foreground">#{toAr(a.id)}</span></td>
                    <td className="p-3">{revenueProviders.find(provider => provider.id === a.providerId)?.businessName ?? "خدمة"}</td>
                    <td className="p-3 text-xs">{fmtDualDate(a.dateStr)}</td>
                    <td className="p-3 tabular-nums">{fmtN(Number(a.amount ?? 0))} ر.س</td>
                    <td className="p-3 tabular-nums text-green-700 dark:text-green-400">{fmtN(Number(a.deposit ?? 0))} ر.س</td>
                    <td className="p-3 tabular-nums text-amber-700 dark:text-amber-400">{fmtN(Math.max(0, Number(a.amount ?? 0) - Number(a.deposit ?? 0)))} ر.س</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <PaginationBar page={pagination.page} pageSize={pagination.pageSize}
                totalItems={combinedServiceBookings.length} totalPages={pagination.totalPages}
                onPageChange={pagination.goToPage} onPageSizeChange={pagination.changePageSize} />
            </div>}
          </PaginatedItems>
        </div>
      )}

      {unit.type !== "chalet" && revenueSource !== "bookings" && <QuickSalesRevenueDetails sales={combinedQuickSales} />}
      <div className={unit.type !== "chalet" && revenueSource === "quick_sales" ? "hidden" : "contents"}>
      {/* ── FINANCIAL CHANNELS DISTRIBUTION ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">توزيع قنوات التحصيل</h3>
          <span className="text-[11px] text-muted-foreground ms-auto">الوضع الراهن — {unit.type === "all" && revenueProviders.length > 0 ? "حجوزات العقارات" : "جميع الحجوزات"}</span>
        </div>
        {/* Column headers */}
        <div className="flex items-center justify-between px-5 py-2 bg-muted/30 border-b border-border">
          <span className="text-xs font-bold text-muted-foreground">القناة المالية</span>
          <span className="text-xs font-bold text-muted-foreground">المبلغ المحصّل</span>
        </div>
        <div className="divide-y divide-border">
          {/* Row 1: Bank / Transfers */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-lg">🏦</div>
              <div>
                <div className="font-semibold text-sm text-foreground">الحساب البنكي / حوالات</div>
                <div className="text-[11px] text-muted-foreground">مجموع التحويلات البنكية والشبكة المستلمة</div>
              </div>
            </div>
            {loading ? <Skeleton className="h-7 w-28" /> : (
              <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                {fmtN(channels.bankTransfers)} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
              </div>
            )}
          </div>
          {/* Row 2: Cash Deposited to Bank */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 text-lg">✅</div>
              <div>
                <div className="font-semibold text-sm text-foreground">كاش تم إيداعه في البنك</div>
                <div className="text-[11px] text-muted-foreground">نقدي سبق تحويله للحساب البنكي</div>
              </div>
            </div>
            {loading ? <Skeleton className="h-7 w-28" /> : (
              <div className="text-xl font-extrabold text-green-600 dark:text-green-400 tabular-nums shrink-0">
                {fmtN(channels.cashDeposited)} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
              </div>
            )}
          </div>
          {/* Row 3: Un-deposited Cash — info click → breakdown, action → deposit */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border/50">
            <button
              type="button"
              onClick={() => setCashBreakdownOpen(true)}
              className="flex items-center gap-3 flex-1 text-right hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 text-lg">💵</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">كاش لم يودَع / عهدة معلقة</span>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">تفاصيل ↓</span>
                </div>
                <div className="text-[11px] text-muted-foreground">نقدي بيد المشرف — لم يُودَع في البنك بعد</div>
              </div>
            </button>
            <div className="flex items-center gap-3 shrink-0">
              {loading ? <Skeleton className="h-7 w-28" /> : (
                <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                  {fmtN(channels.cashUndeposited)} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                </span>
              )}
              {!loading && channels.cashUndeposited > 0 && (
                <button
                  type="button"
                  onClick={() => setDepositCashOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg transition-colors whitespace-nowrap"
                >
                  🏦 تسجيل إيداع
                </button>
              )}
            </div>
          </div>
          {/* Row 4: Insurance Custody */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-lg">🔒</div>
              <div>
                <div className="font-semibold text-sm text-foreground">عهدة التأمينات المستلمة</div>
                <div className="text-[11px] text-muted-foreground">مبالغ تأمين محتجزة — تُعاد للعملاء لاحقاً</div>
              </div>
            </div>
            {loading ? <Skeleton className="h-7 w-28" /> : (
              <div className="text-xl font-extrabold text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                {fmtN(channels.insuranceCustody)} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cash Breakdown Dialog */}
      <Dialog open={cashBreakdownOpen} onOpenChange={setCashBreakdownOpen}>
        <DialogContent className="max-w-lg px-3 sm:px-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              تفاصيل السيولة اليدوية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {(financial?.cashBreakdown ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد بنود</p>
            ) : (
              <table className="w-full table-fixed text-sm" dir="rtl">
                <colgroup>
                  <col />
                  <col className="w-[30%]" />
                  <col className="w-[28%]" />
                  <col className="w-8" />
                </colgroup>
                <thead className="text-xs font-bold text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-1 py-2 text-right">العميل</th>
                    <th scope="col" className="px-1 py-2 text-right">التاريخ</th>
                    <th scope="col" className="px-1 py-2 text-left">المبلغ</th>
                    <th scope="col" className="py-2"><span className="sr-only">الإجراءات</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(financial?.cashBreakdown ?? []).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-1 py-2 font-medium text-right text-foreground">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="break-words min-w-0">{row.clientName}</span>
                          {row.bookingId != null && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground whitespace-nowrap">
                              حجز <bdi dir="ltr">#{toArN(row.bookingId)}</bdi>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-2 text-right text-muted-foreground text-xs leading-relaxed tabular-nums">{fmtDualDate(row.date)}</td>
                      <td className="px-1 py-2 text-left font-bold tabular-nums text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        {fmtN(row.amount)} <span className="text-[10px] font-normal">ر.س</span>
                      </td>
                      <td className="py-2 text-center">
                        {row.paymentId && row.bookingId ? (
                          <button
                            type="button"
                            title="حذف هذه الدفعة"
                            onClick={async () => {
                              if (!confirm(`حذف دفعة ${fmtN(row.amount)} ر.س لـ ${row.clientName}؟`)) return;
                              const r = await apiFetch(`/owner/bookings/${row.bookingId}/payments/${row.paymentId}`, { method: "DELETE" });
                              if (r.ok) { refetchFinancial(); refetchFuture(); }
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-amber-300">
                  <tr>
                    <td colSpan={2} className="px-1 pt-2 text-right font-bold text-amber-700 dark:text-amber-400">الإجمالي</td>
                    <td className="px-1 pt-2 text-left font-extrabold tabular-nums text-amber-700 dark:text-amber-300 whitespace-nowrap">
                      {fmtN(channels.cashUndeposited)} <span className="text-[10px] font-normal">ر.س</span>
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Revenue log + damage deductions: only in individual unit view, NOT master */}
      {false && (
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">سجل الإيرادات</h3>
          {unit.type === "chalet" && (
            <span className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">كل الحجوزات</span>
          )}
          <div className="ms-auto flex gap-1 flex-wrap">
            {([["all", "الكل"], ["deposit", "عربون"], ["balance", "متبقي"], ["insurance", "تأمين"], ["damage", "تلفيات"], ["cancellation", "إلغاءات"], ["refund", "استرداد"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v as any)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${filter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">لا توجد إيرادات لهذا الشهر</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">العميل</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">النوع</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">طريقة الدفع</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const { hijri, gregorian } = formatDualDate(row.bookingDate);
                  const meta = TYPE_META[row.type];
                  const hasProof = row.type === "damage" && (() => { try { return JSON.parse(row.proofImages ?? "[]").length > 0; } catch { return false; } })();
                  const amtColor = row.type === "damage" ? "text-red-600" : row.type === "refund" ? "text-rose-600" : row.type === "balance" ? "text-green-600" : row.type === "cancellation" ? "text-orange-600" : row.type === "insurance" ? "text-slate-600" : "text-blue-600";
                  const pm = row.booking?.paymentMethod ?? "transfer";
                  const pmBadge = pm === "pos"
                    ? { icon: "💳", label: "شبكة", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" }
                    : pm === "cash"
                      ? { icon: "💵", label: "كاش", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" }
                      : { icon: "🏦", label: "تحويل", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
                  return (
                    <tr key={`${row.bookingId}-${row.type}-${i}`} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${row.isPending ? "opacity-70" : ""}`}>
                      <td className="py-2.5 px-3 font-medium">
                        {row.clientName}
                        {row.isPending && <span className="ms-1 text-[10px] font-semibold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-full">متبقي</span>}
                        {row.type === "deposit" && row.isPending && (
                          <span className="ms-1 text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-1.5 py-0.5 rounded-full">محصّل</span>
                        )}
                        {row.type === "deposit" && !row.isPending && (
                          <span className="ms-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 px-1.5 py-0.5 rounded-full">✓ مؤكد</span>
                        )}
                        {row.type === "insurance" && (
                          <span className="ms-1 text-[10px] font-semibold text-slate-600 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 px-1.5 py-0.5 rounded-full">تأمين عهدة</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                        <div className="font-medium">{hijri}</div>
                        <div className="text-muted-foreground">{gregorian} م</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
                          {row.type === "deposit" && row.isFullPayment ? "💰" : meta.emoji}
                          {row.type === "deposit" && row.isFullPayment ? "كامل المبلغ" : meta.label}
                        </span>
                        {row.reason && <div className="text-[10px] text-muted-foreground mt-0.5">{row.reason}</div>}
                        {hasProof && (
                          <button
                            type="button"
                            onClick={() => setProofTarget(row.booking)}
                            className="text-[10px] text-purple-600 underline mt-0.5 block"
                          >📸 عرض الإثبات</button>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {(row.type === "deposit" || row.type === "balance" || row.type === "damage" || row.type === "cancellation") ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${pmBadge.cls}`}>
                            {pmBadge.icon} {pmBadge.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-left">
                        <div className="inline-flex flex-col items-start gap-1">
                          <div className="font-bold text-base tabular-nums">
                            <span className={amtColor}>{fmtN(row.amount)}</span>
                            <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                          </div>
                          {(row.type === "deposit" || row.type === "balance") && !row.isPending && (() => {
                            const bk = row.booking;
                            const dep = Number(bk.depositPaid ?? 0);
                            const rem = bk.totalPrice ? Math.max(0, Number(bk.totalPrice) - dep) : 0;
                            const maxAmt = dep + (bk.balanceCollected ? rem : 0);
                            return maxAmt > 0 ? (
                              <button
                                onClick={() => { setRefundModal({ booking: bk, maxAmount: maxAmt }); setRefundAmount(""); setRefundReason(""); setRefundType("partial"); }}
                                className="flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg px-2 py-1 hover:bg-rose-100 transition-colors whitespace-nowrap"
                              >
                                <RotateCcw className="w-3 h-3" />
                                استرداد
                              </button>
                            ) : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={4} className="py-2 px-3 text-xs font-bold text-muted-foreground">المجموع</td>
                  <td className="py-2 px-3 text-left font-extrabold text-base text-primary tabular-nums">
                    {fmtN(filteredRows.reduce((s, r) => s + r.amount, 0))} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Damage Deductions sub-section — individual unit only */}
      {false && (
        <div className="bg-card border border-red-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">✂️</span>
            <h3 className="font-bold text-sm text-red-700">سجل خصومات التأمين (تلفيات)</h3>
          </div>
          <div className="space-y-2">
            {rows.filter(r => r.type === "damage").map((row, i) => {
              const { hijri, gregorian } = formatDualDate(row.bookingDate);
              const proofImgs: string[] = (() => { try { return JSON.parse(row.proofImages ?? "[]"); } catch { return []; } })();
              const base = import.meta.env.BASE_URL.replace(/\/$/, "");
              return (
                <div key={i} className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-foreground">{row.clientName}</div>
                      <div className="text-[11px] text-muted-foreground">{hijri} | {gregorian}</div>
                      {row.reason && <div className="text-xs text-red-700 mt-0.5">📋 {row.reason}</div>}
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-xl font-bold text-red-600 tabular-nums">{fmtN(row.amount)} <span className="text-xs font-normal">ر.س</span></div>
                    </div>
                  </div>
                  {proofImgs.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex gap-1">
                        {proofImgs.slice(0, 3).map((u, pi) => {
                          const fu = u.startsWith("http") ? u : `${window.location.origin}${base}${u}`;
                          return (
                            <button key={pi} type="button" onClick={() => setProofTarget(row.booking)} className="w-10 h-10 rounded overflow-hidden bg-muted border">
                              <img src={fu} alt="" className="w-full h-full object-cover" />
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => setProofTarget(row.booking)} className="text-xs text-purple-600 underline">
                        📸 عرض الإثبات ({toAr(proofImgs.length)})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      </div>
      </>}

      {/* ══ DEPOSIT CASH CONFIRMATION DIALOG ══════════════════════════════ */}
      <Dialog open={depositCashOpen} onOpenChange={setDepositCashOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <span className="text-xl">🏦</span>
              تسجيل إيداع نقدي في البنك
            </DialogTitle>
            <DialogDescription className="text-right text-sm mt-2">
              هل أنت متأكد من تسجيل تحويل هذا المبلغ الكاش إلى الحساب البنكي؟
            </DialogDescription>
          </DialogHeader>
          <div className="my-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-center">
            <div className="text-3xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
              {fmtN(channels.cashUndeposited)}
              <span className="text-lg font-normal text-muted-foreground ms-2">ر.س</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">إجمالي الكاش غير المودَع حالياً</div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">مبلغ الإيداع (ر.س)</label>
            <input
              type="text"
              inputMode="decimal"
              value={depositAmount ? toEasternArabic(depositAmount) : ""}
              onChange={e => setDepositAmount(fromEasternArabic(e.target.value).replace(/[^\d]/g, ""))}
              placeholder={toEasternArabic(channels.cashUndeposited)}
              className={`w-full border rounded-lg px-3 py-2 text-right text-sm bg-background focus:outline-none focus:ring-2 ${depositAmount && Number(depositAmount) > channels.cashUndeposited ? "border-destructive focus:ring-destructive" : "border-border focus:ring-blue-500"}`}
            />
            {depositAmount && Number(depositAmount) > channels.cashUndeposited && (
              <p className="text-xs font-semibold text-destructive">⚠️ المبلغ يتجاوز الكاش المتاح ({channels.cashUndeposited.toLocaleString("ar-SA")} ر.س)</p>
            )}
            <p className="text-xs text-muted-foreground">
              اترك الحقل فارغاً لإيداع المبلغ الكامل ({channels.cashUndeposited.toLocaleString("ar-SA")} ر.س)
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-right bg-muted/40 rounded-lg p-3 leading-relaxed">
            سيتم تسجيل الإيداع في سجل الحساب البنكي وخصمه من رصيد الكاش غير المودَع.
          </p>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => { setDepositCashOpen(false); setDepositAmount(""); }} disabled={depositingCash} className="flex-1">
              إلغاء
            </Button>
            <Button
              onClick={async () => {
                const amt = depositAmount ? Number(depositAmount) : channels.cashUndeposited;
                if (!amt || amt <= 0) return;
                setDepositingCash(true);
                try {
                  const submissionId = unit.type === "chalet" ? (unit as any).submissionId : undefined;
                  const r = await apiFetch("/owner/mark-cash-deposited", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: amt, submissionId }),
                  });
                  if (r.ok) {
                    await Promise.all([refetchBookings(), refetchDepositLogs(), refetchFinancial()]);
                    setDepositCashOpen(false);
                    setDepositAmount("");
                  }
                } finally {
                  setDepositingCash(false);
                }
              }}
              disabled={depositingCash || channels.cashUndeposited === 0 || (!!depositAmount && Number(depositAmount) > channels.cashUndeposited)}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {depositingCash ? "جارٍ التسجيل..." : "✓ تأكيد الإيداع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProofViewerDialog booking={proofTarget} open={!!proofTarget} onClose={() => setProofTarget(null)} />

      {/* ── Owner Refund Modal ── */}
      <Dialog open={!!refundModal} onOpenChange={(v) => { if (!v) setRefundModal(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-rose-500" />
              تسجيل استرداد للعميل
            </DialogTitle>
            <DialogDescription>
              {refundModal?.booking?.clientName} — الحد الأقصى للاسترداد: {fmtN(refundModal?.maxAmount ?? 0)} ر.س
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">نوع الاسترداد</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setRefundType("partial"); setRefundAmount(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${refundType === "partial" ? "bg-rose-600 text-white border-rose-600" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  جزئي
                </button>
                <button
                  onClick={() => { setRefundType("full"); setRefundAmount(String(refundModal?.maxAmount ?? "")); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${refundType === "full" ? "bg-rose-600 text-white border-rose-600" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  كامل ({fmtN(refundModal?.maxAmount ?? 0)} ر.س)
                </button>
              </div>
            </div>
            {refundType === "partial" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">المبلغ المسترد (ر.س)</label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0"
                  max={refundModal?.maxAmount ?? 0}
                  className={`text-right ${refundAmount && Number(refundAmount) > (refundModal?.maxAmount ?? 0) ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                />
                {refundAmount && Number(refundAmount) > (refundModal?.maxAmount ?? 0) && (
                  <p className="text-xs font-semibold text-destructive bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg px-2.5 py-2">
                    ⚠️ خطأ: المبلغ المُسترد ({fmtN(Number(refundAmount))} ر.س) يتجاوز الحد المسموح — الحد الأقصى هو {fmtN(refundModal?.maxAmount ?? 0)} ر.س
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">سبب الاسترداد (اختياري)</label>
              <Textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="مثال: إلغاء بسبب ظروف طارئة..."
                rows={2}
                className="text-right resize-none"
              />
            </div>
            {refundAmount && Number(refundAmount) > 0 && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 px-3 py-2 text-sm">
                سيُسجَّل استرداد بمبلغ <span className="font-bold text-rose-700">{fmtN(Number(refundAmount))} ر.س</span> لـ {refundModal?.booking?.clientName}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRefundModal(null)}>إلغاء</Button>
            <Button
              disabled={refundPending || !refundAmount || Number(refundAmount) <= 0 || Number(refundAmount) > (refundModal?.maxAmount ?? 0)}
              onClick={async () => {
                if (!refundModal) return;
                setRefundPending(true);
                try {
                  const r = await apiFetch(`/owner/bookings/${refundModal.booking.id}/refund`, {
                    method: "POST",
                    body: JSON.stringify({ amount: Number(refundAmount), reason: refundReason || null, type: refundType }),
                  });
                  if (!r.ok) {
                    const err = await r.json().catch(() => null);
                    toast({ title: "فشل تسجيل الاسترداد", description: err?.error ?? "حاول مجدداً", variant: "destructive" });
                    return;
                  }
                  toast({ title: "✅ تم تسجيل الاسترداد", description: `${fmtN(Number(refundAmount))} ر.س — ${refundModal.booking.clientName}` });
                  setRefundModal(null);
                  refetchRefunds();
                  refetchFinancial();
                } finally { setRefundPending(false); }
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
            >
              {refundPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              تأكيد الاسترداد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
