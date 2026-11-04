import { FinancialReportActivitySelect, type ReportProperty, type ReportService } from "@/components/FinancialReportActivitySelect";
import { propertyPrincipal, servicePrincipal, isPropertyExpense } from "@/lib/financialPrincipal";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useCallback, type ReactElement } from "react";
import { financialReportTitle, scopeServiceFinancialReport, defaultFinancialReportActivity, loneFinancialReportActivity, includeQuickSalesInReport } from "@/lib/financialReportActivity";
import { quickSalesForPeriod, type RevenueSource } from "@/lib/quickSalesRevenue";
import { type PropertyPaymentFilter } from "@/lib/propertyBookingStatus";
import { buildServiceFinancialReport, serviceExpensesForPeriod, serviceReportRows, serviceReportSourceLabels, serviceBookingReport, serviceSalesForPaymentFilter, serviceReportDate, serviceReportStatus, serviceReportPaymentLabels, serviceReportPeriodForView, type ServiceReportMode, type ServiceReportBooking } from "@/lib/serviceFinancialReport";
import { archiveToday } from "@/lib/bookingArchive";
import { formatDateWithHijri, formatDualDate, HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { buildActivitySummaryReportHtml, resolveReportCalendar, financialPeriodOptions, reconcileFinancialMonth, PROPERTY_REPORT_REVENUE_NOTE } from "@/lib/financialReport";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { propertyReportAllPeriodBounds } from "@/lib/propertyReportPeriod";
import { activityKey } from "@/lib/dashboardActivity";
import type { GetOwnerFinancialPeriods200 } from "@workspace/api-client-react";
import { useListQuickSales } from "@workspace/api-client-react";
import { toAr } from "@/lib/utils";
import { ServiceFinancialReportPanels, type ServiceReportDetailTable } from "@/components/owner/ServiceFinancialReportPanels";
import { Clock, Home, BookOpen, Trash2, Globe, Phone, AlertTriangle, BarChart2, TrendingUp, Sunrise, Moon, Sun, Zap, Wallet, Receipt, TrendingDown, ChevronDown, ChevronUp, Loader2, FileText, Archive, Mail, MessageSquare, Settings, Activity, Send, CalendarDays, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { ServiceReportPeriodControls } from "@/components/owner/ServiceReportPeriodControls";
import { FinancialPeriodControls } from "@/components/FinancialPeriodControls";
import { ServiceReportFilters } from "@/components/owner/ServiceReportFilters";
import { Skeleton } from "@/components/ui/skeleton";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Input } from "@/components/ui/input";
import { FinanceUnit, useAdminFinance, useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { getHijriYMClient } from "@/components/owner/finance-dates";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";
import { FinancialReportNumber, MonthReport, OwnerExpense, PaginationBar, ReportCalendarMode, buildReportFileName, catMap, formatAmount, formatWhatsAppAmount, formatWhatsAppHijriDate, useListPagination } from "@/components/owner/finance-shared";
import { GREGORIAN_MONTHS_AR } from "@/components/owner/owner-calendar";
import { REPORT_CSS, buildMonthlyReportHtml, buildYearlyReportHtml, generateAndUploadReportPdf, generateReportQrDataUrl, getLogoDataUrl, htmlToPdfBlob, printMonthlyReport, printYearlyReport } from "@/components/owner/financial-report-export";
import { encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { GroupedFinancialReport } from "./GroupedFinancialReport";


export function ReportsTab(props: Parameters<typeof SingleActivityReportsTab>[0]) {
  const { unit, financialSelection, selectFinancialActivities } = useAdminFinance();
  const selection = financialSelection === undefined ? unit.type === "all" ? null : [unit] : financialSelection;
  if (selectFinancialActivities && (selection === null ? props.properties.length + props.services.length > 1 : selection.length > 1)) {
    return <GroupedFinancialReport selection={selection} calendarPreference={props.calendarPreference} />;
  }
  return <SingleActivityReportsTab {...props} />;
}

function SingleActivityReportsTab({ calendarPreference, properties, services, activitiesLoading, activitiesError }: {
  calendarPreference?: "hijri" | "gregorian";
  properties: ReportProperty[];
  services: ReportService[];
  activitiesLoading?: boolean;
  activitiesError?: boolean;
}) {
  const { toast } = useToast();
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  // This is a report-local filter: it never changes the owner's dashboard activity.
  const { unit: currentActivity, selectFinancialActivities } = useAdminFinance();
  const [reportActivityOverride, setReportUnit] = useState<FinanceUnit | null>(null);
  const loneReportActivity = loneFinancialReportActivity(properties, services);
  const repUnit = loneReportActivity ?? (reportActivityOverride ?? defaultFinancialReportActivity(currentActivity, properties, services));
  const [serviceReportSource, setServiceReportSource] = useState<RevenueSource>("all");
  const [serviceReportPayment, setServiceReportPayment] = useState<PropertyPaymentFilter>("all");
  const [serviceReportMode, setServiceReportMode] = useState<ServiceReportMode>("compact");
  const [showPropertyReportDetails, setShowPropertyReportDetails] = useState(false);
  const includesServiceBookings = repUnit.type !== "service" || serviceReportSource !== "quick_sales";
  const includesServiceSales = repUnit.type !== "service" || serviceReportSource !== "bookings";
  const _nowRep = new Date();
  const currentMonth = `${_nowRep.getFullYear()}-${String(_nowRep.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(_nowRep.getFullYear());
  const _nowHijri = getHijriYMClient(_nowRep);
  const nowHijriYearNum  = _nowHijri.year;
  const nowHijriMonthNum = _nowHijri.month;
  const todayLocalDate = archiveToday();
  const todayReportLabel = formatDateWithHijri(_nowRep);

  const [viewMode, setViewMode] = useState<"monthly" | "yearly" | "custom">("monthly");
  const [allPropertyPeriods, setAllPropertyPeriods] = useState(false);
  const reportType = repUnit.type === "all" ? "unified" : repUnit.type === "service" ? "services" : "chalets";
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const selectedSubmissionId = repUnit.type === "chalet"
    ? String(repUnit.submissionId ?? "none") : "all";
  const [isHijri, setIsHijri] = useState(() => resolveReportCalendar(calendarPreference, localStorage.getItem("revCalType")) === "hijri");
  const [isYearlyHijri, setIsYearlyHijri] = useState(() => resolveReportCalendar(calendarPreference, localStorage.getItem("revCalType")) === "hijri");
  useEffect(() => {
    if (!calendarPreference) return;
    setIsHijri(calendarPreference === "hijri");
    setIsYearlyHijri(calendarPreference === "hijri");
  }, [calendarPreference]);
  const isActivitySummary = repUnit.type === "service" || (repUnit.type === "all" && reportType !== "chalets");
  const [selectedHijriMonthVal, setSelectedHijriMonthVal] = useState<string>(() => {
    const { year, month } = getHijriYMClient(new Date());
    return year ? `${year}-${String(month).padStart(2, "0")}` : "";
  });
  const [selectedHijriYear, setSelectedHijriYear] = useState(() => {
    const { year } = getHijriYMClient(new Date());
    return String(year || nowHijriYearNum || 1448);
  });
  const [sharePhone, setSharePhone] = useState(() => localStorage.getItem("reportSharePhone") ?? "");
  const [shareEmail, setShareEmail] = useState(() => localStorage.getItem("reportShareEmail") ?? "");
  const [showShare, setShowShare] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [quickAction, setQuickAction] = useState<"print" | "pdf" | "share" | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveSavedId, setArchiveSavedId] = useState<number | null>(null);
  const [customFromInput, setCustomFrom] = useState("");
  const [customToInput, setCustomTo] = useState("");
  const propertyBookingsQuery = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "report-bookings-with-cancellations"],
    queryFn: async () => {
      const responses = await Promise.all([apiFetch("/owner/bookings"), apiFetch("/owner/bookings/cancelled")]);
      if (responses.some(r => !r.ok)) throw new Error("تعذّر تحميل حجوزات التقرير");
      const lists = await Promise.all(responses.map(r => r.json() as Promise<OwnerBooking[]>));
      return [...new Map(lists.flat().map(b => [b.id, b])).values()];
    },
    enabled: viewMode === "monthly" || viewMode === "custom",
  });
  const propertyExpensesQuery = useQuery<OwnerExpense[]>({
    queryKey: ["owner", "expenses"],
    queryFn: async () => {
      const r = await apiFetch("/owner/expenses");
      if (!r.ok) throw new Error("تعذّر تحميل مصروفات التقرير");
      return r.json();
    },
  });
  const repAllBookings = propertyBookingsQuery.data ?? [];
  const repAllExpenses = (propertyExpensesQuery.data ?? []).filter(isPropertyExpense);
  const allPropertyBounds = propertyReportAllPeriodBounds(repAllBookings, repAllExpenses, selectedSubmissionId, todayLocalDate);
  const customFrom = allPropertyPeriods ? allPropertyBounds.from : customFromInput;
  const customTo = allPropertyPeriods ? allPropertyBounds.to : customToInput;
  const allPropertyDataLoading = allPropertyPeriods && (propertyBookingsQuery.isLoading || propertyExpensesQuery.isLoading);
  const allPropertyDataError = allPropertyPeriods && (propertyBookingsQuery.isError || propertyExpensesQuery.isError);
  const qc = useQueryClient();

  useEffect(() => { setPdfUrl(null); setArchiveSavedId(null); }, [viewMode, allPropertyPeriods, selectedMonth, selectedHijriMonthVal, isHijri, selectedYear, selectedHijriYear, isYearlyHijri, customFrom, customTo, selectedSubmissionId, reportType, activityKey(repUnit), serviceReportSource, serviceReportPayment, serviceReportMode, showPropertyReportDetails]);

  const hijriReportParsed = useMemo(() => {
    if (!isHijri || !selectedHijriMonthVal) return null;
    const [y, m] = selectedHijriMonthVal.split("-").map(Number);
    return { year: y, month: m };
  }, [isHijri, selectedHijriMonthVal]);

  const { data: reportYears, isLoading: periodsLoading, isError: periodsError } = useQuery<GetOwnerFinancialPeriods200>({
    queryKey: ["owner", "report-years", selectedSubmissionId, repUnit.type, repUnit.type === "service" ? repUnit.id : null, reportType],
    queryFn: async () => {
      const activity = repUnit.type === "service" || reportType === "services" ? "services"
        : repUnit.type === "all" && reportType === "unified" ? "unified" : "properties";
      const params = new URLSearchParams({ activity });
      if (activity !== "services" && selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      if (repUnit.type === "service") params.set("providerId", String(repUnit.id));
      const response = await apiFetch(`/owner/report-years?${params}`);
      if (!response.ok) throw new Error("تعذّر تحميل الفترات المالية");
      return response.json();
    },
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: repUnit.type === "service" ? 30_000 : false,
  });
  const gregorianPeriods = useMemo(() => financialPeriodOptions(reportYears?.gregorianMonths ?? [], "gregorian"), [reportYears]);
  const hijriPeriods = useMemo(() => financialPeriodOptions(reportYears?.hijriMonths ?? [], "hijri"), [reportYears]);
  const activePeriods = isHijri ? hijriPeriods : gregorianPeriods;
  const activeSelectedMonth = isHijri ? selectedHijriMonthVal : selectedMonth;
  const monthlyPeriodReady = activePeriods.months.includes(activeSelectedMonth);
  useEffect(() => {
    const gregorian = reconcileFinancialMonth(gregorianPeriods.months, selectedMonth);
    const hijri = reconcileFinancialMonth(hijriPeriods.months, selectedHijriMonthVal);
    if (gregorian && gregorian !== selectedMonth) setSelectedMonth(gregorian);
    if (hijri && hijri !== selectedHijriMonthVal) setSelectedHijriMonthVal(hijri);
    if (gregorianPeriods.years.length && !gregorianPeriods.years.includes(selectedYear)) setSelectedYear(gregorianPeriods.years[0]);
    if (hijriPeriods.years.length && !hijriPeriods.years.includes(selectedHijriYear)) setSelectedHijriYear(hijriPeriods.years[0]);
  }, [gregorianPeriods, hijriPeriods, selectedMonth, selectedHijriMonthVal, selectedYear, selectedHijriYear]);

  const { data: report, isLoading } = useQuery<MonthReport>({
    queryKey: ["owner", "reports", isHijri, isHijri ? selectedHijriMonthVal : selectedMonth, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isHijri && hijriReportParsed) {
        params.set("hijriYear",  String(hijriReportParsed.year));
        params.set("hijriMonth", String(hijriReportParsed.month));
      } else {
        params.set("month", selectedMonth);
      }
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/reports?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: viewMode === "monthly" && monthlyPeriodReady,
  });

  const { data: subscription } = useQuery({
    queryKey: ["owner", "subscription"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: financial } = useQuery<{
    month: string;
    totalRevenue: number;
    totalInsuranceHeld: number;
    totalInsuranceDeducted: number;
    totalExpenses: number;
    netProfit: number;
    categoryTotals: Record<string, number>;
    trend: { month: string; revenue: number; expenses: number }[];
    cashOnHand?: number;
    totalWithdrawals?: number;
  }>({
    queryKey: ["owner", "financial-summary", isHijri, isHijri ? selectedHijriMonthVal : selectedMonth, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isHijri && hijriReportParsed) {
        params.set("hijriYear",  String(hijriReportParsed.year));
        params.set("hijriMonth", String(hijriReportParsed.month));
      } else {
        params.set("month", selectedMonth);
      }
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/financial-summary?${params}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: viewMode === "monthly" && monthlyPeriodReady,
  });

  const { data: yearly, isLoading: yearlyLoading } = useQuery<{
    year: string;
    monthly: { month: string; revenue: number; expenses: number; netProfit: number }[];
    totals: { revenue: number; expenses: number; netProfit: number };
  }>({
    queryKey: ["owner", "yearly-summary", selectedYear, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ year: selectedYear });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/yearly-summary?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: viewMode === "yearly" && !isYearlyHijri && gregorianPeriods.years.includes(selectedYear),
  });

  const { data: yearlyHijri, isLoading: yearlyHijriLoading } = useQuery<{
    hijriYear: number;
    monthly: { month: string; monthName: string; revenue: number; expenses: number; netProfit: number }[];
    totals: { revenue: number; expenses: number; netProfit: number };
  }>({
    queryKey: ["owner", "yearly-summary-hijri", selectedHijriYear, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ hijriYear: selectedHijriYear });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/yearly-summary-hijri?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: viewMode === "yearly" && isYearlyHijri && hijriPeriods.years.includes(selectedHijriYear),
  });

  const { data: archive = [] } = useQuery<any[]>({
    queryKey: ["owner", "reports-archive"],
    queryFn: async () => {
      const r = await apiFetch("/owner/reports/archive");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: showArchive,
  });
  const archivePagination = useListPagination(archive, archive.map((report: any) => report.id).join("|"));

  const { data: rawSvcRepSummary, isLoading: serviceReportLoading, isError: serviceReportError } = useQuery<{ totalRevenue: number; totalDeposits: number; totalInsurance: number; byProvider: { id: number; name: string; revenue: number; deposits: number; insurance: number }[] }>({
    queryKey: ["owner", "service-revenue-summary-rep", isHijri, isHijri ? selectedHijriMonthVal : selectedMonth],
    queryFn: async () => {
      const params = isHijri
        ? new URLSearchParams({ hijriYear: selectedHijriMonthVal.split("-")[0], hijriMonth: String(Number(selectedHijriMonthVal.split("-")[1])) })
        : new URLSearchParams({ month: selectedMonth });
      const r = await apiFetch(`/owner/service-revenue-summary?${params}`);
      if (!r.ok) throw new Error("تعذّر تحميل تقرير الخدمات");
      return r.json();
    },
    enabled: isActivitySummary && repUnit.type !== "service" && viewMode === "monthly" && monthlyPeriodReady,
    refetchInterval: 30_000,
  });
  const reportQuickSalesQuery = useListQuickSales(repUnit.type === "service" ? { providerId: repUnit.id } : undefined, {
    query: { enabled: isActivitySummary, staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000 },
  });
  const serviceReportPeriod = serviceReportPeriodForView(
    repUnit.type === "service" ? viewMode : "monthly", isHijri ? "hijri" : "gregorian",
    isHijri ? selectedHijriMonthVal : selectedMonth, isHijri ? selectedHijriYear : selectedYear, customFrom, customTo);
  const servicePeriodReady = viewMode === "monthly" ? monthlyPeriodReady
    : viewMode === "yearly" ? activePeriods.years.includes(isHijri ? selectedHijriYear : selectedYear)
    : !!customFrom && !!customTo && customFrom <= customTo && customTo <= todayLocalDate && activePeriods.years.length > 0;
  const periodQuickSales = includesServiceSales ? quickSalesForPeriod(reportQuickSalesQuery.data ?? [], repUnit, serviceReportPeriod) : [];
  const reportQuickSales = repUnit.type === "service"
    ? serviceSalesForPaymentFilter(periodQuickSales, serviceReportPayment) : periodQuickSales;
  const serviceExpenseQuery = useQuery<OwnerExpense[]>({
    queryKey: ["owner", "expenses", "service-report", repUnit.type === "service" ? repUnit.id : null],
    queryFn: async () => {
      const r = await apiFetch(`/owner/expenses?providerId=${repUnit.type === "service" ? repUnit.id : ""}`);
      if (!r.ok) throw new Error("تعذّر تحميل مصروفات الخدمة");
      return r.json();
    },
    enabled: repUnit.type === "service", staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
  });
  const serviceBookingsQuery = useQuery<ServiceReportBooking[]>({
    queryKey: ["service-appointments", repUnit.type === "service" ? repUnit.id : null],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${repUnit.type === "service" ? repUnit.id : ""}/appointments`);
      if (!r.ok) throw new Error("تعذّر تحميل تفاصيل حجوزات الخدمة");
      return r.json();
    },
    enabled: repUnit.type === "service" && includesServiceBookings, staleTime: 0, refetchOnMount: "always", refetchInterval: 30_000,
  });
  const serviceReportExpenses = repUnit.type === "service"
    ? serviceExpensesForPeriod(serviceExpenseQuery.data ?? [], repUnit.id, serviceReportPeriod) : [];
  const selectedServiceBookings = serviceBookingReport(serviceBookingsQuery.data ?? [], repUnit.type === "service" ? repUnit.id : -1,
    serviceReportPeriod, serviceReportPayment);
  const serviceClosing = buildServiceFinancialReport(repUnit.type === "service"
    ? selectedServiceBookings.summary : scopeServiceFinancialReport(rawSvcRepSummary, repUnit),
    reportQuickSales, serviceReportExpenses, serviceReportSource);
  const svcRepSummary = repUnit.type === "service" ? serviceClosing
    : includeQuickSalesInReport(scopeServiceFinancialReport(rawSvcRepSummary, repUnit), reportQuickSales);
  const serviceDataLoading = repUnit.type === "service" && (serviceExpenseQuery.isLoading
    || (includesServiceBookings && serviceBookingsQuery.isLoading)
    || (includesServiceSales && reportQuickSalesQuery.isLoading));
  const serviceDataError = repUnit.type === "service" && (serviceExpenseQuery.isError
    || (includesServiceBookings && (serviceBookingsQuery.isError || selectedServiceBookings.hasInvalidAmounts))
    || (includesServiceSales && reportQuickSalesQuery.isError));
  const quickSaleDetails = {
    title: "تفاصيل المبيعات الفردية (البيع السريع)",
    headers: ["رقم البيع", "التاريخ", "النشاط", "العميل", "البنود والكميات", "التحصيل", "المبلغ"],
    rows: reportQuickSales.map(sale => {
      const date = formatDualDate(sale.dateStr);
      return [
        toAr(String(sale.id)),
        repUnit.type === "service" ? serviceReportDate(sale.dateStr, isHijri)
          : isHijri ? `${date.hijri} — ${date.gregorian} م` : `${date.gregorian} م — ${date.hijri}`,
        sale.providerName, sale.clientName || "غير محدد",
        sale.items.map(item => `${item.name} × ${toAr(String(item.quantity))}`).join("، "),
        sale.paymentMethod === "bank" ? "تحويل بنكي" : "نقدي",
        `${sale.total.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`,
      ];
    }),
  };
  const serviceMoney = (value: number) => `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
  const serviceDate = (dateStr: string) => serviceReportDate(dateStr, isHijri);
  const serviceReportDetails: ServiceReportDetailTable[] = [
    ...(includesServiceBookings ? [{
      title: "تفاصيل حجوزات الخدمات الأساسية", headers: ["رقم الحجز", "التاريخ", "العميل", "الحالة", "قيمة الحجز", "المحصّل", "المتبقي دون التأمين"],
      rows: selectedServiceBookings.bookings.map(booking =>
        [toAr(String(booking.id)), serviceDate(servicePrincipal(booking).date), booking.clientName || "غير محدد",
          serviceReportStatus(booking.status), serviceMoney(servicePrincipal(booking).contractual),
          serviceMoney(servicePrincipal(booking).collected), serviceMoney(servicePrincipal(booking).outstanding)]),
      emptyMessage: "لا توجد حجوزات غير ملغاة خلال الفترة المختارة.",
    }] : []),
    ...(includesServiceSales ? [{ ...quickSaleDetails, emptyMessage: "لا توجد مبيعات فردية مكتملة خلال الفترة المختارة." }] : []),
    { title: "تفاصيل المصروفات المسجلة للخدمة", headers: ["رقم المصروف", "التاريخ", "التصنيف", "الملاحظات", "المبلغ"],
      rows: serviceReportExpenses.map(expense => [toAr(String(expense.id)), serviceDate(expense.dateStr),
        expense.customCategory || catMap[expense.category]?.label || "أخرى", expense.notes || "—", serviceMoney(Number(expense.amount))]),
      emptyMessage: "لا توجد مصروفات مسجلة لهذه الخدمة خلال الفترة المختارة." },
  ];
  const serviceClosingRows = serviceClosing ? [
    { label: "إجمالي القيمة التعاقدية والمبيعات", amount: serviceClosing.totalContractValue },
    { label: "إجمالي الإيرادات المحصلة فعليًا (دون التأمين)", amount: serviceClosing.totalRevenue },
    { label: "المبالغ المتبقية لأصل الخدمة", amount: serviceClosing.totalOutstanding },
    { label: "المصروفات المسجلة للخدمة", amount: serviceClosing.totalExpenses },
    { label: "صافي الربح / الدخل النهائي", amount: serviceClosing.netProfit },
  ] : [];

  const archiveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiFetch("/owner/reports/archive", { method: "POST", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("فشل الحفظ");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "reports-archive"] }),
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/reports/archive/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "reports-archive"] }),
  });

  const monthOptions = gregorianPeriods.months.map(val => ({
    val, label: `${GREGORIAN_MONTHS_AR[Number(val.slice(5)) - 1]} ${toAr(val.slice(0, 4))} م`,
  }));

  // ── Compute monthly booking breakdown for the selected month/property ───
  const repBreakdown = useMemo(() => {
    const getAddonSum = (b: OwnerBooking): number => {
      const addons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
      return addons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0)
        .reduce((s, a) => s + Math.round(Number(a.price)), 0);
    };
    const [selHY, selHM] = selectedHijriMonthVal ? selectedHijriMonthVal.split("-").map(Number) : [0, 0];
    const filtered = repAllBookings.filter(b => {
      const date = propertyPrincipal(b).date;
      if (!date) return false;
      let monthMatch: boolean;
      if (isHijri && selHY) {
        const { year, month } = getHijriYMClient(new Date(date + "T12:00:00"));
        monthMatch = year === selHY && month === selHM;
      } else {
        monthMatch = date.startsWith(selectedMonth);
      }
      const propMatch = selectedSubmissionId === "all" || String(b.submissionId) === selectedSubmissionId;
      return monthMatch && propMatch;
    });
    const rows = filtered.map(b => {
      if (b.cancelledAt) {
        const principal = propertyPrincipal(b);
        return { id: b.id, name: `${b.clientName} — إيراد إلغاء محتفظ به`, date: principal.date,
          base: principal.collected, svc: 0, total: principal.collected };
      }
      const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice)
        : b.revenueAmount != null && Number(b.revenueAmount) > 0 ? Number(b.revenueAmount)
        : Number(b.depositPaid ?? 0);
      const svc = getAddonSum(b);
      return { id: b.id, name: b.clientName, date: b.bookingDate, base: Math.max(0, tp - svc), svc, total: tp };
    }).filter(r => r.total > 0);
    const totBase  = Math.round(rows.reduce((s, r) => s + r.base, 0));
    const totSvc   = Math.round(rows.reduce((s, r) => s + r.svc, 0));
    const totTotal = Math.round(rows.reduce((s, r) => s + r.total, 0));
    console.log("[تكية Reports] bookings:", rows.length, "| إيجار:", totBase, "| خدمات:", totSvc, "| إجمالي:", totTotal);
    return { rows, totBase, totSvc, totTotal };
  }, [repAllBookings, selectedMonth, selectedHijriMonthVal, isHijri, selectedSubmissionId]);

  // ── Earliest transaction date (for minDate constraint in custom picker) ───
  const earliestTransactionDate = useMemo(() => {
    const dates: string[] = [];
    for (const b of repAllBookings) {
      if (propertyPrincipal(b).date) dates.push(propertyPrincipal(b).date);
    }
    for (const e of repAllExpenses) {
      if (e.dateStr && Number(e.amount) > 0) dates.push(e.dateStr);
    }
    if (dates.length === 0) return undefined;
    return dates.sort()[0];
  }, [repAllBookings, repAllExpenses]);

  // ── groupByDay: ≤30 days → daily grouping, else monthly ─────────────────────
  const groupByDay = useMemo(() => {
    if (!customFrom || !customTo || customFrom > customTo) return false;
    const diff = Math.round(
      (new Date(customTo + "T12:00:00").getTime() - new Date(customFrom + "T12:00:00").getTime()) / 86_400_000
    ) + 1;
    return diff <= 30;
  }, [customFrom, customTo]);

  // ── Custom range report data — computed client-side from all bookings/expenses ───
  const customRangeData = useMemo(() => {
    if (!customFrom || !customTo || customFrom > customTo) return null;
    const propMatch = (sid: number | string | null | undefined) =>
      selectedSubmissionId === "all" || String(sid) === selectedSubmissionId;
    const monthMap = new Map<string, { revenue: number; expenses: number }>();
    const ensureMonth = (key: string) => { if (!monthMap.has(key)) monthMap.set(key, { revenue: 0, expenses: 0 }); return monthMap.get(key)!; };
    for (const b of repAllBookings) {
      const principal = propertyPrincipal(b);
      if (!principal.date || !propMatch(b.submissionId)) continue;
      if (principal.date < customFrom || principal.date > customTo) continue;
      const rev = principal.collected;
      if (rev <= 0) continue;
      ensureMonth(groupByDay ? principal.date : principal.date.slice(0, 7)).revenue += rev;
    }
    for (const e of repAllExpenses) {
      if (!e.dateStr || !(Number(e.amount) > 0)) continue;
      if (e.submissionId != null && !propMatch(e.submissionId)) continue;
      if (e.dateStr < customFrom || e.dateStr > customTo) continue;
      ensureMonth(groupByDay ? e.dateStr : e.dateStr.slice(0, 7)).expenses += Number(e.amount);
    }
    const monthly = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { revenue, expenses }]) => ({ month, revenue, expenses, netProfit: revenue - expenses }));
    const totals = monthly.reduce(
      (acc, m) => ({ revenue: acc.revenue + m.revenue, expenses: acc.expenses + m.expenses, netProfit: acc.netProfit + m.netProfit }),
      { revenue: 0, expenses: 0, netProfit: 0 }
    );
    return { monthly, totals };
  }, [repAllBookings, repAllExpenses, customFrom, customTo, selectedSubmissionId, groupByDay]);

  // ── Custom range data grouped by Hijri month (for hijri calMode) ─────────
  const customRangeDataHijri = useMemo(() => {
    if (!customFrom || !customTo || customFrom > customTo) return null;
    const propMatch = (sid: number | string | null | undefined) =>
      selectedSubmissionId === "all" || String(sid) === selectedSubmissionId;
    const monthMap = new Map<string, { revenue: number; expenses: number }>();
    const ensureMonth = (key: string) => { if (!monthMap.has(key)) monthMap.set(key, { revenue: 0, expenses: 0 }); return monthMap.get(key)!; };
    const toHijriKey = (dateStr: string) => {
      try {
        const hc = toHijriComponents(new Date(dateStr + "T12:00:00"));
        if (groupByDay) return `${hc.year}-${String(hc.month).padStart(2, "0")}-${String(hc.day).padStart(2, "0")}`;
        return `${hc.year}-${String(hc.month).padStart(2, "0")}`;
      } catch { return groupByDay ? dateStr : dateStr.slice(0, 7); }
    };
    for (const b of repAllBookings) {
      const principal = propertyPrincipal(b);
      if (!principal.date || !propMatch(b.submissionId)) continue;
      if (principal.date < customFrom || principal.date > customTo) continue;
      const rev = principal.collected;
      if (rev <= 0) continue;
      ensureMonth(toHijriKey(principal.date)).revenue += rev;
    }
    for (const e of repAllExpenses) {
      if (!e.dateStr || !(Number(e.amount) > 0)) continue;
      if (e.submissionId != null && !propMatch(e.submissionId)) continue;
      if (e.dateStr < customFrom || e.dateStr > customTo) continue;
      ensureMonth(toHijriKey(e.dateStr)).expenses += Number(e.amount);
    }
    const monthly = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { revenue, expenses }]) => ({ month, revenue, expenses, netProfit: revenue - expenses }));
    const totals = monthly.reduce(
      (acc, m) => ({ revenue: acc.revenue + m.revenue, expenses: acc.expenses + m.expenses, netProfit: acc.netProfit + m.netProfit }),
      { revenue: 0, expenses: 0, netProfit: 0 }
    );
    return { monthly, totals };
  }, [repAllBookings, repAllExpenses, customFrom, customTo, selectedSubmissionId, groupByDay]);

  const hijriMonthOptions = hijriPeriods.months.map(val => ({
    val, label: `${HIJRI_MONTHS_AR[Number(val.slice(5)) - 1]} ${toAr(val.slice(0, 4))} هـ`,
  }));

  const activeMonthLabel = isHijri
    ? (report?.hijriMonthLabel ?? hijriMonthOptions.find(o => o.val === selectedHijriMonthVal)?.label ?? selectedHijriMonthVal)
    : (monthOptions.find(o => o.val === selectedMonth)?.label ?? selectedMonth);
  const servicePeriodLabel = viewMode === "monthly" ? activeMonthLabel
    : viewMode === "yearly" ? `عام ${toAr(isHijri ? selectedHijriYear : selectedYear)} ${isHijri ? "هـ" : "م"}`
    : `من ${serviceReportDate(customFrom, isHijri)} إلى ${serviceReportDate(customTo, isHijri)}`;
  const isCurrentMonthlyPeriod = isHijri
    ? selectedHijriMonthVal === `${nowHijriYearNum}-${String(nowHijriMonthNum).padStart(2, "0")}`
    : selectedMonth === currentMonth;

  /* Recalculate occupancy from raw fields to guarantee consistency with displayed text */
  const displayOccupancy = useMemo(() => {
    if (!report || !report.daysInMonth) return report?.occupancyRate ?? 0;
    return Math.min(100, Math.round((report.totalDays / report.daysInMonth) * 100));
  }, [report]);

  const slotLabels: Record<string, { icon: ReactElement; label: string }> = {
    morning:     { icon: <Sunrise className="w-4 h-4" />,  label: "صباحي" },
    evening:     { icon: <Moon className="w-4 h-4" />,     label: "مسائي" },
    full_day:    { icon: <Sun className="w-4 h-4" />,      label: "يوم كامل" },
    unspecified: { icon: <Clock className="w-4 h-4" />,    label: "غير محدد" },
  };

  const selectedPropertyName = repUnit.type === "all" ? "جميع الأنشطة" : repUnit.name;
  const reportHeading = financialReportTitle(repUnit);

  function selectReportActivity(activity: FinanceUnit) {
    setReportUnit(activity);
    setAllPropertyPeriods(false);
    setViewMode("monthly");
    setPdfUrl(null);
    setArchiveSavedId(null);
    setShowShare(false);
    setShowArchive(false);
  }

  const handleShareWhatsApp = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const phone = sharePhone.replace(/\D/g, "");

    // ── Build message text (Arabic + Arabic-Indic digits) ──────────────────
    let titleText = "";
    let bodyText = "";
    let htmlContent = "";

    if (viewMode === "monthly" && report) {
      const monthLabel = toAr(activeMonthLabel);
      titleText = `تقرير ${monthLabel} – ${selectedPropertyName}`;
      const occupancy = report.daysInMonth > 0
        ? Math.min(100, Math.round((report.totalDays / report.daysInMonth) * 100))
        : report.occupancyRate;
      bodyText =
`📊 *تقرير شهر ${monthLabel}*
🏠 *المنشأة:* ${toAr(selectedPropertyName)}
🗓️ *الحجوزات:* ${toAr(report.totalBookings)} • *الإشغال:* ${toAr(occupancy)}٪
📈 *صافي الربح:* ${financial ? formatWhatsAppAmount(financial.netProfit) : "—"}
✨ *منصة تكية لإدارة الحجوزات*`;
      console.log("[WA-SHARE] bodyText:", bodyText);
    } else if (viewMode === "yearly") {
      const waYearly = isYearlyHijri ? yearlyHijri : yearly;
      const waYearStr = isYearlyHijri ? selectedHijriYear : selectedYear;
      const waYearLabel = isYearlyHijri ? `${selectedHijriYear} هـ` : selectedYear;
      if (!waYearly) return;
      const calTypeLabel = isYearlyHijri ? "الهجري" : "الميلادي";
      titleText = `التقرير السنوي ${calTypeLabel} - ${toAr(waYearStr)} – ${selectedPropertyName}`;
      bodyText =
`📊 التقرير السنوي ${calTypeLabel} - ${toAr(waYearStr)}
🏠 المنشأة: ${toAr(selectedPropertyName)}
💰 الإيرادات: ${formatWhatsAppAmount(waYearly.totals.revenue)}
💸 المصروفات: ${formatWhatsAppAmount(waYearly.totals.expenses)}
📈 صافي الربح: ${formatWhatsAppAmount(waYearly.totals.netProfit)}

