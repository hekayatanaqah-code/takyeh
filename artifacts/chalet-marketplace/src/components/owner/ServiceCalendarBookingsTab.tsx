import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useRef } from "react";
import { formatDualDate, withHijriEra, getHijriMonthDays, toGregorianStr, prevHijriMonth, nextHijriMonth, HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Plus, Calendar, CheckCircle, BookOpen, ChevronLeft, ChevronRight, TrendingUp, Lock, Wallet, ChevronDown, Camera, Loader2, FileText, Send, CalendarDays, Printer } from "lucide-react";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSaudiDayClock } from "@/hooks/useSaudiDayClock";
import { useRecordServiceAppointmentPayment } from "@workspace/api-client-react";
import { serviceCalendarBookings, serviceBookingMatches, type ServiceBookingScope } from "@/lib/serviceBookingOperations";
import { type PropertyPaymentFilter } from "@/lib/propertyBookingStatus";
import { publicContractUrl } from "@/lib/digitalContracts";
import { ServiceBookingCard, serviceFinancialState } from "@/components/owner/ServiceBookingCard";
import { getServiceClientIdField, getServiceReceiptFinancialSummary, servicePaymentMethodLabel, serviceReceiptMoney, serviceReceiptNumber, shouldShowServiceClientId } from "@/lib/serviceReceipt";
import { toAr, fromAr } from "@/lib/utils";
import { sortServiceBookings, serviceBookingPage } from "@/lib/serviceBookingList";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ServiceBookingScheduleFields } from "@/components/owner/ServiceBookingScheduleFields";
import { ServiceBookingPaymentDialog } from "@/components/owner/ServiceBookingPaymentDialog";
import { ServiceBookingFilters } from "@/components/owner/ServiceBookingFilters";
import { ServiceBookingArchive } from "@/components/owner/ServiceBookingArchive";
import BookingArchivePagination from "@/components/owner/BookingArchivePagination";
import takyahLogoSrc from "@/assets/platform-logo.png";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { serviceDurationLabel, toArN } from "@/components/owner/owner-formatting";
import { useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { DEFAULT_MODIFICATION_TEMPLATE_BODY, DEFAULT_OWNER_MESSAGE_SETTINGS, OwnerMessageSettings, encodeWhatsAppText, prepareServiceMessageTemplate } from "@/components/owner/owner-message-templates";
import { uploadFile } from "@/components/owner/finance-shared";
import { GREGORIAN_MONTHS_AR } from "@/components/owner/owner-calendar";
import { createFreshReceiptPdfBlobFromDom } from "@/components/owner/financial-report-export";
import { DeleteConfirmDialog } from "@/components/owner/PropertyBookingChanges";
import { ServiceContractPreviewDialog } from "@/components/owner/ServiceContractPreviewDialog";


/* ── Service Calendar Tab (Block Dates + Appointments merged) ── */
const _svcHijriDay  = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric" });
const _svcHijriMon  = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long" });
const _svcHijriYear = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" });

const SOURCE_LABELS: Record<string, string> = {
  platform: "من المنصة",
  external: "خارج المنصة",
};

/* ── Service Block-Dates Range Dialog ──────────── */
function ServiceBlockDatesDialog({ open, providerId, onClose, onDone }: {
  open: boolean;
  providerId: number | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("إغلاق مؤقت");
  const [loading, setLoading] = useState(false);
  const [blockResult, setBlockResult] = useState<{
    succeeded: number;
    failed: Array<{ dateStr: string; error: string }>;
  } | null>(null);

  function reset() {
    setStartDate("");
    setEndDate("");
    setReason("إغلاق مؤقت");
    setBlockResult(null);
  }

  async function handleBlock() {
    if (!providerId || !startDate || !endDate || startDate > endDate) return;
    setLoading(true);
    setBlockResult(null);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates: string[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      const results = await Promise.all(dates.map(async (dateStr) => {
        const response = await apiFetch(`/providers/my/approved/${providerId}/blocked-dates`, {
          method: "POST",
          body: JSON.stringify({ dateStr, reason }),
        });
        if (response.ok) return { dateStr, ok: true, error: "" };
        const body = await response.json().catch(() => ({})) as { error?: string };
        return { dateStr, ok: false, error: body.error || "تعذر إغلاق اليوم" };
      }));

      const succeeded = results.filter((result) => result.ok);
      const failed = results.filter((result) => !result.ok);

      if (succeeded.length > 0) onDone();

      if (failed.length > 0) {
        setBlockResult({
          succeeded: succeeded.length,
          failed: failed.map(({ dateStr, error }) => ({ dateStr, error })),
        });
        const failedDates = failed
          .slice(0, 4)
          .map((result) => formatDualDate(result.dateStr).gregorian)
          .join("، ");
        toast({
          title: succeeded.length > 0
            ? `تم إغلاق ${toArN(succeeded.length)} يوم وتعذر إغلاق ${toArN(failed.length)}`
            : "لم يتم إغلاق أي يوم",
          description: `${failed[0]?.error ?? "تعذرت العملية"}${failedDates ? ` — الأيام المتجاوزة: ${failedDates}` : ""}`,
          variant: "destructive",
        });
        return;
      }

      toast({ title: `تم إغلاق ${toArN(succeeded.length)} يوم بنجاح`, description: reason });
      onClose();
      reset();
    } catch {
      toast({ title: "تعذر إغلاق الأيام", description: "تحقق من الاتصال وحاول مرة أخرى.", variant: "destructive" });
    } finally { setLoading(false); }
  }

  const dayCount = startDate && endDate && startDate <= endDate
    ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />إغلاق أيام الخدمة
          </DialogTitle>
          <DialogDescription>حدد نطاق التواريخ لمنع الحجوزات (صيانة، إجازة، غياب...)</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker value={startDate} onChange={setStartDate} placeholder="من تاريخ" label="من تاريخ" />
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker value={endDate} onChange={setEndDate} placeholder="إلى تاريخ" label="إلى تاريخ" minDate={startDate || undefined} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">سبب الإغلاق</label>
            <div className="flex gap-2 flex-wrap">
              {["إغلاق مؤقت", "صيانة", "إجازة", "فعالية خاصة"].map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${reason === r ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                  {r}
                </button>
              ))}
            </div>
            <Input className="mt-2" placeholder="أو اكتب سبباً آخر..." value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {dayCount > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              سيتم إغلاق {dayCount.toLocaleString("ar-SA-u-nu-arab")} يوم من {formatDualDate(startDate).hijri} إلى {formatDualDate(endDate).hijri} هـ
            </div>
          )}
          {blockResult && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
              role="alert"
              data-testid="service-block-range-result"
            >
              <p className="font-extrabold">
                تم إغلاق {toArN(blockResult.succeeded)} يوم، وتعذر إغلاق {toArN(blockResult.failed.length)} يوم
              </p>
              <p className="text-xs mt-1.5">
                بقيت الأيام التالية متاحة لوجود حجوزات نشطة أو تعذر تحديثها:
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {blockResult.failed.map((item) => (
                  <li key={item.dateStr}>
                    {formatDualDate(item.dateStr).gregorian}: {item.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>إلغاء</Button>
          <Button disabled={!startDate || !endDate || !reason.trim() || loading || startDate > endDate} onClick={handleBlock}
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}إغلاق الأيام
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Service Calendar + Bookings (Unified Tab) ──────────────── */
export function ServiceCalendarBookingsTab() {
  const { providerId } = useServiceErp();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const serviceClock = useSaudiDayClock();
  const now = new Date(`${new Date(serviceClock + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)}T12:00:00`);
  const serviceCalendarRootRef = useRef<HTMLDivElement>(null);
  const todayHijri = toHijriComponents(now);
  const [calendarType, setCalendarType] = useState<"hijri" | "gregorian">(
    () => (localStorage.getItem("dashCalDefaultType") as "hijri" | "gregorian") ?? "hijri",
  );
  const [hijriYear, setHijriYear] = useState(todayHijri.year);
  const [hijriMonth, setHijriMonth] = useState(todayHijri.month);
  const [gregYear, setGregYear] = useState(now.getFullYear());
  const [gregMonth, setGregMonth] = useState(now.getMonth() + 1);
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [serviceCalendarFocusDate, setServiceCalendarFocusDate] = useState<string | null>(null);
  const [calendarPickerYear, setCalendarPickerYear] = useState(
    calendarType === "hijri" ? todayHijri.year : now.getFullYear(),
  );
  const [togglingDate, setTogglingDate] = useState<string | null>(null);
  const [unblockDay, setUnblockDay] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelAppointment, setCancelAppointment] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonDetails, setCancelReasonDetails] = useState("");
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<number | null>(null);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<number | null>(null);
  const [reviewSendingId, setReviewSendingId] = useState<number | null>(null);
  const [reviewSentIds, setReviewSentIds] = useState<Set<number>>(new Set());
  const [openServiceMessageMenuId, setOpenServiceMessageMenuId] = useState<number | null>(null);
  const [receiptAppointment, setReceiptAppointment] = useState<any | null>(null);
  const [paymentAppointment, setPaymentAppointment] = useState<any | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const paymentSubmittingRef = useRef(false);
  const recordServicePayment = useRecordServiceAppointmentPayment();
  const [receiptWhatsAppLoading, setReceiptWhatsAppLoading] = useState(false);
  const [contractPreviewAppointment, setContractPreviewAppointment] = useState<any | null>(null);
  const receiptPdfExportNonceRef = useRef(0);
  const [listFilter, setListFilter] = useState<"all" | "confirmed" | "pending">("all");
  const [serviceBookingScope, setServiceBookingScope] = useState<ServiceBookingScope>("active");
  const [servicePaymentFilter, setServicePaymentFilter] = useState<PropertyPaymentFilter>("all");
  const [serviceListPage, setServiceListPage] = useState(1);
  const serviceListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setServiceListPage(1);
    setOpenServiceMessageMenuId(null);
  }, [providerId, listFilter, serviceBookingScope, servicePaymentFilter]);
  const emptyForm = {
    clientName: "",
    clientPhone: "",
    serviceAddress: "",
    serviceDeliveryMethod: "",
    clientIdNumber: "",
    dateStr: "",
    startTime: "",
    duration: "",
    durationUnit: "hours",
    status: "confirmed",
    notes: "",
    amount: "",
    deposit: "",
    insuranceAmount: "",
    source: "platform",
    paymentMethod: "cash",
    paymentReceiptUrl: "",
    editReasonType: "",
    editReason: "",
  };
  const [form, setForm] = useState({ ...emptyForm });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickYear, setPickYear] = useState(now.getFullYear());
  const [pickMonth, setPickMonth] = useState(now.getMonth());
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [serviceCustomerLoading, setServiceCustomerLoading] = useState(false);
  const [serviceCustomerFound, setServiceCustomerFound] = useState<boolean | null>(null);
  const serviceCustomerLookupRequestRef = useRef(0);
  const insuranceManuallyEditedRef = useRef(false);

  const { data: provider } = useQuery<any | null>({
    queryKey: ["service-provider-detail", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/${providerId}`);
      return r.ok ? r.json() : null;
    },
    enabled: !!providerId,
  });
  useEffect(() => {
    if (!showForm || editingAppointmentId || !provider || insuranceManuallyEditedRef.current) return;
    const insuranceAmount = provider.requiresInsurance ? String(provider.insuranceAmount ?? "0") : "0";
    setForm(previous => previous.insuranceAmount === insuranceAmount ? previous : { ...previous, insuranceAmount });
  }, [showForm, editingAppointmentId, provider?.requiresInsurance, provider?.insuranceAmount]);

  const { data: blockedDates = [] } = useQuery<{ id: number; dateStr: string }[]>({
    queryKey: ["service-blocked-dates", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/blocked-dates`);
      return r.ok ? r.json() : [];
    },
    enabled: !!providerId,
  });

  const { data: appointments = [], isLoading: apptLoading, isError: apptError, refetch: refetchAppointments } = useQuery<any[]>({
    queryKey: ["service-appointments", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
      if (!r.ok) throw new Error("تعذر تحميل حجوزات الخدمة");
      return r.json();
    },
    enabled: !!providerId,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const serviceCalendarMap = useMemo(() => serviceCalendarBookings<any>(appointments), [appointments]);

  function showServiceBookingInCalendar(appointment: any) {
    const date = new Date(`${appointment.dateStr}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return;
    const hijri = toHijriComponents(date);
    setHijriYear(hijri.year);
    setHijriMonth(hijri.month);
    setGregYear(date.getFullYear());
    setGregMonth(date.getMonth() + 1);
    setSummaryDate(null);
    setServiceCalendarFocusDate(appointment.dateStr);
  }

  useEffect(() => {
    if (!serviceCalendarFocusDate || apptLoading) return;
    const day = serviceCalendarRootRef.current?.querySelector<HTMLButtonElement>(`[data-service-calendar-date="${serviceCalendarFocusDate}"]`);
    if (!day) return;
    day.focus({ preventScroll: true });
    day.scrollIntoView({ behavior: "smooth", block: "center" });
    setServiceCalendarFocusDate(null);
  }, [serviceCalendarFocusDate, apptLoading, gregMonth, gregYear, hijriMonth, hijriYear, calendarType]);

  // Keep an open receipt aligned with the same persisted booking as the calendar.
  useEffect(() => {
    setReceiptAppointment((current: any) => current
      ? appointments.find(appointment => appointment.id === current.id) ?? null
      : null);
  }, [appointments]);

  const { data: messageSettings = DEFAULT_OWNER_MESSAGE_SETTINGS } = useQuery<OwnerMessageSettings>({
    queryKey: ["owner", "message-settings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/message-settings");
      if (!r.ok) return DEFAULT_OWNER_MESSAGE_SETTINGS;
      return r.json();
    },
  });

  useEffect(() => {
    if (editingAppointmentId) return;
    const phone = form.clientPhone.trim();
    if (phone.replace(/\D/g, "").length < 9) {
      serviceCustomerLookupRequestRef.current += 1;
      setServiceCustomerFound(null);
      return;
    }
    const requestId = ++serviceCustomerLookupRequestRef.current;
    const timer = window.setTimeout(async () => {
      setServiceCustomerLoading(true);
      try {
        const response = await apiFetch(`/owner/customers/lookup?phone=${encodeURIComponent(phone)}`);
        if (!response.ok) return;
        const customer = await response.json();
        if (requestId !== serviceCustomerLookupRequestRef.current) return;
        if (customer?.clientName) {
          setForm((current) => ({
            ...current,
            clientName: customer.clientName,
            serviceAddress: current.serviceAddress || customer.serviceAddress || "",
            serviceDeliveryMethod: current.serviceDeliveryMethod || customer.serviceDeliveryMethod || "",
            clientIdNumber: current.clientIdNumber || customer.clientIdNumber || "",
          }));
          setServiceCustomerFound(true);
        } else {
          setServiceCustomerFound(false);
        }
      } finally {
        if (requestId === serviceCustomerLookupRequestRef.current) {
          setServiceCustomerLoading(false);
        }
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.clientPhone, editingAppointmentId]);

  const blockedSet = new Set(blockedDates.map(d => d.dateStr));
  const apptDays = new Map([...serviceCalendarMap].map(([date, entries]) => [
    date, entries.filter(a => a.status !== "cancelled").length,
  ]));
  const dailyCapacity = Math.max(1, Number(provider?.dailyCapacity) || 1);

  function revealBookingForm() {
    setShowForm(true);
  }

  function createBookingForDate(dateStr: string) {
    const [year, month] = dateStr.split("-").map(Number);
    setEditingAppointmentId(null);
    insuranceManuallyEditedRef.current = false;
    setForm({ ...emptyForm, dateStr, insuranceAmount: provider?.requiresInsurance ? String(provider.insuranceAmount ?? "0") : "0" });
    setServiceCustomerFound(null);
    setPickYear(year);
    setPickMonth(month - 1);
    setPickerOpen(false);
    setSummaryDate(null);
    revealBookingForm();
  }

  function closeBookingForm() {
    if (saving || receiptUploading) return;
    setShowForm(false);
    setPickerOpen(false);
    setEditingAppointmentId(null);
    insuranceManuallyEditedRef.current = false;
    setForm({ ...emptyForm });
    setServiceCustomerFound(null);
  }

  async function handleReceiptUpload(file: File) {
    setReceiptUploading(true);
    try {
      const url = await uploadFile(file);
      if (!url) {
        toast({ title: "تعذر رفع الإيصال", description: "حاول مرة أخرى", variant: "destructive" });
        return;
      }
      setForm((current) => ({ ...current, paymentReceiptUrl: url }));
    } finally {
      setReceiptUploading(false);
    }
  }

  function toDateStr(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  async function toggleDate(dateStr: string) {
    if (togglingDate) return;
    setTogglingDate(dateStr);
    try {
      if (blockedSet.has(dateStr)) {
        const found = blockedDates.find(d => d.dateStr === dateStr);
        if (!found) return;
        const r = await apiFetch(`/providers/my/approved/${providerId}/blocked-dates/${found.id}`, { method: "DELETE" });
        if (!r.ok) throw new Error("تعذرت إتاحة اليوم");
      } else {
        const r = await apiFetch(`/providers/my/approved/${providerId}/blocked-dates`, { method: "POST", body: JSON.stringify({ dateStr }) });
        if (!r.ok) {
          const error = await r.json().catch(() => ({})) as { error?: string };
          throw new Error(error.error || "تعذر إغلاق اليوم");
        }
      }
      queryClient.invalidateQueries({ queryKey: ["service-blocked-dates", providerId] });
      setSummaryDate(dateStr);
      toast({ title: blockedSet.has(dateStr) ? "تمت إتاحة اليوم ✓" : "تم إغلاق اليوم ✓" });
    } catch (error) {
      toast({
        title: "تعذرت العملية",
        description: error instanceof Error ? error.message : "تعذر تحديث إتاحة اليوم.",
        variant: "destructive",
      });
    } finally { setTogglingDate(null); }
  }

  async function handleSave() {
    if (!form.clientName.trim() || !form.clientPhone.trim() || !form.dateStr || !form.serviceDeliveryMethod || !form.notes.trim()) {
      toast({ title: "أكمل الحقول الإجبارية", description: "اسم العميل والجوال والتاريخ وطريقة تقديم الخدمة وتفاصيلها مطلوبة.", variant: "destructive" });
      return;
    }
    if (editingAppointmentId && (!form.editReasonType || !form.editReason.trim())) {
      toast({
        title: "سبب التعديل مطلوب",
        description: form.editReasonType === "أخرى"
          ? "اكتب تفاصيل سبب تعديل أو إعادة جدولة الحجز."
          : "اختر سبب تعديل أو إعادة جدولة الحجز.",
        variant: "destructive",
      });
      return;
    }
    const activeCount = apptDays.get(form.dateStr) ?? 0;
    const editingAppointment = editingAppointmentId
      ? appointments.find((appointment) => appointment.id === editingAppointmentId)
      : null;
    const consumesNewCapacity = form.status !== "cancelled" && (
      !editingAppointment ||
      editingAppointment.status === "cancelled" ||
      editingAppointment.dateStr !== form.dateStr
    );
    if (consumesNewCapacity && activeCount >= dailyCapacity) {
      toast({
        title: "اليوم مكتمل الحجوزات",
        description: `الحد اليومي لهذه الخدمة ${toArN(dailyCapacity)} حجوزات.`,
        variant: "destructive",
      });
      return;
    }
    const insuranceAmount = form.insuranceAmount.trim() || "0";
    if (!/^\d+(?:\.\d{1,2})?$/.test(insuranceAmount) || !Number.isFinite(Number(insuranceAmount))) {
      toast({ title: "مبلغ التأمين غير صحيح", description: "أدخل صفراً للإعفاء أو مبلغاً موجباً.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const endpoint = editingAppointmentId
        ? `/providers/my/approved/${providerId}/appointments/${editingAppointmentId}`
        : `/providers/my/approved/${providerId}/appointments`;
      const { editReasonType: _editReasonType, ...formPayload } = form;
      const r = await apiFetch(endpoint, {
        method: editingAppointmentId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...formPayload,
          clientName: form.clientName.trim(),
          clientPhone: form.clientPhone.trim(),
          serviceAddress: form.serviceAddress.trim() || null,
          serviceDeliveryMethod: form.serviceDeliveryMethod,
          notes: form.notes.trim(),
          startTime: form.startTime || null,
          clientIdNumber: provider?.requiresInsurance ? (form.clientIdNumber.trim() || null) : null,
          amount: form.amount || null,
          deposit: form.deposit || null,
          insuranceAmount,
        }),
      });
      if (!r.ok) {
        const error = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "فشل حفظ الحجز");
      }
      queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: editingAppointmentId ? "تم تحديث الحجز ✓" : "تم تسجيل الحجز ✓" });
      setEditingAppointmentId(null);
      insuranceManuallyEditedRef.current = false;
      setForm({ ...emptyForm }); setShowForm(false); setPickerOpen(false);
    } catch (error) {
      toast({
        title: "تعذر حفظ الحجز",
        description: error instanceof Error ? error.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    }
    finally { setSaving(false); }
  }

  function startEditingAppointment(appointment: any) {
    insuranceManuallyEditedRef.current = true;
    setEditingAppointmentId(appointment.id);
    setForm({
      clientName: appointment.clientName ?? "",
      clientPhone: appointment.clientPhone ?? "",
      serviceAddress: appointment.serviceAddress ?? "",
      serviceDeliveryMethod: appointment.serviceDeliveryMethod ?? "",
      clientIdNumber: appointment.clientIdNumber ?? "",
      dateStr: appointment.dateStr ?? "",
      startTime: appointment.startTime ?? "",
      duration: appointment.duration ?? "",
      durationUnit: appointment.durationUnit ?? "hours",
      status: appointment.status === "cancelled" ? "pending" : appointment.status,
      notes: appointment.notes ?? "",
      amount: appointment.amount ?? "",
      deposit: appointment.deposit ?? "",
      insuranceAmount: appointment.insuranceAmount ?? "",
      source: appointment.source ?? "external",
      paymentMethod: appointment.paymentMethod ?? "cash",
      paymentReceiptUrl: appointment.paymentReceiptUrl ?? "",
      editReasonType: "",
      editReason: "",
    });
    if (appointment.dateStr) {
      const [year, month] = appointment.dateStr.split("-").map(Number);
      setPickYear(year);
      setPickMonth(month - 1);
    }
    setPickerOpen(false);
    revealBookingForm();
  }

  async function handleStatusChange(id: number, status: "confirmed" | "cancelled", cancellation?: { reason: string; refundAmount?: number }) {
    setCancellingId(id);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(status === "cancelled"
          ? { status, cancelReason: cancellation?.reason ?? cancelReason.trim(), cancelRefundAmount: cancellation?.refundAmount ? String(cancellation.refundAmount) : "0" }
          : { status }),
      });
      if (!r.ok) {
        const error = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "تعذر تحديث الحالة");
      }
      queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: status === "cancelled" ? "تم إلغاء الحجز" : "تم تأكيد الحجز" });
      if (status === "cancelled") {
        setCancelAppointment(null);
        setCancelReason("");
        setCancelReasonDetails("");
        setCancelRefundAmount("");
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: error instanceof Error ? error.message : "تعذر تحديث الحالة",
        variant: "destructive",
      });
    }
    finally { setCancellingId(null); }
  }

  async function updateServiceAppointmentFlags(
    appointment: any,
    updates: { cashDeposited?: boolean; contractSigned?: boolean },
  ) {
    setUpdatingAppointmentId(appointment.id);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments/${appointment.id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (!r.ok) {
        const error = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(error.error || "تعذر تحديث الحجز");
      }
      await queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: "تم تحديث حالة الحجز ✓" });
    } catch (error) {
      toast({
        title: "تعذر تحديث الحجز",
        description: error instanceof Error ? error.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setUpdatingAppointmentId(null);
    }
  }

  function sendServiceContractWhatsApp(appointment: any) {
    const whatsappPhone = normalizeServiceWhatsAppPhone(appointment.clientPhone);
    if (!whatsappPhone) return;
    const dual = formatDualDate(appointment.dateStr);
    const contractUrl = publicContractUrl(appointment.id, "service", BASE);
    const message = [
      `مرحباً ${appointment.clientName}،`,
      `نرفق لك عقد تقديم الخدمة للحجز بتاريخ ${withHijriEra(dual.hijri)} (${dual.gregorian} م).`,
      "يرجى مراجعة بيانات العقد وتوقيعه إلكترونياً من خلال الرابط التالي:",
      contractUrl,
    ].join("\n\n");
    window.open(`https://wa.me/${whatsappPhone}?text=${encodeWhatsAppText(message)}`, "_blank", "noopener,noreferrer");
  }

  function openServicePaymentDialog(appointment: any) {
    const { canCollect } = serviceFinancialState(appointment);
    if (!canCollect) return;
    setPaymentError(null);
    setPaymentAppointment(appointment);
  }

  async function submitServicePayment(amount: string) {
    const appointment = paymentAppointment;
    const targetProviderId = providerId;
    if (!appointment || !targetProviderId || paymentSubmittingRef.current) return;
    paymentSubmittingRef.current = true;
    setPaymentError(null);
    try {
      const updated = await recordServicePayment.mutateAsync({
        id: targetProviderId,
        apptId: appointment.id,
        data: {
          amount,
          expectedDeposit: String(appointment.deposit ?? "0"),
          expectedPaymentMethod: appointment.paymentMethod || "cash",
          expectedCashDeposited: !!appointment.cashDeposited,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-appointments", targetProviderId] }),
        queryClient.invalidateQueries({ queryKey: ["owner", "bank-ledger-services"] }),
        queryClient.invalidateQueries({ queryKey: ["owner", "service-revenue-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["owner", "service-revenue-summary-rep"] }),
      ]);
      setReceiptAppointment((current: any) => current && current.id === appointment.id ? { ...current, ...(updated as any) } : current);
      setPaymentAppointment(null);
      toast({ title: "تم تسجيل الدفعة" });
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status;
      const serverMessage = error?.data?.error ?? (error instanceof Error ? error.message : "");
      setPaymentError(
        status === 409 ? "تغيّرت بيانات الدفع لهذا الحجز من مكان آخر. أغلق النافذة وأعد المحاولة بعد تحديث البيانات."
        : status === 422 ? serverMessage || "تحقق من مبلغ الدفعة والمتبقي على الحجز."
        : serverMessage || "تعذر تسجيل الدفعة، حاول مرة أخرى.",
      );
      if (status === 409) queryClient.invalidateQueries({ queryKey: ["service-appointments", targetProviderId] });
    } finally {
      paymentSubmittingRef.current = false;
    }
  }

  function serviceMessageTemplates(appointment: any) {
    if (!messageSettings.waEnabled) return [];
    return [
      {
        id: "confirmation",
        title: appointment.status === "pending" ? "متابعة الحجز" : "تأكيد الحجز",
        body: messageSettings.bookingConfirmationTemplate,
      },
      ...(appointment.status === "cancelled"
        ? [{ id: "cancellation", title: "إشعار إلغاء الحجز", body: messageSettings.cancellationTemplate }]
        : []),
      ...(appointment.editReason
        ? [{
            id: "modification",
            title: "تعديل الحجز / إعادة الجدولة",
            body: messageSettings.modificationTemplate || DEFAULT_MODIFICATION_TEMPLATE_BODY,
          }]
        : []),
      ...(messageSettings.customTemplates ?? []),
    ].filter((template) => template.body?.trim());
  }

  function buildServiceMessage(appointment: any, templateBody: string) {
    const effectiveDateStr = appointment.editedDateStr || appointment.dateStr;
    const dual = formatDualDate(effectiveDateStr);
    const previousDate = appointment.previousDateStr || (appointment.editReason || appointment.lastEditedAt
      || appointment.previousStartTime != null ? appointment.dateStr : null);
    const previousDual = previousDate
      ? formatDualDate(previousDate)
      : null;
    const total = Number(appointment.amount ?? 0);
    const deposit = Number(appointment.deposit ?? 0);
    const insurance = Number(appointment.insuranceAmount ?? 0);
    const refund = Number(appointment.cancelRefundAmount ?? 0);
    const remaining = appointment.status === "cancelled" ? 0 : Math.max(0, total - deposit);
    const amountText = (value: number) => toArN(value.toLocaleString("en-US"));
    const insuranceRefund = appointment.insuranceStatus === "refunded" ? insurance : 0;
    const insuranceState = appointment.insuranceStatus === "refunded" ? "مسجل رده محاسبياً"
      : appointment.insuranceStatus === "deducted" ? "تمت تسوية الخصم محاسبياً" : "محتجز؛ تتم تسويته مستقلاً";
    const ar = (value: unknown) => toArN(String(value ?? ""));
    const durationText = serviceDurationLabel(appointment.duration, appointment.durationUnit)?.replace(/^المدة:\s*/, "") ?? "—";
    const messageDurationText =
      appointment.durationUnit === "days" && Number(appointment.duration) === 1
        ? "يوم واحد"
        : durationText;
    const previousDurationText = serviceDurationLabel(appointment.previousDuration ?? appointment.duration,
      appointment.previousDurationUnit ?? appointment.durationUnit)?.replace(/^المدة:\s*/, "") ?? "—";
    let preparedTemplate = templateBody.includes("{سبب_التعديل}")
      ? templateBody
          .split(/\r?\n/)
          .map((line) => {
            if (line.trim().startsWith("الحجز السابق:")) {
              return `الحجز السابق: {اسم_اليوم_من}، {من_التاريخ} هـ ({من_التاريخ_م})${appointment.previousStartTime ? ` — الساعة ${ar(appointment.previousStartTime)}` : ""}${previousDurationText === "—" ? "" : ` — ${previousDurationText}`}.`;
            }
            if (line.trim().startsWith("الحجز الجديد:")) {
              return `الحجز الجديد: {اسم_اليوم_إلى}، {إلى_التاريخ} هـ ({إلى_التاريخ_م})${appointment.startTime ? ` — الساعة ${ar(appointment.startTime)}` : ""}${messageDurationText === "—" ? "" : ` — ${messageDurationText}`}.`;
            }
            return line;
          })
          .join("\n")
          .replace(/\{الفترة_القديمة\}/g, `${previousDurationText}${appointment.previousStartTime ? ` — ${ar(appointment.previousStartTime)}` : ""}`)
          .replace(/\{الفترة_الجديدة\}|\{الفترة\}/g, `${messageDurationText}${appointment.startTime ? ` — ${ar(appointment.startTime)}` : ""}`)
          .replace(/(?:أمنياتنا|نتمنى) لكم بإقامة (?:ممتعة|مانعة)\.?/g, "سعداء بخدمتكم")
      : prepareServiceMessageTemplate(templateBody);
    preparedTemplate = preparedTemplate.replace(/فتره/g, "فترة");
    if (insurance <= 0) {
      preparedTemplate = preparedTemplate
        .split(/\r?\n/)
        .filter((line) => !line.includes("{التأمين}"))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    }
    return preparedTemplate
      .replace(/\{اسم_العميل\}/g, ar(appointment.clientName))
      .replace(/\{اسم_العقار\}/g, ar(provider?.businessName ?? "الخدمة"))
      .replace(/\{اسم_الخدمة\}/g, ar(provider?.businessName ?? "الخدمة"))
      .replace(/\{رقم_الحجز\}/g, toArN(appointment.id ?? ""))
      .replace(/\{اسم_اليوم_من\}/g, previousDate
        ? ar(new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(`${previousDate}T12:00:00`)))
        : "لم تسجل بيانات موعد سابق")
      .replace(/\{اسم_اليوم_إلى\}/g, ar(new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(`${effectiveDateStr}T12:00:00`))))
      .replace(/\{من_التاريخ\}/g, previousDual ? ar(previousDual.hijri.replace(/\s*هـ\s*$/, "")) : "غير متوفر في السجل السابق")
      .replace(/\{من_التاريخ_م\}/g, previousDual ? ar(previousDual.gregorian) : "غير متوفر")
      .replace(/\{التاريخ\}|\{إلى_التاريخ\}/g, ar(dual.hijri.replace(/\s*هـ\s*$/, "")))
      .replace(/\{التاريخ_م\}|\{إلى_التاريخ_م\}/g, ar(dual.gregorian))
      .replace(/\{تاريخ_الخدمة\}/g, ar(dual.gregorian))
      .replace(/\{الإيجار\}|\{قيمة_الإيجار\}|\{الإجمالي_الكلي\}/g, amountText(total))
      .replace(/\{المدفوع\}/g, amountText(deposit))
      .replace(/\{المتبقي\}/g, amountText(remaining))
      .replace(/\{التأمين\}/g, amountText(insurance))
      .replace(/\{المدة\}/g, durationText)
      .replace(/\{سبب_الإلغاء\}/g, ar(appointment.cancelReason || "حسب الاتفاق"))
      .replace(/\{استرداد_العربون\}/g, amountText(refund))
      .replace(/\{استرداد_التأمين\}/g, amountText(insuranceRefund))
      .replace(/\{إجمالي_المسترد\}|\{المبلغ_المسترد\}/g, amountText(refund + insuranceRefund))
      .replace(/\{حالة_التأمين\}/g, insuranceState)
      .replace(/\{سبب_التعديل\}/g, ar(appointment.editReason || "حسب الاتفاق"))
      .replace(/\{طريقة_تقديم_الخدمة\}/g, appointment.serviceDeliveryMethod === "customer_pickup" ? "استلام العميل من المقر" : appointment.serviceDeliveryMethod === "delivery_installation" ? "توصيل وتركيب بموقع العميل" : "—")
      .replace(/\{عنوان_الخدمة\}/g, ar(appointment.serviceAddress || "—"))
      .replace(/\{تفاصيل_الخدمة\}/g, ar(appointment.notes || "—"))
      .replace(/\{رابط_العقد_الرقمي\}/g, publicContractUrl(appointment.id, "service", BASE))
      .replace(/\{إجمالي_الخدمات\}|\{تفاصيل_الخدمات\}/g, "—")
      .replace(/قيمة الإيجار/g, "قيمة الخدمة")
      .replace(/\{[^}]+\}/g, "—")
      + (appointment.status === "cancelled" && insurance > 0 ? `\nحالة التأمين: ${insuranceState}.` : "");
  }

  function sendServiceCustomMessage(appointment: any, templateBody: string) {
    const message = buildServiceMessage(appointment, templateBody);
    const phone = normalizeServiceWhatsAppPhone(appointment.clientPhone);
    window.open(`https://wa.me/${phone}?text=${encodeWhatsAppText(message)}`, "_blank", "noopener,noreferrer");
    setOpenServiceMessageMenuId(null);
  }

  async function sendServiceReviewRequest(appointment: any) {
    setReviewSendingId(appointment.id);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/review-invite`, {
        method: "POST",
        body: JSON.stringify({ guestName: appointment.clientName }),
      });
      if (!r.ok) throw new Error("تعذر إنشاء رابط التقييم");
      const data = await r.json() as { token: string };
      const link = `${window.location.origin}${BASE}/r/${data.token}`;
      const message = `أهلاً ${appointment.clientName}، يسعدنا تقييمك لتجربتك مع ${provider?.businessName ?? "الخدمة"}.\nاضغط هنا لإرسال تقييمك: ${link}`;
      const phone = normalizeServiceWhatsAppPhone(appointment.clientPhone);
      window.open(`https://wa.me/${phone}?text=${encodeWhatsAppText(message)}`, "_blank", "noopener,noreferrer");
      setReviewSentIds((current) => new Set([...current, appointment.id]));
      toast({ title: "تم إنشاء رابط التقييم وفتح واتساب ✓" });
    } catch (error) {
      toast({
        title: "تعذر إرسال رابط التقييم",
        description: error instanceof Error ? error.message : "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setReviewSendingId(null);
    }
  }

  async function handleDeleteAppointment(id: number) {
    if (!confirm("هل تريد حذف سجل هذا الحجز نهائياً؟")) return;
    setDeletingAppointmentId(id);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-appointments", providerId] });
      toast({ title: "تم حذف سجل الحجز" });
    } catch {
      toast({ title: "تعذر حذف الحجز", variant: "destructive" });
    } finally {
      setDeletingAppointmentId(null);
    }
  }

  function serviceReceiptDocumentTitle(appointment: any) {
    return `إيصال_حجز_${serviceReceiptNumber(appointment)}`;
  }

  function serviceReceiptPdfFileName(appointment: any) {
    const numericId = Number(appointment?.id);
    return `${Number.isFinite(numericId) ? String(Math.max(0, Math.trunc(numericId))) : "0"}.pdf`;
  }

  function freshServiceReceiptPdfFileName(appointment: any) {
    const baseName = serviceReceiptPdfFileName(appointment).replace(/\.pdf$/, "");
    const exportNonce = ++receiptPdfExportNonceRef.current;
    return `${baseName}-${Date.now()}-${exportNonce}.pdf`;
  }

  function serviceReceiptIssueDate(appointment: any) {
    const date = appointment.createdAt ? new Date(appointment.createdAt) : new Date();
    const hijri = toHijriComponents(date);
    const hijriLabel = `${toArN(hijri.day)} ${HIJRI_MONTHS_AR[hijri.month - 1]} ${toArN(hijri.year)} هـ`;
    const gregorianLabel = `${toArN(date.getDate())} ${GREGORIAN_MONTHS_AR[date.getMonth()]} ${toArN(date.getFullYear())} م`;
    const preferredCalendar = localStorage.getItem("dashCalDefaultType") === "gregorian"
      ? "gregorian"
      : "hijri";
    return {
      hijri: hijriLabel,
      gregorian: gregorianLabel,
      primary: preferredCalendar === "gregorian" ? gregorianLabel : hijriLabel,
      secondary: preferredCalendar === "gregorian" ? hijriLabel : gregorianLabel,
    };
  }

  function serviceReceiptServiceDate(dateStr: string) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) return { hijri: "—", gregorian: "—" };
    const hijri = toHijriComponents(date);
    return {
      hijri: `${toArN(hijri.day)} ${HIJRI_MONTHS_AR[hijri.month - 1]} ${toArN(hijri.year)} هـ`,
      gregorian: `${toArN(date.getDate())} ${GREGORIAN_MONTHS_AR[date.getMonth()]} ${toArN(date.getFullYear())} م`,
    };
  }
  function normalizeServiceWhatsAppPhone(phone?: string | null) {
    const digits = String(phone ?? "")
      .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .replace(/\D/g, "")
      .replace(/^00/, "");
    if (!digits) return "";
    if (digits.startsWith("0")) return `966${digits.slice(1)}`;
    if (digits.startsWith("5")) return `966${digits}`;
    return digits;
  }

  function getRenderedServiceReceiptElement() {
    const receiptElement = document.getElementById("receipt-print-area");
    if (!(receiptElement instanceof HTMLElement)) {
      throw new Error("Receipt print area is not available");
    }
    return receiptElement;
  }

  function printServiceReceipt() {
    if (!receiptAppointment) return;
    try {
      getRenderedServiceReceiptElement();
    } catch {
      toast({ title: "تعذر العثور على الإيصال", description: "أغلق المعاينة وافتحها ثم حاول مرة أخرى.", variant: "destructive" });
      return;
    }
    const previousTitle = document.title;
    document.title = serviceReceiptDocumentTitle(receiptAppointment);
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
  }

  async function sendServiceReceiptWhatsApp() {
    if (!receiptAppointment || receiptWhatsAppLoading) return;
    const whatsappPhone = normalizeServiceWhatsAppPhone(receiptAppointment.clientPhone);
    if (!whatsappPhone) {
      toast({
        title: "لا يوجد رقم جوال",
        description: "أضف رقم جوال العميل إلى الحجز قبل إرسال الإيصال عبر واتساب.",
        variant: "destructive",
      });
      return;
    }
    const clientName = toAr(receiptAppointment.clientName || "عميل");
    const serviceName = toAr(provider?.businessName ?? "الخدمة");
    const { total, deposit, remaining } = getServiceReceiptFinancialSummary(receiptAppointment);
    const serviceDate = serviceReceiptServiceDate(receiptAppointment.dateStr);
    const serviceHijriDate = serviceDate.hijri.replace(/\sهـ$/, "");
    const serviceGregorianDate = serviceDate.gregorian.replace(/\sم$/, "");
    const message = toAr([
      `أهلاً بك ${clientName} ✨`,
      `تفاصيل حجز ( ${serviceName} ) منصة تكية`,
      ``,
      `• رقم الإيصال: ${serviceReceiptNumber(receiptAppointment)}`,
      `• تاريخ الخدمة: ${serviceHijriDate} هـ (${serviceGregorianDate} م)`,
      ...(receiptAppointment.startTime ? [`• وقت الموعد: ${toAr(receiptAppointment.startTime)}`] : []),
      ...(receiptAppointment.notes ? [`• تفاصيل العنصر / الخدمة والملاحظات:\n${receiptAppointment.notes}`] : []),
      `• المبلغ الإجمالي: ${serviceReceiptMoney(total)}`,
      `• العربون المدفوع: ${serviceReceiptMoney(deposit)}`,
      `• المتبقي: ${serviceReceiptMoney(remaining)}`,
      `• طريقة الدفع: ${servicePaymentMethodLabel(receiptAppointment.paymentMethod)}`,
      ``,
      `مرفق لكم ملف الإيصال (PDF) 📄`,
      `شكراً لاختياركم ${serviceName} عبر منصة تكية ✨`,
    ].join("\n"));

    setReceiptWhatsAppLoading(true);
    try {
      const fileName = freshServiceReceiptPdfFileName(receiptAppointment);
      const receiptElement = getRenderedServiceReceiptElement();
      const { blob: freshPdfBlob } = await createFreshReceiptPdfBlobFromDom(receiptElement, fileName);
      const blob = new Blob([freshPdfBlob], { type: "application/pdf" });
      const pdfFile = new File([blob], fileName, {
        type: "application/pdf",
        lastModified: Date.now(),
      });
      const canShareFile = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [pdfFile] });

      if (canShareFile) {
        await navigator.share({
          files: [pdfFile],
          title: serviceReceiptDocumentTitle(receiptAppointment),
          text: message,
        });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(objectUrl);
      window.open(`https://wa.me/${whatsappPhone}?text=${encodeWhatsAppText(message)}`, "_blank", "noopener,noreferrer");
      toast({
        title: `تم حفظ ${fileName}`,
        description: "لا يدعم هذا المتصفح إرفاق الملفات تلقائياً؛ أرفق الملف المحفوظ في محادثة واتساب.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Service receipt WhatsApp share failed:", error);
      toast({
        title: "تعذر تجهيز إيصال واتساب",
        description: "حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setReceiptWhatsAppLoading(false);
    }
  }

  function prevMonth() {
    if (calendarType === "hijri") {
      const prev = prevHijriMonth(hijriYear, hijriMonth);
      setHijriYear(prev.year);
      setHijriMonth(prev.month);
    } else if (gregMonth === 1) {
      setGregMonth(12);
      setGregYear((year) => year - 1);
    } else {
      setGregMonth((month) => month - 1);
    }
  }

  function nextMonth() {
    if (calendarType === "hijri") {
      const next = nextHijriMonth(hijriYear, hijriMonth);
      setHijriYear(next.year);
      setHijriMonth(next.month);
    } else if (gregMonth === 12) {
      setGregMonth(1);
      setGregYear((year) => year + 1);
    } else {
      setGregMonth((month) => month + 1);
    }
  }

  const calendarDays = useMemo(() => {
    if (calendarType === "hijri") return getHijriMonthDays(hijriYear, hijriMonth);
    const daysInMonth = new Date(gregYear, gregMonth, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(gregYear, gregMonth - 1, index + 1);
      return { date, hijriDay: toHijriComponents(date).day };
    });
  }, [calendarType, gregMonth, gregYear, hijriMonth, hijriYear]);

  const firstCalendarDate = calendarDays[0]?.date;
  const lastCalendarDate = calendarDays[calendarDays.length - 1]?.date;
  const firstDow = firstCalendarDate?.getDay() ?? 0;
  const dayNames = ["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"];
  const todayStr = new Date(serviceClock + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const calendarStart = firstCalendarDate ? toGregorianStr(firstCalendarDate) : "";
  const calendarEnd = lastCalendarDate ? toGregorianStr(lastCalendarDate) : "";
  const monthAppts = appointments.filter(
    (appointment) =>
      appointment.status !== "cancelled" &&
      [...serviceCalendarMap].some(([date, entries]) => date >= calendarStart && date <= calendarEnd && entries.some(entry => entry.id === appointment.id)),
  );

  const gregorianSpanLabel = useMemo(() => {
    if (!firstCalendarDate || !lastCalendarDate) return "";
    const first = firstCalendarDate.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" });
    const last = lastCalendarDate.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" });
    return first === last ? `${first} م` : `${first} – ${last} م`;
  }, [firstCalendarDate?.getTime(), lastCalendarDate?.getTime()]);

  const hijriSpanLabel = useMemo(() => {
    if (!firstCalendarDate || !lastCalendarDate) return "";
    if (calendarType === "hijri") return `${HIJRI_MONTHS_AR[hijriMonth - 1]} ${toArN(hijriYear)} هـ`;
    const first = toHijriComponents(firstCalendarDate);
    const last = toHijriComponents(lastCalendarDate);
    const firstLabel = `${HIJRI_MONTHS_AR[first.month - 1]} ${toArN(first.year)} هـ`;
    const lastLabel = `${HIJRI_MONTHS_AR[last.month - 1]} ${toArN(last.year)} هـ`;
    return firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`;
  }, [calendarType, firstCalendarDate?.getTime(), hijriMonth, hijriYear, lastCalendarDate?.getTime()]);

  const confirmedRevenue = appointments.filter(a => a.status === "confirmed" && a.amount).reduce((s, a) => s + parseFloat(a.amount), 0);
  const totalDeposits    = appointments.filter(a => a.deposit).reduce((s, a) => s + parseFloat(a.deposit ?? "0"), 0);

  const statusBadge: Record<string, string> = {
    confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    cancelled: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  };
  const statusLabel: Record<string, string> = { confirmed: "مؤكد", pending: "معلق", cancelled: "ملغي" };

  const filteredAppts = useMemo(
    () => sortServiceBookings<any>(
      appointments.filter(a => serviceBookingMatches(a, serviceBookingScope, listFilter, servicePaymentFilter, serviceClock)),
      todayStr,
    ),
    [appointments, listFilter, todayStr, serviceBookingScope, servicePaymentFilter, serviceClock],
  );
  const pagedAppts = serviceBookingPage(filteredAppts, serviceListPage);
  useEffect(() => {
    if (serviceListPage !== pagedAppts.page) setServiceListPage(pagedAppts.page);
  }, [serviceListPage, pagedAppts.page]);
  const summaryAppointments = summaryDate
    ? sortServiceBookings(serviceCalendarMap.get(summaryDate) ?? [], todayStr)
    : [];
  const summaryActiveAppointments = summaryAppointments.filter((appointment) => appointment.status !== "cancelled");
  const summaryBlocked = summaryDate ? blockedSet.has(summaryDate) : false;
  const summaryRemaining = Math.max(0, dailyCapacity - summaryActiveAppointments.length);
  const calendarCells: Array<{ date: Date; hijriDay: number } | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...calendarDays,
  ];
  const blockedDaysInView = blockedDates.filter(
    (blockedDate) => blockedDate.dateStr >= calendarStart && blockedDate.dateStr <= calendarEnd,
  ).length;

  const renderServiceBooking = (a: any) => (
    <ServiceBookingCard
      key={a.id}
      now={serviceClock}
      onShowInCalendar={() => showServiceBookingInCalendar(a)}
      appointment={a}
      serviceName={provider?.businessName ?? "الخدمة"}
      sourceLabel={SOURCE_LABELS[a.source] ?? a.source ?? "غير محدد"}
      durationLabel={serviceDurationLabel(a.duration, a.durationUnit)}
      requiresContract={!!provider?.requiresContract}
      templates={serviceMessageTemplates(a)}
      messageMenuOpen={openServiceMessageMenuId === a.id}
      isUpdating={updatingAppointmentId === a.id}
      isStatusBusy={cancellingId === a.id}
      reviewSending={reviewSendingId === a.id}
      reviewSent={reviewSentIds.has(a.id)}
      onToggleMessageMenu={() => setOpenServiceMessageMenuId(openServiceMessageMenuId === a.id ? null : a.id)}
      onSendTemplate={(body) => sendServiceCustomMessage(a, body)}
      onReceipt={() => setReceiptAppointment(a)}
      onAddPayment={() => openServicePaymentDialog(a)}
      onConfirm={() => handleStatusChange(a.id, "confirmed")}
      onCancel={() => setCancelAppointment(a)}
      onPreviewContract={() => setContractPreviewAppointment(a)}
      onSendContract={() => sendServiceContractWhatsApp(a)}
      onToggleContractSigned={() => updateServiceAppointmentFlags(a, { contractSigned: !a.contractSigned })}
      onToggleCashDeposited={() => updateServiceAppointmentFlags(a, { cashDeposited: !a.cashDeposited })}
      onSendReview={() => sendServiceReviewRequest(a)}
      onEdit={() => startEditingAppointment(a)}
      isDeleting={deletingAppointmentId === a.id}
      onDelete={() => handleDeleteAppointment(a.id)}
    />
  );

  return (
    <div ref={serviceCalendarRootRef} className="space-y-5">
      {apptError && (
        <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
          تعذر تحديث حجوزات الخدمة؛ لا تعتمد على ألوان الإتاحة حتى تنجح إعادة التحميل.
        </p>
      )}
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الحجوزات", val: appointments.length, icon: <BookOpen className="w-4 h-4" />, cls: "" },
          { label: "مؤكد", val: appointments.filter(a => a.status === "confirmed").length, icon: <CheckCircle className="w-4 h-4" />, cls: "text-green-600" },
          { label: "إيرادات مؤكدة", val: `${Math.round(confirmedRevenue).toLocaleString()} ر.س`, icon: <Wallet className="w-4 h-4" />, cls: "text-primary" },
          { label: "عربون محصّل", val: `${Math.round(totalDeposits).toLocaleString()} ر.س`, icon: <TrendingUp className="w-4 h-4" />, cls: "text-amber-600" },
        ].map(({ label, val, icon, cls }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-muted-foreground flex justify-center mb-1">{icon}</div>
            <p className={`text-lg font-extrabold text-foreground ${cls}`}>{val}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* ── CALENDAR ── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              تقويم الحجوزات والإتاحة
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              الطاقة اليومية: {toArN(dailyCapacity)} حجوزات — اضغط على أي يوم قادم لعرض تفاصيله وإدارته
            </p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs self-start md:self-auto">
            <button
              type="button"
              onClick={() => {
                setCalendarType("hijri");
                setCalendarPickerOpen(false);
                localStorage.setItem("dashCalDefaultType", "hijri");
              }}
              className={`px-3 py-1.5 font-bold transition-colors ${calendarType === "hijri" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              هجري
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarType("gregorian");
                setCalendarPickerOpen(false);
                localStorage.setItem("dashCalDefaultType", "gregorian");
              }}
              className={`px-3 py-1.5 font-bold transition-colors ${calendarType === "gregorian" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              ميلادي
            </button>
          </div>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
          <div className="relative text-center">
            <button
              type="button"
              onClick={() => {
                setCalendarPickerYear(calendarType === "hijri" ? hijriYear : gregYear);
                setCalendarPickerOpen((open) => !open);
              }}
              className="rounded-xl px-4 py-1 hover:bg-muted/60 transition-colors"
            >
              <span className="font-extrabold text-base text-foreground flex items-center justify-center gap-1">
                {calendarType === "hijri" ? hijriSpanLabel : gregorianSpanLabel}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </span>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {calendarType === "hijri" ? gregorianSpanLabel : hijriSpanLabel}
              </span>
            </button>
            {calendarPickerOpen && (
              <>
                <button
                  type="button"
                  aria-label="إغلاق اختيار الشهر"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setCalendarPickerOpen(false)}
                />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-card border border-border rounded-xl shadow-lg p-3 w-64" dir="rtl">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <button type="button" onClick={() => setCalendarPickerYear((year) => year + 1)} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold">{toArN(calendarPickerYear)} {calendarType === "hijri" ? "هـ" : "م"}</span>
                    <button type="button" onClick={() => setCalendarPickerYear((year) => year - 1)} className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center">
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(calendarType === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS_AR).map((monthName, index) => {
                      const monthNumber = index + 1;
                      const selected = calendarType === "hijri"
                        ? calendarPickerYear === hijriYear && monthNumber === hijriMonth
                        : calendarPickerYear === gregYear && monthNumber === gregMonth;
                      return (
                        <button
                          key={monthName}
                          type="button"
                          onClick={() => {
                            if (calendarType === "hijri") {
                              setHijriYear(calendarPickerYear);
                              setHijriMonth(monthNumber);
                            } else {
                              setGregYear(calendarPickerYear);
                              setGregMonth(monthNumber);
                            }
                            setCalendarPickerOpen(false);
                          }}
                          className={`rounded-lg py-1.5 px-1 text-[11px] font-medium leading-tight transition-colors ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
                        >
                          {monthName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
        </div>

        {/* Legend */}
        <div className="flex gap-3 flex-wrap text-xs text-muted-foreground items-center rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" /> متاح</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" /> محجوز جزئياً</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> مكتمل</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-200 border border-slate-400 inline-block" /> مغلق</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary/20 border border-primary inline-block" /> اليوم</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> مؤكد</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> معلّق</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> ملغي</span>
          <button type="button" onClick={() => setShowBlockDialog(true)}
            className="ms-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border border-border text-muted-foreground hover:border-red-400 hover:text-red-500">
            <Lock className="w-3 h-3" />إغلاق أيام
          </button>
        </div>

        {/* Grid — identical structure to chalet calendar */}
        <div className="select-none rounded-xl overflow-hidden border border-border">
          <div className="grid grid-cols-7 gap-px bg-border">
            {dayNames.map(d => <div key={d} className="bg-muted/60 text-center text-[10px] font-bold text-muted-foreground py-2">{d}</div>)}
            {calendarCells.map((calendarDay, i) => {
              if (!calendarDay) return <div key={`e-${i}`} className="bg-background/60 min-h-[76px]" />;
              const ds = toGregorianStr(calendarDay.date);
              const blocked = blockedSet.has(ds);
              const apptCnt = apptDays.get(ds) ?? 0;
              const remaining = Math.max(0, dailyCapacity - apptCnt);
              const full = apptCnt >= dailyCapacity;
              const hasAppt = apptCnt > 0;
              const isToday = ds === todayStr;
              const isPast  = ds < todayStr;
              const gregorianDay = calendarDay.date.getDate();
              const cellAppointments = serviceCalendarMap.get(ds) ?? [];
              const bookingCount = cellAppointments.length;
              const hasConfirmed = cellAppointments.some((appointment) => appointment.status === "confirmed");
              const hasPending = cellAppointments.some((appointment) => appointment.status === "pending");
              const hasCancelled = cellAppointments.some((appointment) => appointment.status === "cancelled");
              const primaryDay = calendarType === "hijri" ? calendarDay.hijriDay : gregorianDay;
              const secondaryDay = calendarType === "hijri" ? gregorianDay : calendarDay.hijriDay;
              return (
                <button key={ds} type="button"
                  onClick={() => {
                    if (isPast && bookingCount === 0) return;
                    setOpenServiceMessageMenuId(null);
                    setSummaryDate(ds);
                  }}
                  disabled={(isPast && bookingCount === 0) || togglingDate === ds}
                  data-service-calendar-date={ds}
                  data-testid={`service-calendar-day-${ds}`}
                  data-capacity-state={blocked ? "blocked" : full ? "full" : "available"}
                  aria-label={`${formatDualDate(ds).gregorian} — ${blocked ? "مغلق" : full ? "مكتمل الحجوزات" : `متبقي ${toArN(remaining)}`}`}
                  title={blocked ? "اليوم مغلق — اضغط لفتحه" : full ? "اكتملت الطاقة اليومية" : `${remaining} حجوزات متبقية`}
                  className={[
                    "focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary",
                    "flex flex-col items-center justify-start pt-1.5 pb-1 px-0.5 w-full",
                    "transition-colors focus:outline-none focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary/60",
                    "min-h-[88px] relative",
                    isPast
                      ? "bg-background/60 text-muted-foreground/40 cursor-default"
                      : blocked
                        ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300"
                        : full
                          ? "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 hover:bg-red-200"
                        : hasAppt
                          ? "bg-amber-50 dark:bg-amber-900/20 text-foreground hover:bg-amber-100"
                          : isToday
                            ? "bg-primary/10 text-primary ring-2 ring-inset ring-primary"
                            : "bg-emerald-50/60 dark:bg-emerald-950/10 hover:bg-emerald-100/70 text-foreground",
                    togglingDate === ds ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <span className="text-[0.82rem] font-bold leading-none">{toArN(primaryDay)}</span>
                  <span className={`text-[0.52rem] leading-none mt-0.5 tabular-nums ${blocked ? "opacity-60" : "text-muted-foreground"}`}>
                    {toArN(secondaryDay)} {calendarType === "hijri" ? "م" : "هـ"}
                  </span>
                  <span className={`mt-1 text-[9px] font-bold rounded-full px-1.5 py-0.5 ${
                    blocked
                      ? "bg-slate-300/80 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      : full
                      ? "bg-red-200/80 text-red-700 dark:bg-red-900/70 dark:text-red-200"
                      : hasAppt
                        ? "bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                  }`}>
                    {blocked ? "مغلق" : full ? "مكتمل" : `متبقي ${toArN(remaining)}`}
                  </span>
                  {bookingCount > 0 && (
                    <span className="mt-1 flex items-center justify-center gap-1.5" aria-label={`${toArN(bookingCount)} حجوزات في هذا اليوم`}>
                      {hasConfirmed && <span className="w-2 h-2 rounded-full bg-green-500" />}
                      {hasPending && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                      {hasCancelled && <span className="w-2 h-2 rounded-full bg-red-500" />}
                      <span className="text-[10px] font-extrabold leading-none tabular-nums text-foreground">
                        {toArN(bookingCount)}
                      </span>
                    </span>
                  )}
                  {cellAppointments.filter(appointment => appointment.status !== "cancelled").map(appointment => (
                    <span key={appointment.id} data-service-calendar-booking-id={appointment.id}
                      className="mt-1 w-full truncate text-center text-[10px] font-semibold" title={appointment.clientName}>
                      {appointment.clientName?.trim().split(/\s+/)[0] || "حجز"}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* Month summary */}
        <div className="flex gap-3 text-xs">
          <div className="flex-1 bg-muted rounded-xl px-4 py-2.5">
            <span className="font-semibold text-foreground">{toArN(blockedDaysInView)}</span>
            <span className="text-muted-foreground"> يوم محجوب هذا الشهر</span>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-2.5">
            <span className="font-semibold text-amber-700 dark:text-amber-400">{toArN(monthAppts.length)}</span>
            <span className="text-muted-foreground"> حجز</span>
          </div>
        </div>
      </div>

      {/* ── DAY DETAILS DIALOG ── */}
      {summaryDate && (() => {
        const dual = formatDualDate(summaryDate);
        const isPastSummary = summaryDate < todayStr;
        const isFullSummary = summaryActiveAppointments.length >= dailyCapacity;
        return (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !updatingAppointmentId && !reviewSendingId) {
                setOpenServiceMessageMenuId(null);
                setSummaryDate(null);
              }
            }}
          >
            <DialogContent
              dir="rtl"
              className="max-w-5xl max-h-[calc(100vh-1.5rem)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden p-4 sm:p-5 gap-3"
              data-testid="service-day-details-dialog"
            >
              <DialogHeader>
                <DialogTitle className="text-right flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary" />
                  تفاصيل يوم الخدمة
                </DialogTitle>
                <DialogDescription className="text-right">
                  <span className="font-bold text-foreground">{withHijriEra(dual.hijri)}</span>
                  <span className="mx-2">—</span>
                  <span>{dual.gregorian} م</span>
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "الطاقة اليومية", value: dailyCapacity, tone: "text-foreground" },
                  { label: "الحجوزات النشطة", value: summaryActiveAppointments.length, tone: "text-amber-700 dark:text-amber-400" },
                  { label: "المتبقي", value: summaryBlocked ? 0 : summaryRemaining, tone: summaryRemaining > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600" },
                  { label: "حالة اليوم", value: summaryBlocked ? "مغلق" : isFullSummary ? "مكتمل" : "متاح", tone: summaryBlocked || isFullSummary ? "text-red-600" : "text-emerald-700 dark:text-emerald-400" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
                    <p className={`text-base font-extrabold ${item.tone}`}>
                      {typeof item.value === "number" ? toArN(item.value) : item.value}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>

              {summaryAppointments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                  <Calendar className="w-9 h-9 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="font-bold text-foreground">
                    {summaryBlocked ? "هذا اليوم مغلق للحجوزات" : "لا توجد حجوزات في هذا اليوم"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summaryBlocked ? "يمكنك إتاحته من زر إدارة اليوم أدناه." : `يمكن تسجيل ${toArN(summaryRemaining)} حجوزات حسب الطاقة اليومية.`}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {summaryAppointments.map((appointment) => (
                      <ServiceBookingCard
                        key={appointment.id}
                        now={serviceClock}
                        onShowInCalendar={() => showServiceBookingInCalendar(appointment)}
                        appointment={appointment}
                        serviceName={provider?.businessName ?? "الخدمة"}
                        sourceLabel={SOURCE_LABELS[appointment.source] ?? appointment.source ?? "غير محدد"}
                        durationLabel={serviceDurationLabel(appointment.duration, appointment.durationUnit)}
                        requiresContract={!!provider?.requiresContract}
                        templates={serviceMessageTemplates(appointment)}
                        messageMenuOpen={openServiceMessageMenuId === appointment.id}
                        isUpdating={updatingAppointmentId === appointment.id}
                        isStatusBusy={cancellingId === appointment.id}
                        reviewSending={reviewSendingId === appointment.id}
                        reviewSent={reviewSentIds.has(appointment.id)}
                        onToggleMessageMenu={() => setOpenServiceMessageMenuId(openServiceMessageMenuId === appointment.id ? null : appointment.id)}
                        onSendTemplate={(body) => sendServiceCustomMessage(appointment, body)}
                        onReceipt={() => setReceiptAppointment(appointment)}
                        onAddPayment={() => openServicePaymentDialog(appointment)}
                        onConfirm={() => handleStatusChange(appointment.id, "confirmed")}
                        onCancel={() => setCancelAppointment(appointment)}
                        onPreviewContract={() => setContractPreviewAppointment(appointment)}
                        onSendContract={() => sendServiceContractWhatsApp(appointment)}
                        onToggleContractSigned={() => updateServiceAppointmentFlags(appointment, { contractSigned: !appointment.contractSigned })}
                        onToggleCashDeposited={() => updateServiceAppointmentFlags(appointment, { cashDeposited: !appointment.cashDeposited })}
                        onSendReview={() => sendServiceReviewRequest(appointment)}
                        onEdit={() => { setSummaryDate(null); startEditingAppointment(appointment); }}
                      />
                  ))}
                </div>
              )}

              {!isPastSummary && (
                <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2">
                  <p className="text-xs font-bold text-foreground">إدارة اليوم</p>
                  <div className="flex flex-wrap gap-2">
                    {!summaryBlocked && !isFullSummary && (
                      <Button
                        size="sm"
                        className="rounded-xl gap-1.5"
                        onClick={() => createBookingForDate(summaryDate)}
                      >
                        <Plus className="w-4 h-4" />إضافة حجز
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={togglingDate === summaryDate || (!summaryBlocked && summaryActiveAppointments.length > 0)}
                      className={`rounded-xl gap-1.5 ${summaryBlocked ? "text-green-700" : "text-red-600"}`}
                      onClick={() => toggleDate(summaryDate)}
                    >
                      {togglingDate === summaryDate ? <Loader2 className="w-4 h-4 animate-spin" /> : summaryBlocked ? <CheckCircle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      {summaryBlocked ? "إتاحة اليوم" : "إغلاق اليوم"}
                    </Button>
                  </div>
                  {!summaryBlocked && summaryActiveAppointments.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">لا يمكن إغلاق اليوم قبل إلغاء أو نقل جميع حجوزاته النشطة.</p>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── BOOKING DIALOG ── */}
      <Button onClick={revealBookingForm} variant="outline" className="gap-2 rounded-xl w-full md:w-auto">
        <Plus className="w-4 h-4" />تسجيل حجز جديد
      </Button>
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) closeBookingForm();
        }}
      >
        <DialogContent
          dir="rtl"
          data-testid="service-new-booking-form"
          aria-label={editingAppointmentId ? "تعديل الحجز" : "تسجيل حجز يدوي للخدمة"}
          className="max-w-md max-h-[92vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="text-right text-base">
              {editingAppointmentId ? "تعديل الحجز" : "إضافة حجز يدوي"}
            </DialogTitle>
            <DialogDescription className="text-right">
              {editingAppointmentId
                ? "تعديل بيانات الحجز وموعده من مكان واحد، مع توضيح سبب التعديل."
                : "تسجيل حجز مباشر للخدمة المحددة مع بيانات العميل والدفع."}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 -mt-1 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-base">🛎️</span>
              <span className="text-sm font-bold text-primary">
                {provider?.businessName ?? "الخدمة الحالية"}
              </span>
            </div>
            {form.dateStr ? (
              <p className="text-xs text-muted-foreground font-medium pr-7">
                📅 {withHijriEra(formatDualDate(form.dateStr).hijri)}
                <span className="text-muted-foreground/60 mr-2">({formatDualDate(form.dateStr).gregorian} م)</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground pr-7">اختر تاريخ الخدمة أدناه</p>
            )}
          </div>

          <div className="space-y-4 mt-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">أدخل بيانات العميل والقيمة والتاريخ ومصدر الحجز</p>
              {form.dateStr && (
                <span className="text-xs font-semibold rounded-full bg-muted px-3 py-1">
                  المتبقي في اليوم: {toArN(Math.max(0, dailyCapacity - (apptDays.get(form.dateStr) ?? 0)))}
                </span>
              )}
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">اسم الخدمة</label>
              <Input value={provider?.businessName ?? ""} readOnly className="rounded-xl bg-muted/40" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">اسم العميل *</label>
              <Input value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} placeholder="محمد أحمد" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-muted-foreground">رقم الجوال *</label>
                {serviceCustomerFound === true && <span className="text-[11px] font-bold text-blue-700">عميل مسجل</span>}
                {serviceCustomerFound === false && <span className="text-[11px] font-bold text-green-700">عميل جديد</span>}
              </div>
              <Input type="text" inputMode="numeric" lang="ar"
                value={toAr(form.clientPhone)}
                onChange={e => {
                  setServiceCustomerFound(null);
                  setForm(p => ({ ...p, clientPhone: e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) }));
                }}
                placeholder="٠٥xxxxxxxx" className="rounded-xl" dir="ltr" />
              {serviceCustomerLoading && <p className="text-[11px] text-muted-foreground">جاري البحث في قاعدة العملاء…</p>}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">طريقة تقديم الخدمة *</label>
              <Select value={form.serviceDeliveryMethod} onValueChange={v => setForm(p => ({ ...p, serviceDeliveryMethod: v, serviceAddress: v === "customer_pickup" ? "" : p.serviceAddress }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر طريقة تقديم الخدمة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery_installation">توصيل وتركيب بموقع العميل</SelectItem>
                  <SelectItem value="customer_pickup">استلام العميل من المقر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.serviceDeliveryMethod === "delivery_installation" && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  عنوان / موقع تقديم الخدمة <span className="font-normal">(اختياري)</span>
                </label>
                <Input
                  value={form.serviceAddress}
                  onChange={e => setForm(p => ({ ...p, serviceAddress: e.target.value }))}
                  placeholder="اسم القاعة، الحي، أو رابط الموقع"
                  className="rounded-xl"
                />
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">تفاصيل / ملاحظات الخدمة *</label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="rounded-xl resize-none" placeholder="اكتب تفاصيل تنفيذ الخدمة أو أي ملاحظات مهمة..." />
            </div>
            {shouldShowServiceClientId(provider?.requiresInsurance === true) && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  رقم الهوية / الإقامة <span className="font-normal">(اختياري)</span>
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  lang="ar"
                  value={toAr(form.clientIdNumber)}
                  onChange={e => setForm(p => ({
                    ...p,
                    clientIdNumber: e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))),
                  }))}
                  placeholder="رقم الهوية أو الإقامة"
                  className="rounded-xl"
                  dir="ltr"
                />
                <p className="text-[11px] text-muted-foreground">يظهر هذا الحقل لأن التأمين المسترد مفعّل لهذه الخدمة.</p>
              </div>
            )}
            <ServiceBookingScheduleFields editing={!!editingAppointmentId}
              time={form.startTime}
              onTimeChange={value => setForm(current => ({ ...current, startTime: value }))}
              reasonType={form.editReasonType} reason={form.editReason}
              onReasonTypeChange={value => setForm(current => ({
                ...current, editReasonType: value, editReason: value === "أخرى" ? "" : value,
              }))}
              onReasonChange={value => setForm(current => ({ ...current, editReason: value }))}>
              {/* Unified Hijri / Gregorian date picker */}
              {form.dateStr && !pickerOpen ? (
                <div className="flex items-center gap-3 bg-primary/5 border border-primary/30 rounded-xl px-4 py-2.5">
                  <div className="flex-1">
                    <p className="font-bold text-primary text-sm">{withHijriEra(formatDualDate(form.dateStr).hijri)}</p>
                    <p className="text-xs text-muted-foreground">{formatDualDate(form.dateStr).gregorian} م</p>
                  </div>
                  <button type="button" onClick={() => { setPickerOpen(true); const [y,m] = form.dateStr.split("-").map(Number); setPickYear(y); setPickMonth(m - 1); }}
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">تغيير</button>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {/* Mini picker header */}
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-2">
                    <button type="button" onClick={() => { if (pickMonth === 0) { setPickMonth(11); setPickYear(y => y - 1); } else setPickMonth(m => m - 1); }}
                      className="p-1 rounded hover:bg-muted transition-colors"><ChevronRight className="w-3.5 h-3.5" /></button>
                    <div className="text-center">
                      <p className="text-xs font-bold text-foreground">
                        {(() => {
                          const hijri = toHijriComponents(new Date(pickYear, pickMonth, 1));
                          return `${HIJRI_MONTHS_AR[hijri.month - 1]} ${toArN(hijri.year)} هـ`;
                        })()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{new Date(pickYear, pickMonth, 1).toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" })} م</p>
                    </div>
                    <button type="button" onClick={() => { if (pickMonth === 11) { setPickMonth(0); setPickYear(y => y + 1); } else setPickMonth(m => m + 1); }}
                      className="p-1 rounded hover:bg-muted transition-colors"><ChevronLeft className="w-3.5 h-3.5" /></button>
                  </div>
                  {/* Mini picker grid */}
                  <div className="select-none">
                    <div className="grid grid-cols-7 gap-px bg-border">
                      {["أحد","اثن","ثلا","أرب","خمي","جمع","سبت"].map(d => (
                        <div key={d} className="bg-muted/60 text-center text-[9px] font-bold text-muted-foreground py-1.5">{d}</div>
                      ))}
                      {(() => {
                        const fd = new Date(pickYear, pickMonth, 1).getDay();
                        const dim = new Date(pickYear, pickMonth + 1, 0).getDate();
                        const todayPick = new Date().toISOString().slice(0, 10);
                        const pickCells: (number | null)[] = [];
                        for (let i = 0; i < fd; i++) pickCells.push(null);
                        for (let d = 1; d <= dim; d++) pickCells.push(d);
                        return pickCells.map((day, idx) => {
                          if (!day) return <div key={`pe-${idx}`} className="bg-background/60 min-h-[48px]" />;
                          const ds = `${pickYear}-${String(pickMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const isSelected = ds === form.dateStr;
                          const isPast = ds < todayPick;
                          const isBlockedPick = blockedSet.has(ds);
                           const appointmentCount = apptDays.get(ds) ?? 0;
                           const editingOnDate = !!editingAppointmentId && appointments.some(
                             (appointment) =>
                               appointment.id === editingAppointmentId &&
                               appointment.dateStr === ds &&
                               appointment.status !== "cancelled",
                           );
                           const isFullPick = appointmentCount >= dailyCapacity && !editingOnDate;
                           const hijriD = toHijriComponents(new Date(pickYear, pickMonth, day)).day;
                          const gregAr = day.toLocaleString("ar-SA-u-nu-arab");
                          return (
                            <button key={ds} type="button"
                              onClick={() => {
                                 if (isPast || isBlockedPick || isFullPick) return;
                                setForm(p => ({ ...p, dateStr: ds }));
                                setPickerOpen(false);
                              }}
                               disabled={isPast || isBlockedPick || isFullPick}
                               title={isBlockedPick ? "هذا اليوم مغلق" : isFullPick ? "اكتملت الطاقة اليومية" : undefined}
                              className={[
                                "flex flex-col items-center justify-start pt-1 pb-1 px-0 w-full min-h-[48px]",
                                "transition-colors focus:outline-none relative",
                                isPast ? "bg-background/60 text-muted-foreground/40 cursor-default"
                                   : isBlockedPick || isFullPick ? "bg-red-100 dark:bg-red-900/40 text-red-400 dark:text-red-500 cursor-not-allowed"
                                  : isSelected ? "bg-primary text-primary-foreground"
                                  : ds === todayPick ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary"
                                  : "bg-background hover:bg-primary/5 text-foreground",
                              ].join(" ")}
                            >
                               <span className="text-[0.72rem] font-bold leading-none">{toArN(hijriD)}</span>
                              <span className={`text-[0.48rem] leading-none mt-0.5 tabular-nums ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{gregAr}</span>
                               {(isBlockedPick || isFullPick) && (
                                 <span className="absolute inset-0 flex items-end justify-center pb-0.5">
                                   <span className="text-[0.38rem] text-red-500 font-bold">{isBlockedPick ? "مغلق" : "مكتمل"}</span>
                                 </span>
                               )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </ServiceBookingScheduleFields>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">المدة</label>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <Input type="text" inputMode="decimal" lang="ar" value={toAr(form.duration)}
                  onChange={e => setForm(p => ({ ...p, duration: e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, "") }))}
                  placeholder="العدد" className="rounded-xl" />
                <Select value={form.durationUnit} onValueChange={v => setForm(p => ({ ...p, durationUnit: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="hours">ساعات</SelectItem><SelectItem value="days">أيام</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">المبلغ الإجمالي (ر.س)</label>
              <Input type="text" inputMode="decimal" lang="ar"
                value={toAr(form.amount)}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) }))}
                placeholder="٠" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">العربون المدفوع (ر.س)</label>
              <Input type="text" inputMode="decimal" lang="ar"
                value={toAr(form.deposit)}
                onChange={e => setForm(p => ({ ...p, deposit: e.target.value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) }))}
                placeholder="٠" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">المتبقي (ر.س)</label>
              <Input
                type="text"
                readOnly
                aria-live="polite"
                value={toAr(String((Number(form.amount) || 0) - (Number(form.deposit) || 0)))}
                className={`rounded-xl font-bold ${
                  (Number(form.amount) || 0) - (Number(form.deposit) || 0) < 0
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                }`}
              />
              <p className="text-[11px] text-muted-foreground">يُحسب تلقائياً: المبلغ الإجمالي ناقص العربون المدفوع.</p>
            </div>
            {(provider?.requiresInsurance || (editingAppointmentId && appointments.some(a => a.id === editingAppointmentId && a.insuranceAmount != null))) && (
              <div className="space-y-1.5">
                <label htmlFor={`service-appointment-insurance-${providerId}`} className="text-xs font-semibold text-muted-foreground">
                  التأمين المسترد المطبق (ر.س)
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  lang="ar"
                  id={`service-appointment-insurance-${providerId}`}
                  value={toAr(form.insuranceAmount)}
                  onChange={e => {
                    insuranceManuallyEditedRef.current = true;
                    setForm(p => ({ ...p, insuranceAmount: fromAr(e.target.value).replace(/٫/g, ".") }));
                  }}
                  className="rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground">القيمة الافتراضية من إعدادات الخدمة. يمكنك تعديلها أو مسحها أو إدخال صفر لإعفاء هذا الحجز فقط.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">مصدر الحجز</label>
              <Select value={form.source} onValueChange={v => setForm(p => ({ ...p, source: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {cancelReason === "أخرى" && <div className="space-y-1.5">
              <label className="text-sm font-semibold">وضح سبب الإلغاء بالتفصيل *</label>
              <Textarea value={cancelReasonDetails} onChange={e => setCancelReasonDetails(e.target.value)} rows={3} className="rounded-xl resize-none" placeholder="اكتب سبب الإلغاء بالتفصيل..." />
            </div>}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">مؤكد</SelectItem>
                  <SelectItem value="pending">معلق</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className={`text-sm font-semibold ${Number(form.deposit) <= 0 ? "text-muted-foreground" : ""}`}>
              طريقة الدفع
              {Number(form.deposit) <= 0 && <span className="text-[11px] font-normal mr-1.5">(أدخل مبلغ العربون أولاً)</span>}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "cash", label: "كاش", emoji: "💵" },
                { value: "transfer", label: "حوالة", emoji: "🏦" },
                { value: "pos", label: "شبكة", emoji: "💳" },
              ] as const).map(({ value, label, emoji }) => {
                const depositHasValue = Number(form.deposit) > 0;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!depositHasValue}
                    onClick={() => setForm((current) => ({ ...current, paymentMethod: value }))}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
                      !depositHasValue
                        ? "border-border text-muted-foreground/40 bg-muted/30 cursor-not-allowed opacity-50"
                        : form.paymentMethod === value
                          ? "border-primary bg-primary/8 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <span className="text-base">{emoji}</span>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">
              إرفاق صورة التحويل أو الإيصال <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            {form.paymentReceiptUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                <img src={form.paymentReceiptUrl} alt="إيصال الحجز" className="h-14 w-14 rounded-lg object-cover shrink-0" />
                <span className="flex-1 text-xs text-muted-foreground">تم إرفاق الإيصال</span>
                <button
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, paymentReceiptUrl: "" }))}
                  className="text-xs text-destructive hover:underline"
                >
                  حذف
                </button>
              </div>
            ) : (
              <label className={`flex items-center gap-2 rounded-xl border-2 border-dashed border-border p-3 transition-colors ${receiptUploading ? "cursor-wait opacity-70" : "cursor-pointer hover:border-primary/40"}`}>
                {receiptUploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" /> : <Camera className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="text-sm text-muted-foreground">{receiptUploading ? "جاري رفع الإيصال..." : "اضغط لإرفاق صورة أو ملف PDF"}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  disabled={receiptUploading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) await handleReceiptUpload(file);
                    event.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={closeBookingForm} disabled={saving || receiptUploading} className="rounded-xl">إلغاء</Button>
            <Button onClick={handleSave} disabled={saving || receiptUploading} className="rounded-xl gap-2 bg-amber-500 hover:bg-amber-600 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editingAppointmentId ? "حفظ التعديلات" : "حفظ الحجز"}
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!cancelAppointment}
        booking={cancelAppointment ? {
          ...cancelAppointment,
          bookingDate: cancelAppointment.dateStr,
          depositPaid: Number(cancelAppointment.deposit ?? 0),
          totalPrice: Number(cancelAppointment.amount ?? 0),
          revenueAmount: Number(cancelAppointment.deposit ?? 0),
          insuranceFee: Number(cancelAppointment.insuranceAmount ?? 0),
        } : null}
        insuranceSettlement={cancelAppointment ? { status: cancelAppointment.insuranceStatus ?? "held",
          deduction: Number(cancelAppointment.insuranceDeductAmount ?? 0) } : undefined}
        onClose={() => setCancelAppointment(null)}
        onConfirm={(id, reason, _reasonCode, refundAmount) => {
          void handleStatusChange(id, "cancelled", { reason, refundAmount });
        }}
      />

      <ServiceContractPreviewDialog appointment={contractPreviewAppointment} onClose={() => setContractPreviewAppointment(null)} />
      <ServiceBookingPaymentDialog
        appointment={paymentAppointment}
        submitting={recordServicePayment.isPending}
        error={paymentError}
        onClose={() => { if (!recordServicePayment.isPending) { setPaymentAppointment(null); setPaymentError(null); } }}
        onSubmit={submitServicePayment}
      />

      {/* ── APPOINTMENTS LIST ── */}
      <div ref={serviceListRef} className="min-w-0 space-y-3 scroll-mt-24" data-testid="service-bookings-register">
        <h3 className="text-sm font-bold text-foreground">سجل الحجوزات</h3>
        <ServiceBookingFilters
          scope={serviceBookingScope}
          payment={servicePaymentFilter}
          status={listFilter}
          onScopeChange={scope => { setServiceBookingScope(scope); setServiceListPage(1); }}
          onPaymentChange={filter => { setServicePaymentFilter(filter); setServiceListPage(1); }}
          onStatusChange={filter => { setListFilter(filter); setServiceListPage(1); }}
        />

        {apptError ? (
          <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
            تعذر تحميل حجوزات الخدمة. لا تمثل هذه الحالة عدم وجود حجوزات.
            <Button variant="outline" size="sm" onClick={() => refetchAppointments()}>إعادة المحاولة</Button>
          </div>
        ) : apptLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filteredAppts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium">لا توجد حجوزات مطابقة للنطاق والفلاتر المحددة</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {pagedAppts.items.map(renderServiceBooking)}
          </div>
        )}
        {!apptLoading && filteredAppts.length > 0 && (
          <BookingArchivePagination
            page={pagedAppts.page}
            total={filteredAppts.length}
            loading={false}
            label="صفحات سجل حجوزات الخدمات"
            onChange={(page) => {
              setServiceListPage(page);
              setOpenServiceMessageMenuId(null);
              serviceListRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
            }}
          />
        )}
      </div>

      {providerId && <ServiceBookingArchive
        key={providerId}
        providerId={providerId}
        serviceName={provider?.businessName ?? "الخدمة"}
        appointments={appointments}
        now={serviceClock}
        loading={apptLoading}
        error={apptError}
        onRetry={() => { void refetchAppointments(); }}
        renderBooking={renderServiceBooking}
      />}

      {/* Service receipt preview */}
      {receiptAppointment && (() => {
        const { total, deposit, remaining, paymentMethodLabel } = getServiceReceiptFinancialSummary(receiptAppointment);
        const serviceDate = serviceReceiptServiceDate(receiptAppointment.dateStr);
        const issueDate = serviceReceiptIssueDate(receiptAppointment);
        const identityField = getServiceClientIdField(
          provider?.requiresInsurance === true,
          receiptAppointment.clientIdNumber,
        );
        return (
          <Dialog open onOpenChange={(open) => { if (!open && !receiptWhatsAppLoading) setReceiptAppointment(null); }}>
            <DialogContent
              dir="rtl"
              className="max-w-2xl max-h-[94vh] overflow-y-auto p-0"
              data-testid="service-receipt-dialog"
            >
              <DialogHeader className="sr-only">
                <DialogTitle>إيصال حجز الخدمة</DialogTitle>
                <DialogDescription>معاينة إيصال الحجز وخيارات الطباعة والتنزيل والإرسال.</DialogDescription>
              </DialogHeader>
              <div className="bg-[#f7f2e8] p-3 sm:p-6">
                <div
                  id="receipt-print-area"
                  data-testid="service-receipt-print-content"
                  className="rounded-2xl bg-white border border-[#e8dcc4] shadow-sm overflow-hidden"
                >
                  <div
                    className="flex flex-row flex-nowrap items-center gap-2 sm:gap-4 p-4 sm:p-7 border-b-[3px] border-[#b88930]"
                    style={{ direction: "ltr" }}
                  >
                    <div className="order-1 flex flex-1 items-center justify-start" style={{ direction: "rtl" }}>
                      {provider?.logoUrl ? (
                        <img
                          src={provider.logoUrl}
                          alt={`شعار ${provider.businessName ?? "النشاط التجاري"}`}
                          className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 rounded-2xl border border-[#e6dfd0] bg-white object-contain object-center"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl border border-[#d9bd82] bg-[#fbf6ea] text-[#8d651d] flex items-center justify-center text-xl font-extrabold">
                          {(provider?.businessName ?? "خ").slice(0, 1)}
                        </div>
                      )}
                    </div>
                    <div className="order-2 w-[9.5rem] sm:w-[18.75rem] shrink-0 min-w-0 text-center" style={{ direction: "rtl" }}>
                      <h2 className="text-lg sm:text-2xl font-extrabold text-[#8d651d]">إيصال حجز خدمة</h2>
                      <p className="text-xs text-[#6f6b62] mt-2">
                        رقم الإيصال:{" "}
                        <bdi
                          dir="ltr"
                          style={{ display: "inline-block", direction: "ltr", unicodeBidi: "isolate", fontFamily: "Tahoma, Arial, sans-serif", fontVariantNumeric: "tabular-nums", letterSpacing: 0 }}
                        >
                          {serviceReceiptNumber(receiptAppointment)}
                        </bdi>
                      </p>
                      <p className="text-xs text-[#6f6b62] mt-1">تاريخ الإصدار: {issueDate.primary}</p>
                      <p className="text-xs text-[#777066] mt-1">{issueDate.secondary}</p>
                    </div>
                    <div className="order-3 flex flex-1 items-center justify-end" style={{ direction: "rtl" }}>
                      <img src={takyahLogoSrc} alt="شعار منصة تكية" className="w-16 h-12 sm:w-24 sm:h-16 object-contain" />
                    </div>
                  </div>

                  <div className="p-5 sm:p-7 space-y-6 text-[#25231f]">
                    <section>
                      <h3 className="text-sm font-bold text-[#8d651d] bg-[#fbf6ea] border-r-4 border-[#b88930] px-3 py-2 mb-3">بيانات العميل</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-xl overflow-hidden border border-[#e9e4d9] bg-[#e9e4d9]">
                        {[
                          ["اسم العميل", receiptAppointment.clientName],
                          ["رقم الجوال", receiptAppointment.clientPhone ? toAr(receiptAppointment.clientPhone) : "—"],
                          ...(identityField ? [[identityField.label, toAr(identityField.value)]] : []),
                        ].map(([label, value]) => (
                          <div key={label} className="bg-white p-4 min-h-[4.25rem] flex flex-col justify-center text-right">
                            <span className="block text-[11px] text-[#777066] mb-1.5">{label}</span>
                            <strong className="block text-sm leading-relaxed break-words">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-bold text-[#8d651d] bg-[#fbf6ea] border-r-4 border-[#b88930] px-3 py-2 mb-3">تفاصيل الخدمة</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px rounded-xl overflow-hidden border border-[#e9e4d9] bg-[#e9e4d9]">
                        <div className="bg-white p-4 min-h-[4.25rem] flex flex-col justify-center text-right">
                          <span className="block text-[11px] text-[#777066] mb-1.5">اسم الخدمة</span>
                          <strong className="text-sm">{provider?.businessName ?? "الخدمة"}</strong>
                        </div>
                        <div className="bg-white p-4 min-h-[4.25rem] flex flex-col justify-center text-right">
                          <span className="block text-[11px] text-[#777066] mb-1.5">تاريخ الخدمة</span>
                          <strong className="block text-sm">{serviceDate.hijri}</strong>
                          <span className="text-xs text-[#777066]">{serviceDate.gregorian}</span>
                        </div>
                        {receiptAppointment.serviceAddress && (
                          <div className="bg-white p-4 min-h-[4.25rem] flex flex-col justify-center text-right sm:col-span-2">
                            <span className="block text-[11px] text-[#777066] mb-1.5">موقع / عنوان تقديم الخدمة</span>
                            <strong className="block text-sm leading-relaxed break-words">{receiptAppointment.serviceAddress}</strong>
                          </div>
                        )}
                        {receiptAppointment.startTime && (
                          <div className="bg-white p-4 text-right">
                            <span className="block text-[11px] text-[#777066] mb-1.5">وقت الموعد — بتوقيت السعودية</span>
                            <strong className="text-sm"><bdi>{toAr(receiptAppointment.startTime)}</bdi></strong>
                          </div>
                        )}
                        {receiptAppointment.notes && (
                          <div className="bg-white p-4 text-right sm:col-span-2" data-testid="service-receipt-details">
                            <span className="block text-[11px] text-[#777066] mb-1.5">تفاصيل العنصر / الخدمة والملاحظات</span>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{toAr(receiptAppointment.notes)}</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-sm font-bold text-[#8d651d] bg-[#fbf6ea] border-r-4 border-[#b88930] px-3 py-2 mb-3">الملخص المالي</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          ["المبلغ الإجمالي", serviceReceiptMoney(total), false],
                          ["العربون المدفوع", serviceReceiptMoney(deposit), false],
                          ["المتبقي", serviceReceiptMoney(remaining), true],
                          ["طريقة الدفع", paymentMethodLabel, false],
                        ].map(([label, value, highlighted]) => (
                          <div
                            key={String(label)}
                            className={`rounded-xl border p-3 text-center ${highlighted ? "bg-[#fbf6ea] border-[#d9bd82] text-[#7d5816]" : "bg-white border-[#e6dfd0]"}`}
                          >
                            <span className="block text-[10px] text-[#777066] mb-1.5">{label}</span>
                            <strong className="text-xs sm:text-sm">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <p className="text-center text-[11px] text-[#777066] border-t border-dashed border-[#d7cdb9] pt-4">
                      شكراً لاختياركم {provider?.businessName ?? "الخدمة"} - منصة تكية — هذا الإيصال صادر إلكترونياً
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-4 border-t border-border bg-card">
                <Button variant="outline" onClick={printServiceReceipt} className="gap-2 rounded-xl">
                  <Printer className="w-4 h-4" />
                  طباعة
                </Button>
                <Button
                  variant="outline"
                  onClick={printServiceReceipt}
                  className="gap-2 rounded-xl"
                  data-testid="service-receipt-download"
                >
                  <FileText className="w-4 h-4" />
                  حفظ كـ PDF
                </Button>
                <Button
                  onClick={() => { void sendServiceReceiptWhatsApp(); }}
                  disabled={receiptWhatsAppLoading}
                  className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  data-testid="service-receipt-whatsapp"
                >
                  {receiptWhatsAppLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {receiptWhatsAppLoading ? "جاري تجهيز الإيصال..." : "إرسال عبر واتساب"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Unblock Day Confirmation Dialog */}
      <Dialog open={!!unblockDay} onOpenChange={v => { if (!v) setUnblockDay(null); }}>
        <DialogContent dir="rtl" className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Lock className="w-4 h-4 text-red-500" />هذا اليوم مغلق
            </DialogTitle>
            <DialogDescription className="text-right">
              {unblockDay ? formatDualDate(unblockDay).hijri : ""}
              <br />هل تريد فتح هذا اليوم وإتاحته للحجز؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row-reverse">
            <Button variant="outline" onClick={() => setUnblockDay(null)}>إلغاء</Button>
            <Button
              disabled={togglingDate === unblockDay}
              onClick={async () => { const d = unblockDay!; setUnblockDay(null); await toggleDate(d); }}
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              {togglingDate === unblockDay ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              فتح اليوم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block-Dates Range Dialog */}
      <ServiceBlockDatesDialog
        open={showBlockDialog}
        providerId={providerId}
        onClose={() => setShowBlockDialog(false)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ["service-blocked-dates", providerId] })}
      />
    </div>
  );
}
