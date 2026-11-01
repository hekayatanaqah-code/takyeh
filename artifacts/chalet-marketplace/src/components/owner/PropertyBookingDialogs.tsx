import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useMemo, useRef } from "react";
import { resolveManualBookingProperty } from "@/lib/manualBookingProperty";
import { useQuery } from "@tanstack/react-query";
import type { PropertyPriceQuote } from "@workspace/api-client-react";
import { formatDualDate } from "@/lib/hijri";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toAr, fromAr } from "@/lib/utils";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { Plus, Sun, Camera, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfferPrice } from "@/components/chalet/PropertyOfferPrice";
import { INSURANCE_NOT_READY_MESSAGE } from "@workspace/booking-time";
import { ChaletAvailability, ChaletSeason, GlobalSeason, OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";
import { ChaletServiceRow } from "@/components/owner/ChaletServicesTab";
import { uploadFile } from "@/components/owner/finance-shared";
import { toArN } from "@/components/owner/owner-formatting";


/* ── Add Booking Dialog ──────────────────────── */
export function AddBookingDialog({
  open, onClose, submissions, onAdded, existingBookings, prefilledDate, prefilledChaletId, availabilityBlocks, prefilledPeriod, onBack,
}: {
  open: boolean;
  onClose: () => void;
  submissions: any[];
  onAdded: () => void;
  existingBookings?: OwnerBooking[];
  prefilledDate?: string | null;
  prefilledChaletId?: string | null;
  availabilityBlocks?: ChaletAvailability[];
  prefilledPeriod?: string | null;
  onBack?: (() => void) | null;
}) {
  const { toast } = useToast();
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [isReturningCustomer, setIsReturningCustomer] = useState<boolean | null>(null);
  const [bookingDate, setBookingDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [period, setPeriod] = useState<string>("");
  const [source, setSource] = useState<"platform" | "external">("external");
  const [submissionId, setSubmissionId] = useState<string>(() => resolveManualBookingProperty(submissions, "", prefilledChaletId));
  const [notes, setNotes] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [insuranceFee, setInsuranceFee] = useState("");
  const [insuranceReceived, setInsuranceReceived] = useState(false);
  const [insurancePaymentMethod, setInsurancePaymentMethod] = useState<"cash" | "transfer">("transfer");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "pos">("cash");
  const [cashDeposited, setCashDeposited] = useState(false);
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedAddonIds, setSelectedAddonIds] = useState<number[]>([]);
  const [addonQuantities, setAddonQuantities] = useState<Record<number, number>>({});
  const prevAddonsTotalRef = useRef(0);

  /* ── Seasonal pricing hint ── */
  const activeSubNum = submissionId && submissionId !== "none" ? Number(submissionId) : submissions[0]?.id ?? null;
  const { data: dialogSeasons = [] } = useQuery<ChaletSeason[]>({
    queryKey: ["owner", "seasons", activeSubNum],
    queryFn: async () => {
      if (!activeSubNum) return [];
      const r = await apiFetch(`/owner/seasons?submissionId=${activeSubNum}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activeSubNum,
  });
  const { data: dialogGlobalSeasons = [] } = useQuery<GlobalSeason[]>({
    queryKey: ["owner", "global-seasons", activeSubNum, "booking-dialog"],
    queryFn: async () => {
      if (!activeSubNum) return [];
      const r = await apiFetch(`/owner/global-seasons?submissionId=${activeSubNum}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activeSubNum,
  });
  const activeSeason = useMemo<ChaletSeason | GlobalSeason | null>(() => {
    if (!bookingDate) return null;
    const privateSeason = dialogSeasons.find((s) =>
      bookingDate >= s.startDate && bookingDate <= s.endDate &&
      (!s.period || !period || s.period === "all" || s.period === period)
    );
    if (privateSeason) return privateSeason;
    return dialogGlobalSeasons.find((s) =>
      s.enabled && bookingDate >= s.startDate && bookingDate <= s.endDate
    ) ?? null;
  }, [bookingDate, period, dialogSeasons, dialogGlobalSeasons]);

  /* ── Add-on services for selected chalet ── */
  const { data: dialogAddons = [], isLoading: addonsLoading } = useQuery<ChaletServiceRow[]>({
    queryKey: ["owner", "submission-addons", activeSubNum],
    queryFn: async () => {
      if (!activeSubNum) return [];
      const r = await apiFetch(`/owner/submission-addons/${activeSubNum}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activeSubNum,
    staleTime: 0,
    refetchOnMount: true,
  });
  const addonsTotalPrice = useMemo(() =>
    dialogAddons
      .filter(a => selectedAddonIds.includes(a.id) && a.unit !== "خدمة مجانية" && Number(a.price) > 0)
      .reduce((sum, a) => sum + Number(a.price) * (addonQuantities[a.id] ?? 1), 0),
  [dialogAddons, selectedAddonIds, addonQuantities]);

  /* ── Track addons total (no longer mutates totalPrice — base rent stays separate) ── */
  useEffect(() => {
    prevAddonsTotalRef.current = addonsTotalPrice;
  }, [addonsTotalPrice]);

  /* ── Derived chalet — must be declared BEFORE any derived variables that use it ── */
  const selectedChalet = submissions.find((s: any) => String(s.id) === submissionId) ?? null;

  /* ── Conflict detection: which periods are already booked across range ── */
  const conflictSet = useMemo(() => {
    const blocked = new Set<string>();
    if (!bookingDate || !existingBookings?.length) return blocked;
    const [sy, sm, sd] = bookingDate.split("-").map(Number);
    const duration = Math.max(1, durationDays);
    // Collect all dates in the selected range
    const rangeDates = new Set<string>();
    for (let i = 0; i < duration; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      rangeDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    // Walk existing bookings and expand their dates
    for (const b of existingBookings) {
      if (!b.bookingDate) continue;
      // If a chalet is selected, only check conflicts for that chalet
      if (submissionId && submissionId !== "none" && b.submissionId !== Number(submissionId)) continue;
      const bDur = Math.max(1, b.durationDays ?? 1);
      const [by, bm, bd2] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < bDur; i++) {
        const d = new Date(by, bm - 1, bd2 + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (rangeDates.has(ds)) blocked.add(b.period ?? "full_day");
      }
    }
    return blocked;
  }, [bookingDate, durationDays, existingBookings, submissionId]);

  /* ── Unpriced slot detection — disable period if no default price set ── */
  const activeDayPrice = activeSeason?.dailyPrices?.[bookingDate] ?? null;
  const morningUnpriced  = !activeDayPrice?.morning && !activeSeason?.priceMorning && !selectedChalet?.priceMorning && !selectedChalet?.priceFullDay;
  const eveningUnpriced  = !activeDayPrice?.evening && !activeSeason?.priceEvening && !selectedChalet?.priceEvening && !selectedChalet?.priceFullDay;
  const fullDayUnpriced  = !activeDayPrice?.fullDay && !activeSeason?.priceFullDay && !selectedChalet?.priceFullDay && !selectedChalet?.priceMorning && !selectedChalet?.priceEvening;
  // Only apply unpriced lock when a chalet is actually selected
  const hasChalet        = !!(submissionId && submissionId !== "none");

  /* ── Inactive slot — the chalet owner has disabled this period entirely ── */
  const morningInactive  = hasChalet && selectedChalet?.slotMorning === false;
  const eveningInactive  = hasChalet && selectedChalet?.slotEvening === false;
  const fullDayInactive  = hasChalet && selectedChalet?.slotFullDay === false;

  const morningDisabled  = conflictSet.has("morning")  || conflictSet.has("full_day") || morningInactive || (hasChalet && morningUnpriced);
  const eveningDisabled  = conflictSet.has("evening")  || conflictSet.has("full_day") || eveningInactive || (hasChalet && eveningUnpriced);
  const fullDayDisabled  = conflictSet.has("morning")  || conflictSet.has("evening") || conflictSet.has("full_day") || fullDayInactive || (hasChalet && fullDayUnpriced);
  const isFullyBlocked   = conflictSet.has("full_day") || (conflictSet.has("morning") && conflictSet.has("evening"));

  const morningBookingBlocked  = conflictSet.has("morning")  || conflictSet.has("full_day");
  const eveningBookingBlocked  = conflictSet.has("evening")  || conflictSet.has("full_day");
  const fullDayBookingBlocked  = conflictSet.has("morning")  || conflictSet.has("evening") || conflictSet.has("full_day");

  /* ── Maintenance block detection: any day in the booking range manually blocked ── */
  const maintenanceBlockNote = useMemo(() => {
    if (!bookingDate || !availabilityBlocks?.length) return null;
    const [sy, sm, sd] = bookingDate.split("-").map(Number);
    const duration = Math.max(1, durationDays);
    for (let i = 0; i < duration; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const av = availabilityBlocks.find((a) => a.dateStr === ds);
      if (av?.notes) return av.notes;
    }
    return null;
  }, [bookingDate, durationDays, availabilityBlocks]);

  // Auto-clear period if it becomes disabled
  useEffect(() => {
    if ((period === "morning" && morningDisabled) ||
        (period === "evening" && eveningDisabled) ||
        (period === "full_day" && fullDayDisabled)) {
      setPeriod("");
    }
  }, [morningDisabled, eveningDisabled, fullDayDisabled, period]);

  // Pre-fill date, chalet and period when opened from calendar click or booking footer
  useEffect(() => {
    if (open && prefilledDate) setBookingDate(prefilledDate);
    if (open && prefilledPeriod) setPeriod(prefilledPeriod);
    if (!open) { setBookingDate(""); setPeriod(""); }
  }, [open, prefilledDate, prefilledChaletId, prefilledPeriod]);

  // Resolve late-loaded inventory too, without overwriting a valid manual choice.
  useEffect(() => {
    if (!open) { setSubmissionId(""); return; }
    setSubmissionId(current => resolveManualBookingProperty(submissions, current, prefilledChaletId));
  }, [open, submissions, prefilledChaletId]);

  /* ── Auto-fill price when period or date changes ── */
  useEffect(() => {
    if (!period || !bookingDate) return;
    // Priority 1: active season price for this period/date
    if (activeSeason) {
      const dayDP = activeSeason.dailyPrices?.[bookingDate] ?? null;
      const sp =
        period === "morning"  ? (dayDP?.morning  ?? (activeSeason.priceMorning  ? Number(activeSeason.priceMorning)  : null)) :
        period === "evening"  ? (dayDP?.evening  ?? (activeSeason.priceEvening  ? Number(activeSeason.priceEvening)  : null)) :
        period === "full_day" ? (dayDP?.fullDay  ?? (activeSeason.priceFullDay  ? Number(activeSeason.priceFullDay)  : null)) :
        null;
      if (sp != null) { setTotalPrice(String(sp)); return; }
    }
    // Priority 2: chalet default price
    if (selectedChalet) {
      const dp =
        period === "morning"  ? selectedChalet.priceMorning :
        period === "evening"  ? selectedChalet.priceEvening :
        period === "full_day" ? selectedChalet.priceFullDay :
        null;
      if (dp) setTotalPrice(String(Math.round(Number(dp))));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, bookingDate, submissionId, activeSeason, selectedChalet]);

  const offerPriceKey = `${submissionId}:${bookingDate}:${period}:${durationDays}`;
  const [manualPriceKey, setManualPriceKey] = useState("");
  useEffect(() => { if (!open) setManualPriceKey(""); }, [open]);
  const offerPriceQuery = useQuery<PropertyPriceQuote>({
    queryKey: ["owner", "property-price-quote", submissionId, bookingDate, period, durationDays],
    enabled: open && !!submissionId && submissionId !== "none" && !!bookingDate && !!period,
    queryFn: async () => {
      const params = new URLSearchParams({ submissionId, date: bookingDate, period, durationDays: String(durationDays) });
      const r = await apiFetch(`/owner/price-quote?${params}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "تعذّر حساب السعر");
      return r.json();
    },
    refetchInterval: 30000, retry: false,
  });
  useEffect(() => {
    if (offerPriceQuery.data && manualPriceKey !== offerPriceKey) setTotalPrice(String(offerPriceQuery.data.price));
  }, [offerPriceQuery.data, offerPriceKey, manualPriceKey]);
  const useOfferPrice = manualPriceKey !== offerPriceKey && !!offerPriceQuery.data;
  const tp = totalPrice ? Math.round(Number(totalPrice) * 100) / 100 : null;
  const dp = depositPaid ? Math.round(Number(depositPaid)) : null;
  const grandTotal = tp !== null ? tp + addonsTotalPrice : null;
  const remainingBalance = grandTotal !== null && dp !== null ? Math.max(0, grandTotal - dp) : null;

  const customerLookupRequestRef = useRef(0);

  // Auto-fill client name + detect new/returning customer
  const lookupCustomerByPhone = async (phoneValue = clientPhone) => {
    const phone = phoneValue.trim();
    if (phone.length < 9) { setIsReturningCustomer(null); return; }
    const requestId = ++customerLookupRequestRef.current;
    setPhoneLoading(true);
    try {
      const r = await apiFetch(`/owner/customers/lookup?phone=${encodeURIComponent(phone)}`);
      if (r.ok) {
        const data = await r.json();
        if (requestId !== customerLookupRequestRef.current) return;
        if (data?.clientName) {
          setClientName(data.clientName);
          setIsReturningCustomer(true);
        } else {
          setIsReturningCustomer(false);
        }
      }
    } catch { /* silent */ } finally {
      setPhoneLoading(false);
    }
  };

  useEffect(() => {
    const phone = clientPhone.trim();
    if (phone.length < 9) {
      customerLookupRequestRef.current += 1;
      setIsReturningCustomer(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void lookupCustomerByPhone(phone);
    }, 350);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientPhone]);

  const reset = () => {
    setClientName(""); setClientPhone(""); setBookingDate(""); setDurationDays(1);
    setPeriod(""); setSource("external"); setSubmissionId(""); setNotes("");
    setTotalPrice(""); setDepositPaid(""); setInsuranceFee(""); setInsuranceReceived(false);
    setPaymentMethod("cash"); setCashDeposited(false); setPaymentReceiptUrl(null);
    setIsReturningCustomer(null); setSelectedAddonIds([]); setAddonQuantities({});
    prevAddonsTotalRef.current = 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Snapshot all state values immediately to avoid stale-closure or async-race issues
    const snapPhone    = clientPhone.trim();
    const snapDate     = bookingDate;
    const snapPeriod   = period;
    const snapPrice    = totalPrice;
    const snapDeposit  = depositPaid;
    const snapDuration = durationDays;
    const snapApplyOfferPrice = useOfferPrice;
    if (submissionId && submissionId !== "none" && manualPriceKey !== offerPriceKey
      && (!offerPriceQuery.data || offerPriceQuery.isFetching || offerPriceQuery.isError)) {
      toast({ title: "انتظر اكتمال تحديث السعر قبل الحفظ", variant: "destructive" });
      return;
    }
    const snapSource   = source;
    const snapNotes    = notes;
    const snapSubId    = submissionId;
    const snapInsuranceFee = insuranceFee;
    const snapInsuranceReceived = insuranceReceived;
    const snapInsurancePayMethod = insurancePaymentMethod;
    const snapPayMethod = paymentMethod;
    const snapCashDeposited = cashDeposited;
    const snapReceiptUrl = paymentReceiptUrl;
    const snapAddonIds = selectedAddonIds;
    const snapAddonQuantities = snapAddonIds.map(id => ({ id, quantity: addonQuantities[id] ?? 1 }));
    if (snapAddonQuantities.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      item.quantity > 1000000 || (dialogAddons.find(addon => addon.id === item.id)?.maxQuantity != null &&
        item.quantity > dialogAddons.find(addon => addon.id === item.id)!.maxQuantity!))) {
      toast({ title: "راجع كميات الخدمات؛ لا يمكن تجاوز المتاح لكل حجز.", variant: "destructive" });
      return;
    }
    const snapAddonTotal = addonsTotalPrice;

    if (!snapPhone) { setError("يرجى إدخال رقم الجوال"); return; }
    if (!snapDate) { setError("يرجى اختيار تاريخ الحجز"); return; }
    if (maintenanceBlockNote) { setError(`هذا اليوم غير متاح للحجز (صيانة/إغلاق مؤقت) — ${maintenanceBlockNote}`); return; }
    const validPeriods = ["morning", "evening", "full_day"] as const;
    const snapPeriodValid = validPeriods.includes(snapPeriod as typeof validPeriods[number]) ? (snapPeriod as typeof validPeriods[number]) : null;
    if (!snapPeriodValid) { setError("يرجى اختيار الفترة"); return; }
    if (!snapPrice) { setError("يرجى إدخال قيمة الإيجار الأساسية"); return; }
    if (Number(snapDeposit) > 0 && !snapPayMethod) { setError("الرجاء اختيار طريقة الدفع"); return; }
    if (grandTotal !== null && Number(snapDeposit) > grandTotal) {
      setError("العربون لا يمكن أن يتجاوز إجمالي قيمة الحجز");
      return;
    }
    setSaving(true); setError("");
    try {
      const body = {
        clientName: clientName || undefined,
        clientPhone: snapPhone,
        bookingDate: snapDate,
        durationDays: snapDuration,
        period: snapPeriodValid,
        source: snapSource,
        notes: snapNotes || undefined,
        submissionId: snapSubId && snapSubId !== "none" ? Number(snapSubId) : undefined,
        totalPrice: snapPrice ? Math.round((Number(snapPrice) + snapAddonTotal) * 100) / 100 : undefined,
        applyOfferPrice: snapApplyOfferPrice,
        depositPaid: snapDeposit ? Math.round(Number(snapDeposit)) : undefined,
        insuranceFee: snapInsuranceFee ? Math.round(Number(snapInsuranceFee)) : undefined,
        insuranceReceived: Number(snapInsuranceFee) > 0 ? snapInsuranceReceived : false,
        insurancePaymentMethod: Number(snapInsuranceFee) > 0 && snapInsuranceReceived ? snapInsurancePayMethod : "transfer",
        paymentMethod: snapPayMethod,
        cashDeposited: snapPayMethod === "cash" ? snapCashDeposited : true,
        paymentReceiptUrl: snapReceiptUrl || undefined,
        addonIds: snapAddonIds.length > 0 ? snapAddonIds : undefined,
        addonQuantities: snapAddonQuantities.length > 0 ? snapAddonQuantities : undefined,
      };
      console.log("[AddBooking] submitting body:", JSON.stringify(body));
      const r = await apiFetch("/owner/bookings", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => ({}));
        if (r.status === 409 && errJson.quote) await offerPriceQuery.refetch();
        if (errJson?.details) console.error("[AddBooking] Zod details:", JSON.stringify(errJson.details));
        setError(errJson?.error ?? "حدث خطأ، يرجى المحاولة مجدداً");
        return;
      }
      onAdded();
      onClose();
      reset();
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived display values ── */
  const bookingHijri = bookingDate ? formatDualDate(bookingDate).hijri.replace(/\s*هـ\s*$/, "") + " هـ" : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col gap-1.5">
            {onBack && (
              <button
                type="button"
                onClick={() => { onBack(); onClose(); reset(); }}
                className="self-start flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/8 transition-colors rounded-lg px-2.5 py-1.5 border border-primary/20 bg-primary/5"
              >
                <span className="text-sm">🔙</span>
                <span>العودة للحجز</span>
              </button>
            )}
            <DialogTitle className="text-right text-base">إضافة حجز يدوي</DialogTitle>
          </div>
        </DialogHeader>

        {/* ── Chalet + Date header banner ── */}
        <div className="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 -mt-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base">🏡</span>
            <span className="text-sm font-bold text-primary">
              {selectedChalet ? selectedChalet.nameAr : <span className="text-muted-foreground font-normal">لم يُحدَّد العقار بعد</span>}
            </span>
          </div>
          {bookingHijri && (
            <p className="text-xs text-muted-foreground font-medium pr-7">
              📅 {bookingHijri}
              {bookingDate && <span className="text-muted-foreground/60 mr-2">({formatDualDate(bookingDate).gregorian})</span>}
            </p>
          )}
          {!bookingHijri && (
            <p className="text-xs text-muted-foreground pr-7">اختر التاريخ أدناه لعرض التاريخ الهجري</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">

          {/* ── Chalet selector — REQUIRED, at top ── */}
          {submissions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">اسم العقار <span className="text-destructive">*</span></label>
              {submissions.length === 1 ? (
                <Input
                  aria-label="اسم العقار"
                  data-testid="manual-booking-single-property"
                  value={submissions[0].nameAr}
                  readOnly
                  className="text-right bg-muted/40"
                />
              ) : (
              <Select value={submissionId} onValueChange={setSubmissionId}>
                <SelectTrigger><SelectValue placeholder="اختر العقار..." /></SelectTrigger>
                <SelectContent>
                  {submissions.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}
            </div>
          )}

          {/* ── Phone — required, Arabic numerals ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">
                رقم الجوال <span className="text-destructive">*</span>
              </label>
              {isReturningCustomer === true && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  🔄 زبون سابق
                </span>
              )}
              {isReturningCustomer === false && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  🆕 زبون جديد
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(clientPhone)}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "");
                  setClientPhone(raw);
                  setIsReturningCustomer(null);
                }}
                onBlur={() => void lookupCustomerByPhone()}
                placeholder="٠٥xxxxxxxx"
                className="text-right"
              />
              {phoneLoading && <span className="absolute left-3 top-2.5 text-xs text-muted-foreground animate-pulse">جاري البحث…</span>}
            </div>
          </div>

          {/* ── Client name — optional ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم المستأجر</label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل الكريم (اختياري)" />
          </div>

          {/* ── Date + Duration ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">تاريخ الحجز <span className="text-destructive">*</span></label>
              <div className="rounded-md border bg-background px-3 py-2 text-sm min-h-[2.5rem] flex items-center">
                <DualCalendarPicker
                  value={bookingDate}
                  onChange={setBookingDate}
                  placeholder="اختر التاريخ"
                  minDate={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">عدد الأيام</label>
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(String(durationDays))}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "");
                  setDurationDays(Math.max(1, Number(raw) || 1));
                }}
              />
            </div>
          </div>

          {/* ── Maintenance block warning ── */}
          {maintenanceBlockNote && (
            <div className="flex items-start gap-2 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 px-3 py-2.5">
              <span className="text-base mt-0.5">🔧</span>
              <div>
                <p className="text-xs font-bold text-orange-800 dark:text-orange-300">هذا اليوم غير متاح للحجز (صيانة/إغلاق مؤقت)</p>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">{maintenanceBlockNote}</p>
              </div>
            </div>
          )}

          {/* ── Period — required ── */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">الفترة الزمنية <span className="text-destructive">*</span></label>
            {isFullyBlocked && !maintenanceBlockNote && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                <span className="text-base">⛔</span>
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">هذا اليوم محجوز بالكامل — لا تتوفر فترات متاحة</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {([
                {
                  value: "morning",  label: "صباحي",    sub: "الفترة الصباحية",
                  disabled: morningDisabled, booked: morningBookingBlocked, inactive: morningInactive,
                  unpriced: hasChalet && morningUnpriced && !morningBookingBlocked && !morningInactive, icon: "🌅",
                },
                {
                  value: "evening",  label: "مسائي",    sub: "الفترة المسائية",
                  disabled: eveningDisabled, booked: eveningBookingBlocked, inactive: eveningInactive,
                  unpriced: hasChalet && eveningUnpriced && !eveningBookingBlocked && !eveningInactive, icon: "🌙",
                },
                {
                  value: "full_day", label: "يوم كامل", sub: "يوم كامل",
                  disabled: fullDayDisabled, booked: fullDayBookingBlocked, inactive: fullDayInactive,
                  unpriced: hasChalet && fullDayUnpriced && !fullDayBookingBlocked && !fullDayInactive, icon: "☀️",
                },
              ] as const).map(({ value, label, sub, disabled, booked, unpriced, inactive, icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPeriod(value)}
                  className={[
                    "relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-start transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40",
                    disabled
                      ? "opacity-50 cursor-not-allowed bg-muted/40 border-border"
                      : period === value
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold flex items-center gap-1">
                    {icon && <span>{icon}</span>}
                    {label}
                    {inactive && <span className="text-[10px] font-bold text-muted-foreground mr-1">(غير متاح)</span>}
                    {booked   && !inactive && <span className="text-[10px] font-bold text-red-500 dark:text-red-400 mr-1">(محجوز)</span>}
                    {unpriced && <span className="text-[10px] font-bold text-gray-400 mr-1">(غير مسعّر)</span>}
                  </span>
                  {(value as string) !== "none" && (
                    <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>
                  )}
                  {period === value && !disabled && (
                    <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Add-on Services checklist ── */}
          {(addonsLoading || dialogAddons.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                خدمات إضافية (اختياري)
              </p>
              {addonsLoading ? (
                <div className="flex items-center justify-center py-4 rounded-xl border border-border bg-muted/20">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                  {dialogAddons.map(addon => {
                    const checked = selectedAddonIds.includes(addon.id);
                    const isFree = addon.unit === "خدمة مجانية" || Number(addon.price) === 0;
                    return (
                      <div key={addon.id} className="flex items-start gap-3 select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          id={`addon-select-${addon.id}`}
                          disabled={addon.maxQuantity === 0 && !checked}
                          aria-label={`اختيار خدمة ${addon.name}`}
                          onChange={(e) => setSelectedAddonIds(ids =>
                            e.target.checked ? [...ids, addon.id] : ids.filter(i => i !== addon.id)
                          )}
                          className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`addon-select-${addon.id}`} className="text-sm font-semibold leading-tight cursor-pointer">{addon.name}</label>
                          {addon.maxQuantity != null && <p className="text-sm text-foreground mt-1">
                            {addon.maxQuantity === 0 ? "غير متاحة حالياً" : `المتاح لكل حجز: ${toAr(addon.maxQuantity)}`}
                          </p>}
                          {checked && <div className="mt-2 space-y-1">
                            <label className="text-sm font-medium" htmlFor={`addon-quantity-${addon.id}`}>الكمية المطلوبة</label>
                            <Input id={`addon-quantity-${addon.id}`} aria-label={`كمية خدمة ${addon.name}`}
                              inputMode="numeric" className="w-24 h-9" value={toAr(addonQuantities[addon.id] ?? 1)}
                              onChange={event => setAddonQuantities(old => ({ ...old, [addon.id]: Number(fromAr(event.target.value).replace(/[^\d]/g, "")) }))} />
                            {(addonQuantities[addon.id] === 0 || (addon.maxQuantity != null && (addonQuantities[addon.id] ?? 1) > addon.maxQuantity)) &&
                              <p role="alert" className="text-sm text-destructive">أدخل كمية صحيحة لا تتجاوز المتاح.</p>}
                          </div>}
                          {addon.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{addon.description}</p>
                          )}
                        </div>
                        <span className={`text-xs font-bold whitespace-nowrap shrink-0 ${isFree ? "text-green-600 dark:text-green-400" : "text-primary"}`}>
                          {isFree ? "🎁 خدمة مجانية" : `${toAr(Math.round(Number(addon.price)))} ر.س / ${addon.unit}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {addonsTotalPrice > 0 && (
                <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 space-y-1 text-xs">
                  {totalPrice && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>قيمة الإيجار الأساسية</span>
                      <span className="font-semibold text-foreground">{toAr(Number(totalPrice) || 0)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>إجمالي الخدمات الإضافية</span>
                    <span className="font-semibold text-primary">+ {toAr(addonsTotalPrice)} ر.س</span>
                  </div>
                  {totalPrice && (
                    <div className="flex justify-between border-t border-border pt-1">
                      <span className="font-semibold text-foreground">الإجمالي الكلي</span>
                      <span className="font-bold text-primary">{toAr((Number(totalPrice) || 0) + addonsTotalPrice)} ر.س</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Financial Fields — إجمالي required ── */}
          <div className="bg-muted/40 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">تفاصيل المبالغ</p>
            {activeSeason && (() => {
              /* Per-day price takes priority over season-level price */
              const dayDP = activeSeason.dailyPrices?.[bookingDate ?? ""] ?? null;
              const morningP = dayDP?.morning ?? (activeSeason.priceMorning ? Number(activeSeason.priceMorning) : null);
              const eveningP = dayDP?.evening ?? (activeSeason.priceEvening ? Number(activeSeason.priceEvening) : null);
              const fullDayP = dayDP?.fullDay ?? (activeSeason.priceFullDay ? Number(activeSeason.priceFullDay) : null);
              const seasonPrice =
                period === "morning" && morningP != null ? morningP :
                period === "evening" && eveningP != null ? eveningP :
                (period === "full_day" || period === "all") && fullDayP != null ? fullDayP :
                null;
              const hasDailyOverride = !!dayDP && Object.keys(dayDP).length > 0;
              return (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex-1">موسم: {activeSeason.nameAr}</p>
                    {hasDailyOverride && <span className="text-[10px] bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-full">سعر هذا اليوم</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                    {morningP != null && <span>☀️ صباحي: <span className="font-semibold">{toAr(morningP)} ر.س</span></span>}
                    {eveningP != null && <span>🌙 مسائي: <span className="font-semibold">{toAr(eveningP)} ر.س</span></span>}
                    {fullDayP != null && <span>📅 يوم كامل: <span className="font-semibold">{toAr(fullDayP)} ر.س</span></span>}
                  </div>
                  {seasonPrice != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 w-full"
                      onClick={() => { setManualPriceKey(offerPriceKey); setTotalPrice(String(seasonPrice)); }}
                    >
                      تطبيق السعر الموسمي للفترة المحددة
                    </Button>
                  )}
                </div>
              );
            })()}
            {offerPriceQuery.data && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" data-testid="owner-booking-offer-price">
                <p className="mb-2 font-semibold">السعر المعتمد للأيام المحددة</p>
                <OfferPrice quote={offerPriceQuery.data} />
                {manualPriceKey === offerPriceKey && <p className="mt-2 text-xs">تم اختيار سعر يدوي لهذا الحجز. <button type="button" className="underline" onClick={() => setManualPriceKey("")}>تطبيق السعر المعتمد</button></p>}
              </div>
            )}
            {offerPriceQuery.isError && <p className="text-sm text-destructive">تعذّر حساب السعر المعتمد. يمكنك إعادة المحاولة أو إدخال سعر يدوي.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  قيمة الإيجار الأساسية (ر.س) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={toAr(totalPrice)}
                  onChange={(e) => { setManualPriceKey(offerPriceKey); setTotalPrice(
                    e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace("٫", ".").replace(",", ".")
                      .replace(/[^\d.]/g, "")
                  ); }}
                  placeholder="٠"
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">العربون المدفوع (ر.س)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={toAr(depositPaid)}
                  onChange={(e) => setDepositPaid(
                    e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/\D/g, "")
                  )}
                  placeholder="٠"
                  className={`text-right ${grandTotal !== null && Number(depositPaid) > grandTotal ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {grandTotal !== null && Number(depositPaid) > grandTotal && (
                  <p className="text-xs font-semibold text-destructive">العربون لا يمكن أن يتجاوز إجمالي قيمة الحجز</p>
                )}
              </div>
            </div>
            {remainingBalance !== null && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">المبلغ المتبقي:</span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{remainingBalance.toLocaleString("ar-SA")} ر.س</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">مبلغ التأمين (ر.س) — قابل للإعادة</label>
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(insuranceFee)}
                onChange={(e) => setInsuranceFee(
                  e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "")
                )}
                placeholder="٠"
                className="text-right"
              />
              {Number(insuranceFee) > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none group mt-1">
                  <input
                    type="checkbox"
                    checked={insuranceReceived}
                    onChange={(e) => setInsuranceReceived(e.target.checked)}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    تم استلام التأمين الآن؟
                    <span className={`mr-1 font-semibold ${insuranceReceived ? "text-green-600" : "text-amber-600"}`}>
                      {insuranceReceived ? "(مُستلَم — يُضاف للسجل)" : "(معلّق — لا يُضاف للسجل)"}
                    </span>
                  </span>
                </label>
              )}
              {Number(insuranceFee) > 0 && insuranceReceived && (
                <div className="flex gap-2 mt-1.5">
                  <button type="button" onClick={() => setInsurancePaymentMethod("transfer")}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border-2 transition-colors ${insurancePaymentMethod === "transfer" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "border-border text-muted-foreground hover:border-blue-300"}`}>
                    🏦 تحويل بنكي
                  </button>
                  <button type="button" onClick={() => setInsurancePaymentMethod("cash")}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border-2 transition-colors ${insurancePaymentMethod === "cash" ? "border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" : "border-border text-muted-foreground hover:border-amber-300"}`}>
                    💵 نقداً
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Source ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">مصدر الحجز</label>
            <Select value={source} onValueChange={(v) => setSource(v as "platform" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">من خارج المنصة (واتساب / انستقرام)</SelectItem>
                <SelectItem value="platform">عن طريق المنصة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Notes — optional ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">ملاحظات <span className="text-xs font-normal text-muted-foreground">(اختياري)</span></label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
          </div>

          {/* ── Payment Method ── */}
          <div className="space-y-2">
            <label className={`text-sm font-semibold ${Number(depositPaid) <= 0 ? "text-muted-foreground" : ""}`}>
              طريقة الدفع
              {Number(depositPaid) <= 0 && <span className="text-[11px] font-normal mr-1.5">(أدخل مبلغاً أولاً)</span>}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { val: "cash",     label: "كاش",    emoji: "💵" },
                { val: "transfer", label: "حوالة",  emoji: "🏦" },
                { val: "pos",      label: "شبكة",   emoji: "💳" },
              ] as const).map(({ val, label, emoji }) => {
                const depositHasValue = Number(depositPaid) > 0;
                return (
                  <button
                    key={val}
                    type="button"
                    disabled={!depositHasValue}
                    onClick={() => depositHasValue && setPaymentMethod(val)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 text-xs font-semibold transition-all ${
                      !depositHasValue
                        ? "border-border text-muted-foreground/40 bg-muted/30 cursor-not-allowed opacity-50"
                        : paymentMethod === val
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
            {paymentMethod === "cash" && Number(depositPaid) > 0 && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 space-y-2.5">
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">هل تم إيداع الكاش في البنك؟</p>
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-0.5">اختر الوضع الصحيح — يمكن تغييره لاحقاً من سجل المعاملات</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCashDeposited(false)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 py-2.5 px-2 text-xs font-bold transition-all ${!cashDeposited ? "border-amber-500 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300" : "border-border text-muted-foreground bg-background hover:border-amber-300"}`}
                  >
                    <span className="text-base">💵</span>
                    <span>لا</span>
                    <span className="font-normal text-[10px]">سيولة يدوية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashDeposited(true)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 py-2.5 px-2 text-xs font-bold transition-all ${cashDeposited ? "border-green-500 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" : "border-border text-muted-foreground bg-background hover:border-green-300"}`}
                  >
                    <span className="text-base">🏦</span>
                    <span>نعم</span>
                    <span className="font-normal text-[10px]">أُودع في البنك</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Receipt Image ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">
              إرفاق صورة التحويل أو الإيصال <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
            </label>
            {paymentReceiptUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                <img src={paymentReceiptUrl} alt="إيصال" className="h-14 w-14 rounded-lg object-cover shrink-0" />
                <span className="flex-1 text-xs text-muted-foreground">تم إرفاق الصورة</span>
                <button type="button" onClick={() => setPaymentReceiptUrl(null)} className="text-xs text-destructive hover:underline">حذف</button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border p-3 hover:border-primary/40 transition-colors">
                <Camera className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">{receiptUploading ? "جاري الرفع..." : "اضغط لإرفاق صورة"}</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  disabled={receiptUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setReceiptUploading(true);
                    const url = await uploadFile(file);
                    if (url) setPaymentReceiptUrl(url);
                    setReceiptUploading(false);
                  }}
                />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={saving || receiptUploading || (grandTotal !== null && Number(depositPaid) > grandTotal)}>
              {saving ? "جاري الحفظ..." : "حفظ الحجز"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>إلغاء</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Proof Viewer Dialog ───────────────────────────────── */
export function ProofViewerDialog({
  booking,
  open,
  onClose,
}: {
  booking: OwnerBooking | null;
  open: boolean;
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (!booking) return null;
  const images: string[] = (() => {
    try { return JSON.parse(booking.insuranceProofImages ?? "[]"); } catch { return []; }
  })();

  const fullUrl = (url: string) =>
    url.startsWith("http") ? url : `${window.location.origin}${BASE}${url}`;

  return (
    <>
      <Dialog open={open && !lightbox} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">📸 إثبات التلفيات — {booking.clientName}</DialogTitle>
            {booking.insuranceDeductReason && (
              <div className="text-sm text-muted-foreground mt-1">السبب: {booking.insuranceDeductReason}</div>
            )}
          </DialogHeader>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد صور مرفقة</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
              {images.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(fullUrl(url))}
                  className="relative rounded-lg overflow-hidden aspect-square bg-muted hover:opacity-90 transition"
                >
                  <img
                    src={fullUrl(url)}
                    alt={`إثبات ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {toAr(i + 1)} / {toAr(images.length)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-0">
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-2 left-2 z-50 text-white bg-black/60 rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >✕</button>
            <img src={lightbox} alt="proof" className="w-full max-h-[80vh] object-contain rounded" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ── Manage Insurance Dialog ───────────────────────── */
export function ManageInsuranceDialog({
  booking,
  open,
  onClose,
  onSaved,
  apiFetch,
  formatAmount,
  canSettle,
}: {
  booking: OwnerBooking | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  formatAmount: (v: string | number | null | undefined) => string;
  canSettle: boolean;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [mode, setMode] = useState<"choose" | "refund" | "deduct">("choose");
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [proofImages, setProofImages] = useState<string[]>([]);      // uploaded URLs
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode("choose"); setDeductAmount(""); setDeductReason("");
      setProofImages([]); setUploading(false); setSaving(false);
      setSaveError("");
    }
  }, [open]);

  if (!booking) return null;

  const insurance = Number(booking.insuranceFee ?? 0);
  const deductVal = Math.round(Number(deductAmount) || 0);
  const remaining = Math.max(0, insurance - deductVal);

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${BASE}/api/storage/uploads/process`, {
          method: "POST", credentials: "include", body: fd,
        });
        if (r.ok) {
          const data = await r.json();
          if (data?.url) uploaded.push(data.url);
        }
      } catch { /* skip failed */ }
    }
    setProofImages(prev => [...prev, ...uploaded]);
    setUploading(false);
  };

  const removeProofImage = (url: string) =>
    setProofImages(prev => prev.filter(u => u !== url));

  const fullUrl = (url: string) =>
    url.startsWith("http") ? url : `${window.location.origin}${BASE}${url}`;

  const saveInsurance = async (patch: Record<string, unknown>) => {
    setSaving(true); setSaveError("");
    try {
      const response = await apiFetch(`/owner/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "تعذر حفظ التأمين");
      }
      onSaved(); onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "تعذر حفظ التأمين");
    } finally { setSaving(false); }
  };

  const handleFullRefund = async () => {
    if (!canSettle) return;
    await saveInsurance({ insuranceRefunded: true, insuranceDeducted: 0, insuranceDeductReason: null });
  };

  const handleDeduct = async () => {
    if (!canSettle || deductVal <= 0 || deductVal > insurance) return;
    await saveInsurance({
        insuranceRefunded: true,
        insuranceDeducted: deductVal,
        insuranceDeductReason: deductReason || undefined,
        insuranceProofImages: proofImages,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            🔒 إدارة التأمين — {booking.clientName}
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            مبلغ التأمين: <span className="font-bold text-orange-600">{formatAmount(booking.insuranceFee)}</span>
          </div>
        </DialogHeader>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        {!canSettle && <p className="text-xs text-muted-foreground">{INSURANCE_NOT_READY_MESSAGE}</p>}

        {mode === "choose" && (
          <div className="flex flex-col gap-3 py-2">
            {!booking.insuranceReceived && (
              <Button type="button" disabled={saving} onClick={() => saveInsurance({ insuranceReceived: true })}>
                {saving ? "جارٍ التسجيل..." : "تسجيل استلام التأمين"}
              </Button>
            )}
            {booking.insuranceReceived && <p className="text-xs text-emerald-700">تم تسجيل استلام التأمين</p>}
            <button
              disabled={!canSettle || saving}
              title={!canSettle ? INSURANCE_NOT_READY_MESSAGE : undefined}
              onClick={() => setMode("refund")}
              className="w-full rounded-lg border-2 border-green-200 bg-green-50 p-4 text-right hover:bg-green-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-bold text-green-700">✅ إرجاع بالكامل</div>
              <div className="text-sm text-green-600 mt-1">إعادة كامل مبلغ التأمين للعميل دون أي خصم</div>
            </button>
            <button
              disabled={!canSettle || saving}
              title={!canSettle ? INSURANCE_NOT_READY_MESSAGE : undefined}
              onClick={() => setMode("deduct")}
              className="w-full rounded-lg border-2 border-red-200 bg-red-50 p-4 text-right hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="font-bold text-red-700">✂️ خصم من التأمين</div>
              <div className="text-sm text-red-600 mt-1">خصم مبلغ بسبب تلفيات مع رفع صور الإثبات</div>
            </button>
          </div>
        )}

        {mode === "refund" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{formatAmount(booking.insuranceFee)}</div>
              <div className="text-sm text-green-800 dark:text-green-200 mt-1 font-medium">سيتم إرجاع كامل مبلغ التأمين للعميل</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} disabled={saving}>رجوع</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleFullRefund} disabled={saving}>
                {saving ? "جاري الحفظ..." : "✅ تأكيد الإرجاع"}
              </Button>
            </div>
          </div>
        )}

        {mode === "deduct" && (
          <div className="flex flex-col gap-3 py-2">
            {/* Amount preview */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-xs text-red-500">المخصوم (تلفيات)</div>
                <div className="text-xl font-bold text-red-700">{toArN(deductVal)} ر.س</div>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <div className="text-xs text-green-500">المُرجَع للعميل</div>
                <div className="text-xl font-bold text-green-700">{toArN(remaining)} ر.س</div>
              </div>
            </div>

            {/* Deduction amount */}
            <div>
              <label className="block text-sm font-medium mb-1">المبلغ المخصوم (ر.س)</label>
              <input
                type="text" inputMode="numeric" dir="ltr"
                value={deductAmount ? toArN(deductAmount) : ""}
                onChange={e => {
                  const normalized = e.target.value
                    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                    .replace(/[^0-9]/g, "");
                  setDeductAmount(normalized);
                }}
                className="w-full rounded-md border px-3 py-2 text-right text-base"
                placeholder={`أقصى مبلغ: ${toArN(insurance)}`}
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium mb-1">سبب الخصم</label>
              <input
                type="text"
                value={deductReason}
                onChange={e => setDeductReason(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-base"
                placeholder="مثال: كسر أثاث، تلف فعلي..."
              />
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium mb-2">📸 صور الإثبات (اختياري)</label>

              {/* Thumbnail grid */}
              {proofImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {proofImages.map((url, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden aspect-square bg-muted">
                      <img src={fullUrl(url)} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeProofImage(url)}
                        className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleUploadImages(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
              >
                {uploading
                  ? "⏳ جاري الرفع..."
                  : proofImages.length > 0
                    ? `📎 إضافة المزيد من الصور (${toAr(proofImages.length)} مُرفق)`
                    : "📎 انقر لرفع صور الإثبات"}
              </button>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              ⚠️ المبلغ المخصوم سيُضاف تلقائياً كإيراد تحت فئة <strong>تلفيات</strong> في التقارير الشهرية.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} disabled={saving}>رجوع</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleDeduct}
                disabled={saving || uploading || deductVal <= 0 || deductVal > insurance}
              >
                {saving ? "جاري الحفظ..." : "✅ تأكيد الخصم"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Block Date Dialog ───────────────────────── */
export function BlockDateDialog({
  open, onClose, dateStr, chaletId, existing, onSaved, bookedPeriod,
}: {
  open: boolean;
  onClose: () => void;
  dateStr: string;
  chaletId: number;
  existing?: ChaletAvailability | null;
  onSaved: () => void;
  bookedPeriod?: string | null;
}) {
  const [morning, setMorning] = useState(existing?.periodMorning ?? false);
  const [evening, setEvening] = useState(existing?.periodEvening ?? false);
  const [fullDay, setFullDay] = useState(existing?.periodFullDay ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMorning(existing?.periodMorning ?? false);
    setEvening(existing?.periodEvening ?? false);
    setFullDay(existing?.periodFullDay ?? false);
    setNotes(existing?.notes ?? "");
  }, [existing, open]);

  const handleSave = async () => {
    if (!morning && !evening && !fullDay) {
      if (existing) {
        await apiFetch(`/owner/availability/${existing.id}`, { method: "DELETE" });
      }
      onSaved(); onClose(); return;
    }
    setSaving(true);
    try {
      await apiFetch("/owner/availability", {
        method: "POST",
        body: JSON.stringify({ chaletId, dateStr, periodMorning: morning, periodEvening: evening, periodFullDay: fullDay, notes: notes || undefined }),
      });
      onSaved(); onClose();
    } finally {
      setSaving(false);
    }
  };

  const dateObj = new Date(dateStr + "T12:00:00");
  const weekday = dateObj.toLocaleDateString("ar-SA", { weekday: "long" });
  const { hijri, gregorian } = formatDualDate(dateStr);
  const labelDate = `${weekday}، ${hijri} | ${gregorian} م`;

  const allPeriods: { key: "morning" | "evening" | "full_day"; label: string; state: boolean; set: (v: boolean) => void }[] = [
    { key: "morning",  label: "🌅 صباحي",    state: morning,  set: setMorning },
    { key: "evening",  label: "🌙 مسائي",    state: evening,  set: setEvening },
    { key: "full_day", label: "☀️ يوم كامل", state: fullDay,  set: setFullDay },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right text-base font-bold">ضبط إتاحة اليوم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-muted-foreground">{labelDate}</p>
          <p className="text-xs text-foreground font-medium">اختر الفترات المراد إغلاقها (تعطيل الإتاحة):</p>
          <div className="space-y-3">
            {allPeriods.map(({ key, label, state, set }) => {
              // When opened from a booking context:
              // - the booked period itself → disabled + always checked
              // - full_day → disabled (can't close whole day when half is booked)
              // - other partial period → active + toggleable
              const isBookedPeriod = bookedPeriod === key;
              const isFullDayBlocked = bookedPeriod && bookedPeriod !== "full_day" && key === "full_day";
              const isDisabled = !!(isBookedPeriod || isFullDayBlocked);
              const forceChecked = isBookedPeriod;
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 ${isDisabled ? "select-none" : "cursor-pointer group"}`}
                  style={isDisabled ? { opacity: 0.3, pointerEvents: "none", userSelect: "none" } : {}}
                  onClick={() => { if (!isDisabled) set(!state); }}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                      isDisabled
                        ? "bg-gray-300 border-gray-300 dark:bg-gray-600 dark:border-gray-600"
                        : state
                          ? "bg-primary border-primary"
                          : "border-border group-hover:border-primary/50"
                    }`}
                  >
                    {(forceChecked || (!isDisabled && state)) && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                  {isBookedPeriod && <span className="text-xs text-muted-foreground mr-1">(محجوز)</span>}
                  {isFullDayBlocked && <span className="text-xs text-muted-foreground mr-1">(غير متاح)</span>}
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">ملاحظة (اختياري)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: حفلة عائلية" className="text-sm" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
          {!morning && !evening && !fullDay && existing && (
            <p className="text-xs text-center text-muted-foreground">إلغاء تحديد جميع الفترات سيحذف تاريخ الحجب.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
