import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle, MessageSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { formatDualDate } from "@/lib/hijri";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { Input } from "@/components/ui/input";
import { DEFAULT_MODIFICATION_TEMPLATE_BODY, encodeWhatsAppText } from "@/components/owner/owner-message-templates";
import { ChaletSeason, GlobalSeason, OwnerBooking } from "@/components/owner/owner-booking-types";
import { apiFetch } from "@/components/owner/owner-api";


/* ── Cancellation Management Dialog ─────────── */
const CANCEL_REASONS = [
  { code: "client_request", label: "طلب العميل" },
  { code: "maintenance",    label: "صيانة" },
  { code: "double_booking", label: "تعارض حجوزات" },
  { code: "other",          label: "أخرى" },
] as const;

/* ── WhatsApp Cancellation Preview Dialog ──────────────────────────────── */
export function WaCancelPreviewDialog({
  open, phone, initialMessage, onClose, onSent,
}: {
  open: boolean;
  phone: string;
  initialMessage: string;
  onClose: () => void;
  onSent: (finalMessage: string, wasEdited: boolean) => void;
}) {
  const [msg, setMsg] = useState(initialMessage);
  useEffect(() => { if (open) setMsg(initialMessage); }, [open, initialMessage]);

  const wasEdited = msg.trim() !== initialMessage.trim();

  const handleSend = () => {
    const encoded = encodeWhatsAppText(msg);
    const url = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    onSent(msg, wasEdited);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-xl">💬</span>
            معاينة رسالة الإلغاء
          </DialogTitle>
          <DialogDescription className="text-right text-sm">
            راجع الرسالة وعدّلها إن أردت قبل إرسالها عبر واتساب
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={11}
            dir="rtl"
            className="text-sm font-mono leading-relaxed resize-none"
          />
          {wasEdited && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-2.5 text-xs text-amber-700 dark:text-amber-400">
              <span className="shrink-0">✏️</span>
              <span>تم تعديل الرسالة — ستُحفظ النسخة المُرسلة في ملاحظات الحجز تلقائياً.</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>تخطّي</Button>
          <Button
            size="sm"
            onClick={handleSend}
            className="bg-[#25D366] hover:bg-[#1ea855] text-white gap-1.5"
          >
            <MessageSquare className="w-4 h-4" />
            إرسال عبر واتساب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Delete / Cancel Booking Dialog ────────────────────────────────────── */
export function DeleteConfirmDialog({
  open, booking, onClose, onConfirm, insuranceSettlement,
}: {
  open: boolean;
  booking: OwnerBooking | null;
  onClose: () => void;
  onConfirm: (id: number, reason: string, reasonCode?: string, refundAmount?: number) => void;
  insuranceSettlement?: { status: "held" | "refunded" | "deducted"; deduction?: number };
}) {
  const [reasonCode, setReasonCode]     = useState<string>("");
  const [customReason, setCustomReason] = useState("");
  const [refundAmount, setRefundAmount] = useState<string>("");

  useEffect(() => {
    if (!open) { setReasonCode(""); setCustomReason(""); setRefundAmount(""); }
  }, [open]);

  if (!booking) return null;

  const depositPaid    = Math.round(Number(booking.depositPaid ?? booking.revenueAmount ?? 0));
  const totalPrice     = Math.round(Number(booking.totalPrice ?? 0));
  const isFullPayment  = totalPrice > 0 && depositPaid === totalPrice;
  const insuranceFee   = Math.round(Number(booking.insuranceFee ?? 0));
  const insuranceReturned = insuranceSettlement
    ? insuranceSettlement.status === "refunded" ? insuranceFee : 0
    : insuranceFee;
  const refundExceedsDeposit = !!refundAmount && Number(refundAmount) > depositPaid;
  /* refundDisplay = exact typed value (shown in summary for real-time sync) */
  const refundDisplay  = Number(refundAmount) || 0;
  /* refundNum = clamped safe value (used only for actual submission) */
  const refundNum      = Math.max(0, Math.min(depositPaid, refundDisplay));
  const cancelIncome   = Math.max(0, depositPaid - refundNum);
  const selectedLabel  = CANCEL_REASONS.find(r => r.code === reasonCode)?.label ?? "";
  const finalReason    = reasonCode === "other" ? customReason.trim() : selectedLabel + (customReason.trim() ? ` — ${customReason.trim()}` : "");
  const canSubmit      = !!reasonCode && (reasonCode !== "other" || !!customReason.trim()) && !refundExceedsDeposit;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="text-xl">📋</span>
            إدارة مستحقات الإلغاء
          </DialogTitle>
          <DialogDescription className="text-right text-sm">
            إلغاء حجز <strong>{booking.clientName}</strong> — {booking.bookingDate}
            {depositPaid > 0 && (
              <span className="block mt-0.5 text-xs text-amber-600 font-medium">
                {isFullPayment ? "المبلغ الكامل المسجّل:" : "العربون المسجّل:"} {depositPaid.toLocaleString("ar-SA")} ر.س
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Reason dropdown */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">سبب الإلغاء <span className="text-destructive">*</span></label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger dir="rtl" className="text-right">
                <SelectValue placeholder="اختر سبب الإلغاء..." />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {CANCEL_REASONS.map(r => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional custom note */}
          {reasonCode && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">
                {reasonCode === "other" ? "وصف السبب *" : "ملاحظة إضافية (اختياري)"}
              </label>
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder={reasonCode === "other" ? "اكتب السبب..." : "تفاصيل إضافية..."}
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* Refund amount */}
          {depositPaid > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">المبلغ المسترد للعميل (ر.س)</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={refundAmount.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d])}
                  onChange={(e) => {
                    const western = e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/[^\d]/g, "");
                    setRefundAmount(western);
                  }}
                  placeholder={`الحد الأقصى: ${depositPaid.toLocaleString("ar-SA")} ر.س`}
                  className={`w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none transition-colors text-right ${refundExceedsDeposit ? "border-red-500 focus:border-red-500" : "border-border focus:border-primary"}`}
                />
              </div>
              {refundExceedsDeposit && (
                <p className="text-xs font-semibold text-destructive">⚠️ لا يمكن أن يتجاوز المبلغ المُسترد العربون المحصّل ({depositPaid.toLocaleString("ar-SA")} ر.س)</p>
              )}
              {!refundExceedsDeposit && <p className="text-xs text-muted-foreground">اترك الحقل فارغاً إذا لم يُسترد أي مبلغ</p>}
            </div>
          )}

          {/* Financial summary */}
          {(depositPaid > 0 || insuranceFee > 0) && (
            <div className="bg-muted/50 rounded-xl p-3 space-y-2 text-sm border border-border">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">ملخص مالي للإلغاء</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isFullPayment ? "المبلغ الكامل المحصّل:" : "العربون المحصّل:"}</span>
                <span className="font-bold">{depositPaid.toLocaleString("ar-SA")} ر.س</span>
              </div>
              <div className={`flex justify-between ${refundExceedsDeposit ? "text-red-600 font-semibold" : "text-red-600"}`}>
                <span>{isFullPayment ? "استرداد المبلغ للعميل:" : "استرداد العربون للعميل:"}</span>
                <span className="font-bold">− {refundDisplay.toLocaleString("ar-SA")} ر.س</span>
              </div>
              {insuranceFee > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>{insuranceSettlement
                    ? insuranceSettlement.status === "refunded" ? "التأمين: مسجل رده محاسبياً"
                      : insuranceSettlement.status === "deducted" ? "التأمين: تسوية خصم مسجلة"
                      : "التأمين محتجز — يسوى مستقلاً من إدارة التأمينات"
                    : "🔒 مبلغ التأمين (مسترد بالكامل لعدم الدخول):"}</span>
                  <span className="font-semibold">{insuranceFee.toLocaleString("ar-SA")} ر.س</span>
                </div>
              )}
              {refundExceedsDeposit ? (
                <div className="flex justify-between border-t border-red-300 pt-2 font-bold text-red-600">
                  <span>⛔ مبلغ غير صالح</span>
                  <span>يتجاوز الحد المسموح</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between border-t border-border pt-2 font-bold text-green-700 dark:text-green-400">
                    <span>إيراد الإلغاء للمالك:</span>
                    <span>{cancelIncome.toLocaleString("ar-SA")} ر.س</span>
                  </div>
                  {insuranceFee > 0 && (
                    <div className="flex justify-between border-t border-border pt-2 font-extrabold text-base text-foreground">
                      <span>{insuranceSettlement ? "إجمالي الاسترداد:" : "💰 إجمالي المُعاد للعميل:"}</span>
                      <span>{(refundDisplay + insuranceReturned).toLocaleString("ar-SA")} ر.س</span>
                    </div>
                  )}
                </>
              )}
              <p className="text-[11px] text-muted-foreground">
                💡 إيراد الإلغاء = {isFullPayment ? "المبلغ المحصّل" : "العربون"} − مبلغ مسترد. يُضاف تلقائياً إلى تقرير الإيرادات.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 mt-1">
          <Button variant="outline" size="sm" onClick={onClose}>تراجع</Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              onConfirm(
                booking.id,
                finalReason,
                reasonCode,
                refundNum > 0 ? refundNum : undefined,
              );
              onClose();
            }}
          >
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Reschedule Dialog ───────────────────────── */
export function RescheduleDialog({
  open, booking, existingBookings, chaletName, clientPhone, chaletPrices, modificationTemplate, onClose, onRescheduled,
}: {
  open: boolean;
  booking: OwnerBooking | null;
  existingBookings: OwnerBooking[];
  chaletName?: string;
  clientPhone?: string;
  chaletPrices?: { priceMorning?: string | null; priceEvening?: string | null; priceFullDay?: string | null; pricePerNight?: string | null } | null;
  modificationTemplate?: string;
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newDuration, setNewDuration] = useState(1);
  const [newPeriod, setNewPeriod] = useState<string>("none");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showWAConfirm, setShowWAConfirm] = useState(false);
  const [waConfirmMsg, setWaConfirmMsg] = useState("");
  const [oldDateSnap, setOldDateSnap] = useState("");
  const [oldPeriodSnap, setOldPeriodSnap] = useState<string | null>(null);
  const [newTotalPrice, setNewTotalPrice] = useState("");

  const _getArabicDayName = (dateStr: string) =>
    new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(dateStr + "T12:00:00"));
  const _periodLabel = (p: string | null | undefined) =>
    p === "morning" ? "صباحي" : p === "evening" ? "مسائي" : p === "full_day" ? "يوم كامل" : "—";

  /* ── Fetch seasons for this booking's chalet ── */
  const subId = booking?.submissionId ?? null;
  const { data: dialogSeasons = [] } = useQuery<ChaletSeason[]>({
    queryKey: ["owner", "seasons", subId, "reschedule-dialog"],
    queryFn: async () => {
      if (!subId) return [];
      const r = await apiFetch(`/owner/seasons?submissionId=${subId}`);
      return r.ok ? r.json() : [];
    },
    enabled: open && !!subId,
  });
  const { data: dialogGlobalSeasons = [] } = useQuery<GlobalSeason[]>({
    queryKey: ["owner", "global-seasons", subId, "reschedule-dialog"],
    queryFn: async () => {
      if (!subId) return [];
      const r = await apiFetch(`/owner/global-seasons?submissionId=${subId}`);
      return r.ok ? r.json() : [];
    },
    enabled: open && !!subId,
  });

  /* ── Compute price for a given date + period using seasons then base rates ── */
  const _getPriceForDate = (date: string, period: string): number | null => {
    const effPeriod = period && period !== "none" ? period : null;
    if (!effPeriod) return null;
    const season = dialogSeasons.find(
      (s) => date >= s.startDate && date <= s.endDate &&
        (!s.period || s.period === "all" || s.period === effPeriod)
    ) ?? dialogGlobalSeasons.find(
      (s) => s.enabled && date >= s.startDate && date <= s.endDate
    );
    if (season) {
      const dayDP = (season.dailyPrices as Record<string, { morning?: number; evening?: number; fullDay?: number }> | null)?.[date] ?? null;
      const sp =
        effPeriod === "morning"  ? (dayDP?.morning  ?? (season.priceMorning  ? Number(season.priceMorning)  : null)) :
        effPeriod === "evening"  ? (dayDP?.evening  ?? (season.priceEvening  ? Number(season.priceEvening)  : null)) :
        effPeriod === "full_day" ? (dayDP?.fullDay  ?? (season.priceFullDay  ? Number(season.priceFullDay)  : null)) :
        null;
      if (sp != null) return sp;
    }
    if (chaletPrices) {
      const dp =
        effPeriod === "morning"  ? chaletPrices.priceMorning :
        effPeriod === "evening"  ? chaletPrices.priceEvening :
        effPeriod === "full_day" ? chaletPrices.priceFullDay :
        null;
      if (dp) return Math.round(Number(dp));
    }
    return null;
  };

  /* ── Auto-computed price (read-only, used to pre-fill the editable input) ── */
  const newComputedPrice = useMemo(
    () => (newDate && newPeriod && newPeriod !== "none" ? _getPriceForDate(newDate, newPeriod) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newDate, newPeriod, dialogSeasons, dialogGlobalSeasons, chaletPrices]
  );
  /* Auto-fill editable price input whenever computed price changes */
  useEffect(() => {
    if (newComputedPrice !== null) {
      setNewTotalPrice(String(Math.round(newComputedPrice)));
    }
  }, [newComputedPrice]);

  const oldTotalPrice = booking?.totalPrice ? Number(booking.totalPrice) : null;
  const newTotalPriceNum = newTotalPrice !== "" && !isNaN(Number(newTotalPrice)) ? Math.round(Number(newTotalPrice)) : null;
  const depositPaidNum = booking?.depositPaid ? Number(booking.depositPaid) : null;
  const newRemaining = newTotalPriceNum !== null && depositPaidNum !== null
    ? Math.max(0, newTotalPriceNum - depositPaidNum)
    : null;
  const priceDiff = newTotalPriceNum !== null && oldTotalPrice !== null
    ? newTotalPriceNum - oldTotalPrice
    : null;

  /* ── Insurance summary (derived from booking, no extra fetch needed) ── */
  const insuranceFeeNum = booking?.insuranceFee ? Number(booking.insuranceFee) : 0;
  const insuranceStatusAr =
    booking?.insuranceRefunded ? "مُسترجع" :
    (booking?.insuranceDeducted && Number(booking.insuranceDeducted) > 0) ? "مخصوم جزئياً" :
    booking?.insuranceReceived ? "مُستلَم" :
    "معلّق";
  /* Insurance is still pending (to be collected at arrival) unless already refunded */
  const pendingInsuranceNum = !booking?.insuranceRefunded ? insuranceFeeNum : 0;
  /* Total the client must bring on the new arrival day */
  const totalDueOnArrival =
    newRemaining !== null && pendingInsuranceNum > 0
      ? newRemaining + pendingInsuranceNum
      : newRemaining !== null
        ? newRemaining
        : pendingInsuranceNum > 0
          ? pendingInsuranceNum
          : null;

  useEffect(() => {
    if (open && booking) {
      setNewDate(booking.bookingDate);
      setNewDuration(Math.max(1, booking.durationDays ?? 1));
      setNewPeriod(booking.period ?? "none");
      setReason("");
      setError("");
      setShowWAConfirm(false);
      setWaConfirmMsg("");
      setOldDateSnap(booking.bookingDate);
      setOldPeriodSnap(booking.period ?? null);
      setNewTotalPrice("");
    }
  }, [open, booking]);

  /* ── Conflict detection (mirrors AddBookingDialog, excludes self) ── */
  const conflictSet = useMemo(() => {
    const blocked = new Set<string>();
    if (!newDate || !booking) return blocked;
    const [sy, sm, sd] = newDate.split("-").map(Number);
    const dur = Math.max(1, newDuration);
    const rangeDates = new Set<string>();
    for (let i = 0; i < dur; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      rangeDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    for (const b of existingBookings) {
      if (!b.bookingDate || b.id === booking.id) continue; // exclude self
      if (booking.submissionId && b.submissionId !== booking.submissionId) continue;
      const bDur = Math.max(1, b.durationDays ?? 1);
      const [by, bm, bd2] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < bDur; i++) {
        const d = new Date(by, bm - 1, bd2 + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (rangeDates.has(ds)) blocked.add(b.period ?? "full_day");
      }
    }
    return blocked;
  }, [newDate, newDuration, existingBookings, booking]);

  const morningDisabled  = conflictSet.has("morning")  || conflictSet.has("full_day");
  const eveningDisabled  = conflictSet.has("evening")  || conflictSet.has("full_day");
  const fullDayDisabled  = conflictSet.has("morning")  || conflictSet.has("evening") || conflictSet.has("full_day");
  const isFullyBlocked   = conflictSet.has("full_day") || (conflictSet.has("morning") && conflictSet.has("evening"));

  // Auto-clear period if the chosen slot becomes unavailable
  useEffect(() => {
    if ((newPeriod === "morning" && morningDisabled) ||
        (newPeriod === "evening" && eveningDisabled) ||
        (newPeriod === "full_day" && fullDayDisabled)) {
      setNewPeriod("none");
    }
  }, [morningDisabled, eveningDisabled, fullDayDisabled, newPeriod]);

  // Derive whether the current selection conflicts
  const selectedPeriodBlocked =
    (newPeriod === "morning" && morningDisabled) ||
    (newPeriod === "evening" && eveningDisabled) ||
    (newPeriod === "full_day" && fullDayDisabled);
  const hasConflict = isFullyBlocked || selectedPeriodBlocked;

  if (!booking) return null;

  const handleSave = async () => {
    if (!newDate) { setError("يرجى تحديد تاريخ"); return; }
    if (!reason.trim()) { setError("يرجى كتابة سبب إعادة الجدولة"); return; }
    if (hasConflict) { setError(isFullyBlocked ? "هذا اليوم محجوز بالكامل" : "هذه الفترة محجوزة — يرجى اختيار فترة أخرى"); return; }
    setSaving(true); setError("");
    try {
      const newPeriodForApi = newPeriod && newPeriod !== "none" ? newPeriod : null;
      const patchBody: Record<string, unknown> = {
        bookingDate: newDate,
        durationDays: newDuration,
        period: newPeriodForApi,
        rescheduleReason: reason.trim(),
      };
      /* Use the manually entered (or auto-filled) price to update totalPrice → المتبقي recalculates */
      if (newTotalPriceNum !== null) {
        patchBody.totalPrice = newTotalPriceNum;
      }
      const r = await apiFetch(`/owner/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error ?? "حدث خطأ، يرجى المحاولة");
        return;
      }
      /* ── Build WA message from modificationTemplate (falls back to default if owner hasn't customized) ── */
      const snap = oldDateSnap || booking.bookingDate;
      const oldHijri = formatDualDate(snap).hijri.replace(/\s*هـ\s*$/, "");
      const oldGreg  = formatDualDate(snap).gregorian;
      const oldDay   = _getArabicDayName(snap);
      const newHijri = formatDualDate(newDate).hijri.replace(/\s*هـ\s*$/, "");
      const newGreg  = formatDualDate(newDate).gregorian;
      const newDay   = _getArabicDayName(newDate);
      const oldPeriodAr = _periodLabel(oldPeriodSnap);
      const newPeriodAr = _periodLabel(newPeriodForApi);
      const _msgTotal     = newTotalPriceNum ?? 0;
      const _msgInsurance = insuranceFeeNum;
      const _msgPaid      = depositPaidNum ?? 0;
      const _msgRemaining = Math.max(0, _msgTotal + _msgInsurance - _msgPaid);
      const _fmtN = (n: number) => n > 0 ? n.toLocaleString("ar-SA") : "—";
      const tpl = modificationTemplate || DEFAULT_MODIFICATION_TEMPLATE_BODY;
      const msg = tpl
        .replace(/\{اسم_العميل\}/g, booking.clientName ?? "")
        .replace(/\{اسم_العقار\}/g, chaletName ?? "العقار")
        .replace(/\{سبب_التعديل\}/g, reason.trim() || "—")
        .replace(/\{اسم_اليوم_من\}/g, oldDay)
        .replace(/\{من_التاريخ\}/g, oldHijri)
        .replace(/\{من_التاريخ_م\}/g, oldGreg)
        .replace(/\{الفترة_القديمة\}/g, oldPeriodAr)
        .replace(/\{اسم_اليوم_إلى\}/g, newDay)
        .replace(/\{إلى_التاريخ\}/g, newHijri)
        .replace(/\{إلى_التاريخ_م\}/g, newGreg)
        .replace(/\{الفترة_الجديدة\}/g, newPeriodAr)
        .replace(/\{الإيجار\}/g, _fmtN(_msgTotal))
        .replace(/\{التأمين\}/g, _fmtN(_msgInsurance))
        .replace(/\{المدفوع\}/g, _fmtN(_msgPaid))
        .replace(/\{المتبقي\}/g, _fmtN(_msgRemaining))
        .replace(/\{[^}]+\}/g, "—");
      setWaConfirmMsg(msg);
      setShowWAConfirm(true);
      onRescheduled();
      /* intentionally do NOT call onClose() — user must dismiss after reviewing/sending */
    } finally {
      setSaving(false);
    }
  };

  /* ── Send WA helper ── */
  const sendWhatsApp = () => {
    let rawPhone = (clientPhone ?? "").replace(/\D/g, "");
    if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
    if (rawPhone.startsWith("0"))  rawPhone = "966" + rawPhone.slice(1);
    if (rawPhone.length === 9 && rawPhone.startsWith("5")) rawPhone = "966" + rawPhone;
    const url = rawPhone
      ? `https://wa.me/${rawPhone}?text=${encodeWhatsAppText(waConfirmMsg)}`
      : `https://wa.me/?text=${encodeWhatsAppText(waConfirmMsg)}`;
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm max-h-[90vh] overflow-y-auto">
        {!showWAConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>إعادة جدولة الحجز</DialogTitle>
              <DialogDescription>تعديل موعد حجز {booking.clientName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              {/* Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">تاريخ الحجز الجديد</label>
                <div className="rounded-md border bg-background px-3 py-2 flex items-center">
                  <DualCalendarPicker value={newDate} onChange={setNewDate} placeholder="اختر التاريخ" />
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">عدد الأيام</label>
                <Input type="number" min={1} value={newDuration} onChange={(e) => setNewDuration(Math.max(1, Number(e.target.value)))} />
              </div>

              {/* Period — smart radio buttons with conflict badges */}
              <div className="space-y-2">
                <label className="text-sm font-semibold">الفترة</label>
                {isFullyBlocked && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                    <span className="text-base">⛔</span>
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">هذا اليوم محجوز بالكامل — لا تتوفر فترات متاحة</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "none",     label: "—",         sub: "بدون تحديد",     disabled: false,           icon: ""   },
                    { value: "morning",  label: "صباحي",     sub: "الفترة الصباحية", disabled: morningDisabled,  icon: "🌅" },
                    { value: "evening",  label: "مسائي",     sub: "الفترة المسائية", disabled: eveningDisabled,  icon: "🌙" },
                    { value: "full_day", label: "يوم كامل",  sub: "يوم كامل",       disabled: fullDayDisabled,  icon: "☀️" },
                  ] as const).map(({ value, label, sub, disabled, icon }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && setNewPeriod(value)}
                      className={[
                        "relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-start transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-primary/40",
                        disabled
                          ? "opacity-50 cursor-not-allowed bg-muted/40 border-border"
                          : newPeriod === value
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border hover:border-primary/50 hover:bg-muted/30",
                      ].join(" ")}
                    >
                      <span className="text-sm font-semibold flex items-center gap-1">
                        {icon && <span>{icon}</span>}
                        {label}
                        {disabled && (
                          <span className="text-[10px] font-bold text-red-500 dark:text-red-400 mr-1">(محجوز)</span>
                        )}
                      </span>
                      {(value as string) !== "none" && (
                        <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>
                      )}
                      {newPeriod === value && !disabled && (
                        <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">سبب إعادة الجدولة <span className="text-destructive">*</span></label>
                <Textarea
                  placeholder="مثال: طلب العميل تأجيل الموعد بسبب..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
              </div>

              {/* Editable total price + remaining balance */}
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold flex items-center gap-1.5">
                    السعر الإجمالي الجديد
                    {newComputedPrice !== null && (
                      <span className="text-[10px] font-normal text-muted-foreground">(محسوب تلقائياً — قابل للتعديل)</span>
                    )}
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={newTotalPrice}
                      onChange={(e) => setNewTotalPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="أدخل السعر الإجمالي"
                      className="text-right pl-14"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">ر.س</span>
                  </div>
                </div>
                {/* New remaining balance */}
                {newRemaining !== null && (
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">المتبقي الجديد</span>
                    <span className="text-sm font-bold text-blue-800 dark:text-blue-200">{newRemaining.toLocaleString("ar-SA")} ر.س</span>
                  </div>
                )}
                {/* Price diff vs original */}
                {priceDiff !== null && priceDiff !== 0 && (
                  <div className={[
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    priceDiff > 0
                      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
                      : "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300",
                  ].join(" ")}>
                    <span>{priceDiff > 0 ? "⬆️" : "⬇️"}</span>
                    <span>فارق عن الحجز الأصلي: {priceDiff > 0 ? "+" : ""}{priceDiff.toLocaleString("ar-SA")} ريال</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                  <span className="text-base mt-0.5">⛔</span>
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !reason.trim() || hasConflict || isFullyBlocked}
              >
                {saving ? "جاري الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* ── WA Confirmation Screen ── */
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="w-5 h-5" />
                تمت إعادة الجدولة بنجاح ✓
              </DialogTitle>
              <DialogDescription>راجع الرسالة أدناه قبل إرسالها للعميل عبر واتساب</DialogDescription>
            </DialogHeader>
            <div className="mt-3 space-y-3">
              {/* ── Financial summary for owner reference ── */}
              {(newRemaining !== null || insuranceFeeNum > 0) && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
                  <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">ملخص مالي</p>
                  {newRemaining !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">المتبقي الجديد</span>
                      <span className="font-semibold text-foreground">{newRemaining.toLocaleString("ar-SA")} ر.س</span>
                    </div>
                  )}
                  {insuranceFeeNum > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        مبلغ التأمين
                        <span className={`mr-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                          booking?.insuranceRefunded
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                            : (booking?.insuranceDeducted && Number(booking.insuranceDeducted) > 0)
                              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                              : booking?.insuranceReceived
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        }`}>{insuranceStatusAr}</span>
                      </span>
                      <span className="font-semibold text-foreground">{insuranceFeeNum.toLocaleString("ar-SA")} ر.س</span>
                    </div>
                  )}
                  {totalDueOnArrival !== null && (newRemaining !== null && pendingInsuranceNum > 0) && (
                    <div className="flex justify-between text-sm border-t border-blue-200 dark:border-blue-700 pt-2 mt-1">
                      <span className="font-bold text-blue-800 dark:text-blue-200">المبلغ المستحق عند الوصول</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300 text-base">{totalDueOnArrival.toLocaleString("ar-SA")} ر.س</span>
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-border bg-muted/40 p-3">
                <p className="text-[11px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">نص الرسالة — قابل للتعديل قبل الإرسال</p>
                <Textarea
                  value={waConfirmMsg}
                  onChange={(e) => setWaConfirmMsg(e.target.value)}
                  rows={11}
                  dir="rtl"
                  className="text-sm font-sans leading-relaxed resize-y"
                />
              </div>
              <Button
                className="w-full bg-[#25D366] hover:bg-[#1da851] text-white font-bold gap-2"
                onClick={sendWhatsApp}
              >
                <MessageSquare className="w-4 h-4" />
                إرسال التحديث للعميل عبر واتساب
              </Button>
            </div>
            <DialogFooter className="mt-2">
              <Button variant="outline" size="sm" className="w-full" onClick={onClose}>إغلاق</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
