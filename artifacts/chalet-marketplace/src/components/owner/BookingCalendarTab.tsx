import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo, useRef, Fragment } from "react";
import { archiveDateRange, archiveCalendarYear, archiveCalendarYears, EMPTY_ARCHIVE_FILTERS, getArchiveDateError } from "@/lib/bookingArchive";
import { isStayComplete, isBookingCalendarComplete, REVIEW_NOT_READY_MESSAGE } from "@workspace/booking-time";
import { formatDateWithHijri, formatDualDate, getHijriMonthDays, toGregorianStr, prevHijriMonth, nextHijriMonth, HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import BookingArchiveControls, { type ArchiveFilters } from "@/components/owner/BookingArchiveControls";
import { matchesPropertyPaymentFilter, type PropertyPaymentFilter } from "@/lib/propertyBookingStatus";
import { useToast } from "@/hooks/use-toast";
import { toAr, arabicTimeTo24h, time24hToArabic } from "@/lib/utils";
import { useGetOwnerBookingArchive, getOwnerBookingArchive } from "@workspace/api-client-react";
import takyahLogoSrc from "@assets/image_1783707669452.png";
import { DEFAULT_DETAILED_RECEIPT_TEMPLATE, detailedReceiptValues, renderDetailedReceipt } from "@/lib/detailedWhatsAppReceipt";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Clock, CheckCircle, XCircle, Home, BookOpen, Trash2, Building2, Globe, Phone, RotateCcw, Star, ChevronLeft, ChevronRight, Lock, ChevronDown, ChevronUp, Loader2, FileText, Archive, MessageSquare, Settings, Search, Activity, Banknote, X, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { publicContractUrl, CONTRACT_STATUS_STYLES } from "@/lib/digitalContracts";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { HijriDatePicker } from "@/components/HijriDatePicker";
import { PropertyBookingPaymentFilters, PropertyBookingArrivalBadge } from "@/components/PropertyBookingStatus";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import BookingArchivePagination from "@/components/owner/BookingArchivePagination";
import { useAdminFinance, useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { ChaletAvailability, OwnerBooking, RescheduleLogItem } from "@/components/owner/owner-booking-types";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { fromArN, toArN } from "@/components/owner/owner-formatting";
import { DEFAULT_MODIFICATION_TEMPLATE_BODY, DEFAULT_OWNER_MESSAGE_SETTINGS, OwnerMessageSettings, encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { BufferExceptionDateFE, GregorianMiniCalendar, MiniCalendar } from "@/components/owner/PropertyMiniCalendars";
import { GREGORIAN_MONTHS_AR, getBookingMonthKey, getBookingMonthLabel, isCurrentPause } from "@/components/owner/owner-calendar";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";
import { AddBookingDialog, BlockDateDialog, ManageInsuranceDialog, ProofViewerDialog } from "@/components/owner/PropertyBookingDialogs";
import { fromEasternArabic, toEasternArabic } from "@/components/owner/SubscriptionAccountBanner";
import { uploadFile } from "@/components/owner/finance-shared";
import { buildContractWaMsg } from "@/components/owner/ContractTabs";
import { DeleteConfirmDialog, RescheduleDialog, WaCancelPreviewDialog } from "@/components/owner/PropertyBookingChanges";


/* ── Booking Calendar Tab ────────────────────── */
export function BookingCalendarTab({
  submissions,
  submissionsLoading = false,
  ownerChalets,
  chaletsLoading = false,
  preferredReportCalendar = "hijri",
}: {
  submissions: any[];
  submissionsLoading?: boolean;
  ownerChalets: any[];
  chaletsLoading?: boolean;
  preferredReportCalendar?: "hijri" | "gregorian";
}) {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const [archiveCalendar, setArchiveCalendar] = useState<"hijri" | "gregorian">(preferredReportCalendar);
  useEffect(() => {
    setArchiveCalendar(preferredReportCalendar);
    setArchiveFilters(previous => ({
      ...previous, year: previous.period === "year" ? String(archiveCalendarYear(preferredReportCalendar)) : previous.year,
    }));
    setArchivePage(1);
  }, [preferredReportCalendar]);
  const [addOpen, setAddOpen] = useState(false);
  const [stayClock, setStayClock] = useState(Date.now);
  useEffect(() => {
    const tick = () => setStayClock(Date.now());
    const timer = window.setInterval(tick, 30_000);
    let midnightTimer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const nextMidnight = 86400000 - ((Date.now() + 3 * 60 * 60 * 1000) % 86400000);
      midnightTimer = setTimeout(() => { tick(); scheduleMidnight(); }, nextMidnight);
    };
    scheduleMidnight();
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(timer); clearTimeout(midnightTimer); window.removeEventListener("focus", tick); };
  }, []);
  const bookingIsComplete = (booking: OwnerBooking) => isStayComplete(
    booking, ownerChalets.find((chalet: any) => chalet.submissionId === booking.submissionId), stayClock,
  );
  const [prefilledDate, setPrefilledDate] = useState<string | null>(null);
  const [prefilledPeriod, setPrefilledPeriod] = useState<string | null>(null);
  const [backToSummaryDate, setBackToSummaryDate] = useState<string | null>(null);
  const activityScope = useAdminFinance();
  const [localChaletId, setSelectedChaletId] = useState<number | "all" | null>(null);
  const selectedChaletId = activityScope.selectUnit ? (activityScope.unit.type === "chalet" ? activityScope.unit.id : "all") : localChaletId;
  const [calendarMode, setCalendarMode] = useState<"calendar" | "agenda">("calendar");
  const [agendaScope, setAgendaScope] = useState<"week" | "month">("week");
  const [dashCalType, setDashCalType] = useState<"hijri" | "gregorian">(() => (localStorage.getItem("dashCalDefaultType") as "hijri" | "gregorian") ?? "hijri");
  const _todayH = toHijriComponents(new Date());
  const [calHijriYear, setCalHijriYear] = useState(_todayH.year);
  const [calHijriMonth, setCalHijriMonth] = useState(_todayH.month);
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [calPickerYear, setCalPickerYear] = useState(0);
  const _todayGreg = new Date();
  const [calGregYear, setCalGregYear] = useState(_todayGreg.getFullYear());
  const [calGregMonth, setCalGregMonth] = useState(_todayGreg.getMonth() + 1);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  const { calMonthDays, calMonthStart, calMonthEnd } = useMemo(() => {
    if (dashCalType === "gregorian") {
      const daysInMonth = new Date(calGregYear, calGregMonth, 0).getDate();
      const days = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(calGregYear, calGregMonth - 1, i + 1);
        const h = toHijriComponents(date);
        return { date, hijriDay: h.day };
      });
      const start = `${calGregYear}-${String(calGregMonth).padStart(2, "0")}-01`;
      const end = `${calGregYear}-${String(calGregMonth).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      return { calMonthDays: days, calMonthStart: start, calMonthEnd: end };
    }
    const days = getHijriMonthDays(calHijriYear, calHijriMonth);
    return {
      calMonthDays: days,
      calMonthStart: days[0] ? toGregorianStr(days[0].date) : "",
      calMonthEnd: days.length > 0 ? toGregorianStr(days[days.length - 1].date) : "",
    };
  }, [calHijriYear, calHijriMonth, dashCalType, calGregYear, calGregMonth]);
  const [blockDateStr, setBlockDateStr] = useState<string | null>(null);
  const [blockDateBookingPeriod, setBlockDateBookingPeriod] = useState<string | null>(null);
  const [chalUnblockDay, setChalUnblockDay] = useState<{ ds: string; avId: number } | null>(null);
  const [unblockingChal, setUnblockingChal] = useState(false);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [confirmInsuranceBookingId, setConfirmInsuranceBookingId] = useState<number | null>(null);
  const [reviewSentIds, setReviewSentIds] = useState<Set<number>>(new Set());
  const [reviewPendingId, setReviewPendingId] = useState<number | null>(null);
  const [deleteDialogBooking, setDeleteDialogBooking] = useState<OwnerBooking | null>(null);
  const [contractPreviewBooking, setContractPreviewBooking] = useState<OwnerBooking | null>(null);
  const [waCancelPreview, setWaCancelPreview] = useState<{ booking: OwnerBooking; phone: string; message: string } | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<OwnerBooking | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab] = useState<"cancelled" | "rescheduled" | "completed">("cancelled");
  const [archiveFilters, setArchiveFilters] = useState<ArchiveFilters>({ ...EMPTY_ARCHIVE_FILTERS });
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archivePage, setArchivePage] = useState(1);
  const [archiveExporting, setArchiveExporting] = useState(false);
  const archiveRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setArchiveSearch(archiveFilters.search), 300);
    return () => window.clearTimeout(timer);
  }, [archiveFilters.search]);
  const [bookingPage, setBookingPage] = useState(0);
  const bookingCalView = "hijri" as const;
  const [bookingPaymentFilter, setBookingPaymentFilter] = useState<PropertyPaymentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [calDepositSaving, setCalDepositSaving] = useState<number | null>(null);
  const [bookingDepositTarget, setBookingDepositTarget] = useState<{ bookingId: number; maxAmount: number; totalCash: number; submissionId?: number | null; label?: string } | null>(null);
  const [bookingDepositAmt, setBookingDepositAmt] = useState("");
  const [bookingDepositSaving, setBookingDepositSaving] = useState(false);

  const [calReceiptUrl, setCalReceiptUrl] = useState<string | null>(null);
  const [calReceiptUploading, setCalReceiptUploading] = useState(false);
  const calReceiptRef = useRef<HTMLInputElement>(null);
  const [calPayTarget, setCalPayTarget] = useState<number | null>(null);
  const [calPayAmt, setCalPayAmt] = useState("");
  const [calPayDate, setCalPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [calPayMethod, setCalPayMethod] = useState<"cash" | "transfer" | "pos">("cash");
  const [calPayDeposited, setCalPayDeposited] = useState(false);
  const [calPayReceiptUrl, setCalPayReceiptUrl] = useState<string | null>(null);
  const [calPayReceiptUploading, setCalPayReceiptUploading] = useState(false);
  const [calPaySaving, setCalPaySaving] = useState(false);
  const calPayReceiptRef = useRef<HTMLInputElement>(null);
  const [receiptLightbox, setReceiptLightbox] = useState<string | null>(null);
  const { toast } = useToast();

  function openBookingDepositDialog(bookingId: number, maxAmount: number, totalCash: number, submissionId?: number | null, label?: string) {
    setBookingDepositTarget({ bookingId, maxAmount, totalCash, submissionId, label });
    setBookingDepositAmt("");
  }

  const { data: allInstallments = [] } = useQuery<{
    id: number; bookingId: number; amount: string; paymentDate: string;
    method: string; cashDeposited: boolean; receiptUrl: string | null;
  }[]>({
    queryKey: ["owner", "booking-payments"],
    queryFn: async () => {
      const r = await apiFetch("/owner/booking-payments");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const paymentsByBooking = useMemo(() => {
    const map: Record<number, typeof allInstallments> = {};
    allInstallments.forEach(p => {
      if (!map[p.bookingId]) map[p.bookingId] = [];
      map[p.bookingId].push(p);
    });
    return map;
  }, [allInstallments]);

  const { data: depositLogsCal = [] } = useQuery<Array<{ id: number; bookingId: number | null; submissionId: number | null; amount: string; note: string | null }>>({
    queryKey: ["owner", "cash-deposit-logs"],
    queryFn: async () => {
      const r = await apiFetch("/owner/cash-deposit-logs");
      if (!r.ok) return [];
      return r.json();
    },
  });
  const perBookingDeposited = useMemo(() => {
    const map = new Map<number, number>();
    depositLogsCal.forEach(l => {
      if (l.bookingId && !(l.note ?? "").includes("تأمين"))
        map.set(l.bookingId, (map.get(l.bookingId) ?? 0) + Math.round(Number(l.amount)));
    });
    return map;
  }, [depositLogsCal]);
  const perBookingInsuranceDeposited = useMemo(() => {
    const map = new Map<number, number>();
    depositLogsCal.forEach(l => {
      if (l.bookingId && (l.note ?? "").includes("تأمين"))
        map.set(l.bookingId, (map.get(l.bookingId) ?? 0) + Math.round(Number(l.amount)));
    });
    return map;
  }, [depositLogsCal]);

  async function addInstallmentPayment(bookingId: number) {
    const amt = parseFloat(fromArN(calPayAmt));
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "خطأ", description: "الرجاء إدخال مبلغ صحيح", variant: "destructive" });
      return;
    }
    setCalPaySaving(true);
    try {
      const isDeposited = calPayMethod === "transfer" ? true : calPayDeposited;
      const payload = {
        amount: amt,
        paymentDate: calPayDate,
        method: calPayMethod,
        cashDeposited: isDeposited,
        receiptUrl: calPayReceiptUrl,
      };
      const r = await apiFetch(`/owner/bookings/${bookingId}/payments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      let data: any = {};
      try { data = await r.json(); } catch { /* ignore parse errors */ }
      if (r.ok) {
        toast({
          title: data.fullyPaid ? "✅ اكتمل السداد" : "✅ تمت إضافة الدفعة",
          description: data.fullyPaid ? "سُدِّد المبلغ بالكامل" : `المتبقي: ${Math.round(Math.max(0, (data.remaining ?? 0) - (data.totalPaid ?? 0))).toLocaleString("en-US")} ر.س`,
        });
        qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
        qc.invalidateQueries({ queryKey: ["owner", "booking-payments"] });
        qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
        qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
        qc.invalidateQueries({ queryKey: ["owner", "transaction-history"] });
        setCalPayTarget(null);
        setCalPayAmt("");
        setCalPayReceiptUrl(null);
        setCalPayDeposited(false);
      } else {
        const msg = data?.details?.[0]?.message ?? data?.error ?? `خطأ ${r.status}`;
        toast({ title: "⚠️ لم يتم الحفظ", description: msg, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ في الاتصال", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally { setCalPaySaving(false); }
  }

  async function deleteInstallmentPayment(bookingId: number, paymentId: number) {
    await apiFetch(`/owner/bookings/${bookingId}/payments/${paymentId}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
    qc.invalidateQueries({ queryKey: ["owner", "booking-payments"] });
    qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
    qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
  }

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/page-content`);
      if (!r.ok) return {};
      const rows: { key: string; value: string }[] = await r.json();
      return Object.fromEntries(rows.map((x) => [x.key, x.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const approvedSubmissionIds = useMemo(() => new Set(
    submissions
      .filter((submission: any) => {
        const status = String(submission.status ?? "").toLowerCase();
        return status === "approved" || status === "active";
      })
      .map((submission: any) => Number(submission.id)),
  ), [submissions]);

  const approvedOwnerChalets = useMemo(() => ownerChalets.filter((chalet: any) => {
    const chaletStatus = String(chalet.status ?? "").toLowerCase();
    return approvedSubmissionIds.has(Number(chalet.submissionId))
      || chaletStatus === "approved"
      || chaletStatus === "active";
  }), [ownerChalets, approvedSubmissionIds]);

  const approvedCalendarSubmissionIds = useMemo(
    () => new Set(approvedOwnerChalets.map((chalet: any) => Number(chalet.submissionId))),
    [approvedOwnerChalets],
  );

  const showAllChalets = selectedChaletId === "all";
  const selectedApprovedChalet = typeof selectedChaletId === "number"
    ? approvedOwnerChalets.find((chalet: any) => chalet.id === selectedChaletId)
    : null;
  const activeChaletId = showAllChalets
    ? null
    : selectedApprovedChalet?.id ?? approvedOwnerChalets[0]?.id ?? null;

  /* ── Build WhatsApp review message from template ── */
  const DEFAULT_WA_REVIEW = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟\nاضغط هنا لتقييمك: {link}";
  function buildReviewMessage(guestName: string, chaletName: string, link: string): string {
    const chalet = ownerChalets.find((c: any) => c.id === activeChaletId);
    const tpl =
      (chalet?.waReviewTemplate as string | null | undefined) ??
      siteSettings.wa_review_template ??
      DEFAULT_WA_REVIEW;
    return tpl
      .replace(/\{link\}/g, link)
      .replace(/\{guest_name\}/g, guestName)
      .replace(/\{chalet_name\}/g, chaletName);
  }

  /* ── Send review invite via WhatsApp ── */
  async function sendReviewRequest(b: OwnerBooking) {
    if (!bookingIsComplete(b)) {
      toast({ title: REVIEW_NOT_READY_MESSAGE, variant: "destructive" });
      return;
    }
    const bookingChalet = ownerChalets.find((c: any) => c.submissionId === b.submissionId);
    if (!bookingChalet) return;
    setReviewPendingId(b.id);
    try {
      const r = await apiFetch("/owner/review-invite", {
        method: "POST",
        body: JSON.stringify({ chaletId: bookingChalet.id, guestName: b.clientName, bookingId: b.id }),
      });
      if (!r.ok) {
        const error = await r.json();
        toast({ title: error.error || "تعذر إنشاء رابط التقييم", variant: "destructive" });
        return;
      }
      const data = await r.json();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${window.location.origin}${base}/r/${data.token}`;
      const chaletName = ownerChalets.find((c: any) => c.submissionId === b.submissionId)?.nameAr
        ?? ownerChalets.find((c: any) => c.id === activeChaletId)?.nameAr
        ?? "عقارنا";
      const msg = buildReviewMessage(b.clientName ?? "", chaletName, link);
      let rawPhone = b.clientPhone?.replace(/\D/g, "") ?? "";
      if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
      const a = document.createElement("a");
      a.href = `https://wa.me/${rawPhone || ""}?text=${encodeWhatsAppText(msg)}`;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setReviewSentIds((prev) => new Set([...prev, b.id]));
      toast({ title: "تم إرسال طلب التقييم ✓", description: `تم فتح واتساب لإرسال رابط التقييم إلى ${b.clientName}` });
    } finally {
      setReviewPendingId(null);
    }
  }

  const { data: availability = [], isLoading: availLoading } = useQuery<ChaletAvailability[]>({
    queryKey: ["owner", "availability", activeChaletId],
    queryFn: async () => {
      if (!activeChaletId) return [];
      const r = await apiFetch(`/owner/availability?chaletId=${activeChaletId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeChaletId,
  });

  const { data: bookings = [], isLoading: bookingsLoading, isError: bookingsError, refetch: retryCalendarBookings } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) throw new Error("تعذّر تحميل الحجوزات");
      return r.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 30_000,
  });
  /* phones that appear in 2+ bookings = returning guests */
  const returningPhonesSet = useMemo(() => {
    const counts = new Map<string, number>();
    bookings.forEach(b => { if (b.clientPhone) counts.set(b.clientPhone, (counts.get(b.clientPhone) ?? 0) + 1); });
    return new Set([...counts.entries()].filter(([, v]) => v > 1).map(([k]) => k));
  }, [bookings]);
  const { data: messageSettings = DEFAULT_OWNER_MESSAGE_SETTINGS } = useQuery<OwnerMessageSettings>({
    queryKey: ["owner", "message-settings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/message-settings");
      if (!r.ok) return DEFAULT_OWNER_MESSAGE_SETTINGS;
      return r.json();
    },
  });
  const [openMessageMenuId, setOpenMessageMenuId] = useState<number | null>(null);

  const [insuranceTarget, setInsuranceTarget] = useState<OwnerBooking | null>(null);
  const [proofTarget, setProofTarget] = useState<OwnerBooking | null>(null);

  /* ── Booking stats (always-enabled for summary cards) ── */
  const { data: bookingStats } = useQuery<{
    activeCurrentMonth: number;
    revenueCurrentMonth: number;
    totalActive: number;
    totalCancelled: number;
    totalRescheduled: number;
  } | null>({
    queryKey: ["owner", "bookings", "stats"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings/stats");
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const activeChalet = activeChaletId ? approvedOwnerChalets.find((c: any) => c.id === activeChaletId) as any | undefined : undefined;
  const [morningCheckIn, setMorningCheckIn] = useState<string>("");
  const [morningCheckOut, setMorningCheckOut] = useState<string>("");
  const [eveningCheckIn, setEveningCheckIn] = useState<string>("");
  const [eveningCheckOut, setEveningCheckOut] = useState<string>("");
  const [fullDayCheckIn, setFullDayCheckIn] = useState<string>("");
  const [fullDayCheckOut, setFullDayCheckOut] = useState<string>("");
  const [savingTimes, setSavingTimes] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);
  const [bufferPolicyEnabled, setBufferPolicyEnabled] = useState(false);
  const [bufferBlockNextMorningFullDay, setBufferBlockNextMorningFullDay] = useState(false);
  const [bufferBlockNextMorningEvening, setBufferBlockNextMorningEvening] = useState(false);
  const [bufferBlockSameDayEvening, setBufferBlockSameDayEvening] = useState(false);
  const [savingBuffer, setSavingBuffer] = useState(false);
  const [bufferSaved, setBufferSaved] = useState(false);
  const [bufferExceptionWeekdays, setBufferExceptionWeekdays] = useState<number[]>([]);
  const [bufferExceptionDates, setBufferExceptionDates] = useState<BufferExceptionDateFE[]>([]);
  const [newExDate, setNewExDate] = useState("");
  const [newExPeriods, setNewExPeriods] = useState<string[]>(["morning", "evening"]);
  const [newExAction, setNewExAction] = useState<"disable" | "enable">("disable");

  // Sync fields when active chalet changes OR when chalet data first loads
  const prevChaletRef = useRef<number | null>(null);
  const prevChaletLoadedRef = useRef<boolean>(false);
  const chaletLoaded = !!activeChalet;
  if (activeChaletId !== prevChaletRef.current || (chaletLoaded && !prevChaletLoadedRef.current)) {
    prevChaletRef.current = activeChaletId;
    prevChaletLoadedRef.current = chaletLoaded;
    setMorningCheckIn(arabicTimeTo24h(activeChalet?.morningCheckIn));
    setMorningCheckOut(arabicTimeTo24h(activeChalet?.morningCheckOut));
    setEveningCheckIn(arabicTimeTo24h(activeChalet?.eveningCheckIn));
    setEveningCheckOut(arabicTimeTo24h(activeChalet?.eveningCheckOut));
    setFullDayCheckIn(arabicTimeTo24h(activeChalet?.fullDayCheckIn));
    setFullDayCheckOut(arabicTimeTo24h(activeChalet?.fullDayCheckOut));
    setTimesSaved(false);
    setBufferPolicyEnabled(activeChalet?.bufferPolicyEnabled ?? false);
    setBufferBlockNextMorningFullDay(activeChalet?.bufferBlockNextMorningFullDay ?? false);
    setBufferBlockNextMorningEvening(activeChalet?.bufferBlockNextMorningEvening ?? false);
    setBufferBlockSameDayEvening(activeChalet?.bufferBlockSameDayEvening ?? false);
    try { setBufferExceptionWeekdays(JSON.parse(activeChalet?.bufferExceptionWeekdays ?? "[]")); } catch { setBufferExceptionWeekdays([]); }
    try { setBufferExceptionDates(JSON.parse(activeChalet?.bufferExceptionDates ?? "[]")); } catch { setBufferExceptionDates([]); }
    setBufferSaved(false);
  }

  const saveTimes = async () => {
    if (!activeChaletId) return;
    setSavingTimes(true);
    try {
      await apiFetch(`/owner/chalets/${activeChaletId}/times`, {
        method: "PATCH",
        body: JSON.stringify({
          morningCheckIn: time24hToArabic(morningCheckIn) || null,
          morningCheckOut: time24hToArabic(morningCheckOut) || null,
          eveningCheckIn: time24hToArabic(eveningCheckIn) || null,
          eveningCheckOut: time24hToArabic(eveningCheckOut) || null,
          fullDayCheckIn: time24hToArabic(fullDayCheckIn) || null,
          fullDayCheckOut: time24hToArabic(fullDayCheckOut) || null,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      await qc.invalidateQueries({ queryKey: ["chalet-detail", String(activeChaletId)] });
      await qc.invalidateQueries({ queryKey: ["chalet-master", String(activeChaletId)] });
      await qc.invalidateQueries({ queryKey: ["chalets"] });
      setTimesSaved(true);
      setTimeout(() => setTimesSaved(false), 3000);
    } finally {
      setSavingTimes(false);
    }
  };

  const saveBufferPolicy = async () => {
    if (!activeChaletId) return;
    setSavingBuffer(true);
    try {
      await apiFetch(`/owner/chalets/${activeChaletId}/buffer-policy`, {
        method: "PATCH",
        body: JSON.stringify({
          bufferPolicyEnabled,
          bufferBlockNextMorningFullDay,
          bufferBlockNextMorningEvening,
          bufferBlockSameDayEvening,
          bufferExceptionWeekdays,
          bufferExceptionDates,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      setBufferSaved(true);
      setTimeout(() => setBufferSaved(false), 3000);
    } finally {
      setSavingBuffer(false);
    }
  };

  /* Toggle a specific cleaning block exception (auto-saves silently) */
  const toggleCleaningException = async (dateStr: string, period: string) => {
    if (!activeChaletId) return;
    setBufferExceptionDates((prev) => {
      const disableEntry = prev.find((e) => e.date === dateStr && e.action === "disable");
      let newDates: BufferExceptionDateFE[];
      if (disableEntry && disableEntry.periods.includes(period)) {
        /* Already overridden → remove (re-enable cleaning block) */
        const newPeriods = disableEntry.periods.filter((p) => p !== period);
        newDates = newPeriods.length === 0
          ? prev.filter((e) => !(e.date === dateStr && e.action === "disable"))
          : prev.map((e) => e.date === dateStr && e.action === "disable" ? { ...e, periods: newPeriods } : e);
      } else {
        /* Add disable exception for this period */
        if (disableEntry) {
          newDates = prev.map((e) =>
            e.date === dateStr && e.action === "disable"
              ? { ...e, periods: [...new Set([...e.periods, period])] }
              : e,
          );
        } else {
          newDates = [...prev, { date: dateStr, periods: [period], action: "disable" }];
        }
      }
      /* Auto-save silently */
      apiFetch(`/owner/chalets/${activeChaletId}/buffer-policy`, {
        method: "PATCH",
        body: JSON.stringify({
          bufferPolicyEnabled,
          bufferBlockNextMorningFullDay,
          bufferBlockNextMorningEvening,
          bufferBlockSameDayEvening,
          bufferExceptionWeekdays,
          bufferExceptionDates: newDates,
        }),
      }).then(() => qc.invalidateQueries({ queryKey: ["owner", "chalets"] })).catch(() => {});
      return newDates;
    });
  };

  const archiveRange = archiveDateRange(archiveFilters, stayClock, archiveCalendar);
  const archiveInvalid = !!getArchiveDateError(archiveFilters);
  const archiveParams = {
    tab: archiveTab, search: archiveSearch.trim() || undefined,
    ...archiveRange, page: archivePage,
  };
  const archiveQuery = useGetOwnerBookingArchive(archiveParams, {
    query: {
      queryKey: ["owner", "bookings", "archive", archiveParams, new Date(stayClock + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)],
      enabled: showArchive && !archiveInvalid,
      refetchInterval: 30_000,
      staleTime: 0,
    },
    request: { credentials: "include" },
  });
  const archiveBusy = archiveQuery.isFetching || archiveFilters.search !== archiveSearch;
  const archiveData = !archiveInvalid && !archiveQuery.isError ? archiveQuery.data : undefined;
  const cancelledBookings = (archiveTab === "cancelled" ? archiveData?.bookings ?? [] : []) as unknown as OwnerBooking[];
  const completedBookings = (archiveTab === "completed" ? archiveData?.bookings ?? [] : []) as unknown as OwnerBooking[];
  const rescheduleLog = (archiveData?.rescheduleLog ?? []) as unknown as RescheduleLogItem[];
  const visibleArchivePage = archiveData?.page ?? archivePage;
  useEffect(() => {
    if (archiveData && archiveData.page !== archivePage) setArchivePage(archiveData.page);
  }, [archiveData?.page, archivePage]);
  const updateArchiveFilters = (filters: ArchiveFilters) => {
    setArchiveFilters(filters);
    setArchivePage(1);
  };
  const selectArchiveTab = (tab: "cancelled" | "rescheduled" | "completed") => {
    setArchiveTab(tab);
    setArchivePage(1);
  };
  async function exportArchive(format: "xlsx" | "pdf") {
    if (archiveExporting || archiveBusy || archiveInvalid) return;
    setArchiveExporting(true);
    // Snapshot the active filters before the async export starts.
    const params = { ...archiveParams, export: "1" as const };
    const selectedTab = archiveTab;
    try {
      const [data, profileResponse] = await Promise.all([
        getOwnerBookingArchive(params, { credentials: "include" }),
        apiFetch("/owner/profile"),
      ]);
      if (!profileResponse.ok) throw new Error("تعذّر تحميل هوية المالك وتفضيل التقويم للتقرير.");
      const profile = await profileResponse.json();
      if (!data.total) {
        toast({ title: "لا توجد حجوزات مطابقة للتصدير" });
        return;
      }
      const { buildArchiveExportTable, exportArchiveFile } = await import("@/lib/bookingArchiveExport");
      const exportBookings = data.bookings as unknown as OwnerBooking[];
      const exportLogs = data.rescheduleLog as unknown as RescheduleLogItem[];
      const propertyFor = (id?: number | null) => ownerChalets.find((chalet: any) => chalet.submissionId === id)
        ?? submissions.find((submission: any) => submission.id === id);
      const propertyName = (id?: number | null) => propertyFor(id)?.nameAr ?? "عقار غير متاح";
      const exportedRecords = selectedTab === "rescheduled" ? exportLogs : exportBookings;
      const propertyNames = [...new Set(exportedRecords.map(record => propertyName(record.submissionId)))];
      const logoUrls = [...new Set(exportedRecords.map(record => propertyFor(record.submissionId)?.logoUrl).filter(Boolean))] as string[];
      const calendarPreference: "hijri" | "gregorian" = profile.reportsCalPref === "hijri" || profile.reportsCalPref === "gregorian"
        ? profile.reportsCalPref : profile.bookingsCalPref === "gregorian" ? "gregorian" : dashCalType;
      const ownerLogo = logoUrls.length === 1 ? logoUrls[0] : null;
      const logoUrl = (url: string) => url.startsWith("/") && !url.startsWith("//") ? `${BASE}${url}` : url;
      const context = {
        propertyNames,
        ownerName: profile.fullName || profile.businessName || "اسم المالك غير مسجل",
        ownerPhone: profile.phone || "",
        ownerLogoUrl: ownerLogo ? logoUrl(ownerLogo) : null,
        propertyLogos: logoUrls.length > 1 ? logoUrls.map(url => ({
          name: propertyNames.filter(name => exportedRecords.some(record => propertyName(record.submissionId) === name && propertyFor(record.submissionId)?.logoUrl === url)).join("، "),
          url: logoUrl(url),
        })) : [],
        platformLogoUrl: takyahLogoSrc,
        calendarPreference,
        from: params.from, to: params.to, search: params.search,
        issuedAt: new Date().toISOString(),
      };
      const table = buildArchiveExportTable(selectedTab,
        exportBookings, exportLogs, propertyName, calendarPreference);
      await exportArchiveFile(format, table, context);
      toast({ title: "تم تصدير الأرشيف", description: `تم تصدير ${toAr(data.total)} سجل مطابق للفلاتر.` });
    } catch (error) {
      toast({ title: "تعذّر تصدير الأرشيف", description: error instanceof Error ? error.message : "لم يكتمل تنزيل الملف. حاول مرة أخرى.", variant: "destructive" });
    } finally {
      setArchiveExporting(false);
    }
  }

  const deleteBooking = useMutation({
    mutationFn: async ({ id, reason, reasonCode, refundAmount }: { id: number; reason: string; reasonCode?: string; refundAmount?: number }) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "DELETE", body: JSON.stringify({ reason, reasonCode, refundAmount }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "cancelled"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
      toast({ title: "تم إلغاء الحجز", description: "تم نقل الحجز إلى الأرشيف بنجاح." });
    },
  });

  const restoreBooking = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ restore: true }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "cancelled"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
      toast({ title: "تمت استعادة الحجز", description: "تم إعادة الحجز إلى القائمة النشطة." });
    },
  });

  const patchBookingStatus = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: { balanceCollected?: boolean; insuranceRefunded?: boolean } }) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "bookings"] }),
  });

  const appendBookingNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "bookings"] }),
  });

  const markInsuranceReceived = useMutation({
    mutationFn: async (bookingId: number) => {
      const r = await apiFetch(`/owner/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ insuranceReceived: true }),
      });
      if (!r.ok) throw new Error("فشل");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings-revenue"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
      toast({ title: "✅ تم تسجيل استلام التأمين" });
    },
    onError: () => {
      toast({ title: "⚠️ فشل", description: "تعذّر تحديث حالة التأمين", variant: "destructive" });
    },
  });

  const calAvailability = useMemo(() => {
    if (!calMonthStart || !calMonthEnd) return [];
    return availability.filter((a) => a.dateStr >= calMonthStart && a.dateStr <= calMonthEnd);
  }, [availability, calMonthStart, calMonthEnd]);

  /* Filter bookings whose range OVERLAPS with the current Hijri calendar month */
  const calBookings = useMemo(() => {
    if (!showAllChalets && !activeChalet) return [];
    if (!calMonthStart || !calMonthEnd) return [];
    return bookings.filter((b) => {
      if (!b.bookingDate || b.cancelledAt) return false;
      if (showAllChalets && !approvedCalendarSubmissionIds.has(Number(b.submissionId))) return false;
      if (!showAllChalets && Number(b.submissionId) !== Number(activeChalet?.submissionId)) return false;
      const [by, bm, bd] = b.bookingDate.split("-").map(Number);
      const dur = Math.max(1, b.durationDays ?? 1);
      const bEndDate = new Date(by, bm - 1, bd + dur - 1);
      const bEnd = `${bEndDate.getFullYear()}-${String(bEndDate.getMonth() + 1).padStart(2, "0")}-${String(bEndDate.getDate()).padStart(2, "0")}`;
      return b.bookingDate <= calMonthEnd && bEnd >= calMonthStart;
    });
  }, [bookings, activeChalet, approvedCalendarSubmissionIds, calMonthStart, calMonthEnd, showAllChalets]);

  function revealBookingInCalendar(booking: OwnerBooking) {
    const property = approvedOwnerChalets.find((c: any) => Number(c.submissionId) === Number(booking.submissionId));
    const date = new Date(`${booking.bookingDate}T12:00:00`);
    if (!property || !Number.isFinite(date.getTime())) return;
    // The list spans months/properties; explicitly align BOTH calendar scopes.
    if (activityScope.selectUnit) {
      if (activityScope.unit.type !== "all" && !(activityScope.unit.type === "chalet" && activityScope.unit.id === property.id)) {
        activityScope.selectUnit({ type: "chalet", id: property.id, submissionId: property.submissionId, name: property.nameAr });
      }
    }
    else setSelectedChaletId(property.id);
    const hijri = toHijriComponents(date);
    setCalHijriYear(hijri.year);
    setCalHijriMonth(hijri.month);
    setCalGregYear(date.getFullYear());
    setCalGregMonth(date.getMonth() + 1);
    setCalendarMode("calendar");
    setCalendarFocusDate(booking.bookingDate);
  }

  useEffect(() => {
    if (!calendarFocusDate || availLoading || bookingsLoading) return;
    const cell = document.querySelector<HTMLButtonElement>(`[data-property-calendar-date="${calendarFocusDate}"]`);
    if (!cell) return;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ behavior: "smooth", block: "center" });
    setCalendarFocusDate(null);
  }, [calendarFocusDate, availLoading, bookingsLoading, calMonthStart, activeChaletId, calendarMode]);

  /* Stats computed from the currently visible calendar scope */
  const calScopeStats = useMemo(() => {
    const active = calBookings.filter(b => !b.cancelledAt);
    return {
      activeCount: active.length,
      revenue: active.reduce((s, b) => s + Number(b.totalPrice ?? 0), 0),
    };
  }, [calBookings]);

  const blockEntry = blockDateStr ? availability.find((a) => a.dateStr === blockDateStr) ?? null : null;

  const _firstGregDate = calMonthDays[0]?.date;
  const _lastGregDate = calMonthDays.length > 0 ? calMonthDays[calMonthDays.length - 1].date : undefined;
  const _firstGregLabel = _firstGregDate?.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" } as Intl.DateTimeFormatOptions) ?? "";
  const _lastGregLabel = _lastGregDate?.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" } as Intl.DateTimeFormatOptions) ?? "";
  const monthLabelGreg = _firstGregLabel === _lastGregLabel ? _firstGregLabel : `${_firstGregLabel} – ${_lastGregLabel}`;
  const monthLabelHijri = useMemo(() => {
    if (dashCalType === "gregorian") {
      const firstH = calMonthDays[0] ? toHijriComponents(calMonthDays[0].date) : null;
      const lastH = calMonthDays.length > 0 ? toHijriComponents(calMonthDays[calMonthDays.length - 1].date) : null;
      const fLabel = firstH ? `${HIJRI_MONTHS_AR[firstH.month - 1]} ${firstH.year} هـ` : "";
      const lLabel = lastH ? `${HIJRI_MONTHS_AR[lastH.month - 1]} ${lastH.year} هـ` : "";
      return fLabel === lLabel ? fLabel : `${fLabel} - ${lLabel}`;
    }
    return `${HIJRI_MONTHS_AR[calHijriMonth - 1]} ${calHijriYear} هـ`;
  }, [dashCalType, calMonthDays, calHijriMonth, calHijriYear]);
  const monthLabel = dashCalType === "gregorian"
    ? `${monthLabelGreg} م (${monthLabelHijri})`
    : `${monthLabelHijri} (${monthLabelGreg} م)`;

  const BOOKINGS_PER_PAGE = 5;

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      // The active list retains every occupied date in full; settlement still uses actual check-out.
      if (b.cancelledAt || isBookingCalendarComplete(b, stayClock)) return false;

      if (q) {
        const nameMatch = b.clientName?.toLowerCase().includes(q);
        const phoneMatch = b.clientPhone?.toLowerCase().includes(q);
        const chaletMatch = getBookingChaletName(b).toLowerCase().includes(q);
        const hijriMatch = formatDualDate(b.bookingDate).hijri.toLowerCase().includes(q);
        const gregMatch  = formatDualDate(b.bookingDate).gregorian.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !chaletMatch && !hijriMatch && !gregMatch) return false;
      }
      return true;
    }).sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  }, [bookings, searchQuery, ownerChalets, stayClock]);

  const paymentFilteredBookings = useMemo(
    () => filteredBookings.filter(booking => matchesPropertyPaymentFilter(booking, bookingPaymentFilter)),
    [filteredBookings, bookingPaymentFilter],
  );

  const totalBookingPages = Math.max(1, Math.ceil(paymentFilteredBookings.length / BOOKINGS_PER_PAGE));
  useEffect(() => {
    setBookingPage(current => Math.min(current, totalBookingPages - 1));
  }, [totalBookingPages]);
  const pagedBookings = useMemo(() => {
    const start = bookingPage * BOOKINGS_PER_PAGE;
    return paymentFilteredBookings.slice(start, start + BOOKINGS_PER_PAGE);
  }, [paymentFilteredBookings, bookingPage]);

  useEffect(() => { setBookingPage(0); }, [searchQuery, bookingPaymentFilter]);

  const getManualWhatsAppTemplates = (booking: OwnerBooking) => messageSettings.waEnabled ? [
    { id: "confirmation", title: "تأكيد الحجز", body: messageSettings.bookingConfirmationTemplate },
    ...(booking.cancelledAt ? [{ id: "cancellation", title: "إلغاء الحجز", body: messageSettings.cancellationTemplate }] : []),
    ...((messageSettings.customTemplates ?? []).map((tpl) => ({ id: tpl.id, title: tpl.title, body: tpl.body }))),
  ].filter((tpl) => tpl.body?.trim()) : [];

  const normalizeGuestPhone = (b: OwnerBooking) => {
    let rawPhone = b.clientPhone?.replace(/\D/g, "") ?? "";
    if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
    if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
    if (rawPhone.length === 9 && rawPhone.startsWith("5")) rawPhone = "966" + rawPhone;
    return rawPhone;
  };

  function getBookingChaletName(b: OwnerBooking) {
    return (
    ownerChalets.find((c: any) => c.submissionId === b.submissionId)?.nameAr ??
    ownerChalets.find((c: any) => c.id === activeChaletId)?.nameAr ??
    "العقار"
    );
  }

  const getBookingDateText = (b: OwnerBooking) => {
    const { hijri, gregorian } = formatDualDate(b.bookingDate);
    return hijri && gregorian ? `${hijri} (${gregorian})` : b.bookingDate;
  };

  const getArabicDayName = (dateStr: string) =>
    new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(dateStr + "T12:00:00"));

  /* ── Pure message builder — NO window.open, NO side effects whatsoever ── */
  const buildCancellationWaMsg = (
    b: OwnerBooking,
    templateBody: string,
    reason: string,
    depositRefund: number,
    insuranceFee: number,
  ): string => {
    const startHijri = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
    const startGreg  = formatDualDate(b.bookingDate).gregorian;
    const dur = Math.max(1, b.durationDays ?? 1);
    const endD = new Date(b.bookingDate + "T00:00:00");
    endD.setDate(endD.getDate() + dur - 1);
    const endStr   = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    const endHijri = formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "");
    const endGreg  = formatDualDate(endStr).gregorian;
    const _bTotal     = b.totalPrice  ? Number(b.totalPrice)  : 0;
    const _bPaid      = b.depositPaid ? Number(b.depositPaid) : 0;
    const _bRemaining = Math.max(0, _bTotal + insuranceFee - _bPaid);
    const _fmt = (n: number) => n > 0 ? n.toLocaleString("ar-SA") : "—";
    const refundText = depositRefund > 0 ? depositRefund.toLocaleString("ar-SA") : "٠";
    const _periodAr = (() => { const p = b.period; return p === "morning" ? "صباحية" : p === "evening" ? "مسائية" : p === "full_day" ? "يوم كامل" : "—"; });
    return templateBody
      .replace(/\{اسم_العميل\}/g, b.clientName ?? "")
      .replace(/\{اسم_العقار\}/g, getBookingChaletName(b))
      .replace(/\{التاريخ\}/g, startHijri)
      .replace(/\{التاريخ_م\}/g, startGreg)
      .replace(/\{سبب_الإلغاء\}/g, reason || b.cancelReason || "حسب الاتفاق")
      .replace(/\{اسم_اليوم_من\}/g, getArabicDayName(b.bookingDate))
      .replace(/\{اسم_اليوم_إلى\}/g, getArabicDayName(endStr))
      .replace(/\{من_التاريخ\}/g, startHijri)
      .replace(/\{من_التاريخ_م\}/g, startGreg)
      .replace(/\{إلى_التاريخ\}/g, endHijri)
      .replace(/\{إلى_التاريخ_م\}/g, endGreg)
      .replace(/\{الإيجار\}/g, _fmt(_bTotal))
      .replace(/\{التأمين\}/g, _fmt(insuranceFee))
      .replace(/\{المدفوع\}/g, _fmt(_bPaid))
      .replace(/\{المتبقي\}/g, _fmt(_bRemaining))
      .replace(/\{سبب_التعديل\}/g, reason || "—")
      .replace(/\{المدة\}/g, `${toArN(dur)} ${dur === 1 ? "يوم" : "أيام"}`)
      .replace(/\{الفترة\}/g, _periodAr())
      .replace(/\{الفترة_القديمة\}/g, "—")
      .replace(/\{الفترة_الجديدة\}/g, _periodAr())
      .replace(/\{استرداد_العربون\}/g, _fmt(depositRefund))
      .replace(/\{استرداد_التأمين\}/g, _fmt(insuranceFee))
      .replace(/\{إجمالي_المسترد\}/g, refundText)
      .replace(/\{المبلغ_المسترد\}/g, refundText)
      .replace(/\{[^}]+\}/g, "—");
  };

  const openManualWhatsAppTemplate = (b: OwnerBooking, templateBody: string, reason = "", refundAmount?: number, insuranceFeeOverride?: number, returnOnly = false): string | void => {
    const startHijri  = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
    const startGreg   = formatDualDate(b.bookingDate).gregorian;
    const dur = Math.max(1, b.durationDays ?? 1);
    const endD = new Date(b.bookingDate + "T00:00:00");
    endD.setDate(endD.getDate() + dur - 1);
    const endStr    = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
    const endHijri  = formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "");
    const endGreg   = formatDualDate(endStr).gregorian;
    /* ── Financial variables ── */
    const _bTotal      = b.totalPrice    ? Number(b.totalPrice)    : 0;
    const _bInsurance  = insuranceFeeOverride ?? (b.insuranceFee ? Number(b.insuranceFee) : 0);
    const _bPaid       = b.depositPaid   ? Number(b.depositPaid)   : 0;
    const _bAddons     = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
    const _bAddonsTotal = _bAddons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0).reduce((sum, a) => sum + Math.round(Number(a.price)), 0);
    const _bBaseRent   = _bTotal - _bAddonsTotal;
    const _bRemaining  = Math.max(0, _bTotal + _bInsurance - _bPaid);
    const _fmt = (n: number) => n > 0 ? n.toLocaleString("ar-SA") : "—";
    /* {تفاصيل_الخدمات}: expands to a multi-line services block, or "" when no paid services */
    const _bServicesBlock = (() => {
      if (_bAddons.length === 0) return "";
      const lines: string[] = ["الخدمات الإضافية المختارة:"];
      _bAddons.forEach(a => {
        const priceStr = (a.unit === "خدمة مجانية" || Number(a.price) === 0)
          ? "مجاني"
          : `${Math.round(Number(a.price)).toLocaleString("ar-SA")} ريال`;
        lines.push(`  • ${a.name}: ${priceStr}`);
      });
      if (_bAddonsTotal > 0) lines.push(`إجمالي الخدمات: ${_bAddonsTotal.toLocaleString("ar-SA")} ريال.`);
      return lines.join("\n") + "\n";
    })();
    const _periodAr = (() => { const p = b.period; return p === "morning" ? "صباحية" : p === "evening" ? "مسائية" : p === "full_day" ? "يوم كامل" : "—"; });
    const msg = templateBody
      .replace(/\{اسم_العميل\}/g, b.clientName ?? "")
      .replace(/\{اسم_العقار\}/g, getBookingChaletName(b))
      .replace(/\{التاريخ\}/g, startHijri)
      .replace(/\{التاريخ_م\}/g, startGreg)
      .replace(/\{سبب_الإلغاء\}/g, reason || b.cancelReason || "حسب الاتفاق")
      .replace(/\{اسم_اليوم_من\}/g, getArabicDayName(b.bookingDate))
      .replace(/\{اسم_اليوم_إلى\}/g, getArabicDayName(endStr))
      .replace(/\{من_التاريخ\}/g, startHijri)
      .replace(/\{من_التاريخ_م\}/g, startGreg)
      .replace(/\{إلى_التاريخ\}/g, endHijri)
      .replace(/\{إلى_التاريخ_م\}/g, endGreg)
      .replace(/\{الإيجار\}/g, _fmt(_bTotal))
      .replace(/\{قيمة_الإيجار\}/g, _fmt(_bBaseRent))
      .replace(/\{الإجمالي_الكلي\}/g, _fmt(_bTotal))
      .replace(/\{إجمالي_الخدمات\}/g, _bAddonsTotal > 0 ? _bAddonsTotal.toLocaleString("ar-SA") : "—")
      .replace(/\{تفاصيل_الخدمات\}/g, _bServicesBlock)
      .replace(/\{التأمين\}/g, _fmt(_bInsurance))
      .replace(/\{المدفوع\}/g, _fmt(_bPaid))
      .replace(/\{المتبقي\}/g, _fmt(_bRemaining))
      .replace(/\{سبب_التعديل\}/g, reason || "—")
      .replace(/\{المدة\}/g, `${toArN(dur)} ${dur === 1 ? "يوم" : "أيام"}`)
      .replace(/\{الفترة\}/g, _periodAr())
      .replace(/\{الفترة_القديمة\}/g, "—")
      .replace(/\{الفترة_الجديدة\}/g, _periodAr())
      .replace(/\{استرداد_العربون\}/g, (() => {
        const dep = refundAmount != null ? refundAmount : (b.cancelRefundAmount ? Number(b.cancelRefundAmount) : 0);
        return dep > 0 ? dep.toLocaleString("ar-SA") : "—";
      })())
      .replace(/\{استرداد_التأمين\}/g, _bInsurance > 0 ? _bInsurance.toLocaleString("ar-SA") : "—")
      .replace(/\{إجمالي_المسترد\}/g, (() => {
        const dep = refundAmount != null ? refundAmount : (b.cancelRefundAmount ? Number(b.cancelRefundAmount) : 0);
        return dep > 0 ? dep.toLocaleString("ar-SA") : "٠";
      })())
      .replace(/\{المبلغ_المسترد\}/g, (() => {
        const dep = refundAmount != null ? refundAmount : (b.cancelRefundAmount ? Number(b.cancelRefundAmount) : 0);
        return dep > 0 ? dep.toLocaleString("ar-SA") : "٠";
      })())
      .replace(/\{[^}]+\}/g, "—");
    if (returnOnly) return msg;
    const encoded = encodeWhatsAppText(msg);
    const phone = normalizeGuestPhone(b);
    const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    const a = document.createElement("a");
    a.href = waUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setOpenMessageMenuId(null);
  };

  const openRescheduleLogWhatsApp = (log: RescheduleLogItem) => {
    let rawPhone = (log.clientPhone ?? "").replace(/\D/g, "");
    if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
    if (rawPhone.startsWith("0"))  rawPhone = "966" + rawPhone.slice(1);
    if (rawPhone.length === 9 && rawPhone.startsWith("5")) rawPhone = "966" + rawPhone;

    const tpl = messageSettings.modificationTemplate || DEFAULT_MODIFICATION_TEMPLATE_BODY;
    const _dayName = (d: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(d + "T12:00:00"));
    const _periodAr = (p?: string | null) => p === "morning" ? "صباحية" : p === "evening" ? "مسائية" : p === "full_day" ? "يوم كامل" : "—";
    const oldHijri = formatDualDate(log.oldDate).hijri.replace(/\s*هـ\s*$/, "");
    const oldGreg  = formatDualDate(log.oldDate).gregorian;
    const newHijri = formatDualDate(log.newDate).hijri.replace(/\s*هـ\s*$/, "");
    const newGreg  = formatDualDate(log.newDate).gregorian;

    const chaletName = (() => {
      const found = bookings.find((bk) => bk.id === log.bookingId);
      return found ? getBookingChaletName(found) : (ownerChalets[0]?.nameAr ?? "العقار");
    })();

    const msg = tpl
      .replace(/\{اسم_العميل\}/g, log.clientName ?? "")
      .replace(/\{اسم_العقار\}/g, chaletName)
      .replace(/\{سبب_التعديل\}/g, log.reason || "—")
      .replace(/\{اسم_اليوم_من\}/g, _dayName(log.oldDate))
      .replace(/\{من_التاريخ\}/g, oldHijri)
      .replace(/\{من_التاريخ_م\}/g, oldGreg)
      .replace(/\{الفترة_القديمة\}/g, _periodAr(log.oldPeriod))
      .replace(/\{اسم_اليوم_إلى\}/g, _dayName(log.newDate))
      .replace(/\{إلى_التاريخ\}/g, newHijri)
      .replace(/\{إلى_التاريخ_م\}/g, newGreg)
      .replace(/\{الفترة_الجديدة\}/g, _periodAr(log.newPeriod))
      .replace(/\{[^}]+\}/g, "—");

    const a = document.createElement("a");
    a.href = rawPhone
      ? `https://wa.me/${rawPhone}?text=${encodeWhatsAppText(msg)}`
      : `https://wa.me/?text=${encodeWhatsAppText(msg)}`;
    a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const openReceiptWhatsApp = (b: OwnerBooking) => {
    const phone = normalizeGuestPhone(b);
    const bChalet = ownerChalets.find((c: any) => c.submissionId === b.submissionId);
    const values = detailedReceiptValues(b, {
      propertyName: getBookingChaletName(b),
      platformName: siteSettings.site_display_name || siteSettings.site_title,
      terms: bChalet?.termsAndConditions,
      ...formatDualDate(b.bookingDate),
      assetBaseUrl: `${window.location.origin}${BASE}`,
    });
    const msgFull = renderDetailedReceipt(messageSettings.detailedReceiptTemplate ?? DEFAULT_DETAILED_RECEIPT_TEMPLATE, values);
    const a3 = document.createElement("a");
    a3.href = phone ? `https://wa.me/${phone}?text=${encodeWhatsAppText(msgFull)}` : `https://wa.me/?text=${encodeWhatsAppText(msgFull)}`;
    a3.target = "_blank"; a3.rel = "noopener noreferrer";
    document.body.appendChild(a3); a3.click(); document.body.removeChild(a3);
    setOpenMessageMenuId(null);
  };

  const prevMonth = () => {
    if (dashCalType === "gregorian") {
      if (calGregMonth === 1) { setCalGregYear(y => y - 1); setCalGregMonth(12); }
      else setCalGregMonth(m => m - 1);
    } else {
      const p = prevHijriMonth(calHijriYear, calHijriMonth);
      setCalHijriYear(p.year); setCalHijriMonth(p.month);
    }
  };
  const nextMonth = () => {
    if (dashCalType === "gregorian") {
      if (calGregMonth === 12) { setCalGregYear(y => y + 1); setCalGregMonth(1); }
      else setCalGregMonth(m => m + 1);
    } else {
      const n = nextHijriMonth(calHijriYear, calHijriMonth);
      setCalHijriYear(n.year); setCalHijriMonth(n.month);
    }
  };

  const noApprovedChalets = !submissionsLoading && !chaletsLoading && approvedOwnerChalets.length === 0;
  const bookableSubmissions = useMemo(() => {
    return submissions.filter((s: any) => {
      const status = String(s.status ?? "").toLowerCase();
      if (status !== "approved" && status !== "active") return false;
      const chalet = approvedOwnerChalets.find((c: any) => c.submissionId === s.id);
      return !!chalet && chalet.isActive !== false && !isCurrentPause(chalet);
    });
  }, [submissions, approvedOwnerChalets]);
  const agendaRows = useMemo(() => {
    const scopeStart = (() => {
      if (agendaScope === "month") return calMonthStart;
      const base = new Date();
      const todayIso = base.toISOString().slice(0, 10);
      const inCurrentMonth = !!calMonthStart && todayIso >= calMonthStart && todayIso <= calMonthEnd;
      const anchor = inCurrentMonth ? new Date(base) : (calMonthDays[0] ? new Date(calMonthDays[0].date) : new Date());
      anchor.setDate(anchor.getDate() - anchor.getDay());
      return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-${String(anchor.getDate()).padStart(2, "0")}`;
    })();
    const scopeEnd = (() => {
      if (agendaScope === "month") return calMonthEnd;
      const [y, m, d] = scopeStart.split("-").map(Number);
      const end = new Date(y, m - 1, d + 6);
      return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    })();
    const rows: Array<{ dateStr: string; bookings: OwnerBooking[] }> = [];
    const [sy, sm, sd] = scopeStart.split("-").map(Number);
    const [ey, em, ed] = scopeEnd.split("-").map(Number);
    for (let d = new Date(sy, sm - 1, sd); d <= new Date(ey, em - 1, ed); d.setDate(d.getDate() + 1)) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayBookings = calBookings.filter((b) => {
        const [by, bm, bd] = b.bookingDate.split("-").map(Number);
        const end = new Date(by, bm - 1, bd + Math.max(1, b.durationDays ?? 1) - 1);
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
        return ds >= b.bookingDate && ds <= endStr;
      });
      rows.push({ dateStr: ds, bookings: dayBookings });
    }
    return rows;
  }, [agendaScope, calMonthStart, calMonthEnd, calMonthDays, calBookings]);

  return (
    <div className="property-booking-management space-y-6" data-testid="property-booking-management">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">سجل وتقويم الحجوزات</h2>
          <SectionGuideButton sectionKey="calendar" />
        </div>
        <Button onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } setAddOpen(true); }} size="sm" disabled={isReadOnly}>
          <Plus className="w-4 h-4 me-2" />
          إضافة حجز يدوي
        </Button>
      </div>

      {bookingsError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4">
        <p className="text-sm font-semibold">تعذّر تحديث الحجوزات. قد تكون البيانات المعروضة غير مكتملة؛ أعد المحاولة.</p>
        <Button variant="outline" size="sm" onClick={() => void retryCalendarBookings()}>إعادة المحاولة</Button>
      </div>}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Active bookings in the currently displayed month */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الحجوزات النشطة — {monthLabelHijri}</p>
            <p className="text-2xl font-extrabold text-foreground leading-none">
              {toAr(calScopeStats.activeCount)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              إجمالي {bookingStats != null ? toAr(bookingStats.totalActive) : "—"} حجز نشط
            </p>
          </div>
        </div>

        {/* Card 2: Estimated revenue in the currently displayed month */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الإيرادات المتوقعة — {monthLabelHijri}</p>
            <p className="text-xl font-extrabold text-green-600 dark:text-green-400 leading-none">
              {`${calScopeStats.revenue.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">بناءً على إجمالي قيم الحجوزات</p>
          </div>
        </div>

        {/* Card 3: Cancelled / Rescheduled ratio */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الملغاة / المعاد جدولتها</p>
            <p className="text-2xl font-extrabold text-foreground leading-none">
              {bookingStats != null
                ? `${toAr(bookingStats.totalCancelled)} / ${toAr(bookingStats.totalRescheduled)}`
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ملغاة / إعادة جدولة</p>
          </div>
        </div>
      </div>

      <AddBookingDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setPrefilledDate(null); setPrefilledPeriod(null); setBackToSummaryDate(null); }}
        submissions={bookableSubmissions}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
          qc.invalidateQueries({ queryKey: ["owner", "customers"] });
        }}
        existingBookings={bookings}
        prefilledDate={prefilledDate}
        prefilledChaletId={activeChalet?.submissionId ? String(activeChalet.submissionId) : undefined}
        availabilityBlocks={availability}
        prefilledPeriod={prefilledPeriod}
        onBack={backToSummaryDate ? (() => { const d = backToSummaryDate; setBackToSummaryDate(null); setSummaryDate(d); }) : null}
      />

      {/* Day Booking Summary Dialog */}
      {summaryDate && (() => {
        const sumBkgs = calBookings.filter((b) => {
          if (!b.bookingDate) return false;
          const end = new Date(b.bookingDate);
          end.setDate(end.getDate() + Math.max(1, b.durationDays ?? 1) - 1);
          return summaryDate >= b.bookingDate && summaryDate <= end.toISOString().slice(0, 10);
        });
        const [sy, sm, sd] = summaryDate.split("-").map(Number);
        const sumGreg = new Date(sy, sm - 1, sd).toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric", calendar: "gregory" });
        const sumHijri = new Date(sy, sm - 1, sd).toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
        const periodName = (p?: string | null) =>
          p === "morning" ? "🌅 الفترة الصباحية" :
          p === "evening" ? "🌙 الفترة المسائية" :
          "☀️ يوم كامل";
        return (
          <Dialog open onOpenChange={() => setSummaryDate(null)}>
            <DialogContent className="max-w-sm" dir="rtl">
              <DialogHeader className="shrink-0">
                <DialogTitle className="text-base font-bold leading-snug">
                  حجوزات {sumHijri.replace(/\s*هـ\s*$/, "")} هـ
                  <span className="block text-xs font-normal text-muted-foreground mt-0.5">{sumGreg}</span>
                </DialogTitle>
              </DialogHeader>
              {/* Multi-chalet overview — shown only when owner has more than one chalet */}
              {approvedOwnerChalets.length > 1 && (() => {
                const chaletStatuses = approvedOwnerChalets.map((c: any) => {
                  const isBooked = sumBkgs.some((b) => b.submissionId === c.submissionId);
                  return { id: c.id, name: c.nameAr ?? "عقار", booked: isBooked };
                });
                return (
                  <div className="mx-6 mt-3 mb-1 rounded-xl border border-border bg-muted/40 overflow-hidden">
                    <p className="text-[10px] font-bold text-muted-foreground px-3 pt-2.5 pb-1 uppercase tracking-wide">نظرة عامة على عقاراتك</p>
                    <div className="divide-y divide-border">
                      {chaletStatuses.map((cs) => (
                        <div key={cs.id} className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs font-medium text-foreground truncate max-w-[65%]">{cs.name}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            cs.booked
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}>
                            {cs.booked ? "محجوز" : "متاح"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-3 mt-1 w-full min-w-0 flex-1 min-h-0 overflow-y-auto">
                {sumBkgs.map((b, bi) => {
                  const total = b.totalPrice ? Math.round(Number(b.totalPrice)) : null;
                  const dep   = b.depositPaid ? Math.round(Number(b.depositPaid)) : null;
                  const bal   = total && dep ? total - dep : null;
                  const popDur = Math.max(1, b.durationDays ?? 1);
                  const popEndD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + (popDur - 1) * 86400000);
                  const popEndStr = `${popEndD.getFullYear()}-${String(popEndD.getMonth() + 1).padStart(2, "0")}-${String(popEndD.getDate()).padStart(2, "0")}`;
                  const isPastBooking = bookingIsComplete(b);
                  const popStartH = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                  const popStartG = formatDualDate(b.bookingDate).gregorian;
                  const popEndH   = formatDualDate(popEndStr).hijri.replace(/\s*هـ\s*$/, "");
                  const popEndG   = formatDualDate(popEndStr).gregorian;
                  const modalMessageTemplates = getManualWhatsAppTemplates(b);
                  const sendModalWhatsAppTemplate = (templateBody: string) => openManualWhatsAppTemplate(b, templateBody);
                  return (
                    <div key={b.id} className={`rounded-xl border p-3 space-y-1.5 min-w-0 w-full ${bi > 0 ? "mt-2" : ""} ${
                      b.period === "morning" ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20" :
                      b.period === "evening" ? "border-blue-200 bg-blue-50 dark:bg-blue-900/20" :
                      "border-red-200 bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold">{periodName(b.period)}</p>
                          {b.isRescheduled && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                              🔄 مُعاد جدولته
                            </span>
                          )}
                        </div>
                        {ownerChalets.length > 1 && (() => {
                          const bChaletName = ownerChalets.find((c: any) => c.submissionId === b.submissionId)?.nameAr;
                          return bChaletName ? (
                            <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5 truncate max-w-[45%]">{bChaletName}</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Duration info row — always shown */}
                      <div className="text-xs text-primary/80 bg-primary/5 rounded-lg px-2.5 py-1.5 leading-relaxed space-y-0.5">
                        {popDur === 1 ? (
                          <p>يوم واحد · {popStartH} هـ <span className="text-muted-foreground/70">({popStartG})</span></p>
                        ) : (
                          <>
                            <p className="font-semibold">لمدة {toAr(popDur)} أيام</p>
                            <p>من: {popStartH} هـ <span className="text-muted-foreground/70">({popStartG})</span></p>
                            <p>إلى: {popEndH} هـ <span className="text-muted-foreground/70">({popEndG})</span></p>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground [&>span]:min-w-0 [&>span]:overflow-hidden [&>span:nth-child(even)]:text-left">
                        <span>الاسم</span>
                        <span className="font-semibold text-left min-w-0 overflow-hidden text-ellipsis">
                          {b.clientName && b.clientName !== "عميل مؤقت"
                            ? <span className="text-foreground">{b.clientName}</span>
                            : <span className="text-muted-foreground/70 italic text-[0.7rem]">بانتظار توقيع العقد</span>
                          }
                        </span>
                        {b.clientPhone && <>
                          <span>الجوال</span>
                          <span dir="ltr" className="font-semibold text-foreground text-left">{toAr(b.clientPhone)}</span>
                        </>}
                        {total !== null && (() => {
                          const addons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
                          const addonsTotal = addons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0).reduce((sum, a) => sum + Math.round(Number(a.price)), 0);
                          const baseRent = total - addonsTotal;
                          const hasAddons = addons.length > 0;
                          return hasAddons ? (
                            <>
                              <span>قيمة الإيجار</span>
                              <span className="font-semibold text-foreground text-left">{baseRent.toLocaleString("ar-SA")} ر.س</span>
                              {addons.flatMap(a => [
                                <span key={`al-${a.id}`} className="pr-3 text-muted-foreground/60 truncate">↪ {a.name}</span>,
                                <span key={`ap-${a.id}`} className="text-foreground/80 text-left text-[0.68rem]">
                                  {a.unit === "خدمة مجانية" || Number(a.price) === 0 ? "مجاني" : `${Math.round(Number(a.price)).toLocaleString("ar-SA")} ر.س`}
                                </span>,
                              ])}
                              {addonsTotal > 0 && <>
                                <span className="text-muted-foreground">إجمالي الخدمات</span>
                                <span className="text-foreground text-left">{addonsTotal.toLocaleString("ar-SA")} ر.س</span>
                              </>}
                              <span className="font-semibold text-foreground border-t border-border/50 pt-1">الإجمالي الكلي</span>
                              <span className="font-bold text-foreground text-left border-t border-border/50 pt-1">{total.toLocaleString("ar-SA")} ر.س</span>
                            </>
                          ) : (
                            <>
                              <span>الإجمالي</span>
                              <span className="font-semibold text-foreground text-left">{total.toLocaleString("ar-SA")} ر.س</span>
                            </>
                          );
                        })()}
                        {dep !== null && dep > 0 && <>
                          <span>العربون</span>
                          <span className="font-semibold text-foreground text-left">{dep.toLocaleString("ar-SA")} ر.س</span>
                        </>}
                        {bal !== null && bal > 0 && <>
                          <span>المتبقي</span>
                          <span className={`font-semibold text-left ${b.balanceCollected ? "text-green-600" : "text-orange-500"}`}>
                            {bal.toLocaleString("ar-SA")} ر.س {b.balanceCollected ? "✓" : ""}
                          </span>
                        </>}
                        {b.source === "external" && <>
                          <span>المصدر</span>
                          <span className="font-semibold text-foreground text-left">خارجي</span>
                        </>}
                        {b.notes && <>
                          <span className="col-span-2 text-foreground/70 italic text-[0.7rem]">{b.notes}</span>
                        </>}
                      </div>
                      {/* Insurance / Deposit block */}
                      {b.insuranceFee && Number(b.insuranceFee) > 0 && (() => {
                        const insAmt = Number(b.insuranceFee);
                        const deducted = Number(b.insuranceDeducted ?? 0);
                        const refundable = Math.max(0, insAmt - deducted);
                        const proofImgsC: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                        return (
                          <div className={`rounded-lg border px-3 py-2 text-xs mt-1 space-y-1 ${
                            b.insuranceRefunded
                              ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700"
                              : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-700"
                          }`}>
                            {/* Header row */}
                            <div className="flex items-center justify-between">
                              <span className={`font-bold ${b.insuranceRefunded ? "text-slate-500" : "text-orange-700 dark:text-orange-400"}`}>
                                🔒 مبلغ التأمين
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-sm ${b.insuranceRefunded ? "text-slate-400" : "text-orange-700 dark:text-orange-400"}`}>
                                  {insAmt.toLocaleString("ar-SA")} ر.س
                                </span>
                                {!b.insuranceRefunded && (
                                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                    b.insuranceReceived
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                  }`}>{b.insuranceReceived
                                    ? ((b.insurancePaymentMethod ?? "transfer") === "cash"
                                        ? (() => {
                                            const iAmt = Math.round(Number(b.insuranceFee ?? 0));
                                            const iDep = perBookingInsuranceDeposited.get(b.id) ?? 0;
                                            const iRem = Math.max(0, iAmt - iDep);
                                            if (iDep > 0 && iRem > 0) return `تم إيداع ${toEasternArabic(iDep.toLocaleString("ar-SA"))} ر.س بالبنك (متبقي كاش: ${toEasternArabic(iRem.toLocaleString("ar-SA"))} ر.س)`;
                                            if (iRem === 0 && iDep > 0) return "تم الإيداع بالبنك ✓ (كاش)";
                                            return "مستلم (كاش)";
                                          })()
                                        : "مستلم (تحويل بنكي)")
                                    : "معلّق"}</span>
                                )}
                                {b.insuranceRefunded && deducted === 0 && (
                                  <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">↩ مُعاد</span>
                                )}
                                {b.insuranceRefunded && deducted > 0 && (
                                  <span className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">✂️ مخصوم</span>
                                )}
                              </div>
                            </div>
                            {/* Quick-action: mark insurance as received */}
                            {!b.insuranceRefunded && !b.insuranceReceived && !isReadOnly && (
                              <button
                                type="button"
                                disabled={markInsuranceReceived.isPending && markInsuranceReceived.variables === b.id}
                                onClick={() => setConfirmInsuranceBookingId(b.id)}
                                className="w-full mt-1 text-[11px] py-1 rounded-md font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                              >
                                {markInsuranceReceived.isPending && markInsuranceReceived.variables === b.id ? "جاري التسجيل..." : "✓ تسجيل استلام التأمين"}
                              </button>
                            )}
                            {b.insuranceReceived && (b.insurancePaymentMethod ?? "transfer") === "cash" && !b.insuranceRefunded && !isReadOnly && (() => {
                              const iAmt = Math.round(Number(b.insuranceFee ?? 0));
                              const iDep = perBookingInsuranceDeposited.get(b.id) ?? 0;
                              const iRem = Math.max(0, iAmt - iDep);
                              if (iRem <= 0) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => openBookingDepositDialog(b.id, iRem, iAmt, b.submissionId, `إيداع تأمين كاش — ${b.clientName}`)}
                                  className="w-full mt-1 text-[11px] py-1 rounded-md font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                  🏦 {iDep > 0 ? `إيداع المتبقي (${toEasternArabic(iRem.toLocaleString("ar-SA"))} ر.س)` : "تسجيل إيداع التأمين بالبنك"}
                                </button>
                              );
                            })()}
                            {/* Settlement formula — only if settled */}
                            {b.insuranceRefunded && deducted > 0 && (
                              <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-0.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-red-600">✂️ خصم تلفيات</span>
                                  <span className="font-bold text-red-700">{deducted.toLocaleString("ar-SA")} ر.س</span>
                                </div>
                                {b.insuranceDeductReason && (
                                  <div className="text-[10px] text-muted-foreground">السبب: {b.insuranceDeductReason}</div>
                                )}
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-green-600">↩ مُرجَع للعميل</span>
                                  <span className="font-bold text-green-700">{refundable.toLocaleString("ar-SA")} ر.س</span>
                                </div>
                                {proofImgsC.length > 0 && (
                                  <div className="flex gap-1 pt-0.5 flex-wrap">
                                    {proofImgsC.slice(0, 4).map((u, i) => {
                                      const fullU2 = u.startsWith("http") ? u : `${window.location.origin}${BASE}${u}`;
                                      return (
                                        <img key={i} src={fullU2} alt="توثيق" className="w-10 h-10 rounded object-cover border border-border" />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* ── Payment Status Section (modal) ── */}
                      {(() => {
                        const dep = Number(b.depositPaid ?? 0);
                        const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice) : dep;
                        const bal = b.balanceCollected ? Math.max(0, tp - dep) : 0;
                        const undepCashInst = (paymentsByBooking[b.id] ?? []).filter(i => i.method === "cash" && !i.cashDeposited).reduce((s, i) => s + Number(i.amount), 0);
                        const bookingMainCash = b.paymentMethod === "cash" ? dep + bal : 0;
                        const totalCashB = bookingMainCash + undepCashInst;
                        const logDep = perBookingDeposited.get(b.id) ?? 0;
                        const effectiveDep = (b.cashDeposited && logDep === 0) ? bookingMainCash : logDep;
                        const remaining = Math.max(0, totalCashB - effectiveDep);
                        const fullyDep = remaining === 0;
                        if (totalCashB <= 0 && !b.cashDeposited) return null;
                        return (
                        <div className={`rounded-lg border p-2.5 space-y-2 mt-1 ${fullyDep ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700"}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{fullyDep ? "🏦" : "💵"}</span>
                              <div>
                                <p className={`text-[11px] font-bold ${fullyDep ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                                  {fullyDep ? "تم الإيداع في البنك ✓" : effectiveDep > 0 ? `متبقي كاش لم يُودَع: ${toEasternArabic(remaining.toLocaleString("ar-SA"))} ر.س` : "نقدي — لم يُودَع بعد"}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {fullyDep ? "المبلغ مُحوَّل للبنك ✓" : effectiveDep > 0 ? `أُودِع حتى الآن: ${toEasternArabic(effectiveDep.toLocaleString("ar-SA"))} ر.س` : "يظهر في السيولة اليدوية"}
                                </p>
                              </div>
                            </div>
                            {!fullyDep && remaining > 0 && !isReadOnly && (
                              <button
                                type="button"
                                onClick={() => openBookingDepositDialog(b.id, remaining, totalCashB, b.submissionId, `إيداع نقدي — ${b.clientName}`)}
                                className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg px-2.5 py-1.5 transition-colors"
                              >
                                <CheckCircle className="w-3 h-3" />
                                {effectiveDep > 0 ? "إيداع المتبقي" : "تسجيل إيداع بالبنك"}
                              </button>
                            )}
                          </div>
                          {!fullyDep && remaining > 0 && !isReadOnly && (
                            <div className="border-t border-amber-200 dark:border-amber-800 pt-1.5">
                              <input
                                ref={calReceiptRef}
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setCalReceiptUploading(true);
                                  try {
                                    const url = await uploadFile(file);
                                    if (url) setCalReceiptUrl(url);
                                  } finally { setCalReceiptUploading(false); e.target.value = ""; }
                                }}
                              />
                              {calReceiptUrl ? (
                                <div className="flex items-center gap-2">
                                  <img src={calReceiptUrl} alt="إيصال" className="h-8 w-8 rounded object-cover border" />
                                  <p className="text-[10px] text-green-600 flex-1">تم رفع الإيصال ✓</p>
                                  <button type="button" onClick={() => setCalReceiptUrl(null)} className="text-[10px] text-destructive underline">إزالة</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={calReceiptUploading}
                                  onClick={() => calReceiptRef.current?.click()}
                                  className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 hover:underline"
                                >
                                  {calReceiptUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "📎"}
                                  إرفاق صورة الإيصال (اختياري)
                                </button>
                              )}
                            </div>
                          )}
                          {b.paymentReceiptUrl && (
                            <div className="border-t border-green-200 dark:border-green-800 pt-1.5 flex items-center gap-2">
                              <p className="text-[10px] text-muted-foreground">إيصال:</p>
                              <button type="button" onClick={() => setReceiptLightbox(b.paymentReceiptUrl!)} className="shrink-0">
                                <img src={b.paymentReceiptUrl} alt="إيصال" className="h-12 w-12 rounded-lg object-cover border hover:opacity-80 transition" />
                              </button>
                              <button type="button" onClick={() => setReceiptLightbox(b.paymentReceiptUrl!)} className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 underline hover:no-underline">
                                عرض الإيصال
                              </button>
                            </div>
                          )}
                        </div>
                      );
                      })()}

                      {/* ── حالة العقد ── */}
                      {!b.cancelledAt && (
                        <div className={`flex items-center justify-between px-3 py-2 rounded-xl border mt-2 ${b.contractSigned ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10" : "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/10"}`}>
                          <span className={`text-xs font-semibold ${b.contractSigned ? "text-emerald-700 dark:text-emerald-400" : "text-violet-700 dark:text-violet-400"}`}>
                            حالة العقد
                          </span>
                          {b.contractSigned ? (
                            <button
                              type="button"
                              onClick={() => { setSummaryDate(null); setContractPreviewBooking(b); }}
                              className={`text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-full border ${CONTRACT_STATUS_STYLES.signed} hover:opacity-90 transition-opacity`}
                            >
                              ✅ تم التوقيع
                            </button>
                          ) : (
                            <span className={`text-xs font-bold whitespace-nowrap px-2.5 py-1 rounded-full border ${CONTRACT_STATUS_STYLES.pending}`}>
                              ⏳ بانتظار توقيع المستأجر
                            </span>
                          )}
                        </div>
                      )}
                      {/* Contract quick actions — shown when signature pending and booking is upcoming */}
                      {!b.cancelledAt && !b.contractSigned && !isPastBooking && (() => {
                        const _cu = publicContractUrl(b.id, "property", BASE);
                        const _dg = (b.clientPhone ?? "").replace(/\D/g, "");
                        const _wp = _dg.startsWith("966") ? _dg : _dg.startsWith("0") ? "966" + _dg.slice(1) : _dg ? "966" + _dg : "";
                        const _wm = buildContractWaMsg(b.bookingDate, b.submissionId, ownerChalets, _cu, b.period, returningPhonesSet.has(b.clientPhone ?? ""), b.clientName);
                        return (
                          <div className="flex gap-1.5 mt-2">
                            <a href={_wp ? `https://wa.me/${_wp}?text=${_wm}` : `https://wa.me/?text=${_wm}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors">
                              💬 إرسال العقد بالواتساب
                            </a>
                            <button type="button" onClick={() => navigator.clipboard.writeText(_cu).then(() => toast({ title: "تم النسخ ✓", description: "رابط العقد في الحافظة" }))} className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                              📋 نسخ رابط العقد
                            </button>
                          </div>
                        );
                      })()}

                      {/* Booking management quick actions */}
                      <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-border/50">
                        {b.insuranceFee && Number(b.insuranceFee) > 0 && !b.insuranceRefunded && (
                          <button
                            onClick={() => { setSummaryDate(null); setInsuranceTarget(b); }}
                            className="col-span-2 flex items-center justify-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700 rounded-lg py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                          >
                            <Lock className="w-3 h-3 shrink-0" />
                            إدارة التأمين
                          </button>
                        )}
                        {/* Installment payments — modal */}
                        {(() => {
                          const dep2 = Number(b.depositPaid ?? 0);
                          const total2 = b.totalPrice !== null ? Number(b.totalPrice) : null;
                          const hasInstallments = total2 !== null && total2 > dep2;
                          const bkPmts = hasInstallments ? (paymentsByBooking[b.id] ?? []) : [];
                          const totalPaid2 = bkPmts.reduce((s, p) => s + Number(p.amount), 0);
                          const remDyn2 = hasInstallments ? Math.max(0, total2! - dep2 - totalPaid2) : 0;
                          const isFullyPaid2 = !hasInstallments || b.balanceCollected || remDyn2 <= 0;
                          const showAddPayBtn = hasInstallments && !isFullyPaid2 && !isReadOnly && calPayTarget !== b.id;
                          const showReviewBtn = !!(activeChaletId && !b.ratedAt);
                          return (
                            <>
                              {bkPmts.length > 0 && (
                                <div className="w-full border border-green-200 dark:border-green-800 rounded-xl p-2.5 space-y-1.5 bg-green-50 dark:bg-green-900/10">
                                  <p className="text-[10px] font-bold text-green-700 dark:text-green-400">💰 الدفعات المحصّلة:</p>
                                  {bkPmts.map(p => (
                                    <div key={p.id} className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[10px] text-muted-foreground leading-tight">
                                        <span className="block">{formatDualDate(p.paymentDate).hijri.replace(/\s*هـ\s*$/, "")}</span>
                                        <span className="block opacity-60">({formatDualDate(p.paymentDate).gregorian})</span>
                                      </span>
                                      <span className="text-[10px] font-bold text-green-700 dark:text-green-400">{toArN(Math.round(Number(p.amount)))} ر.س</span>
                                      <span className="text-[10px]">{p.method === "transfer" ? "🏦" : p.method === "pos" ? "💳" : "💵"}</span>
                                      {p.receiptUrl && (<button type="button" onClick={() => setReceiptLightbox(p.receiptUrl!)} className="text-[10px] text-blue-600 hover:underline">🧾</button>)}
                                      {!isReadOnly && (<button type="button" onClick={() => deleteInstallmentPayment(b.id, p.id)} className="text-[10px] text-destructive hover:underline mr-auto">✕</button>)}
                                    </div>
                                  ))}
                                  {isFullyPaid2 ? (<p className="text-[10px] font-bold text-green-600">✅ اكتمل السداد</p>) : (<p className="text-[10px] text-amber-600">المتبقي: {toArN(Math.round(remDyn2))} ر.س</p>)}
                                </div>
                              )}
                              {!isFullyPaid2 && !isReadOnly && (
                                calPayTarget === b.id ? (
                                  <div className="w-full border border-blue-200 dark:border-blue-800 rounded-xl p-2.5 space-y-2 bg-blue-50 dark:bg-blue-900/10">
                                    <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400">إضافة دفعة — المتبقي {toArN(Math.round(remDyn2))} ر.س</p>
                                    <div className="flex gap-2">
                                      <input type="text" inputMode="decimal" value={toArN(calPayAmt)} onChange={e => setCalPayAmt(fromArN(e.target.value))} placeholder="المبلغ" className="flex-1 text-[11px] rounded-lg border border-border bg-background px-2 py-1.5 text-foreground min-w-0 text-center" />
                                      <DualCalendarPicker
                                        value={calPayDate}
                                        onChange={setCalPayDate}
                                        mode="gregorian"
                                        compact
                                        className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] text-foreground"
                                      />
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button type="button" onClick={() => { setCalPayMethod("cash"); setCalPayDeposited(false); }} className={`flex-1 text-[11px] font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "cash" ? "border-amber-500 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}>💵 كاش</button>
                                      <button type="button" onClick={() => { setCalPayMethod("transfer"); setCalPayDeposited(true); }} className={`flex-1 text-[11px] font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "transfer" ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" : "border-border text-muted-foreground"}`}>🏦 تحويل</button>
                                      <button type="button" onClick={() => { setCalPayMethod("pos"); setCalPayDeposited(true); }} className={`flex-1 text-[11px] font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "pos" ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300" : "border-border text-muted-foreground"}`}>💳 شبكة</button>
                                    </div>
                                    {calPayMethod === "cash" && (
                                      <div className="flex gap-2">
                                        <button type="button" onClick={() => setCalPayDeposited(false)} className={`flex-1 text-[10px] font-bold rounded-lg py-1 border-2 transition-colors ${!calPayDeposited ? "border-amber-500 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}>💵 سيولة</button>
                                        <button type="button" onClick={() => setCalPayDeposited(true)} className={`flex-1 text-[10px] font-bold rounded-lg py-1 border-2 transition-colors ${calPayDeposited ? "border-green-500 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "border-border text-muted-foreground"}`}>🏦 أُودع</button>
                                      </div>
                                    )}
                                    <input ref={calPayReceiptRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setCalPayReceiptUploading(true); try { const url = await uploadFile(file); if (url) setCalPayReceiptUrl(url); } finally { setCalPayReceiptUploading(false); e.target.value = ""; } }} />
                                    {(calPayMethod === "transfer" || calPayMethod === "pos") && (
                                      calPayReceiptUrl ? (
                                        <div className="flex items-center gap-2">
                                          <button type="button" onClick={() => setReceiptLightbox(calPayReceiptUrl)}><img src={calPayReceiptUrl} alt="إيصال" className="h-8 w-8 rounded object-cover border hover:opacity-80 transition" /></button>
                                          <p className="text-[10px] text-green-600 flex-1">إيصال مرفق ✓</p>
                                          <button type="button" onClick={() => setCalPayReceiptUrl(null)} className="text-[10px] text-destructive underline">إزالة</button>
                                        </div>
                                      ) : (
                                        <button type="button" disabled={calPayReceiptUploading} onClick={() => calPayReceiptRef.current?.click()} className="flex items-center gap-1 text-[10px] text-blue-700 dark:text-blue-400 hover:underline">
                                          {calPayReceiptUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "📎"} إرفاق إيصال (اختياري)
                                        </button>
                                      )
                                    )}
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => { setCalPayTarget(null); setCalPayAmt(""); setCalPayReceiptUrl(null); }} className="flex-1 text-[11px] rounded-lg py-1.5 border border-border text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
                                      <button type="button" onClick={() => addInstallmentPayment(b.id)} disabled={calPaySaving} className="flex-1 text-[11px] font-bold rounded-lg py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1 transition-colors">
                                        {calPaySaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} تأكيد الدفعة
                                      </button>
                                    </div>
                                  </div>
                                ) : null
                              )}
                              {/* review + add-payment combined row */}
                              {(showReviewBtn || showAddPayBtn) && (
                                <div className="col-span-2 flex gap-1.5">
                                  {showReviewBtn && (
                                    <button
                                      disabled={!bookingIsComplete(b) || reviewSentIds.has(b.id) || reviewPendingId === b.id}
                                      title={!bookingIsComplete(b) ? REVIEW_NOT_READY_MESSAGE : undefined}
                                      onClick={() => { setSummaryDate(null); sendReviewRequest(b); }}
                                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-700 rounded-lg py-2 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50"
                                    >
                                      {reviewPendingId === b.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : reviewSentIds.has(b.id)
                                          ? <CheckCircle className="w-3 h-3" />
                                          : <Star className="w-3 h-3" />}
                                      {reviewSentIds.has(b.id) ? "تم الإرسال ✓" : "إرسال رابط التقييم"}
                                    </button>
                                  )}
                                  {showAddPayBtn && (
                                    <button
                                      type="button"
                                      onClick={() => { setCalPayTarget(b.id); setCalPayAmt(String(remDyn2)); setCalPayDate(new Date().toISOString().slice(0, 10)); setCalPayMethod("cash"); setCalPayDeposited(false); }}
                                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                      <CheckCircle className="w-3 h-3" /> + إضافة دفعة ({toArN(Math.round(remDyn2))} ر.س)
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {/* Custom WhatsApp message dropup */}
                        {b.clientPhone && (() => {
                          const _d2 = (b.clientPhone ?? "").replace(/\D/g, "");
                          return (
                            <div className="col-span-2 relative">
                              {openMessageMenuId === b.id && (
                                <div className="absolute bottom-full right-0 mb-1 w-full rounded-xl border border-green-200 dark:border-green-800 bg-card shadow-xl z-50 overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-800/60">
                                    <span className="text-[11px] font-bold text-green-700 dark:text-green-400">💬 إرسال رسالة</span>
                                    <button type="button" onClick={() => setOpenMessageMenuId(null)} className="text-muted-foreground hover:text-foreground p-0.5">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="p-1">
                                    {modalMessageTemplates.length > 0 ? modalMessageTemplates.map(tpl => (
                                      <button key={tpl.id} type="button"
                                        onClick={() => { sendModalWhatsAppTemplate(tpl.body); setOpenMessageMenuId(null); }}
                                        className="w-full text-right px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors">
                                        {tpl.title}
                                      </button>
                                    )) : (
                                      <p className="px-3 py-2 text-xs text-muted-foreground text-right">أضف قالباً من إعدادات الرسائل</p>
                                    )}
                                    <div className="h-px bg-border my-0.5" />
                                    <button type="button"
                                      onClick={() => { openReceiptWhatsApp(b); setOpenMessageMenuId(null); }}
                                      className="w-full text-right px-3 py-1.5 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors">
                                      إيصال واتساب مفصل
                                    </button>
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setOpenMessageMenuId(openMessageMenuId === b.id ? null : b.id); }}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                إرسال رسالة مخصصة
                                <ChevronDown className={`w-3 h-3 transition-transform ${openMessageMenuId === b.id ? "rotate-180" : ""}`} />
                              </button>
                            </div>
                          );
                        })()}
                        {!isPastBooking && (
                          <div className="col-span-2 flex gap-1.5">
                            <button
                              onClick={() => { setSummaryDate(null); setRescheduleBooking(b); }}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary/10 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3 shrink-0" />
                              إعادة جدولة
                            </button>
                            <button
                              onClick={() => { setSummaryDate(null); setDeleteDialogBooking(b); }}
                              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-lg py-2 hover:bg-destructive/10 transition-colors"
                            >
                              <XCircle className="w-3 h-3 shrink-0" />
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {(() => {
                // sumBkgs is already filtered for summaryDate — use it directly
                const bookedPeriods = sumBkgs.map(b => b.period).filter(Boolean);
                const hasFullDay = bookedPeriods.includes("full_day");
                const hasMorning = bookedPeriods.includes("morning");
                const hasEvening = bookedPeriods.includes("evening");
                // free period = the unbooked half (null when both halves taken or full_day)
                const freePeriod = (hasFullDay || (hasMorning && hasEvening))
                  ? null
                  : hasMorning ? "evening"
                  : hasEvening ? "morning"
                  : null;
                const freePeriodLabel = freePeriod === "morning" ? "الصباحية" : freePeriod === "evening" ? "المسائية" : null;

                // Check if free period is already blocked in availability
                const isFreePeriodBlocked = (() => {
                  if (!freePeriod || !summaryDate) return false;
                  const avail = availability.find(a => a.dateStr === summaryDate);
                  if (!avail) return false;
                  return freePeriod === "morning" ? !!avail.periodMorning : !!avail.periodEvening;
                })();

                const handleBookFree = () => {
                  const capturedDate = summaryDate!;
                  setBackToSummaryDate(capturedDate);
                  setPrefilledDate(capturedDate);
                  setPrefilledPeriod(freePeriod);
                  setSummaryDate(null);
                  setAddOpen(true);
                };

                const handleToggleBlockFree = async () => {
                  if (!activeChaletId || !freePeriod || !summaryDate) return;
                  const existing = availability.find(a => a.dateStr === summaryDate);
                  const shouldBlock = !isFreePeriodBlocked;
                  await apiFetch("/owner/availability", {
                    method: "POST",
                    body: JSON.stringify({
                      chaletId: activeChaletId,
                      dateStr: summaryDate,
                      periodMorning: freePeriod === "morning" ? shouldBlock : (existing?.periodMorning ?? false),
                      periodEvening: freePeriod === "evening" ? shouldBlock : (existing?.periodEvening ?? false),
                      periodFullDay: false,
                    }),
                  });
                  qc.invalidateQueries({ queryKey: ["owner", "availability", activeChaletId] });
                  // Don't close dialog — re-render shows updated toggle state
                };

                return (
                  <DialogFooter className="flex flex-col sm:flex-col sm:items-stretch gap-2 mt-1 shrink-0">
                    {/* Row 1: Smart action buttons side-by-side */}
                    {freePeriod && freePeriodLabel && (
                      <div className="flex flex-row gap-2 w-full">
                        {!isFreePeriodBlocked && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1.5 text-primary border-primary/40 hover:bg-primary/10"
                            onClick={handleBookFree}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            حجز الفترة {freePeriodLabel}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className={`flex-1 ${isFreePeriodBlocked
                            ? "gap-1.5 text-green-700 border-green-400 hover:bg-green-50 dark:text-green-400 dark:border-green-600 dark:hover:bg-green-900/20"
                            : "gap-1.5 text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-900/20"}`}
                          onClick={handleToggleBlockFree}
                        >
                          {isFreePeriodBlocked ? (
                            <><span>🔓</span> فتح الفترة {freePeriodLabel}</>
                          ) : (
                            <><Settings className="w-3.5 h-3.5" /> إغلاق الفترة {freePeriodLabel}</>
                          )}
                        </Button>
                      </div>
                    )}
                    {/* Row 2: Close button — full width */}
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setSummaryDate(null)}>إغلاق</Button>
                  </DialogFooter>
                );
              })()}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Per-booking cash deposit dialog */}
      <Dialog open={bookingDepositTarget !== null} onOpenChange={(o) => { if (!o) { setBookingDepositTarget(null); setBookingDepositAmt(""); } }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <span>🏦</span> تسجيل إيداع بالبنك
            </DialogTitle>
            <DialogDescription className="text-right text-sm">
              {bookingDepositTarget?.label ?? "إيداع الكاش في الحساب البنكي"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 text-center">
              <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                {(bookingDepositTarget?.maxAmount ?? 0).toLocaleString("ar-SA")}
                <span className="text-base font-normal text-muted-foreground ms-2">ر.س</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">الحد الأقصى للإيداع</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">المبلغ المراد إيداعه بالحساب البنكي (SAR)</label>
              <input
                type="text"
                inputMode="decimal"
                value={bookingDepositAmt ? toEasternArabic(bookingDepositAmt) : ""}
                onChange={e => setBookingDepositAmt(fromEasternArabic(e.target.value).replace(/[^\d]/g, ""))}
                placeholder={bookingDepositTarget?.maxAmount ? toEasternArabic(bookingDepositTarget.maxAmount) : ""}
                className="w-full border border-border rounded-lg px-3 py-2 text-right text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {bookingDepositAmt && Number(bookingDepositAmt) > (bookingDepositTarget?.maxAmount ?? 0) && (
                <p className="text-xs font-semibold text-destructive">⚠️ المبلغ يتجاوز الحد الأقصى ({(bookingDepositTarget?.maxAmount ?? 0).toLocaleString("ar-SA")} ر.س)</p>
              )}
              <p className="text-xs text-muted-foreground">اترك الحقل فارغاً لإيداع المبلغ الكامل</p>
            </div>
          </div>
          <DialogFooter className="flex gap-2 mt-2">
            <Button variant="outline" onClick={() => { setBookingDepositTarget(null); setBookingDepositAmt(""); }} disabled={bookingDepositSaving} className="flex-1">إلغاء</Button>
            <Button
              onClick={async () => {
                if (!bookingDepositTarget) return;
                const amt = bookingDepositAmt ? Number(bookingDepositAmt) : bookingDepositTarget.maxAmount;
                if (!amt || amt <= 0 || amt > bookingDepositTarget.maxAmount) return;
                setBookingDepositSaving(true);
                try {
                  const isInsurance = (bookingDepositTarget.label ?? "").includes("تأمين");
                  const r = await apiFetch("/owner/mark-cash-deposited", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: amt, submissionId: bookingDepositTarget.submissionId, bookingId: bookingDepositTarget.bookingId, isInsurance, totalCash: bookingDepositTarget.totalCash, note: bookingDepositTarget.label ?? "إيداع نقدي" }),
                  });
                  if (r.ok) {
                    const targetId = bookingDepositTarget.bookingId;
                    const isFullDeposit = amt >= bookingDepositTarget.totalCash;
                    toast({ title: "✅ تم تسجيل الإيداع", description: isInsurance ? "تم تسجيل إيداع التأمين بالبنك" : isFullDeposit ? "نُقل المبلغ كاملاً إلى الحساب البنكي" : `المتبقي: ${toEasternArabic(Math.max(0, bookingDepositTarget.totalCash - amt).toLocaleString("ar-SA"))} ر.س` });
                    if (!isInsurance && isFullDeposit) {
                      qc.setQueryData(["owner", "bookings"], (old: any) => {
                        if (!Array.isArray(old)) return old;
                        return old.map((bk: any) => bk.id === targetId ? { ...bk, cashDeposited: true } : bk);
                      });
                    }
                    qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
                    qc.invalidateQueries({ queryKey: ["owner", "cash-deposit-logs"] });
                    qc.invalidateQueries({ queryKey: ["owner", "cash-deposit-logs-ledger"] });
                    qc.invalidateQueries({ queryKey: ["owner", "financial-summary-rev"] });
                    qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
                    setBookingDepositTarget(null);
                    setBookingDepositAmt("");
                  }
                } finally { setBookingDepositSaving(false); }
              }}
              disabled={bookingDepositSaving || (!!bookingDepositAmt && Number(bookingDepositAmt) > (bookingDepositTarget?.maxAmount ?? 0))}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {bookingDepositSaving ? "جارٍ التسجيل..." : "✓ تأكيد الإيداع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog: mark insurance as received */}
      <AlertDialog open={confirmInsuranceBookingId !== null} onOpenChange={(o) => { if (!o) setConfirmInsuranceBookingId(null); }}>
        <AlertDialogContent dir="rtl" className="max-w-sm text-right p-6">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right text-base">تأكيد استلام التأمين</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-sm mt-1">
              هل أنت متأكد من تسجيل استلام مبلغ التأمين؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-row justify-start gap-2 mt-4">
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white px-5"
              onClick={() => { if (confirmInsuranceBookingId !== null) { markInsuranceReceived.mutate(confirmInsuranceBookingId); setConfirmInsuranceBookingId(null); } }}
            >
              تأكيد
            </AlertDialogAction>
            <AlertDialogCancel className="px-5">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Calendar Section */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <h3 className="font-bold text-foreground flex-1">التقويم والإتاحة</h3>
          {approvedOwnerChalets.length > 1 && !activityScope.selectUnit && (
            <Select
              value={showAllChalets ? "all" : String(activeChaletId ?? "")}
              onValueChange={(v) => setSelectedChaletId(v === "all" ? "all" : Number(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر العقار" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">عرض الكل</SelectItem>
                {approvedOwnerChalets.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setCalendarMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${calendarMode === "calendar" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              <Calendar className="w-3.5 h-3.5" />
              تقويم
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode("agenda")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${calendarMode === "agenda" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              أجندة
            </button>
          </div>
          {/* Hijri / Gregorian calendar type toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => { setDashCalType("hijri"); localStorage.setItem("dashCalDefaultType", "hijri"); }}
              className={`px-3 py-1.5 font-bold transition-colors ${dashCalType === "hijri" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              title="تقويم هجري"
            >هجري</button>
            <button
              type="button"
              onClick={() => { setDashCalType("gregorian"); localStorage.setItem("dashCalDefaultType", "gregorian"); }}
              className={`px-3 py-1.5 font-bold transition-colors ${dashCalType === "gregorian" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              title="تقويم ميلادي"
            >ميلادي</button>
          </div>
        </div>

        {noApprovedChalets ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا يوجد عقار معتمد بعد. بعد موافقة الإدارة سيظهر التقويم هنا.</p>
          </div>
        ) : (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
              {/* Clickable title → Month/Year quick picker */}
              <div className="relative">
                <button
                  onClick={() => {
                    const yr = dashCalType === "hijri" ? calHijriYear : calGregYear;
                    setCalPickerYear(yr);
                    setCalPickerOpen(o => !o);
                  }}
                  className="flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-lg hover:bg-muted/60 transition-colors"
                >
                  {monthLabel}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                {calPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCalPickerOpen(false)} />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-card border border-border rounded-xl shadow-lg p-3 w-64" dir="rtl">
                      {/* Year selector row */}
                      <div className="flex items-center justify-between mb-3 px-1">
                        <button onClick={() => setCalPickerYear(y => y + 1)} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-sm font-bold">
                          {dashCalType === "hijri" ? `${toArN(calPickerYear)} هـ` : `${toArN(calPickerYear)} م`}
                        </span>
                        <button onClick={() => setCalPickerYear(y => y - 1)} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center">
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Month grid */}
                      <div className="grid grid-cols-3 gap-1">
                        {(dashCalType === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR).map((name, i) => {
                          const monthNum = i + 1;
                          const isActive = dashCalType === "hijri"
                            ? calPickerYear === calHijriYear && monthNum === calHijriMonth
                            : calPickerYear === calGregYear && monthNum === calGregMonth;
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                if (dashCalType === "hijri") { setCalHijriYear(calPickerYear); setCalHijriMonth(monthNum); }
                                else { setCalGregYear(calPickerYear); setCalGregMonth(monthNum); }
                                setCalPickerOpen(false);
                              }}
                              className={`rounded-lg py-1.5 px-1 text-[11px] font-medium leading-tight transition-colors text-center ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {calendarMode === "agenda" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    عرض سريع للحجوزات {showAllChalets ? "لكل العقارات" : `لـ ${activeChalet?.nameAr ?? "العقار"}`}
                  </p>
                  <div className="flex rounded-xl bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setAgendaScope("week")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${agendaScope === "week" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}
                    >
                      أسبوع
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgendaScope("month")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${agendaScope === "month" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}
                    >
                      شهر
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-border overflow-hidden">
                  {agendaRows.map((row) => {
                    const dual = formatDualDate(row.dateStr);
                    return (
                      <div key={row.dateStr} className="border-b border-border last:border-b-0">
                        <div className="bg-muted/40 px-3 py-2 text-xs font-bold text-foreground flex items-center justify-between gap-2">
                          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>{new Date(`${row.dateStr}T12:00:00+03:00`).toLocaleDateString("ar-SA", { weekday: "long", timeZone: "Asia/Riyadh" })}</span>
                            <span>{dual.hijri.replace(/\s*هـ\s*$/, "")} هـ</span>
                            <span className="text-muted-foreground font-medium">{dual.gregorian}</span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs shrink-0"
                            aria-label={`إضافة حجز بتاريخ ${row.dateStr}`}
                            disabled={isReadOnly}
                            onClick={() => {
                              setPrefilledDate(row.dateStr);
                              setPrefilledPeriod(null);
                              setBackToSummaryDate(null);
                              setAddOpen(true);
                            }}
                          >
                            <Plus className="w-3 h-3" aria-hidden="true" /> إضافة حجز
                          </Button>
                        </div>
                        <div className="px-3 py-3 space-y-2 min-h-[3.25rem]">
                          {row.bookings.length === 0 ? (
                            <p className="text-xs text-muted-foreground">لا توجد حجوزات</p>
                          ) : row.bookings.map((b) => (
                            <button
                              key={`${row.dateStr}-${b.id}`}
                              type="button"
                              onClick={() => setSummaryDate(row.dateStr)}
                              className="w-full text-right rounded-xl border border-border bg-card hover:bg-muted/40 px-3 py-2 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-bold text-foreground" dir="ltr">{b.clientPhone || b.clientName}</span>
                                <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">{getBookingChaletName(b)}</span>
                              </div>
                              {b.clientPhone && b.clientName && b.clientName !== "عميل مؤقت" && (
                                <p className="text-xs text-muted-foreground/80 mt-0.5">{b.clientName}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {b.period === "morning" ? "🌅 صباحي" : b.period === "evening" ? "🌙 مسائي" : "☀️ يوم كامل"} · {toAr(b.durationDays ?? 1)} {b.durationDays === 1 ? "يوم" : "أيام"}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : availLoading || bookingsLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : dashCalType === "gregorian" ? (
              <GregorianMiniCalendar
                gregYear={calGregYear}
                gregMonth={calGregMonth}
                availability={calAvailability}
                bookings={calBookings}
                bufferPolicy={activeChalet ? {
                  enabled: bufferPolicyEnabled,
                  blockNextMorningFullDay: bufferBlockNextMorningFullDay,
                  blockNextMorningEvening: bufferBlockNextMorningEvening,
                  blockSameDayEvening: bufferBlockSameDayEvening,
                  exceptionWeekdays: bufferExceptionWeekdays,
                  exceptionDates: bufferExceptionDates,
                } : undefined}
                onCleaningBlockClick={toggleCleaningException}
                onDateClick={(ds) => {
                  const dayBkgs = calBookings.filter((b) => {
                    if (!b.bookingDate) return false;
                    const [by, bm, bd] = b.bookingDate.split("-").map(Number);
                    const endDate = new Date(by, bm - 1, bd + Math.max(1, b.durationDays ?? 1) - 1);
                    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
                    return ds >= b.bookingDate && ds <= endStr;
                  });
                  if (dayBkgs.length > 0) { setSummaryDate(ds); return; }
                  if (isReadOnly) { onBlockedEdit(); return; }
                  setBlockDateStr(ds);
                }}
              />
            ) : (
              <MiniCalendar
                hijriYear={calHijriYear}
                hijriMonth={calHijriMonth}
                availability={calAvailability}
                bookings={calBookings}
                bufferPolicy={activeChalet ? {
                  enabled: bufferPolicyEnabled,
                  blockNextMorningFullDay: bufferBlockNextMorningFullDay,
                  blockNextMorningEvening: bufferBlockNextMorningEvening,
                  blockSameDayEvening: bufferBlockSameDayEvening,
                  exceptionWeekdays: bufferExceptionWeekdays,
                  exceptionDates: bufferExceptionDates,
                } : undefined}
                onCleaningBlockClick={toggleCleaningException}
                onDateClick={(ds) => {
                  const dayBkgs = calBookings.filter((b) => {
                    if (!b.bookingDate) return false;
                    const [by, bm, bd] = b.bookingDate.split("-").map(Number);
                    const endDate = new Date(by, bm - 1, bd + Math.max(1, b.durationDays ?? 1) - 1);
                    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
                    return ds >= b.bookingDate && ds <= endStr;
                  });
                  if (showAllChalets) {
                    if (dayBkgs.length > 0) setSummaryDate(ds);
                    else {
                      if (isReadOnly) { onBlockedEdit(); return; }
                      setPrefilledDate(ds);
                      setAddOpen(true);
                    }
                    return;
                  }
                  if (!activeChaletId) return;
                  // Hard-block: maintenance/صيانة dates — show unblock confirmation dialog
                  const avEntry = availability.find((a) => a.dateStr === ds);
                  if (avEntry?.notes && dayBkgs.length === 0) {
                    if (isReadOnly) { onBlockedEdit(); return; }
                    if (avEntry.id) setChalUnblockDay({ ds, avId: avEntry.id });
                    return;
                  }
                  if (dayBkgs.length > 0) {
                    setSummaryDate(ds);
                  } else {
                    if (isReadOnly) { onBlockedEdit(); return; }
                    setPrefilledDate(ds);
                    setAddOpen(true);
                  }
                }}
              />
            )}

            {/* Legend — دليل الرموز والألوان */}
            <div className="mt-4 rounded-xl border border-border bg-muted/30 dark:bg-muted/10 px-3 py-2.5">
              <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">دليل الرموز والألوان</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center justify-center w-14 h-5 rounded bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 text-[10px] font-semibold">يوم كامل</span>
                  محجوز بالكامل
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center justify-center w-14 h-5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[10px] font-semibold">صباحي/مسائي</span>
                  محجوز جزئياً
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-4 h-5 rounded bg-muted inline-block" />
                  متاح
                </span>
                <span className="w-px h-4 bg-border inline-block self-center" />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 ring-1 ring-border shrink-0" />
                  🟢 حجز مؤكد وموقع
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-600 ring-1 ring-border shrink-0 animate-pulse" />
                  ⏳ بانتظار توقيع العقد
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-1 ring-border shrink-0" />
                  💰 متبقي مبلغ غير مسدد
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 ring-1 ring-border shrink-0" />
                  💵 نقدي لم يُودَع في البنك
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">انقر على أي تاريخ لضبط الفترات أو عرض تفاصيل الحجز.</p>

            {/* Check-in / Check-out times — per period */}
            {activeChaletId && (
              <>
              <div className="mt-5 pt-5 border-t border-border/50">
                <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  أوقات الدخول والخروج
                </h4>
                <p className="text-xs text-muted-foreground mb-3">حدد أوقات الدخول والخروج لكل فترة — تظهر للضيوف عند الاستعراض</p>

                {/* Morning */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-2">
                  <p className="text-xs font-medium">🌅 الفترة الصباحية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="time"
                        value={morningCheckIn}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="time"
                        value={morningCheckOut}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                {/* Evening */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-2">
                  <p className="text-xs font-medium">🌙 الفترة المسائية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="time"
                        value={eveningCheckIn}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="time"
                        value={eveningCheckOut}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                {/* Full day */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-3">
                  <p className="text-xs font-medium">☀️ يوم كامل</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="time"
                        value={fullDayCheckIn}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="time"
                        value={fullDayCheckOut}
                        readOnly
                        disabled
                        className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-xs cursor-not-allowed opacity-70"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span>✏️</span>
                  لتعديل الأوقات انتقل إلى <strong>تعديل بيانات العقار</strong>
                </p>
              </div>

              {/* ── Buffer / Cleaning Time Policy ── */}
              <div className="mt-5 pt-5 border-t border-border/50">
                <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <span>🧹</span>
                  سياسة وقت التجهيز والتنظيف
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  تُطبَّق هذه القواعد على نتائج البحث العام لمنع تعارض الحجوزات — يظل بإمكانك إضافة حجوزات يدوية في هذه الفترات عند الحاجة.
                </p>

                {/* Main toggle */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 px-3.5 py-3 mb-3">
                  <div>
                    <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">تفعيل سياسة وقت التجهيز والتنظيف</p>
                    <p className="text-[11px] text-teal-600 dark:text-teal-400 mt-0.5">يُظهر فترات التنظيف على تقويمك بعلامة 🧹</p>
                  </div>
                  <Switch checked={bufferPolicyEnabled} onCheckedChange={setBufferPolicyEnabled} />
                </div>

                {/* Sub-options */}
                {bufferPolicyEnabled && (
                  <div className="space-y-2 mb-3 pr-1">
                    {([
                      {
                        key: "blockNextMorningFullDay" as const,
                        state: bufferBlockNextMorningFullDay,
                        set: setBufferBlockNextMorningFullDay,
                        label: "إغلاق صباح اليوم التالي تلقائياً عند وجود حجز (يوم كامل)",
                      },
                      {
                        key: "blockNextMorningEvening" as const,
                        state: bufferBlockNextMorningEvening,
                        set: setBufferBlockNextMorningEvening,
                        label: "إغلاق صباح اليوم التالي تلقائياً عند وجود حجز (مسائي)",
                      },
                      {
                        key: "blockSameDayEvening" as const,
                        state: bufferBlockSameDayEvening,
                        set: setBufferBlockSameDayEvening,
                        label: "إغلاق مساء نفس اليوم تلقائياً عند وجود حجز (صباحي)",
                      },
                    ]).map(({ state, set, label }) => (
                      <label key={label} className="flex items-start gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={state}
                          onChange={(e) => set(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-border text-primary accent-primary shrink-0"
                        />
                        <span className="text-xs text-foreground leading-snug group-hover:text-primary transition-colors">{label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* ── Weekday Exceptions ── */}
                {bufferPolicyEnabled && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 mb-3">
                    <p className="text-[11px] font-semibold text-foreground mb-0.5">استثناءات أيام الأسبوع</p>
                    <p className="text-[10px] text-muted-foreground mb-2">الأيام التي يُعطَّل فيها وقت التنظيف التلقائي بالكامل</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([["الأحد",0],["الاثنين",1],["الثلاثاء",2],["الأربعاء",3],["الخميس",4],["الجمعة",5],["السبت",6]] as [string,number][]).map(([lbl,dow]) => (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => setBufferExceptionWeekdays((prev) =>
                            prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]
                          )}
                          className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            bufferExceptionWeekdays.includes(dow)
                              ? "bg-teal-600 border-teal-600 text-white"
                              : "bg-background border-border text-muted-foreground hover:border-teal-400"
                          }`}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Date-Specific Exceptions ── */}
                {bufferPolicyEnabled && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 mb-3">
                    <p className="text-[11px] font-semibold text-foreground mb-0.5">استثناءات تواريخ محددة</p>
                    <p className="text-[10px] text-muted-foreground mb-2">تحكم يدوي في فترات التنظيف · يمكنك أيضاً النقر على 🧹 في التقويم مباشرةً</p>
                    {/* Existing exceptions list */}
                    {bufferExceptionDates.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {bufferExceptionDates.map((ex, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-background border border-border/60 px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${ex.action === "disable" ? "bg-emerald-500" : "bg-orange-500"}`} />
                              <span className="text-[11px] font-medium">{ex.date}</span>
                              <span className="text-[10px] text-muted-foreground">{ex.periods.map((p) => p === "morning" ? "ص" : "م").join(" / ")}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${ex.action === "disable" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"}`}>
                                {ex.action === "disable" ? "متاح للحجز" : "مغلق للتنظيف"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setBufferExceptionDates((prev) => prev.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive transition-colors text-xs shrink-0"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add new exception */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <HijriDatePicker
                        value={newExDate}
                        onChange={setNewExDate}
                        className="flex-1 min-w-[160px]"
                        placeholder="اختر التاريخ الهجري"
                      />
                      <div className="flex gap-1">
                        {(["morning","evening"] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setNewExPeriods((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                            className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${newExPeriods.includes(p) ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"}`}
                          >{p === "morning" ? "صباح" : "مساء"}</button>
                        ))}
                      </div>
                      <select
                        value={newExAction}
                        onChange={(e) => setNewExAction(e.target.value as "disable" | "enable")}
                        className="bg-background border border-border rounded-lg px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-teal-400/50"
                      >
                        <option value="disable">متاح (تعطيل التنظيف)</option>
                        <option value="enable">مغلق (فرض التنظيف)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newExDate || newExPeriods.length === 0) return;
                          setBufferExceptionDates((prev) => {
                            const existing = prev.find((e) => e.date === newExDate && e.action === newExAction);
                            if (existing) {
                              return prev.map((e) =>
                                e.date === newExDate && e.action === newExAction
                                  ? { ...e, periods: [...new Set([...e.periods, ...newExPeriods])] }
                                  : e,
                              );
                            }
                            return [...prev, { date: newExDate, periods: [...newExPeriods], action: newExAction }];
                          });
                          setNewExDate("");
                          setNewExPeriods(["morning","evening"]);
                        }}
                        className="text-[10px] px-2.5 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
                      >+ إضافة</button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={saveBufferPolicy}
                    disabled={savingBuffer}
                    className="rounded-xl text-xs h-8 bg-teal-600 hover:bg-teal-700 text-white"
                  >
                    {savingBuffer ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                    حفظ السياسة
                  </Button>
                  {bufferSaved && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      تم الحفظ بنجاح
                    </span>
                  )}
                </div>
              </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Bookings List */}
      <div>
        <PropertyBookingPaymentFilters
          value={bookingPaymentFilter}
          onChange={(filter) => { setBookingPaymentFilter(filter); setBookingPage(0); }}
        />
        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={toAr(searchQuery)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
              setSearchQuery(raw);
            }}
            placeholder="بحث عن عميل أو رقم الجوال أو اسم العقار..."
            className="pr-9 rounded-xl text-sm"
            dir="rtl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <div className="mb-4 space-y-2">
          <h3 className="font-bold text-foreground">قائمة الحجوزات
            {(searchQuery || bookingPaymentFilter !== "all") && paymentFilteredBookings.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground mr-2">({toAr(paymentFilteredBookings.length)} نتيجة)</span>
            )}
          </h3>
        </div>
        {bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : paymentFilteredBookings.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-2">{bookingPaymentFilter !== "all" ? "لا توجد حجوزات تطابق حالة الدفع المحددة" : searchQuery ? "لا توجد حجوزات تطابق البحث" : "لا توجد حجوزات بعد"}</h3>
            <p className="text-sm text-muted-foreground mb-4">{bookingPaymentFilter !== "all" ? "اختر «الكل» أو غيّر حالة الدفع لعرض الحجوزات الأخرى" : searchQuery ? "جرّب البحث باسم العميل أو رقم الجوال أو اسم العقار" : "سجّل حجوزاتك من واتساب وانستقرام لمتابعة تقويمك"}</p>
            {!searchQuery && bookingPaymentFilter === "all" && (
              <Button size="sm" disabled={isReadOnly} onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } setAddOpen(true); }}>
                <Plus className="w-4 h-4 me-2" />
                إضافة أول حجز
              </Button>
            )}
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {(() => { let _pmk = ""; return pagedBookings.map((b) => {
              const _mk = getBookingMonthKey(b.bookingDate, bookingCalView);
              const _sd = _mk !== _pmk; _pmk = _mk;
              const tp = b.totalPrice ? Number(b.totalPrice) : null;
              const dp = b.depositPaid ? Number(b.depositPaid) : null;
              const ins = b.insuranceFee ? Number(b.insuranceFee) : null;
              const remaining = tp !== null && dp !== null ? Math.max(0, tp - dp) : null;
              const fmtAR = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
              const bookingChaletName = getBookingChaletName(b);

              const sendReceiptWhatsApp = () => {
                openReceiptWhatsApp(b);
              };

              const messageTemplates = getManualWhatsAppTemplates(b);

              const sendManualWhatsAppTemplate = (templateBody: string, reason = "") => {
                openManualWhatsAppTemplate(b, templateBody, reason);
              };

              return (
                <Fragment key={b.id}>
                {_sd && (
                  <div className="flex items-center gap-2 mt-2 mb-0.5">
                    <span className="text-[11px] font-bold text-primary/60 whitespace-nowrap">{getBookingMonthLabel(_mk, bookingCalView)}</span>
                    <div className="flex-1 h-px bg-border/60" />
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {b.source === "platform" ? <Globe className="w-4 h-4 text-primary" /> : <Phone className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                          <p className="font-semibold text-foreground leading-tight">{b.clientName}</p>
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-bold shrink-0">
                            <Home className="w-3 h-3" />
                            {bookingChaletName}
                          </span>
                          {b.clientPhone && (
                            <span className="text-sm font-semibold text-foreground shrink-0" dir="ltr">{toAr(b.clientPhone)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PropertyBookingArrivalBadge bookingDate={b.bookingDate} now={stayClock} />
                          {approvedCalendarSubmissionIds.has(Number(b.submissionId)) && (
                            <button
                              type="button"
                              data-testid={`show-booking-in-calendar-${b.id}`}
                              onClick={() => revealBookingInCalendar(b)}
                              className="text-xs font-semibold px-2 py-1 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              عرض في التقويم
                            </button>
                          )}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.source === "platform" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                            {b.source === "platform" ? "المنصة" : "خارجي"}
                          </span>
                          {b.balanceCollected && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ تم التحصيل</span>
                          )}
                          {ins && !b.insuranceRefunded && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              b.insuranceReceived
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}>🔒 التأمين: {b.insuranceReceived
                              ? ((b.insurancePaymentMethod ?? "transfer") === "cash"
                                  ? (() => {
                                      const iAmt = Math.round(Number(b.insuranceFee ?? 0));
                                      const iDep = perBookingInsuranceDeposited.get(b.id) ?? 0;
                                      const iRem = Math.max(0, iAmt - iDep);
                                      if (iDep > 0 && iRem > 0) return `تم إيداع ${toEasternArabic(iDep.toLocaleString("ar-SA"))} ر.س بالبنك (متبقي: ${toEasternArabic(iRem.toLocaleString("ar-SA"))} ر.س)`;
                                      if (iRem === 0 && iDep > 0) return "تم الإيداع بالبنك ✓";
                                      return "مستلم (كاش)";
                                    })()
                                  : "مستلم (تحويل بنكي)")
                              : "معلّق"}</span>
                          )}
                          {ins && !b.insuranceRefunded && !b.insuranceReceived && !isReadOnly && (
                            <button
                              type="button"
                              disabled={markInsuranceReceived.isPending && markInsuranceReceived.variables === b.id}
                              onClick={(e) => { e.stopPropagation(); setConfirmInsuranceBookingId(b.id); }}
                              className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 transition-colors disabled:opacity-50 border border-green-300 dark:border-green-700"
                            >
                              تسجيل استلام
                            </button>
                          )}
                          {ins && b.insuranceReceived && (b.insurancePaymentMethod ?? "transfer") === "cash" && !b.insuranceRefunded && !isReadOnly && (() => {
                            const iAmt = Math.round(Number(b.insuranceFee ?? 0));
                            const iDep = perBookingInsuranceDeposited.get(b.id) ?? 0;
                            const iRem = Math.max(0, iAmt - iDep);
                            if (iRem <= 0) return null;
                            return (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openBookingDepositDialog(b.id, iRem, iAmt, b.submissionId, `إيداع تأمين كاش — ${b.clientName}`); }}
                                className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 transition-colors border border-blue-300 dark:border-blue-700"
                              >
                                🏦 {iDep > 0 ? `إيداع المتبقي (${toEasternArabic(iRem.toLocaleString("ar-SA"))} ر.س)` : "إيداع التأمين"}
                              </button>
                            );
                          })()}
                          {b.insuranceRefunded && !b.insuranceDeducted && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">↩ تم إعادة التأمين</span>
                          )}
                          {b.insuranceRefunded && b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">✂️ تلفيات: {fmtAR(Number(b.insuranceDeducted))} ر.س</span>
                          )}
                          {b.isRescheduled && (
                            <span
                              title={b.originalDate ? `التاريخ الأصلي: ${formatDualDate(b.originalDate).hijri}${b.rescheduleReason ? ` • السبب: ${b.rescheduleReason}` : ""}` : "تم إعادة جدولة هذا الحجز"}
                              className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 cursor-help"
                            >
                              🔄 مُعاد جدولته
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDualDate(b.bookingDate).hijri} [{formatDualDate(b.bookingDate).gregorian}]</span>
                        <span>{toAr(b.durationDays)} {b.durationDays === 1 ? "يوم" : "أيام"}</span>
                        {b.period && (
                          <span className="font-medium text-primary">
                            {{ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period as string] ?? b.period}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteDialogBooking(b)}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-destructive/10"
                      aria-label="إلغاء الحجز"
                      title="إلغاء الحجز"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Multi-day duration summary */}
                  {(b.durationDays ?? 1) > 1 && (() => {
                    const endD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + ((b.durationDays ?? 1) - 1) * 86400000);
                    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
                    const startHijri = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                    const startGreg  = formatDualDate(b.bookingDate).gregorian;
                    const endHijri   = formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "");
                    const endGreg    = formatDualDate(endStr).gregorian;
                    return (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary font-medium leading-relaxed space-y-0.5">
                        <p>لمدة {toAr(b.durationDays)} أيام</p>
                        <p className="text-primary/80">من: {startHijri} هـ <span className="text-primary/50 font-normal">({startGreg})</span></p>
                        <p className="text-primary/80">إلى: {endHijri} هـ <span className="text-primary/50 font-normal">({endGreg})</span></p>
                      </div>
                    );
                  })()}

                  {/* Financial summary */}
                  {tp !== null && (() => {
                    const listAddons = (b.bookedAddons ?? []) as Array<{ id: number; name: string; price: string; unit: string }>;
                    const listAddonsTotal = listAddons.filter(a => a.unit !== "خدمة مجانية" && Number(a.price) > 0).reduce((sum, a) => sum + Math.round(Number(a.price)), 0);
                    const listBaseRent = tp - listAddonsTotal;
                    return (
                      <div className="space-y-2">
                        {listAddons.length > 0 && (
                          <div className="bg-muted/30 rounded-lg px-3 py-2 space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">قيمة الإيجار الأساسية</span>
                              <span className="font-semibold text-foreground">{fmtAR(listBaseRent)} ر.س</span>
                            </div>
                            {listAddons.map(a => (
                              <div key={a.id} className="flex justify-between pr-2 text-muted-foreground/80">
                                <span>↪ {a.name}</span>
                                <span>{a.unit === "خدمة مجانية" || Number(a.price) === 0 ? "مجاني" : `${fmtAR(Math.round(Number(a.price)))} ر.س`}</span>
                              </div>
                            ))}
                            {listAddonsTotal > 0 && (
                              <div className="flex justify-between text-muted-foreground">
                                <span>إجمالي الخدمات</span>
                                <span className="font-semibold text-primary">+{fmtAR(listAddonsTotal)} ر.س</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-border/50 pt-1">
                              <span className="font-semibold text-foreground">الإجمالي الكلي</span>
                              <span className="font-bold text-foreground">{fmtAR(tp)} ر.س</span>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-2.5 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground">{listAddons.length > 0 ? "الإجمالي الكلي" : "الإجمالي"}</p>
                            <p className="text-xs font-bold text-foreground">{fmtAR(tp)} ر.س</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">{tp !== null && dp !== null && dp === tp ? "كامل المبلغ" : "العربون"}</p>
                            <p className="text-xs font-bold text-green-600 dark:text-green-400">{fmtAR(dp ?? 0)} ر.س</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground">المتبقي</p>
                            <p className={`text-xs font-bold ${b.balanceCollected ? "text-green-600 dark:text-green-400 line-through" : "text-amber-600 dark:text-amber-400"}`}>
                              {fmtAR(remaining ?? 0)} ر.س
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {ins !== null && (
                    <div className={`rounded-lg border px-3 py-2 ${b.insuranceRefunded ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700" : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${b.insuranceRefunded ? "text-slate-500" : "text-orange-700 dark:text-orange-400"}`}>🔒 مبلغ التأمين</span>
                        <span className={`text-xs font-bold ${b.insuranceRefunded ? "text-slate-400 line-through" : "text-orange-700 dark:text-orange-400"}`}>
                          {fmtAR(ins)} ر.س
                        </span>
                      </div>
                      {b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (() => {
                        const proofImgs: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                        const fullU = (u: string) => u.startsWith("http") ? u : `${window.location.origin}${base}${u}`;
                        return (
                          <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-0.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-red-600">✂️ خصم تلفيات</span>
                              <span className="font-bold text-red-700">{fmtAR(Number(b.insuranceDeducted))} ر.س</span>
                            </div>
                            {b.insuranceDeductReason && (
                              <div className="text-[10px] text-muted-foreground">السبب: {b.insuranceDeductReason}</div>
                            )}
                            <div className="flex justify-between text-[11px]">
                              <span className="text-green-600">↩ مُرجَع للعميل</span>
                              <span className="font-bold text-green-700">{fmtAR(Math.max(0, ins - Number(b.insuranceDeducted)))} ر.س</span>
                            </div>
                            {/* Proof image thumbnails */}
                            {proofImgs.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1">
                                <div className="grid grid-cols-3 gap-1">
                                  {proofImgs.slice(0, 3).map((u, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setProofTarget(b)}
                                      className="relative rounded overflow-hidden aspect-square bg-muted hover:opacity-80 transition"
                                    >
                                      <img src={fullU(u)} alt={`إثبات ${i+1}`} className="w-full h-full object-cover" />
                                      {i === 2 && proofImgs.length > 3 && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">
                                          +{toAr(proofImgs.length - 3)}
                                        </div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setProofTarget(b)}
                                  className="text-[10px] text-blue-600 underline text-right mt-0.5"
                                >
                                  📸 عرض الإثبات ({toAr(proofImgs.length)} صورة)
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {b.notes && <p className="text-xs text-muted-foreground border-t border-border pt-2">{b.notes}</p>}

                  {/* ── Payment Status Section ── */}
                  {(() => {
                    const dep = Number(b.depositPaid ?? 0);
                    const tp = b.totalPrice != null && Number(b.totalPrice) > 0 ? Number(b.totalPrice) : dep;
                    const bal = b.balanceCollected ? Math.max(0, tp - dep) : 0;
                    const undepCashInst = (paymentsByBooking[b.id] ?? []).filter(i => i.method === "cash" && !i.cashDeposited).reduce((s, i) => s + Number(i.amount), 0);
                    const bookingMainCash = b.paymentMethod === "cash" ? dep + bal : 0;
                    const totalCashB = bookingMainCash + undepCashInst;
                    const logDep = perBookingDeposited.get(b.id) ?? 0;
                    const effectiveDep = (b.cashDeposited && logDep === 0) ? bookingMainCash : logDep;
                    const remaining = Math.max(0, totalCashB - effectiveDep);
                    const fullyDep = remaining === 0;
                    if (totalCashB <= 0 && !b.cashDeposited) return null;
                    return (
                    <div className={`rounded-lg border p-3.5 space-y-2.5 ${fullyDep ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700"}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{fullyDep ? "🏦" : "💵"}</span>
                          <div>
                            <p className={`text-xs font-bold ${fullyDep ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                              {fullyDep ? "تم الإيداع في البنك ✓" : effectiveDep > 0 ? `متبقي كاش لم يُودَع: ${toEasternArabic(remaining.toLocaleString("ar-SA"))} ر.س` : "نقدي — لم يُودَع بعد"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {fullyDep ? "المبلغ مُحوَّل للبنك ✓" : effectiveDep > 0 ? `أُودِع حتى الآن: ${toEasternArabic(effectiveDep.toLocaleString("ar-SA"))} ر.س` : "يظهر في السيولة اليدوية"}
                            </p>
                          </div>
                        </div>
                        {!fullyDep && remaining > 0 && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => openBookingDepositDialog(b.id, remaining, totalCashB, b.submissionId, `إيداع نقدي — ${b.clientName}`)}
                            className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            {effectiveDep > 0 ? "إيداع المتبقي" : "تسجيل إيداع بالبنك"}
                          </button>
                        )}
                      </div>
                      {!fullyDep && remaining > 0 && !isReadOnly && (
                        <div className="border-t border-amber-200 dark:border-amber-800 pt-2">
                          <input
                            ref={calReceiptRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setCalReceiptUploading(true);
                              try {
                                const url = await uploadFile(file);
                                if (url) setCalReceiptUrl(url);
                              } finally { setCalReceiptUploading(false); e.target.value = ""; }
                            }}
                          />
                          {calReceiptUrl ? (
                            <div className="flex items-center gap-2">
                              <img src={calReceiptUrl} alt="إيصال" className="h-10 w-10 rounded object-cover border" />
                              <p className="text-[11px] text-green-600 flex-1">تم رفع الإيصال ✓</p>
                              <button type="button" onClick={() => setCalReceiptUrl(null)} className="text-[10px] text-destructive underline">إزالة</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={calReceiptUploading}
                              onClick={() => calReceiptRef.current?.click()}
                              className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 hover:underline"
                            >
                              {calReceiptUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "📎"}
                              إرفاق صورة الإيصال (اختياري)
                            </button>
                          )}
                        </div>
                      )}
                      {/* Receipt viewer */}
                      {b.paymentReceiptUrl && (
                        <div className="border-t border-green-200 dark:border-green-800 pt-2">
                          <p className="text-[10px] text-muted-foreground mb-1.5">إيصال الإيداع:</p>
                          <a href={b.paymentReceiptUrl} target="_blank" rel="noreferrer" className="block w-fit">
                            <img src={b.paymentReceiptUrl} alt="إيصال" className="h-16 w-16 rounded-lg object-cover border hover:opacity-80 transition" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                  })()}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40 mt-1">
                    {/* Contract status actions */}
                    {b.contractSigned ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setContractPreviewBooking(b)}
                          className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                        >
                          ✅ تم التوقيع
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescheduleBooking(b)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
                        >
                          🔄 إعادة الجدولة
                        </button>
                      </>
                    ) : !b.cancelledAt && (() => {
                      const _cuB = publicContractUrl(b.id, "property", BASE);
                      const _dgB = (b.clientPhone ?? "").replace(/\D/g, "");
                      const _wpB = _dgB.startsWith("966") ? _dgB : _dgB.startsWith("0") ? "966" + _dgB.slice(1) : _dgB ? "966" + _dgB : "";
                      const _wmB = buildContractWaMsg(b.bookingDate, b.submissionId, ownerChalets, _cuB, b.period, returningPhonesSet.has(b.clientPhone ?? ""), b.clientName);
                      return (
                        <>
                          <span className={`flex items-center whitespace-nowrap text-xs font-bold px-2.5 py-1 rounded-lg border ${CONTRACT_STATUS_STYLES.pending}`}>
                            ⏳ بانتظار التوقيع
                          </span>
                          <a
                            href={_wpB ? `https://wa.me/${_wpB}?text=${_wmB}` : `https://wa.me/?text=${_wmB}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                          >
                            💬 واتساب العقد
                          </a>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(_cuB).then(() => toast({ title: "تم النسخ ✓", description: "رابط العقد في الحافظة" }))}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            📋 نسخ الرابط
                          </button>
                          <button
                            type="button"
                            onClick={() => setRescheduleBooking(b)}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
                          >
                            🔄 إعادة الجدولة
                          </button>
                        </>
                      );
                    })()}
                    <div className="relative">
                      <button
                        onClick={() => setOpenMessageMenuId(openMessageMenuId === b.id ? null : b.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        إرسال عبر الواتساب
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {openMessageMenuId === b.id && (
                        <div className="absolute right-0 top-full mt-1 z-20 min-w-56 rounded-xl border border-border bg-card shadow-lg p-1.5">
                          {messageTemplates.length > 0 ? (
                            messageTemplates.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => sendManualWhatsAppTemplate(tpl.body)}
                                className="w-full text-right px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                {tpl.title}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-2 text-xs text-muted-foreground">أضف قالباً من إعدادات الرسائل</p>
                          )}
                          <div className="h-px bg-border my-1" />
                          <button
                            type="button"
                            onClick={sendReceiptWhatsApp}
                            className="w-full text-right px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted transition-colors"
                          >
                            إيصال واتساب مفصل
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Request Review */}
                    {activeChaletId && (
                      b.ratedAt ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          تم التقييم ✅
                        </span>
                      ) : (
                        <button
                          disabled={!bookingIsComplete(b) || reviewSentIds.has(b.id) || reviewPendingId === b.id}
                          title={!bookingIsComplete(b) ? REVIEW_NOT_READY_MESSAGE : undefined}
                          onClick={() => sendReviewRequest(b)}
                          className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg px-2.5 py-1 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
                        >
                          {reviewPendingId === b.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : reviewSentIds.has(b.id) ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Star className="w-3.5 h-3.5" />
                          )}
                          {reviewSentIds.has(b.id) ? "تم الإرسال ✓" : "إرسال رابط التقييم"}
                        </button>
                      )
                    )}
                    {/* Installment payments — list */}
                    {(() => {
                      if (tp === null || dp === null || tp <= dp) return null;
                      const bkPmtsL = paymentsByBooking[b.id] ?? [];
                      const totalPaidL = bkPmtsL.reduce((s, p) => s + Number(p.amount), 0);
                      const remDynL = Math.max(0, tp - dp - totalPaidL);
                      const isFullyPaidL = b.balanceCollected || remDynL <= 0;
                      return (
                        <>
                          {bkPmtsL.length > 0 && (
                            <div className="w-full border border-green-200 dark:border-green-800 rounded-xl p-3.5 space-y-2 bg-green-50 dark:bg-green-900/10">
                              <p className="text-xs font-bold text-green-700 dark:text-green-400">💰 الدفعات المحصّلة:</p>
                              {bkPmtsL.map(p => (
                                <div key={p.id} className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-muted-foreground leading-tight">
                                    <span className="block">{formatDualDate(p.paymentDate).hijri.replace(/\s*هـ\s*$/, "")}</span>
                                    <span className="block text-[10px] opacity-60">({formatDualDate(p.paymentDate).gregorian})</span>
                                  </span>
                                  <span className="text-xs font-bold text-green-700 dark:text-green-400">{toArN(Math.round(Number(p.amount)))} ر.س</span>
                                  <span className="text-xs">{p.method === "transfer" ? "🏦" : p.method === "pos" ? "💳" : "💵"}</span>
                                  {p.receiptUrl && (<button type="button" onClick={() => setReceiptLightbox(p.receiptUrl!)} className="text-xs text-blue-600 hover:underline">🧾 إيصال</button>)}
                                  {!isReadOnly && (<button type="button" onClick={() => deleteInstallmentPayment(b.id, p.id)} className="text-xs text-destructive hover:underline mr-auto">✕ حذف</button>)}
                                </div>
                              ))}
                              {isFullyPaidL ? (<p className="text-xs font-bold text-green-600">✅ اكتمل السداد</p>) : (<p className="text-xs text-amber-600">المتبقي: {toArN(Math.round(remDynL))} ر.س</p>)}
                            </div>
                          )}
                          {!isFullyPaidL && !isReadOnly && (
                            calPayTarget === b.id ? (
                              <div className="w-full border border-blue-200 dark:border-blue-800 rounded-xl p-3 space-y-2 bg-blue-50 dark:bg-blue-900/10">
                                <p className="text-xs font-bold text-blue-700 dark:text-blue-400">إضافة دفعة — المتبقي {toArN(Math.round(remDynL))} ر.س</p>
                                <div className="flex gap-2">
                                  <input type="text" inputMode="decimal" value={toArN(calPayAmt)} onChange={e => setCalPayAmt(fromArN(e.target.value))} placeholder="المبلغ" className="flex-1 text-xs rounded-lg border border-border bg-background px-2.5 py-2 text-foreground min-w-0 text-center" />
                                  <DualCalendarPicker
                                    value={calPayDate}
                                    onChange={setCalPayDate}
                                    mode="gregorian"
                                    compact
                                    className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground"
                                  />
                                </div>
                                <div className="flex gap-1.5">
                                  <button type="button" onClick={() => { setCalPayMethod("cash"); setCalPayDeposited(false); }} className={`flex-1 text-xs font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "cash" ? "border-amber-500 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}>💵 كاش</button>
                                  <button type="button" onClick={() => { setCalPayMethod("transfer"); setCalPayDeposited(true); }} className={`flex-1 text-xs font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "transfer" ? "border-blue-500 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" : "border-border text-muted-foreground"}`}>🏦 تحويل</button>
                                  <button type="button" onClick={() => { setCalPayMethod("pos"); setCalPayDeposited(true); }} className={`flex-1 text-xs font-bold rounded-lg py-1.5 border-2 transition-colors ${calPayMethod === "pos" ? "border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300" : "border-border text-muted-foreground"}`}>💳 شبكة</button>
                                </div>
                                {calPayMethod === "cash" && (
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setCalPayDeposited(false)} className={`flex-1 text-[11px] font-bold rounded-lg py-1 border-2 transition-colors ${!calPayDeposited ? "border-amber-500 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground"}`}>💵 سيولة</button>
                                    <button type="button" onClick={() => setCalPayDeposited(true)} className={`flex-1 text-[11px] font-bold rounded-lg py-1 border-2 transition-colors ${calPayDeposited ? "border-green-500 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" : "border-border text-muted-foreground"}`}>🏦 أُودع</button>
                                  </div>
                                )}
                                <input ref={calPayReceiptRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setCalPayReceiptUploading(true); try { const url = await uploadFile(file); if (url) setCalPayReceiptUrl(url); } finally { setCalPayReceiptUploading(false); e.target.value = ""; } }} />
                                {(calPayMethod === "transfer" || calPayMethod === "pos") && (
                                  calPayReceiptUrl ? (
                                    <div className="flex items-center gap-2">
                                      <button type="button" onClick={() => setReceiptLightbox(calPayReceiptUrl)}><img src={calPayReceiptUrl} alt="إيصال" className="h-9 w-9 rounded object-cover border hover:opacity-80 transition" /></button>
                                      <p className="text-xs text-green-600 flex-1">إيصال مرفق ✓</p>
                                      <button type="button" onClick={() => setCalPayReceiptUrl(null)} className="text-xs text-destructive underline">إزالة</button>
                                    </div>
                                  ) : (
                                    <button type="button" disabled={calPayReceiptUploading} onClick={() => calPayReceiptRef.current?.click()} className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 hover:underline">
                                      {calPayReceiptUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📎"} إرفاق إيصال (اختياري)
                                    </button>
                                  )
                                )}
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => { setCalPayTarget(null); setCalPayAmt(""); setCalPayReceiptUrl(null); }} className="flex-1 text-xs rounded-lg py-1.5 border border-border text-muted-foreground hover:bg-muted transition-colors">إلغاء</button>
                                  <button type="button" onClick={() => addInstallmentPayment(b.id)} disabled={calPaySaving} className="flex-1 text-xs font-bold rounded-lg py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1 transition-colors">
                                    {calPaySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} تأكيد الدفعة
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setCalPayTarget(b.id); setCalPayAmt(String(remDynL)); setCalPayDate(new Date().toISOString().slice(0, 10)); setCalPayMethod("cash"); setCalPayDeposited(false); }}
                                className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                + إضافة دفعة ({toArN(Math.round(remDynL))} ر.س)
                              </button>
                            )
                          )}
                        </>
                      );
                    })()}
                    {/* Manage insurance */}
                    {ins && !b.insuranceRefunded && (
                      <button
                        onClick={() => setInsuranceTarget(b)}
                        className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-2.5 py-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                      >
                        🔒 إدارة التأمين
                      </button>
                    )}
                    {/* View damage proof */}
                    {b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (() => {
                      const imgs: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                      return imgs.length > 0 ? (
                        <button
                          onClick={() => setProofTarget(b)}
                          className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-2.5 py-1 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          📸 عرض الإثبات
                        </button>
                      ) : null;
                    })()}
                  </div>
                </motion.div>
                </Fragment>
              );
            }); })()}
          </div>
          {paymentFilteredBookings.length > BOOKINGS_PER_PAGE && (
            <div className="flex items-center justify-between pt-3 mt-1" dir="rtl">
              <button
                onClick={() => setBookingPage(p => Math.max(0, p - 1))}
                disabled={bookingPage === 0}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-xl border border-border bg-background hover:bg-muted/50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                → السابق
              </button>
              <span className="text-xs font-medium text-muted-foreground" dir="rtl">
                صفحة {toAr(bookingPage + 1)} من {toAr(totalBookingPages)}
                <span className="text-muted-foreground/60 mr-1">({toAr(paymentFilteredBookings.length)} حجز)</span>
              </span>
              <button
                onClick={() => setBookingPage(p => Math.min(totalBookingPages - 1, p + 1))}
                disabled={bookingPage >= totalBookingPages - 1}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-xl border border-border bg-background hover:bg-muted/50 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                التالي ←
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {/* Archive Section */}
      <div ref={archiveRef} className="bg-card border border-border rounded-2xl overflow-hidden scroll-mt-24" data-testid="booking-archive">
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            الأرشيف
          </span>
          {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showArchive && (
          <div className="border-t border-border">
            {/* Archive Tab Switcher */}
            <div className="flex gap-1 px-5 pt-4 pb-0">
              <button
                onClick={() => selectArchiveTab("cancelled")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${archiveTab === "cancelled" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                الملغاة
              </button>
              <button
                onClick={() => selectArchiveTab("rescheduled")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${archiveTab === "rescheduled" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                إعادة الجدولة
              </button>
              <button
                onClick={() => selectArchiveTab("completed")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${archiveTab === "completed" ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                المكتملة
              </button>
            </div>

            <BookingArchiveControls
              filters={archiveFilters}
              onChange={updateArchiveFilters}
              years={archiveCalendarYears(archiveData?.years ?? [], archiveCalendar, stayClock)}
              total={archiveData?.total ?? 0}
              loading={archiveBusy}
              exporting={archiveExporting}
              onExport={exportArchive}
              calendarMode={archiveCalendar}
              onCalendarModeChange={calendar => {
                setArchiveCalendar(calendar);
                setArchiveFilters(previous => ({ ...previous, year: previous.period === "year" ? String(archiveCalendarYear(calendar)) : "" }));
                setArchivePage(1);
              }}
            />
            <p className="px-5 pt-2 text-[11px] text-muted-foreground">
              الفلترة حسب تاريخ بداية الإقامة، وللحجوزات المعاد جدولتها حسب الموعد الجديد.
            </p>
            {!archiveInvalid && archiveQuery.isPending && (
              <p role="status" className="px-5 py-6 text-sm text-center text-muted-foreground">جارٍ تحميل الأرشيف...</p>
            )}
            {!archiveInvalid && archiveQuery.isError && (
              <div role="alert" className="p-5 text-center space-y-2">
                <p className="text-sm text-destructive">تعذّر تحميل الأرشيف. لم يتم عرض نتائج غير مكتملة.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => archiveQuery.refetch()}>إعادة المحاولة</Button>
              </div>
            )}
            {!archiveInvalid && !archiveQuery.isPending && !archiveQuery.isError && (<>
            {/* Cancelled Tab */}
            {archiveTab === "cancelled" && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                {(() => {
                  const q = archiveFilters.search.trim();
                  const filtered = cancelledBookings;
                  if (filtered.length === 0) return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {q || archiveFilters.period !== "all" ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد حجوزات ملغاة"}
                    </p>
                  );
                  let _cPmk = "";
                  return filtered.map((b) => {
                  const _cMk = getBookingMonthKey(b.bookingDate, bookingCalView);
                  const _cSd = _cMk !== _cPmk; _cPmk = _cMk;
                  const dur = b.durationDays ?? 1;
                  const endD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + (dur - 1) * 86400000);
                  const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
                  const startHijri = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                  const startGreg  = formatDualDate(b.bookingDate).gregorian;
                  const endHijri   = dur > 1 ? formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "") : null;
                  const endGreg    = dur > 1 ? formatDualDate(endStr).gregorian : null;
                  const cancelledDateRaw = b.cancelledAt ? new Date(b.cancelledAt) : null;
                  const cancelledDateStr = cancelledDateRaw ? (() => {
                    const y = cancelledDateRaw.getFullYear();
                    const m = cancelledDateRaw.getMonth() + 1;
                    const d = cancelledDateRaw.getDate();
                    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const h = formatDualDate(iso).hijri.replace(/\s*هـ\s*$/, "");
                    const g = formatDualDate(iso).gregorian;
                    return `${h} هـ (${g})`;
                  })() : "";
                  const periodLabel = b.period ? ({ morning: "صباحي", evening: "مسائي", full_day: "يوم كامل" }[b.period] ?? b.period) : "";
                  return (
                    <Fragment key={b.id}>
                    {_cSd && (
                      <div className="flex items-center gap-2 mt-1 mb-0.5">
                        <span className="text-[11px] font-bold text-muted-foreground/70 whitespace-nowrap">{getBookingMonthLabel(_cMk, bookingCalView)}</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    <div className="bg-muted/30 border border-dashed border-destructive/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground line-through decoration-destructive/50">{b.clientName}</p>
                          <p className="text-[11px] text-muted-foreground">رقم الحجز: <bdi>{toAr(b.id)}</bdi></p>
                          {dur === 1 ? (
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                              {startHijri} هـ <span className="opacity-75">({startGreg})</span>{periodLabel ? ` · ${periodLabel}` : ""}
                            </p>
                          ) : (
                            <div className="text-xs text-zinc-700 dark:text-zinc-300 space-y-0.5">
                              <p className="font-semibold">لمدة {toAr(dur)} أيام{periodLabel ? ` · ${periodLabel}` : ""}</p>
                              <p className="font-medium">من: {startHijri} هـ <span className="opacity-75">({startGreg})</span></p>
                              <p className="font-medium">إلى: {endHijri} هـ <span className="opacity-75">({endGreg})</span></p>
                            </div>
                          )}
                          {b.cancelReason && (
                            <p className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded px-2 py-1.5 leading-relaxed break-words font-medium">
                              <span className="font-bold">سبب الإلغاء:</span> {b.cancelReason}
                            </p>
                          )}
                          {cancelledDateStr && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">أُلغي في {cancelledDateStr}</p>
                          )}
                        </div>
                        <div className="flex flex-row items-center gap-2 shrink-0">
                          {b.clientPhone && (
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1" dir="ltr">
                              <span>📞</span> {toAr(b.clientPhone)}
                            </p>
                          )}
                          {messageSettings.waEnabled && b.clientPhone && (
                            <button
                              onClick={() => openManualWhatsAppTemplate(b, messageSettings.cancellationTemplate, b.cancelReason || "")}
                              className="flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg px-2.5 py-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors whitespace-nowrap"
                            >
                              <MessageSquare className="w-3 h-3" />
                              إشعار
                            </button>
                          )}
                          <button
                            onClick={() => restoreBooking.mutate(b.id)}
                            disabled={restoreBooking.isPending}
                            className="flex items-center gap-1 text-xs font-semibold text-primary border border-primary/30 rounded-lg px-2.5 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            <RotateCcw className="w-3 h-3" />
                            استعادة
                          </button>
                        </div>
                      </div>
                    </div>
                    </Fragment>
                  );
                  });
                })()}
              </div>
            )}

            {/* Rescheduled Tab */}
            {archiveTab === "rescheduled" && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                {(() => {
                  const q = archiveFilters.search.trim();
                  const filteredLog = rescheduleLog;
                  if (filteredLog.length === 0) return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {q || archiveFilters.period !== "all" ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد سجلات إعادة جدولة"}
                    </p>
                  );
                  let _rPmk = "";
                  return filteredLog.map((log) => {
                  const _rMk = getBookingMonthKey(log.newDate, bookingCalView);
                  const _rSd = _rMk !== _rPmk; _rPmk = _rMk;
                  const oldHijri = formatDualDate(log.oldDate).hijri.replace(/\s*هـ\s*$/, "");
                  const newHijri = formatDualDate(log.newDate).hijri.replace(/\s*هـ\s*$/, "");
                  const oldGreg  = formatDualDate(log.oldDate).gregorian;
                  const newGreg  = formatDualDate(log.newDate).gregorian;
                  const pLabel   = (p?: string | null) => p ? ({ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[p] ?? p) : "";
                  const logDateRaw = new Date(log.rescheduledAt);
                  const logIso = `${logDateRaw.getFullYear()}-${String(logDateRaw.getMonth() + 1).padStart(2, "0")}-${String(logDateRaw.getDate()).padStart(2, "0")}`;
                  const logHijri = formatDualDate(logIso).hijri.replace(/\s*هـ\s*$/, "");
                  const logGreg  = formatDualDate(logIso).gregorian;
                  // Compute end dates for multi-day ranges
                  const oldEndD = new Date(new Date(log.oldDate + "T00:00:00").getTime() + (log.oldDuration - 1) * 86400000);
                  const oldEndStr = `${oldEndD.getFullYear()}-${String(oldEndD.getMonth() + 1).padStart(2, "0")}-${String(oldEndD.getDate()).padStart(2, "0")}`;
                  const newEndD = new Date(new Date(log.newDate + "T00:00:00").getTime() + (log.newDuration - 1) * 86400000);
                  const newEndStr = `${newEndD.getFullYear()}-${String(newEndD.getMonth() + 1).padStart(2, "0")}-${String(newEndD.getDate()).padStart(2, "0")}`;
                  return (
                    <Fragment key={log.id}>
                    {_rSd && (
                      <div className="flex items-center gap-2 mt-1 mb-0.5">
                        <span className="text-[11px] font-bold text-muted-foreground/70 whitespace-nowrap">{getBookingMonthLabel(_rMk, bookingCalView)}</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2.5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">{log.clientName}</p>
                          <p className="text-[11px] text-muted-foreground">رقم الحجز: <bdi>{toAr(log.bookingId)}</bdi></p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {log.clientPhone && (
                              <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium" dir="ltr">📞 {toAr(log.clientPhone)}</p>
                            )}
                            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium">
                              <span className="font-semibold">أُعيدت جدولته في:</span> {logHijri} هـ <span className="opacity-80">({logGreg})</span>
                            </p>
                          </div>
                        </div>
                        {messageSettings.waEnabled && log.clientPhone && (
                          <button
                            onClick={() => openRescheduleLogWhatsApp(log)}
                            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg px-2.5 py-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors whitespace-nowrap"
                          >
                            <MessageSquare className="w-3 h-3" />
                            إشعار
                          </button>
                        )}
                      </div>
                      {/* Old → New date cards */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/50 rounded-lg p-2.5 space-y-1">
                          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">التاريخ القديم</p>
                          <p className="font-bold text-zinc-800 dark:text-zinc-200">{oldHijri} هـ</p>
                          <p className="text-zinc-600 dark:text-zinc-400 font-medium">{oldGreg}</p>
                          {log.oldDuration > 1 && (
                            <>
                              <p className="text-zinc-600 dark:text-zinc-400 font-medium">إلى: {formatDualDate(oldEndStr).hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                              <p className="text-zinc-500 dark:text-zinc-500">{formatDualDate(oldEndStr).gregorian}</p>
                            </>
                          )}
                          <p className="text-zinc-600 dark:text-zinc-400 font-medium">{toAr(log.oldDuration)} {log.oldDuration === 1 ? "يوم" : "أيام"}{pLabel(log.oldPeriod) ? ` · ${pLabel(log.oldPeriod)}` : ""}</p>
                        </div>
                        <div className="bg-primary/10 rounded-lg p-2.5 space-y-1">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wide">التاريخ الجديد</p>
                          <p className="font-bold text-zinc-800 dark:text-zinc-200">{newHijri} هـ</p>
                          <p className="text-zinc-600 dark:text-zinc-400 font-medium">{newGreg}</p>
                          {log.newDuration > 1 && (
                            <>
                              <p className="text-zinc-600 dark:text-zinc-400 font-medium">إلى: {formatDualDate(newEndStr).hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                              <p className="text-zinc-500 dark:text-zinc-500">{formatDualDate(newEndStr).gregorian}</p>
                            </>
                          )}
                          <p className="text-zinc-600 dark:text-zinc-400 font-medium">{toAr(log.newDuration)} {log.newDuration === 1 ? "يوم" : "أيام"}{pLabel(log.newPeriod) ? ` · ${pLabel(log.newPeriod)}` : ""}</p>
                        </div>
                      </div>
                      {/* Reason — fully visible, no truncation */}
                      {log.reason && (
                        <div className="bg-background border border-primary/15 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1">سبب التعديل</p>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed break-words">{log.reason}</p>
                        </div>
                      )}
                    </div>
                    </Fragment>
                  );
                  });
                })()}
              </div>
            )}

            {/* Completed Tab */}
            {archiveTab === "completed" && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                {completedBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {archiveFilters.search || archiveFilters.period !== "all" ? "لا توجد نتائج مطابقة للفلاتر" : "لا توجد حجوزات مكتملة بعد"}
                  </p>
                ) : (() => { let _comPmk = ""; return completedBookings.map((b) => {
                  const _comMk = getBookingMonthKey(b.bookingDate, bookingCalView);
                  const _comSd = _comMk !== _comPmk; _comPmk = _comMk;
                  const bookingChaletName = getBookingChaletName(b);
                  const dur = b.durationDays ?? 1;
                  const hijriDate = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                  const gregDate  = formatDualDate(b.bookingDate).gregorian;
                  const periodLabel = b.period ? ({ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period] ?? b.period) : "";
                  const tp = b.totalPrice ? Number(b.totalPrice) : null;
                  return (
                    <Fragment key={b.id}>
                    {_comSd && (
                      <div className="flex items-center gap-2 mt-1 mb-0.5">
                        <span className="text-[11px] font-bold text-muted-foreground/70 whitespace-nowrap">{getBookingMonthLabel(_comMk, bookingCalView)}</span>
                        <div className="flex-1 h-px bg-border/60" />
                      </div>
                    )}
                    <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1.5">
                      {/* Name + badges row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground">{b.clientName}</p>
                        <span className="text-[10px] text-muted-foreground">رقم الحجز: <bdi>{toAr(b.id)}</bdi></span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold shrink-0">
                          <Home className="w-2.5 h-2.5" />
                          {bookingChaletName}
                        </span>
                        {b.isRescheduled && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                            🔄 مُعاد جدولته
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          ✓ مكتمل
                        </span>
                      </div>
                      {/* Phone + WA button on one row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-wrap min-w-0">
                          {b.clientPhone && (
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium" dir="ltr">📞 {toAr(b.clientPhone)}</p>
                          )}
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                            📅 {hijriDate} هـ <span className="opacity-75">({gregDate})</span>
                            {" · "}{toAr(dur)} {dur === 1 ? "يوم" : "أيام"}
                            {periodLabel ? ` · ${periodLabel}` : ""}
                          </p>
                          {tp !== null && (
                            <p className="text-xs font-bold text-foreground">
                              💰 {tp.toLocaleString("ar-SA")} ر.س
                            </p>
                          )}
                        </div>
                        {messageSettings.waEnabled && b.clientPhone && (
                          <button
                            onClick={() => openManualWhatsAppTemplate(b, messageSettings.bookingConfirmationTemplate, "")}
                            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg px-2.5 py-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors whitespace-nowrap"
                          >
                            <MessageSquare className="w-3 h-3" />
                            واتساب
                          </button>
                        )}
                      </div>
                      {!isReadOnly && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {!!b.insuranceFee && Number(b.insuranceFee) > 0 && !b.insuranceRefunded && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setInsuranceTarget(b)}>
                              إدارة التأمين
                            </Button>
                          )}
                          {b.ratedAt ? <span className="text-xs text-emerald-700">تم التقييم</span> : (
                            <Button type="button" size="sm" variant="outline"
                              disabled={reviewSentIds.has(b.id) || reviewPendingId === b.id}
                              onClick={() => sendReviewRequest(b)}>
                              {reviewPendingId === b.id ? "جارٍ الإنشاء..." : reviewSentIds.has(b.id) ? "تم الإرسال ✓" : "إرسال رابط التقييم"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    </Fragment>
                  );
                  }); })()}
              </div>
            )}
            <BookingArchivePagination
              page={visibleArchivePage}
              total={archiveData?.total ?? 0}
              loading={archiveBusy}
              onChange={page => {
                setArchivePage(page);
                archiveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
            </>)}
          </div>
        )}
      </div>

      {/* Manage Insurance Dialog */}
      <ManageInsuranceDialog
        booking={insuranceTarget}
        canSettle={!!insuranceTarget && bookingIsComplete(bookings.find(b => b.id === insuranceTarget.id) ?? insuranceTarget)}
        open={!!insuranceTarget}
        onClose={() => setInsuranceTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["owner", "bookings"] })}
        apiFetch={apiFetch}
        formatAmount={(v) => v === null || v === undefined ? "0" : Number(v).toLocaleString("ar-SA")}
      />

      <ProofViewerDialog
        booking={proofTarget}
        open={!!proofTarget}
        onClose={() => setProofTarget(null)}
      />

      {/* Contract Preview Dialog */}
      {contractPreviewBooking && (
        <Dialog open onOpenChange={(o) => !o && setContractPreviewBooking(null)}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <FileText className="w-5 h-5" />
                عقد الإيجار الموقَّع
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {/* Financial summary */}
              {(() => {
                const _total = Number(contractPreviewBooking.totalPrice ?? 0);
                const _paid  = Number(contractPreviewBooking.depositPaid ?? 0);
                const _remaining = _total - _paid;
                if (!_total) return null;
                return (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">إجمالي الإيجار</span>
                      <span className="font-semibold text-foreground">{_total.toLocaleString("ar-SA")} ر.س</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المبلغ المدفوع</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">{_paid.toLocaleString("ar-SA")} ر.س</span>
                    </div>
                    <div className="flex justify-between border-t border-amber-200 dark:border-amber-700 pt-2">
                      <span className="font-bold text-foreground">المبلغ المتبقي</span>
                      <span className={`font-bold ${_remaining > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {_remaining.toLocaleString("ar-SA")} ر.س
                      </span>
                    </div>
                  </div>
                );
              })()}
              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المستأجر (النظام)</span>
                  <span className="font-semibold text-foreground">{contractPreviewBooking.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الاسم الكامل</span>
                  <span className="font-semibold text-foreground">{contractPreviewBooking.contractSignerName ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رقم الهوية / الإقامة</span>
                  <span className="font-semibold text-foreground" dir="ltr">{contractPreviewBooking.contractSignerId ?? "—"}</span>
                </div>
                {contractPreviewBooking.contractSignedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">تاريخ التوقيع</span>
                    <span className="font-semibold text-foreground text-xs">
                      {(() => {
                        const d = formatDualDate(new Date(contractPreviewBooking.contractSignedAt!).toISOString().slice(0, 10));
                        return `${d.hijri.replace(/\s*هـ\s*$/, "")} (${d.gregorian})`;
                      })()}
                    </span>
                  </div>
                )}
              </div>
              {contractPreviewBooking.contractSignatureDataUrl && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">✍️ التوقيع</p>
                  <div className="border-2 border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                    <img
                      src={contractPreviewBooking.contractSignatureDataUrl}
                      alt="توقيع المستأجر"
                      className="w-full object-contain max-h-40"
                    />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Receipt Lightbox */}
      {receiptLightbox && (
        <Dialog open onOpenChange={() => setReceiptLightbox(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-0" dir="ltr">
            <img src={receiptLightbox} alt="إيصال" className="max-h-[82vh] w-full object-contain rounded" />
            <button type="button" onClick={() => setReceiptLightbox(null)} className="absolute top-3 left-3 text-white/70 hover:text-white bg-black/40 rounded-full p-1 transition-colors">
              <XCircle className="w-6 h-6" />
            </button>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={!!deleteDialogBooking}
        booking={deleteDialogBooking}
        onClose={() => setDeleteDialogBooking(null)}
        onConfirm={(id, reason, reasonCode, refundAmount) => {
          if (isReadOnly) { onBlockedEdit(); return; }
          /* snapshot booking BEFORE any state mutation clears it */
          const bkSnap = deleteDialogBooking;
          /* 1. save cancellation to DB — no WA open here */
          deleteBooking.mutate({ id, reason, reasonCode, refundAmount });
          /* 2. if WA enabled, build message with pure builder and show preview */
          if (bkSnap && messageSettings.waEnabled && messageSettings.cancellationTemplate) {
            const phone  = normalizeGuestPhone(bkSnap);
            const depAmt = refundAmount ?? 0;
            const insAmt = Number(bkSnap.insuranceFee ?? 0);
            const msg    = buildCancellationWaMsg(
              bkSnap,
              messageSettings.cancellationTemplate,
              reason,
              depAmt,
              insAmt,
            );
            /* 3. set state so preview modal renders — window.open happens ONLY
               when the owner clicks 'إرسال عبر واتساب' inside the modal */
            setWaCancelPreview({ booking: bkSnap, phone, message: msg });
          }
        }}
      />

      {/* WhatsApp Cancellation Preview Modal — conditionally rendered,
          mounts only when waCancelPreview is set, unmounts when cleared */}
      {waCancelPreview && (
        <WaCancelPreviewDialog
          open={true}
          phone={waCancelPreview.phone}
          initialMessage={waCancelPreview.message}
          onClose={() => setWaCancelPreview(null)}
          onSent={(finalMsg, wasEdited) => {
            if (wasEdited) {
              const bk   = waCancelPreview.booking;
              const date = formatDateWithHijri(new Date());
              const tag  = `[رسالة إلغاء مُرسلة — ${date}]:\n${finalMsg}`;
              const prev = bk.notes?.trim() ? bk.notes.trim() + "\n\n" : "";
              appendBookingNotes.mutate({ id: bk.id, notes: prev + tag });
            }
            setWaCancelPreview(null);
          }}
        />
      )}

      {/* Reschedule Dialog */}
      <RescheduleDialog
        open={!!rescheduleBooking}
        booking={rescheduleBooking}
        existingBookings={bookings}
        modificationTemplate={messageSettings.modificationTemplate}
        chaletName={
          ownerChalets.find((c: any) => c.submissionId === rescheduleBooking?.submissionId)?.nameAr
          ?? ownerChalets.find((c: any) => c.id === (activeChaletId ?? ownerChalets[0]?.id))?.nameAr
          ?? "العقار"
        }
        clientPhone={rescheduleBooking?.clientPhone ?? ""}
        chaletPrices={(() => {
          const c = ownerChalets.find((ch: any) => ch.submissionId === rescheduleBooking?.submissionId)
            ?? ownerChalets.find((ch: any) => ch.id === (activeChaletId ?? ownerChalets[0]?.id));
          return c ? { priceMorning: c.priceMorning, priceEvening: c.priceEvening, priceFullDay: c.priceFullDay, pricePerNight: c.pricePerNight } : null;
        })()}
        onClose={() => setRescheduleBooking(null)}
        onRescheduled={() => {
          qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
          qc.invalidateQueries({ queryKey: ["owner", "bookings", "reschedule-log"] });
          qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
          toast({ title: "تمت إعادة الجدولة", description: "تم تحديث موعد الحجز بنجاح." });
        }}
      />

      {/* Chalet Unblock Day Confirmation Dialog */}
      <Dialog open={!!chalUnblockDay} onOpenChange={v => { if (!v) setChalUnblockDay(null); }}>
        <DialogContent dir="rtl" className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400">
              <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <Lock className="w-3 h-3 text-red-600" />
              </span>
              هذا اليوم مغلق — لا يمكن الحجز
            </DialogTitle>
            <DialogDescription className="text-right">
              {chalUnblockDay ? formatDualDate(chalUnblockDay.ds).hijri : ""}
              <br />هل تريد فتح هذا اليوم وإتاحته للحجز؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button variant="outline" onClick={() => setChalUnblockDay(null)}>إلغاء</Button>
            <Button
              disabled={unblockingChal}
              onClick={async () => {
                if (!chalUnblockDay) return;
                setUnblockingChal(true);
                try {
                  await apiFetch(`/owner/availability/${chalUnblockDay.avId}`, { method: "DELETE" });
                  qc.invalidateQueries({ queryKey: ["owner", "availability", activeChaletId] });
                  toast({ title: "تم فتح اليوم", description: formatDualDate(chalUnblockDay.ds).hijri });
                  setChalUnblockDay(null);
                } finally { setUnblockingChal(false); }
              }}
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              {unblockingChal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              فتح اليوم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Date Dialog */}
      {blockDateStr && activeChaletId && (
        <BlockDateDialog
          open={!!blockDateStr}
          onClose={() => { setBlockDateStr(null); setBlockDateBookingPeriod(null); }}
          dateStr={blockDateStr}
          chaletId={activeChaletId}
          existing={blockEntry}
          bookedPeriod={blockDateBookingPeriod}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["owner", "availability", activeChaletId] });
            setBlockDateStr(null);
            setBlockDateBookingPeriod(null);
          }}
        />
      )}
    </div>
  );
}