✨ منصة تكية لإدارة الحجوزات`;
      console.log("[WA-SHARE] bodyText:", bodyText);
    } else if (viewMode === "custom") {
      const _waCal = isHijri ? "hijri" : "gregorian";
      const _waData = _waCal === "hijri" ? customRangeDataHijri : customRangeData;
      if (!_waData) return;
      const waRangeLabel = customFrom && customTo
        ? `من ${formatWhatsAppHijriDate(customFrom)} إلى ${formatWhatsAppHijriDate(customTo)}`
        : "فترة مخصصة";
      titleText = `تقرير الحركة المالية – ${selectedPropertyName}`;
      bodyText =
`📊 تقرير الحركة المالية
🏠 المنشأة: ${toAr(selectedPropertyName)}
📅 الفترة: ${waRangeLabel}
💰 الإيرادات: ${formatWhatsAppAmount(_waData.totals.revenue)}
💸 المصروفات: ${formatWhatsAppAmount(_waData.totals.expenses)}
📈 صافي الربح: ${formatWhatsAppAmount(_waData.totals.netProfit)}

✨ منصة تكية لإدارة الحجوزات`;
      console.log("[WA-SHARE] bodyText:", bodyText);
    } else return;

    const shareCalMode: ReportCalendarMode = viewMode === "yearly"
      ? (isYearlyHijri ? "hijri" : "gregorian")
      : viewMode === "monthly"
        ? (isHijri ? "hijri" : "gregorian")
        : (isHijri ? "hijri" : "gregorian");
    const shareFileName = buildReportFileName({
      viewMode,
      calMode: shareCalMode,
      month: selectedMonth,
      hijriMonth: selectedHijriMonthVal,
      year: selectedYear,
      hijriYear: selectedHijriYear,
      from: customFrom,
      to: customTo,
    });

    setWaLoading(true);
    try {
      const activeWaYearly = isYearlyHijri ? yearlyHijri : yearly;
      const activeWaYearStr = isYearlyHijri ? selectedHijriYear : selectedYear;

      const qr = viewMode === "monthly"
        ? await generateReportQrDataUrl("monthly", selectedMonth)
        : await generateReportQrDataUrl("yearly", activeWaYearStr);

      if (viewMode === "monthly") {
        const logo = await getLogoDataUrl();
        htmlContent = buildMonthlyReportHtml(selectedMonth, selectedPropertyName, report, financial, false, qr, repBreakdown, activeMonthLabel, logo, false, shareFileName, showPropertyReportDetails);
      } else if (viewMode === "custom") {
        const _shareCalMode = isHijri ? "hijri" : "gregorian";
        const _shareData = _shareCalMode === "hijri" ? customRangeDataHijri : customRangeData;
        if (!_shareData) return;
        const logo = await getLogoDataUrl();
        const _shareFmt = (d: string) => formatDateWithHijri(`${d}T12:00:00+03:00`);
        const rangeLabel = customFrom && customTo ? `${_shareFmt(customFrom)} ← ${_shareFmt(customTo)}` : "فترة مخصصة";
        const _shareDiff = customFrom && customTo ? Math.round((new Date(customTo + "T12:00:00").getTime() - new Date(customFrom + "T12:00:00").getTime()) / 86_400_000) + 1 : undefined;
        htmlContent = buildYearlyReportHtml(rangeLabel, selectedPropertyName, _shareData as any, false, qr, logo, true, _shareCalMode, groupByDay, _shareDiff, false, shareFileName, showPropertyReportDetails);
      } else if (activeWaYearly) {
        const logo = await getLogoDataUrl();
        htmlContent = buildYearlyReportHtml(activeWaYearStr, selectedPropertyName, activeWaYearly, false, qr, logo, false, shareCalMode, false, undefined, false, shareFileName, showPropertyReportDetails);
      } else return;

      const { blob } = await htmlToPdfBlob(htmlContent, shareFileName);
      const pdfFile = new File([blob], shareFileName, { type: "application/pdf", lastModified: Date.now() });

      // ── Web Share API: إرسال ملف PDF حقيقي مباشرة ───────────────────────
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({ files: [pdfFile], title: shareFileName, text: bodyText });
        return;
      }

      // ── إذا لم تدعم البيئة مشاركة الملفات: رابط واتساب نصي ──────────────
      const waLink = phone
        ? `https://wa.me/${phone}?text=${encodeWhatsAppText(bodyText)}`
        : `https://wa.me/?text=${encodeWhatsAppText(bodyText)}`;
      window.open(waLink, "_blank");
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      alert("تعذّر مشاركة التقرير، يرجى المحاولة مرة أخرى.");
    } finally {
      setWaLoading(false);
    }
  }, [viewMode, selectedMonth, selectedYear, selectedPropertyName, report, financial, yearly, yearlyHijri, isYearlyHijri, selectedHijriYear, sharePhone, activeMonthLabel, repBreakdown, isHijri, selectedHijriMonthVal, customFrom, customTo, customRangeData, customRangeDataHijri, groupByDay, showPropertyReportDetails]);

  const handleShareEmail = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmedEmail = shareEmail.trim();
    if (!trimmedEmail) { alert("يرجى إدخال البريد الإلكتروني في إعدادات المشاركة"); return; }
    setEmailLoading(true);
    try {
      /* 1. Generate & upload PDF if not already done */
      const emailYearly = isYearlyHijri ? yearlyHijri : yearly;
      const emailYearStr = isYearlyHijri ? selectedHijriYear : selectedYear;

      let url = pdfUrl;
      if (!url) {
        if (viewMode === "monthly") {
          url = await generateAndUploadReportPdf("monthly", {
            showDetails: showPropertyReportDetails,
            month: selectedMonth,
            hijriMonth: selectedHijriMonthVal,
            calMode: isHijri ? "hijri" : "gregorian",
            propertyName: selectedPropertyName,
            report,
            financial,
            breakdown: repBreakdown,
            monthTitle: activeMonthLabel,
          });
        } else if (viewMode === "yearly" && emailYearly) {
          url = await generateAndUploadReportPdf("yearly", {
            showDetails: showPropertyReportDetails,
            year: emailYearStr,
            hijriYear: selectedHijriYear,
            calMode: isYearlyHijri ? "hijri" : "gregorian",
            propertyName: selectedPropertyName,
            yearly: emailYearly,
          });
        }
        if (url) setPdfUrl(url);
      }
      if (!url) { alert("تعذّر إنشاء ملف PDF — يرجى المحاولة مرة أخرى"); return; }

      /* 2. Send via backend (real email with PDF attachment) */
      const payload: Record<string, unknown> = {
        to: trimmedEmail,
        chaletName: selectedPropertyName,
        monthLabel: activeMonthLabel,
        pdfUrl: url,
        viewMode,
      };
      if (viewMode === "monthly" && report) {
        payload.report = {
          totalBookings: report.totalBookings,
          occupancyRate: report.occupancyRate,
          totalDays: report.totalDays,
          daysInMonth: report.daysInMonth,
          slotStats: report.slotStats,
          topSlot: report.topSlot,
        };
        if (financial) payload.financial = financial;
      } else if (viewMode === "yearly" && emailYearly) {
        payload.year = emailYearStr;
        payload.yearlyTotals = emailYearly.totals;
      }

      const r = await apiFetch("/owner/reports/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        if (data.isTest && data.previewUrl) {
          /* Ethereal test mode — SMTP not configured */
          const open = window.confirm(
            `📧 تم إنشاء البريد بنجاح (وضع تجريبي)\n\n` +
            `بما أن إعدادات SMTP غير مُعدّة بعد، تم الإرسال عبر خادم بريد تجريبي.\n\n` +
            `اضغط "موافق" لمعاينة البريد (مع المرفق) في المتصفح.\n\n` +
            `ملاحظة: لتفعيل الإرسال الحقيقي أضف SMTP_HOST / SMTP_USER / SMTP_PASS في إعدادات البيئة.`
          );
          if (open) window.open(data.previewUrl, "_blank");
        } else {
          alert(`✅ تم إرسال التقرير بنجاح إلى ${trimmedEmail}\nالملف PDF مرفق مباشرة في البريد.`);
        }
      } else {
        alert(data?.error ?? "تعذّر إرسال البريد الإلكتروني.");
      }
    } catch (err) {
      console.error("Email share failed:", err);
      alert("حدث خطأ أثناء إرسال البريد — يرجى المحاولة لاحقاً.");
    } finally {
      setEmailLoading(false);
    }
  }, [viewMode, selectedMonth, selectedHijriMonthVal, isHijri, selectedYear, selectedPropertyName, report, financial, yearly, yearlyHijri, isYearlyHijri, selectedHijriYear, shareEmail, pdfUrl, repBreakdown, activeMonthLabel, showPropertyReportDetails]);

  const handleSaveToArchive = useCallback(async () => {
    setArchiveSaving(true);
    try {
      let url = pdfUrl;
      if (!url) {
        if (viewMode === "monthly") {
          url = await generateAndUploadReportPdf("monthly", {
            showDetails: showPropertyReportDetails,
            month: selectedMonth,
            hijriMonth: selectedHijriMonthVal,
            calMode: isHijri ? "hijri" : "gregorian",
            propertyName: selectedPropertyName,
            report,
            financial,
            breakdown: repBreakdown,
            monthTitle: activeMonthLabel,
          });
        } else if (viewMode === "yearly" && (isYearlyHijri ? yearlyHijri : yearly)) {
          url = await generateAndUploadReportPdf("yearly", {
            showDetails: showPropertyReportDetails,
            year: isYearlyHijri ? selectedHijriYear : selectedYear,
            hijriYear: selectedHijriYear,
            calMode: isYearlyHijri ? "hijri" : "gregorian",
            propertyName: selectedPropertyName,
            yearly: isYearlyHijri ? yearlyHijri : yearly,
          });
        }
        if (url) setPdfUrl(url);
      }
      const basePayload = {
        submissionId: selectedSubmissionId !== "all" ? Number(selectedSubmissionId) : undefined,
        propertyName: selectedPropertyName,
        pdfUrl: url ?? undefined,
      };
      const payload = viewMode === "monthly"
        ? { ...basePayload, reportType: "monthly", reportPeriod: selectedMonth, data: { report, financial } }
        : { ...basePayload, reportType: "yearly", reportPeriod: selectedYear, data: { yearly } };
      const result = await new Promise<any>((resolve, reject) => {
        archiveMutation.mutate(payload, { onSuccess: resolve, onError: reject });
      });
      setArchiveSavedId(result?.id ?? null);
      setShowArchive(true);
    } catch (e) {
      console.error("Archive save failed:", e);
      alert("تعذّر حفظ التقرير في الأرشيف");
    } finally {
      setArchiveSaving(false);
    }
  }, [viewMode, selectedMonth, selectedHijriMonthVal, isHijri, selectedYear, selectedHijriYear, isYearlyHijri, selectedSubmissionId, selectedPropertyName, report, financial, yearly, yearlyHijri, pdfUrl, archiveMutation, repBreakdown, activeMonthLabel, showPropertyReportDetails]);

  const quickReportReady = !activitiesLoading && !activitiesError && !periodsLoading && !periodsError && !allPropertyDataLoading && !allPropertyDataError && (repUnit.type === "service" ? servicePeriodReady : viewMode === "monthly" ? monthlyPeriodReady
    : viewMode === "yearly" ? (isYearlyHijri ? hijriPeriods.years.includes(selectedHijriYear) : gregorianPeriods.years.includes(selectedYear))
      : activePeriods.years.length > 0) && (isActivitySummary
    ? repUnit.type === "service" ? !!serviceClosing && !serviceDataLoading && !serviceDataError
      : !!svcRepSummary && !serviceReportLoading && !serviceReportError && !reportQuickSalesQuery.isLoading && !reportQuickSalesQuery.isError && (reportType !== "unified" || !!financial)
    : viewMode === "monthly" ? !!report && !!financial && !isLoading
      : viewMode === "yearly" ? !!(isYearlyHijri ? yearlyHijri : yearly) && !(isYearlyHijri ? yearlyHijriLoading : yearlyLoading)
      : !!(isHijri ? customRangeDataHijri : customRangeData) && !!customFrom && !!customTo);

  const propertyClosingTotals = isActivitySummary || !quickReportReady ? null
    : viewMode === "monthly" && financial
      ? { revenue: financial.totalRevenue, expenses: financial.totalExpenses, netProfit: financial.netProfit }
      : viewMode === "yearly" ? (isYearlyHijri ? yearlyHijri : yearly)?.totals
      : (isHijri ? customRangeDataHijri : customRangeData)?.totals;

  async function handleQuickReportAction(action: "print" | "pdf" | "share") {
    if (!quickReportReady || quickAction) return;
    // Open synchronously within the click to avoid browser popup blocking after PDF/font awaits.
    const printWindow = action === "print" ? window.open("", "_blank", "width=900,height=1200") : null;
    if (action === "print" && !printWindow) {
      toast({ title: "تعذّر فتح نافذة الطباعة", description: "اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.", variant: "destructive" });
      return;
    }
    setQuickAction(action);
    try {
      const calMode: ReportCalendarMode = viewMode === "yearly" ? (isYearlyHijri ? "hijri" : "gregorian") : (isHijri ? "hijri" : "gregorian");
      const fileName = buildReportFileName({ viewMode, calMode, month: selectedMonth, hijriMonth: selectedHijriMonthVal,
        year: selectedYear, hijriYear: selectedHijriYear, from: customFrom, to: customTo });
      const logo = await getLogoDataUrl();
      let html: string;
      if (repUnit.type === "service" && serviceClosing) {
        html = buildActivitySummaryReportHtml({ title: reportHeading, period: servicePeriodLabel,
          activityName: repUnit.name, fileName, rows: serviceReportRows(serviceClosing, serviceReportSource, serviceReportMode),
          scopeLabel: `نطاق التقرير: ${serviceReportSourceLabels[serviceReportSource]} — حالة السداد: ${serviceReportPaymentLabels[serviceReportPayment]} — عرض ${serviceReportMode === "compact" ? "مختصر" : "تفصيلي"}. تُخصم مصروفات الخدمة المسجلة للفترة كاملة من إيرادات النطاق المختار؛ لا تُوزّع تلقائيًا بين الحجوزات والبيع السريع. الإيرادات هي المحصّل فعليًا، والعربون جزء منها؛ القيمة التعاقدية تشمل غير المسدد، والتأمين القابل للاسترداد منفصل عن الإيرادات والمتبقي.`,
          detailSections: serviceReportMode === "detailed" ? serviceReportDetails : undefined, closingRows: serviceClosingRows,
          logo, css: REPORT_CSS, forPrint: action === "print" });
      } else if (isActivitySummary && svcRepSummary) {
        const unified = repUnit.type === "all" && reportType === "unified";
        const rows = unified ? [
          { label: "إيرادات العقارات", amount: financial?.totalRevenue ?? 0 },
          { label: "إيرادات حجوزات الخدمات", amount: svcRepSummary.bookingRevenue },
          { label: "المبيعات الفردية (البيع السريع)", amount: svcRepSummary.quickSalesRevenue },
          { label: "إجمالي الإيرادات الموحّدة", amount: (financial?.totalRevenue ?? 0) + svcRepSummary.totalRevenue },
          { label: "مصروفات العقارات", amount: financial?.totalExpenses ?? 0 },
          { label: "صافي العقارات", amount: financial?.netProfit ?? 0 },
        ] : [
          { label: "إيرادات حجوزات الخدمات", amount: svcRepSummary.bookingRevenue },
          { label: "المبيعات الفردية (البيع السريع)", amount: svcRepSummary.quickSalesRevenue },
          { label: "إجمالي إيرادات النشاط الموحّدة", amount: svcRepSummary.totalRevenue },
          { label: "عربون محصّل", amount: svcRepSummary.totalDeposits },
          { label: "التأمينات", amount: svcRepSummary.totalInsurance },
          ...svcRepSummary.byProvider.map(provider => ({ label: provider.name, amount: provider.revenue })),
        ];
        html = buildActivitySummaryReportHtml({ title: reportHeading,
          period: activeMonthLabel, activityName: repUnit.type === "service" ? repUnit.name : "جميع الأنشطة",
          fileName, rows, details: quickSaleDetails, logo, css: REPORT_CSS, forPrint: action === "print" });
      } else if (viewMode === "monthly") {
        const qr = await generateReportQrDataUrl("monthly", isHijri ? selectedHijriMonthVal : selectedMonth);
        html = buildMonthlyReportHtml(selectedMonth, selectedPropertyName, report, financial, action === "print", qr,
          repBreakdown, activeMonthLabel, logo, isCurrentMonthlyPeriod, fileName, showPropertyReportDetails);
      } else if (viewMode === "yearly") {
        const activeYear = isYearlyHijri ? selectedHijriYear : selectedYear;
        const qr = await generateReportQrDataUrl("yearly", activeYear);
        html = buildYearlyReportHtml(activeYear, selectedPropertyName, (isYearlyHijri ? yearlyHijri : yearly)!,
          action === "print", qr, logo, false, calMode, false, undefined,
          isYearlyHijri ? Number(selectedHijriYear) === nowHijriYearNum : selectedYear === currentYear, fileName, showPropertyReportDetails);
      } else {
        const activeCustomData = (isHijri ? customRangeDataHijri : customRangeData)!;
        const formatDate = (date: string) => formatDateWithHijri(`${date}T12:00:00+03:00`);
        const range = `${formatDate(customFrom)} ← ${formatDate(customTo)}`;
        const days = Math.round((new Date(`${customTo}T12:00:00`).getTime() - new Date(`${customFrom}T12:00:00`).getTime()) / 86400000) + 1;
        html = buildYearlyReportHtml(range, selectedPropertyName, activeCustomData, action === "print", null,
          logo, true, calMode, groupByDay, days, false, fileName, showPropertyReportDetails);
      }
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        return;
      }
      const { blob } = await htmlToPdfBlob(html, fileName);
      const file = new File([blob], fileName, { type: "application/pdf", lastModified: Date.now() });
      if (action === "share" && navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: reportHeading });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        if (action === "share") toast({ title: "تم تنزيل التقرير للمشاركة", description: "المشاركة المباشرة غير متاحة في هذا المتصفح. أرفق ملف PDF المحمّل في واتساب أو البريد الإلكتروني." });
      }
    } catch (error) {
      printWindow?.close();
      if (!(error instanceof Error && error.name === "AbortError"))
        toast({ title: "تعذّر تجهيز التقرير", description: "أعد المحاولة بعد اكتمال تحميل البيانات.", variant: "destructive" });
    } finally {
      setQuickAction(null);
    }
  }

  const planLabels: Record<string, string> = {
    trial: "تجريبي (30 يوم)",
    monthly: "شهري",
    yearly: "سنوي",
  };
  const statusLabels: Record<string, { label: string; className: string }> = {
    active:   { label: "نشط", className: "bg-green-100 text-green-700" },
    expired:  { label: "منتهي", className: "bg-red-100 text-red-700" },
    pending:  { label: "قيد التفعيل", className: "bg-amber-100 text-amber-700" },
  };

  const downloadReportButton = (
    <Button type="button" size="sm" variant="outline" className="gap-2"
      disabled={!quickReportReady || !!quickAction}
      onClick={() => void handleQuickReportAction("pdf")} data-testid="financial-report-download">
      {quickAction === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      تحميل كـ PDF
    </Button>
  );

  const quickSaleDetailsSection = isActivitySummary && monthlyPeriodReady
    && !serviceReportLoading && !serviceReportError && svcRepSummary
    && !reportQuickSalesQuery.isLoading && !reportQuickSalesQuery.isError ? (
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4" data-testid="service-report-sales-details">
        <h3 className="font-bold">{quickSaleDetails.title}</h3>
        {repUnit.type !== "service" && <div className="flex flex-wrap gap-6 text-sm">
          <p>إيرادات حجوزات الخدمات: <FinancialReportNumber value={svcRepSummary.bookingRevenue} currency /></p>
          <p>المبيعات الفردية: <FinancialReportNumber value={svcRepSummary.quickSalesRevenue} currency /></p>
          <p className="font-bold">إجمالي إيرادات الخدمات والبيع السريع: <FinancialReportNumber value={svcRepSummary.totalRevenue} currency /></p>
        </div>}
        {quickSaleDetails.rows.length ? <div className="overflow-x-auto">
          <table className="w-full text-right text-xs"><thead><tr>{quickSaleDetails.headers.map(header => <th key={header} className="p-2">{header}</th>)}</tr></thead>
            <tbody>{quickSaleDetails.rows.map((row, index) => <tr key={reportQuickSales[index].id} className="border-t border-border">{row.map((cell, column) => <td key={column} className="p-2">{cell}</td>)}</tr>)}</tbody>
          </table>
        </div> : <p className="text-sm text-muted-foreground">لا توجد مبيعات فردية مكتملة خلال الفترة المختارة.</p>}
      </section>
    ) : null;

  return (
    <div className={`financial-reports space-y-6${!isActivitySummary ? " financial-reports-property" : ""}`}>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground" data-testid="financial-report-title">{reportHeading}</h2>
          <p className="mt-1 text-base font-medium leading-8 text-foreground">{loneReportActivity
            ? "يُعرض التقرير المالي لنشاطك مباشرة."
            : selectFinancialActivities ? "يُعرض التقرير للنشاط المحدد. يمكنك تغيير الأنشطة من فلتر «النشاط المالي» أعلاه."
            : "اختر جميع الأنشطة أو نشاطًا محددًا لاستخراج تقريره المالي فقط."}</p>
        </div>
        {!selectFinancialActivities && <FinancialReportActivitySelect value={repUnit} properties={properties} services={services}
          onChange={selectReportActivity} loading={activitiesLoading || !!quickAction} error={activitiesError} />}
      </div>

      {!isActivitySummary && <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer">
        <input type="checkbox" checked={showPropertyReportDetails}
          data-testid="property-report-show-details"
          disabled={!!quickAction || waLoading || emailLoading || archiveSaving}
          onChange={event => setShowPropertyReportDetails(event.target.checked)}
          className="mt-1 h-4 w-4 accent-primary" />
        <span><span className="block text-sm font-semibold">إظهار الجداول التفصيلية للحجوزات والمصروفات</span>
          <span className="block text-base leading-8 text-foreground">يشمل العرض والطباعة وPDF. تبقى الملخصات والحسابات الختامية ظاهرة دون تغيير الإجماليات.</span></span>
      </label>}
      <SectionGuideButton sectionKey="reports" />
      {(repUnit.type === "service" || !isActivitySummary) && <ServiceReportPeriodControls
        ariaLabel={repUnit.type === "service" ? "فترة وتقويم تقرير الخدمات" : "فترة وتقويم تقرير العقارات"}
        mode={viewMode} allPeriods={!isActivitySummary && allPropertyPeriods}
        onAllPeriods={!isActivitySummary ? () => { setAllPropertyPeriods(true); setViewMode("custom"); } : undefined}
        onModeChange={mode => { setAllPropertyPeriods(false); setViewMode(mode); }}
        hijri={isHijri} onCalendarChange={hijri => { setIsHijri(hijri); setIsYearlyHijri(hijri); }}
        months={activePeriods.months} years={activePeriods.years} month={activeSelectedMonth}
        year={isHijri ? selectedHijriYear : selectedYear} monthNames={isHijri ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR}
        onMonthChange={isHijri ? setSelectedHijriMonthVal : setSelectedMonth}
        onYearChange={isHijri ? setSelectedHijriYear : setSelectedYear}
        from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo}
        earliestDate={!isActivitySummary ? earliestTransactionDate : undefined}
        today={todayLocalDate} disabled={!!quickAction || waLoading || emailLoading || archiveSaving} periodsUnavailable={periodsLoading || periodsError} />}
      {isActivitySummary && repUnit.type !== "service" && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div>
          <span className="mb-2 block text-sm font-bold">تقويم التقرير</span>
          <div className="flex rounded-lg border border-border p-0.5">
            {(["hijri", "gregorian"] as const).map(calendar => (
              <button type="button" key={calendar} aria-pressed={isHijri === (calendar === "hijri")} data-testid={`financial-report-calendar-${calendar}`}
                disabled={!!quickAction}
                onClick={() => { setIsHijri(calendar === "hijri"); setIsYearlyHijri(calendar === "hijri"); }}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-bold ${isHijri === (calendar === "hijri") ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}>
                {calendar === "hijri" ? "هجري" : "ميلادي"}
              </button>
            ))}
          </div>
          </div>
          <FinancialPeriodControls months={activePeriods.months} years={activePeriods.years}
            month={activeSelectedMonth} year={isHijri ? selectedHijriYear : selectedYear}
            monthNames={isHijri ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR} hijri={isHijri}
            disabled={periodsLoading || periodsError || !!quickAction} onMonthChange={isHijri ? setSelectedHijriMonthVal : setSelectedMonth}
            onYearChange={isHijri ? setSelectedHijriYear : setSelectedYear} />
        </div>
      )}

      {repUnit.type === "service" && <ServiceReportFilters source={serviceReportSource}
        payment={serviceReportPayment} mode={serviceReportMode} disabled={!!quickAction}
        onSourceChange={setServiceReportSource} onPaymentChange={setServiceReportPayment} onModeChange={setServiceReportMode} />}

      {/* ── Report Type Selector (only in "all" unit mode) ── */}
      {periodsLoading && <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل الفترات المالية…</p>}
      {periodsError && <p role="alert" className="text-sm text-destructive">تعذّر تحميل السنوات والشهور المالية. أعد تحميل الصفحة للمحاولة مجددًا.</p>}
      {!periodsLoading && !periodsError && !activePeriods.months.length && <p role="status" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">لا توجد بيانات مالية فعلية ونشطة لهذا النشاط. ستظهر السنوات والشهور عند تسجيل بيانات مالية.</p>}
      {repUnit.type === "service" && serviceDataLoading && <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل إيرادات ومصروفات النطاق المختار…</p>}
      {repUnit.type === "service" && serviceDataError && <div role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">
        {selectedServiceBookings.hasInvalidAmounts
          ? "توجد حجوزات بقيمة مالية مفقودة أو غير صالحة؛ راجع قيمة الحجز والمحصّل قبل إصدار التقرير."
          : "تعذّر تحميل بيانات التقرير كاملة؛ الملخص والتصدير متوقفان لتجنب إظهار أرقام ناقصة."}
        <Button variant="outline" className="mr-3" onClick={() => {
          void serviceExpenseQuery.refetch();
          if (includesServiceBookings) { void serviceBookingsQuery.refetch(); void qc.invalidateQueries({ queryKey: ["owner", "service-revenue-summary-rep"] }); }
          if (includesServiceSales) void reportQuickSalesQuery.refetch();
        }}>إعادة المحاولة</Button>
      </div>}
      {isActivitySummary && repUnit.type !== "service" && serviceReportError && <p role="alert" className="text-sm text-destructive">تعذّر تحميل تقرير الخدمات. أعد تحميل الصفحة للمحاولة مجددًا؛ إجراءات التصدير متوقفة حتى تكتمل البيانات.</p>}
      {isActivitySummary && repUnit.type !== "service" && serviceReportLoading && <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل إيرادات الحجوزات والتأمينات لاستكمال التقرير…</p>}
      {isActivitySummary && repUnit.type !== "service" && reportQuickSalesQuery.isLoading && <p role="status" className="text-sm text-muted-foreground">جارٍ تحميل المبيعات الفردية لاستكمال التقرير…</p>}
      {isActivitySummary && repUnit.type !== "service" && reportQuickSalesQuery.isError && <div role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">
        تعذّر تحميل المبيعات الفردية؛ التقرير غير مكتمل والتصدير متوقف.
        <Button variant="outline" className="mr-3" onClick={() => void reportQuickSalesQuery.refetch()}>إعادة المحاولة</Button>
      </div>}
      {repUnit.type !== "service" && quickSaleDetailsSection}
      {/* ── Services Report ── */}
      {repUnit.type === "service" && servicePeriodReady && serviceClosing && !serviceDataLoading && !serviceDataError && (
        <div className="space-y-4">
          <p className="text-sm font-semibold leading-7" data-testid="service-report-active-period">{servicePeriodLabel}</p>
          <ServiceFinancialReportPanels rows={serviceReportRows(serviceClosing, serviceReportSource, serviceReportMode)}
            details={serviceReportMode === "detailed" ? serviceReportDetails : []} closingRows={serviceClosingRows} />
        </div>
      )}

      {/* ── Unified Report ── */}
      {repUnit.type === "all" && reportType === "unified" && viewMode === "monthly" && monthlyPeriodReady && !reportQuickSalesQuery.isLoading && !reportQuickSalesQuery.isError && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Zap className="w-5 h-5 text-primary shrink-0" />
            <h2 className="text-lg font-bold text-foreground">{reportHeading}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-primary/20 rounded-2xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Home className="w-3.5 h-3.5 text-primary" />إيرادات العقارات
              </div>
              <div className="text-2xl font-bold text-primary"><FinancialReportNumber value={financial?.totalRevenue ?? 0} /> <span className="text-sm font-normal text-muted-foreground">ر.س</span></div>
            </div>
            <div className="bg-card border border-amber-200 rounded-2xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Activity className="w-3.5 h-3.5 text-amber-500" />إيرادات الخدمات
              </div>
              <div className="text-2xl font-bold text-amber-600"><FinancialReportNumber value={svcRepSummary?.totalRevenue ?? 0} /> <span className="text-sm font-normal text-muted-foreground">ر.س</span></div>
            </div>
          </div>
          <div className="bg-gradient-to-l from-primary/5 to-amber-500/5 border border-primary/20 rounded-2xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-1">إجمالي الإيرادات الموحّدة</div>
            <div className="text-3xl font-extrabold text-green-600"><FinancialReportNumber value={(financial?.totalRevenue ?? 0) + (svcRepSummary?.totalRevenue ?? 0)} /> <span className="text-lg font-normal text-muted-foreground">ر.س</span></div>
            {financial && <div className="text-xs text-muted-foreground mt-2">المصروفات: <FinancialReportNumber value={financial.totalExpenses} currency /> · صافي العقارات: <span className={financial.netProfit < 0 ? "text-red-600 dark:text-red-400" : ""}><FinancialReportNumber value={financial.netProfit} currency /></span></div>}
          </div>
        </div>
      )}

      {/* Show standard report only for "chalets" type or when unit is not "all" */}
      {!isActivitySummary && (<>

      {allPropertyDataLoading && <p role="status" className="text-base font-medium leading-8 text-foreground">جارٍ تحميل بيانات جميع الفترات…</p>}
      {allPropertyDataError && <p role="alert" className="text-base font-medium leading-8 text-destructive">تعذّر تحميل الحجوزات أو المصروفات كاملة. أعد تحميل الصفحة؛ العرض والتصدير متوقفان لتجنب إظهار أرقام ناقصة.</p>}

      {/* ── YEARLY VIEW ── */}
      {viewMode === "yearly" && (isYearlyHijri ? hijriPeriods.years.includes(selectedHijriYear) : gregorianPeriods.years.includes(selectedYear)) && (() => {
        const activeYearly = isYearlyHijri ? yearlyHijri : yearly;
        const activeYearlyLoading = isYearlyHijri ? yearlyHijriLoading : yearlyLoading;
        const activeYearLabel = isYearlyHijri ? `${selectedHijriYear} هـ` : selectedYear;
        const isCurrentYearlyPeriod = isYearlyHijri
          ? Number(selectedHijriYear) === nowHijriYearNum
          : selectedYear === currentYear;
        const getMonthLabel = (m: any) =>
          isYearlyHijri && (m as any).monthName
            ? (m as any).monthName
            : new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
        const getMonthShortLabel = (m: any) =>
          isYearlyHijri && (m as any).monthName
            ? (m as any).monthName.slice(0, 5)
            : new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "short", calendar: "gregory" });
        return (
        <>
          {activeYearlyLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : activeYearly ? (
            <>
              {isCurrentYearlyPeriod && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p>ملاحظة: هذا التقرير يعرض البيانات المالية المحققة حتى تاريخ اليوم {todayReportLabel} م.</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "إجمالي الإيرادات", value: <FinancialReportNumber value={activeYearly.totals.revenue} currency />, icon: <TrendingUp className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", valueColor: "text-foreground" },
                  { label: "إجمالي المصروفات", value: <FinancialReportNumber value={activeYearly.totals.expenses} currency />, icon: <TrendingDown className="w-5 h-5" />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", valueColor: "text-foreground" },
                  { label: "صافي الربح السنوي", value: <FinancialReportNumber value={activeYearly.totals.netProfit} currency />, icon: <RiyalIcon className="w-4 h-4" />, color: activeYearly.totals.netProfit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700", valueColor: activeYearly.totals.netProfit >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400" },
                ].map((s) => (
                  <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
                    <p className={`text-xl font-bold leading-none ${s.valueColor}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {activeYearly.monthly.some((m) => m.revenue > 0 || m.expenses > 0) && (() => {
                /* اختصارات أسماء الشهور الهجرية لمحور X */
                const HIJRI_AXIS: Record<string, string> = {
                  "محرم": "محرم", "صفر": "صفر",
                  "ربيع الأول": "رب.١", "ربيع الثاني": "رب.٢",
                  "جمادى الأولى": "جم.١", "جمادى الآخرة": "جم.٢",
                  "رجب": "رجب", "شعبان": "شعبان", "رمضان": "رمضان",
                  "شوال": "شوال", "ذو القعدة": "ذو.ق", "ذو الحجة": "ذو.ح",
                };
                const getAxisLabel = (m: any) =>
                  isYearlyHijri && (m as any).monthName
                    ? (HIJRI_AXIS[(m as any).monthName] ?? (m as any).monthName.slice(0, 4))
                    : new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "short", calendar: "gregory" });
                return (
                  <div className="bg-card border border-border rounded-2xl p-5">
                    <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-primary" />
                      الإيرادات والمصروفات لعام {activeYearLabel}
                    </h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={activeYearly.monthly.map((m) => ({
                          name: getAxisLabel(m),
                          fullName: getMonthLabel(m),
                          الإيرادات: m.revenue,
                          المصروفات: m.expenses,
                        }))}
                        margin={{ top: 10, right: 4, left: -10, bottom: 28 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="name"
                          interval={0}
                          tick={(props: any) => {
                            const { x, y, payload } = props;
                            return (
                              <text
                                x={x} y={y + 14}
                                textAnchor="middle"
                                fontSize={9}
                                fill="hsl(var(--muted-foreground))"
                                fontFamily="inherit"
                              >
                                {payload.value}
                              </text>
                            );
                          }}
                        />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12, direction: "rtl" }}
                          labelFormatter={(_: any, payload: any[]) => payload?.[0]?.payload?.fullName ?? _}
                          formatter={(v: number) => [formatAmount(v)]}
                        />
                        <Bar dataKey="الإيرادات" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    {/* دليل الألوان خارج الرسم لمنع التداخل */}
                    <div className="flex items-center justify-center gap-6 mt-2" dir="rtl">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-3 h-3 rounded-sm bg-green-500 inline-block shrink-0" />الإيرادات
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-3 h-3 rounded-sm bg-red-400 inline-block shrink-0" />المصروفات
                      </span>
                    </div>
                  </div>
                );
              })()}

              {(isActivitySummary || showPropertyReportDetails) && <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-foreground text-sm mb-4">تفصيل شهري لعام {activeYearLabel}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right py-2 font-medium text-muted-foreground">الشهر</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">الإيرادات</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">المصروفات</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">صافي الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeYearly.monthly.map((m) => {
                        const isEmpty = m.revenue === 0 && m.expenses === 0;
                        return (
                          <tr key={m.month} className={`border-b border-border/50 ${isEmpty ? "opacity-40" : ""}`}>
                            <td className="py-2 text-muted-foreground">{getMonthLabel(m)}</td>
                            <td className="py-2 font-medium text-green-600">
                              {isEmpty ? <span className="text-muted-foreground/60 font-normal tabular-nums">—</span> : <FinancialReportNumber value={m.revenue} currency />}
                            </td>
                            <td className="py-2 font-medium text-red-600">
                              {isEmpty ? <span className="text-muted-foreground/60 font-normal tabular-nums">—</span> : <FinancialReportNumber value={m.expenses} currency />}
                            </td>
                            <td className={`py-2 font-bold ${m.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                              {isEmpty ? <span className="text-muted-foreground/60 font-normal tabular-nums">—</span> : <FinancialReportNumber value={m.netProfit} currency />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td className="py-2 font-bold">الإجمالي</td>
                        <td className="py-2 font-bold text-green-600"><FinancialReportNumber value={activeYearly.totals.revenue} currency /></td>
                        <td className="py-2 font-bold text-red-600"><FinancialReportNumber value={activeYearly.totals.expenses} currency /></td>
                        <td className={`py-2 font-bold ${activeYearly.totals.netProfit >= 0 ? "text-primary" : "text-destructive"}`}><FinancialReportNumber value={activeYearly.totals.netProfit} currency /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              }
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => printYearlyReport(
                  isYearlyHijri ? activeYearLabel : selectedYear,
                  selectedPropertyName,
                  activeYearly as any,
                  false,
                  isYearlyHijri ? "hijri" : "gregorian",
                  false,
                  undefined,
                  isCurrentYearlyPeriod,
                  buildReportFileName({
                    viewMode: "yearly",
                    calMode: isYearlyHijri ? "hijri" : "gregorian",
                    year: isYearlyHijri ? undefined : selectedYear,
                    hijriYear: isYearlyHijri ? selectedHijriYear : undefined,
                  }),
                  showPropertyReportDetails,
                )} className="gap-2">
                  <FileText className="w-4 h-4" />طباعة التقرير السنوي
                </Button>
                {downloadReportButton}
                <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShareWhatsApp}
                    disabled={waLoading || emailLoading}
                    className="gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
                  >
                    {waLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    {waLoading ? "جاري إنشاء PDF…" : "مشاركة عبر واتساب"}
                  </Button>
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShareEmail}
                    disabled={emailLoading || waLoading}
                    className="gap-2 border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950"
                  >
                    {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {emailLoading ? "جاري الإرسال…" : "إرسال عبر البريد"}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant={archiveSavedId ? "default" : "outline"}
                  size="sm"
                  onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } handleSaveToArchive(); }}
                  disabled={archiveSaving || archiveMutation.isPending || isReadOnly}
                  className="gap-2"
                >
                  {archiveSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ…</>
                    : archiveSavedId
                    ? <><Archive className="w-4 h-4" />تم الحفظ ✓</>
                    : <><Archive className="w-4 h-4" />حفظ في الأرشيف</>}
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد بيانات لهذه السنة</p>
            </div>
          )}
        </>
        );
      })()}

      {/* ── CUSTOM RANGE VIEW ── */}
      {viewMode === "custom" && !allPropertyDataLoading && !allPropertyDataError && (() => {
        const customCalMode = isHijri ? "hijri" : "gregorian";
        // Pick the right grouped dataset: Hijri groups when calMode=hijri to avoid cross-month bleed
        const activeCustomData = customCalMode === "hijri" ? customRangeDataHijri : customRangeData;
        const fmtCustomDate = (d: string) => {
          try {
            const dt = new Date(d + "T12:00:00");
            return customCalMode === "hijri"
              ? dt.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { year: "numeric", month: "short", day: "numeric" })
              : dt.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric", calendar: "gregory" } as Intl.DateTimeFormatOptions);
          } catch { return d; }
        };
        const fmtCustomMonth = (monthStr: string) => {
          try {
            const parts = monthStr.split("-");
            const yr = parseInt(parts[0], 10);
            const mm = parseInt(parts[1], 10) - 1;
            const isDay = parts.length === 3;
            if (yr < 1800) {
              // Hijri key
              if (isDay) {
                const dd = parseInt(parts[2], 10);
                return `${toAr(dd)} ${HIJRI_MONTHS_AR[mm] ?? parts[1]}`;
              }
              return `${HIJRI_MONTHS_AR[mm] ?? parts[1]} ${toAr(yr)} هـ`;
            }
            // Gregorian key
            const dt = new Date((isDay ? monthStr : monthStr + "-15") + "T12:00:00");
            if (isDay) {
              return customCalMode === "hijri"
                ? dt.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long" })
                : dt.toLocaleDateString("ar-SA", { day: "numeric", month: "long", calendar: "gregory" } as Intl.DateTimeFormatOptions);
            }
            return customCalMode === "hijri"
              ? dt.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { year: "numeric", month: "long" })
              : dt.toLocaleDateString("ar-SA", { year: "numeric", month: "long", calendar: "gregory" } as Intl.DateTimeFormatOptions);
          } catch { return monthStr; }
        };
        const rangeLabel = customFrom && customTo ? `${fmtCustomDate(customFrom)} → ${fmtCustomDate(customTo)}` : null;
        const tableTitle = `التفاصيل ${groupByDay ? "اليومية" : "الشهرية"} ${customCalMode === "hijri" ? "الهجرية" : "الميلادية"} — ${rangeLabel}`;
        return (
          <>
            {!customFrom || !customTo ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                <CalendarDays className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">حدد تاريخ البداية والنهاية لعرض التقرير المخصص</p>
              </div>
            ) : customFrom > customTo ? (
              <div className="bg-card border border-dashed border-destructive/40 rounded-2xl p-10 text-center">
                <p className="text-destructive text-sm">تاريخ البداية يجب أن يكون قبل تاريخ النهاية</p>
              </div>
            ) : !activeCustomData || activeCustomData.monthly.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
                <BarChart2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">لا توجد بيانات في الفترة المحددة</p>
              </div>
            ) : (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "إجمالي الإيرادات", value: <FinancialReportNumber value={activeCustomData.totals.revenue} currency />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: <TrendingUp className="w-5 h-5" />, valueColor: "text-foreground" },
                    { label: "إجمالي المصروفات", value: <FinancialReportNumber value={activeCustomData.totals.expenses} currency />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <TrendingDown className="w-5 h-5" />, valueColor: "text-foreground" },
                    { label: "صافي الربح", value: <FinancialReportNumber value={activeCustomData.totals.netProfit} currency />, color: activeCustomData.totals.netProfit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700", icon: <RiyalIcon className="w-4 h-4" />, valueColor: activeCustomData.totals.netProfit >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400" },
                  ].map((s) => (
                    <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
                      <p className={`text-xl font-bold leading-none ${s.valueColor}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Monthly breakdown table */}
                {(isActivitySummary || showPropertyReportDetails) && <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="font-bold text-sm">{tableTitle}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2.5 text-right font-semibold text-xs text-muted-foreground">الشهر</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-xs text-muted-foreground">الإيرادات</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-xs text-muted-foreground">المصروفات</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-xs text-muted-foreground">صافي الربح</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activeCustomData.monthly.map((m) => (
                          <tr key={m.month} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-2.5">{fmtCustomMonth(m.month)}</td>
                            <td className="px-4 py-2.5 text-green-600 font-medium"><FinancialReportNumber value={m.revenue} currency /></td>
                            <td className="px-4 py-2.5 text-red-600 font-medium"><FinancialReportNumber value={m.expenses} currency /></td>
                            <td className={`px-4 py-2.5 font-bold ${m.netProfit >= 0 ? "text-primary" : "text-destructive"}`}><FinancialReportNumber value={m.netProfit} currency /></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-border">
                        <tr className="bg-muted/30">
                          <td className="px-4 py-2.5 font-bold">الإجمالي</td>
                          <td className="px-4 py-2.5 font-bold text-green-600"><FinancialReportNumber value={activeCustomData.totals.revenue} currency /></td>
                          <td className="px-4 py-2.5 font-bold text-red-600"><FinancialReportNumber value={activeCustomData.totals.expenses} currency /></td>
                          <td className={`px-4 py-2.5 font-bold ${activeCustomData.totals.netProfit >= 0 ? "text-primary" : "text-destructive"}`}><FinancialReportNumber value={activeCustomData.totals.netProfit} currency /></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                }
                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => {
                    const _cm = isHijri ? "hijri" : "gregorian";
                    const _fmt = (d: string) => formatDateWithHijri(`${d}T12:00:00+03:00`);
                    const rangeStr = customFrom && customTo ? `${_fmt(customFrom)} ← ${_fmt(customTo)}` : "مخصص";
                    const _diff = customFrom && customTo ? Math.round((new Date(customTo + "T12:00:00").getTime() - new Date(customFrom + "T12:00:00").getTime()) / 86_400_000) + 1 : undefined;
                    printYearlyReport(
                      rangeStr,
                      selectedPropertyName,
                      activeCustomData as any,
                      true,
                      _cm,
                      groupByDay,
                      _diff,
                      false,
                      buildReportFileName({ viewMode: "custom", calMode: _cm, from: customFrom, to: customTo }),
                      showPropertyReportDetails,
                    );
                  }} className="gap-2">
                    <FileText className="w-4 h-4" />طباعة التقرير
                  </Button>
                  {downloadReportButton}
                  <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleShareWhatsApp}
                      disabled={waLoading || emailLoading}
                      className="gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
                    >
                      {waLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      {waLoading ? "جاري إنشاء PDF…" : "مشاركة عبر واتساب"}
                    </Button>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleShareEmail}
                      disabled={emailLoading || waLoading}
                      className="gap-2 border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950"
                    >
                      {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      {emailLoading ? "جاري الإرسال…" : "إرسال عبر البريد"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* ── MONTHLY VIEW ── */}
      {viewMode === "monthly" && monthlyPeriodReady && (
        <>
          {/* ══ Revenue Breakdown Cards: إجمالي الإيجار | إجمالي الخدمات | صافي الدخل ══ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <div style={{ background: "linear-gradient(135deg,#eff6ff,#dbeafe)", border: "2px solid #93c5fd", borderRadius: 16, padding: 20, minHeight: 150, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                <Home className="w-4 h-4" />
                <span>إجمالي الإيجار</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#1d4ed8", lineHeight: 1, marginTop: 4 }}>
                <FinancialReportNumber value={repBreakdown.totBase} rounded={false} />
              </div>
              <div style={{ fontSize: 12, color: "#3b82f6", marginTop: "auto" }}>ريال سعودي</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>مجموع قيمة الإيجار من الحجوزات</div>
            </div>
            <div style={{ background: "linear-gradient(135deg,#fffbeb,#fef3c7)", border: "2px solid #f59e0b", borderRadius: 16, padding: 20, minHeight: 150, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#b45309" }}>
                <Zap className="w-4 h-4" />
                <span>إجمالي الخدمات</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#b45309", lineHeight: 1, marginTop: 4 }}>
                <FinancialReportNumber value={repBreakdown.totSvc || 0} rounded={false} />
              </div>
              <div style={{ fontSize: 12, color: "#d97706", marginTop: "auto" }}>ريال سعودي</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>
                {repBreakdown.totSvc > 0 ? "رسوم الإضافات والخدمات" : "لا توجد خدمات مدفوعة"}
              </div>
            </div>
            <div style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "2px solid #4ade80", borderRadius: 16, padding: 20, minHeight: 150, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                <RiyalIcon className="w-4 h-4" />
                <span>صافي الدخل</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#15803d", lineHeight: 1, marginTop: 4 }}>
                <FinancialReportNumber value={repBreakdown.totTotal} rounded={false} />
              </div>
              <div style={{ fontSize: 12, color: "#16a34a", marginTop: "auto" }}>ريال سعودي</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>إيجار + خدمات</div>
            </div>
          </div>

          {/* ══ Booking Breakdown Table ══ */}
          {(isActivitySummary || showPropertyReportDetails) && repBreakdown.rows.length > 0 && (
            <div style={{ background: "var(--card,#fff)", border: "1px solid var(--border,#e5e7eb)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Receipt className="w-4 h-4 text-primary" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>تفصيل الحجوزات</span>
                <span style={{ fontSize: 11, background: "#eff6ff", color: "#1d4ed8", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
                  {activeMonthLabel}
                </span>
                <span style={{ fontSize: 11, color: "#6b7280", marginRight: "auto" }}>
                  {repBreakdown.rows.length} حجز
                </span>
              </div>
              <div className="financial-bookings-scroll" role="region" aria-label="تفاصيل الحجوزات — جدول قابل للتمرير" tabIndex={0} data-testid="financial-bookings-scroll">
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>العميل</th>
                      <th style={{ textAlign: "right", padding: "8px 8px",  fontSize: 12, color: "#6b7280", fontWeight: 600 }}>التاريخ</th>
                      <th style={{ textAlign: "left",  padding: "8px 12px", fontSize: 12, color: "#1d4ed8", fontWeight: 700 }}>قيمة الإيجار</th>
                      <th style={{ textAlign: "left",  padding: "8px 12px", fontSize: 12, color: "#b45309", fontWeight: 700 }}>رسوم الخدمات</th>
                      <th style={{ textAlign: "left",  padding: "8px 12px", fontSize: 12, color: "#15803d", fontWeight: 700 }}>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repBreakdown.rows.map(row => {
                      const { hijri, gregorian } = formatDualDate(row.date);
                      return (
                        <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: 13 }}>{row.name}</td>
                          <td style={{ padding: "10px 8px", fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                            <div>{hijri}</div><div style={{ opacity: 0.7 }}>{gregorian}</div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#1d4ed8" }}>
                            <FinancialReportNumber value={row.base} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#b45309" }}>
                            {row.svc > 0 ? <><FinancialReportNumber value={row.svc} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span></> : <span style={{ color: "#9ca3af" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 800, color: "#15803d" }}>
                            <FinancialReportNumber value={row.total} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid #d1d5db", background: "#f9fafb" }}>
                      <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13 }}>الإجمالي</td>
                      <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 800, color: "#1d4ed8" }}>
                        <FinancialReportNumber value={repBreakdown.totBase} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 800, color: "#b45309" }}>
                        {repBreakdown.totSvc > 0 ? <><FinancialReportNumber value={repBreakdown.totSvc} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span></> : <span style={{ color: "#9ca3af" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "left", fontWeight: 800, color: "#15803d" }}>
                        <FinancialReportNumber value={repBreakdown.totTotal} rounded={false} /> <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 400 }}>ر.س</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {isCurrentMonthlyPeriod && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p>ملاحظة: هذا التقرير يعرض البيانات المالية المحققة حتى تاريخ اليوم {todayReportLabel} م.</p>
            </div>
          )}

          {financial && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "المبالغ المحصّلة فعلياً", value: <FinancialReportNumber value={financial.totalRevenue} currency />, icon: <TrendingUp className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", note: "إجمالي ما دخل الحساب", valueColor: "text-foreground" },
                  { label: "إجمالي المصروفات", value: <FinancialReportNumber value={Math.max(0, Number(financial.totalExpenses) || 0)} currency />, icon: <TrendingDown className="w-5 h-5" />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", note: "مصروفات + رواتب", valueColor: "text-foreground" },
                  { label: "صافي الربح", value: <FinancialReportNumber value={financial.netProfit} currency />, icon: <RiyalIcon className="w-4 h-4" />, color: financial.netProfit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", note: "الإيرادات - المصروفات", valueColor: financial.netProfit >= 0 ? "text-foreground" : "text-red-600 dark:text-red-400" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                    <p className={`break-words text-2xl sm:text-3xl font-bold leading-tight ${stat.valueColor}`}>{stat.value}</p>
                    <p className="text-sm font-medium text-foreground leading-relaxed">{stat.label}</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{stat.note}</p>
                  </div>
                ))}
              </div>

              {/* Insurance damage deductions — converted to revenue under تلفيات */}
              {financial.totalInsuranceDeducted > 0 && (
                <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <span className="text-base">✂️</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">إيرادات تلفيات</p>
                      <p className="text-[10px] text-red-600/70 dark:text-red-500/70">مخصومة من التأمين · محسوبة في الإيرادات</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-red-700 dark:text-red-400"><FinancialReportNumber value={financial.totalInsuranceDeducted} currency /></p>
                </div>
              )}

              {/* Insurance held — shown separately since it's refundable and NOT counted in profit */}
              {financial.totalInsuranceHeld > 0 && (
                <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <span className="text-base">🔒</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">تأمينات محتجزة</p>
                      <p className="text-[10px] text-orange-600/70 dark:text-orange-500/70">غير محسوبة في الأرباح · قابلة للإعادة</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-400"><FinancialReportNumber value={financial.totalInsuranceHeld} currency /></p>
                </div>
              )}

              {(isActivitySummary || showPropertyReportDetails) && Object.keys(financial.categoryTotals).length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />توزيع المصروفات
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(financial.categoryTotals).sort(([, a], [, b]) => b - a).map(([key, amount]) => {
                      const cat = catMap[key] ?? { label: key, emoji: "✨", color: "bg-slate-100 text-slate-700" };
                      const pct = financial.totalExpenses > 0 ? Math.round((amount / financial.totalExpenses) * 100) : 0;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="flex items-center gap-1.5 text-muted-foreground"><span>{cat.emoji}</span>{cat.label}</span>
                            <span className="font-semibold"><FinancialReportNumber value={amount} currency /> <span className="text-xs text-muted-foreground" dir="rtl">({pct.toLocaleString("ar-SA")}٪)</span></span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-destructive/70 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {financial.trend.some((t) => t.revenue > 0 || t.expenses > 0) && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />مقارنة الإيرادات والمصروفات (آخر 6 أشهر)
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={financial.trend.map((t) => ({
                      name: new Date(t.month + "-15").toLocaleDateString("ar-SA", { month: "short", calendar: isHijri ? "islamic-umalqura" : "gregory" }),
                      الإيرادات: t.revenue,
                      المصروفات: t.expenses,
                    }))} margin={{ top: 0, right: 0, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={(props: any) => {
                        const { x, y, payload } = props;
                        return <text x={x} y={y + 14} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))" fontFamily="inherit" direction="rtl" unicodeBidi="embed">{payload.value}</text>;
                      }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(value: number) => [formatAmount(value)]} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                      <Bar dataKey="الإيرادات" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {isLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : !report ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد بيانات حجوزات لهذا الشهر</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "إجمالي الحجوزات", value: report.totalBookings, icon: <BookOpen className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
                  { label: "نسبة الإشغال", value: `${displayOccupancy.toLocaleString("ar-SA")}٪`, icon: <TrendingUp className="w-5 h-5" />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                  { label: "عبر المنصة", value: report.platformBookings, icon: <Globe className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                  { label: "من خارج المنصة", value: report.externalBookings, icon: <Phone className="w-5 h-5" />, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                ))}
              </div>

              {report.dailyRevenue && report.dailyRevenue.some((d) => d.revenue > 0) && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    الإيرادات اليومية — {activeMonthLabel}
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={report.dailyRevenue.map((d) => ({ day: String(d.day), الإيرادات: d.revenue }))} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={2} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(v: number) => [formatAmount(v), "الإيرادات"]} />
                      <Bar dataKey="الإيرادات" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground text-sm">نسبة الإشغال — {activeMonthLabel}</h3>
                  <span className="text-2xl font-bold text-primary" dir="rtl">{displayOccupancy.toLocaleString("ar-SA")}٪</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${displayOccupancy}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{report.totalDays} يوم محجوز من أصل {report.daysInMonth} يوم</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-foreground mb-4 text-sm">توزيع الفترات الزمنية</h3>
                <div className="space-y-3">
                  {(["morning", "evening", "full_day"] as const).map((key) => {
                    const count = report.slotStats[key];
                    const total = report.totalBookings || 1;
                    const pct = Math.round((count / total) * 100);
                    const { icon, label } = slotLabels[key];
                    const isTop = key === report.topSlot;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {icon} {label}
                            {isTop && count > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">الأعلى</span>}
                          </span>
                          <span className="font-semibold" dir="rtl">{pct.toLocaleString("ar-SA")}٪ ({count.toLocaleString("ar-SA")} حجز)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 ${isTop && count > 0 ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => printMonthlyReport(
                  selectedMonth,
                  selectedPropertyName,
                  report,
                  financial,
                  repBreakdown,
                  activeMonthLabel,
                  isCurrentMonthlyPeriod,
                  isHijri ? "hijri" : "gregorian",
                  isHijri ? selectedHijriMonthVal : undefined,
                  showPropertyReportDetails,
                )} className="gap-2">
                  <FileText className="w-4 h-4" />طباعة التقرير
                </Button>
                {downloadReportButton}
                <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShareWhatsApp}
                    disabled={waLoading || emailLoading}
                    className="gap-2 border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
                  >
                    {waLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    {waLoading ? "جاري إنشاء PDF…" : "مشاركة عبر واتساب"}
                  </Button>
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleShareEmail}
                    disabled={emailLoading || waLoading}
                    className="gap-2 border-blue-600 text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950"
                  >
                    {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {emailLoading ? "جاري الإرسال…" : "إرسال عبر البريد"}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant={archiveSavedId ? "default" : "outline"}
                  size="sm"
                  onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } handleSaveToArchive(); }}
                  disabled={archiveSaving || archiveMutation.isPending || isReadOnly}
                  className="gap-2"
                >
                  {archiveSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ…</>
                    : archiveSavedId
                    ? <><Archive className="w-4 h-4" />تم الحفظ ✓</>
                    : <><Archive className="w-4 h-4" />حفظ في الأرشيف</>}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {propertyClosingTotals && <section data-testid="property-report-closing" className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 font-bold">الحسابات الختامية</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><dt className="flex-1 min-w-0">إجمالي الإيرادات<span className="mt-1 block max-w-2xl text-sm font-normal leading-relaxed text-slate-700 dark:text-slate-300">{PROPERTY_REPORT_REVENUE_NOTE}</span></dt><dd className="whitespace-nowrap"><FinancialReportNumber value={propertyClosingTotals.revenue} currency /></dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>إجمالي المصروفات</dt><dd className="text-red-600"><FinancialReportNumber value={propertyClosingTotals.expenses} currency /></dd></div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3 font-bold"><dt>صافي الربح / الدخل النهائي</dt><dd className={propertyClosingTotals.netProfit < 0 ? "text-red-600" : "text-primary"}><FinancialReportNumber value={propertyClosingTotals.netProfit} currency /></dd></div>
        </dl>
      </section>}
      {/* ── Sharing Settings ── */}
      <div className="bg-card border border-border rounded-2xl p-5 mt-4">
        <button
          onClick={() => setShowShare((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-bold text-foreground"
        >
          <span className="flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />إعدادات المشاركة</span>
          {showShare ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showShare && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">رقم واتساب (للمشاركة المباشرة)</label>
              <Input
                dir="ltr"
                placeholder="+966XXXXXXXXX"
                value={sharePhone}
                onChange={(e) => { setSharePhone(e.target.value); localStorage.setItem("reportSharePhone", e.target.value); }}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">البريد الإلكتروني</label>
              <Input
                dir="ltr"
                type="email"
                placeholder="example@email.com"
                value={shareEmail}
                onChange={(e) => { setShareEmail(e.target.value); localStorage.setItem("reportShareEmail", e.target.value); }}
                className="h-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">تُحفظ هذه الإعدادات تلقائياً على هذا الجهاز</p>
          </div>
        )}
      </div>

      {/* ── Archive ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-bold text-foreground"
        >
          <span className="flex items-center gap-2"><Archive className="w-4 h-4 text-primary" />أرشيف التقارير</span>
          {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showArchive && (
          <div className="mt-4">
            {archive.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">لا توجد تقارير محفوظة بعد</p>
            ) : (
              <>
                <div ref={archivePagination.tableRef} className="space-y-2 scroll-mt-4">
                {archivePagination.paginatedItems.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {a.reportType === "yearly" ? "تقرير سنوي" : "تقرير شهري"} – {a.reportPeriod}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.propertyName} · {formatDateWithHijri(a.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.pdfUrl ? (
                        <a
                          href={a.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="عرض / تحميل PDF"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors border border-amber-200 dark:border-amber-800"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          عرض PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 px-1">بدون PDF</span>
                      )}
                      <button
                        onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } if (confirm("حذف هذا التقرير من الأرشيف؟")) deleteArchiveMutation.mutate(a.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        title="حذف من الأرشيف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                </div>
                <PaginationBar
                  page={archivePagination.page}
                  pageSize={archivePagination.pageSize}
                  totalItems={archive.length}
                  totalPages={archivePagination.totalPages}
                  onPageChange={archivePagination.goToPage}
                  onPageSizeChange={archivePagination.changePageSize}
                />
              </>
            )}
          </div>
        )}
      </div>

      </>)}

      {isActivitySummary && (
        <div className="flex flex-wrap justify-end gap-2 rounded-xl border border-border bg-card p-3" role="group" aria-label="إجراءات التقرير المالي">
          <Button type="button" size="sm" variant="outline" className="gap-2" disabled={!quickReportReady || !!quickAction} onClick={() => void handleQuickReportAction("print")} data-testid="financial-report-print">
            {quickAction === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}طباعة التقرير
          </Button>
          {downloadReportButton}
          <Button type="button" size="sm" variant="outline" className="gap-2" disabled={!quickReportReady || !!quickAction} onClick={() => void handleQuickReportAction("share")} data-testid="financial-report-share">
            {quickAction === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}مشاركة أو إرسال
          </Button>
        </div>
      )}

    </div>
  );
}
