import { InsuranceProofGallery } from "./InsuranceProofImages";
import { Calendar, CheckCircle, ChevronDown, Clock, Edit2, Eye, Globe, Loader2, MapPin, MessageCircle, MessageSquare, Phone, Plus, Receipt, ScrollText, Star, Trash2, XCircle, Banknote, Briefcase } from "lucide-react";
import { formatDualDate, withHijriEra } from "@/lib/hijri";
import { serviceReceiptMoney, servicePaymentMethodLabel } from "@/lib/serviceReceipt";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PropertyBookingArrivalBadge as UpcomingArrivalBadge } from "../PropertyBookingStatus";

const toAr = (v: unknown) => String(v ?? "").replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const STATUS_LABEL: Record<string, string> = { confirmed: "مؤكد", pending: "معلق", cancelled: "ملغي" };
const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export type ServiceFinancialStrip = { tone: "slate" | "green" | "emerald" | "orange" | "blue" | "amber"; label: string };

/** Honest financial state: cash custody vs transfer/pos, paid is cumulative deposit. */
export function serviceFinancialState(a: any) {
  const total = Number(a.amount ?? 0);
  const paid = Number(a.deposit ?? 0);
  const remaining = Math.max(0, total - paid);
  const method = a.paymentMethod || "cash";
  const cancelled = a.status === "cancelled";
  let strip: ServiceFinancialStrip;
  if (cancelled) strip = { tone: "slate", label: "حجز ملغي — لا يوجد تحصيل" };
  else if (paid <= 0) strip = { tone: "amber", label: "لا توجد دفعة مسجلة" };
  else if (method === "cash") strip = a.cashDeposited ? { tone: "emerald", label: "نقداً — أُودع في البنك" } : { tone: "orange", label: "نقداً — بحوزتك ولم يُودع" };
  else strip = { tone: "blue", label: `${servicePaymentMethodLabel(method)} — في الحساب البنكي` };
  if (!cancelled && paid > 0 && remaining === 0) strip = { ...strip, tone: strip.tone === "orange" ? "orange" : "green", label: `مدفوع بالكامل · ${strip.label}` };
  return { total, paid, remaining, method, cancelled, canCollect: !cancelled && remaining > 0, strip };
}

const STRIP_TONE: Record<ServiceFinancialStrip["tone"], string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700",
  green: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  orange: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
  blue: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  amber: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
};

const pill = "flex min-w-0 w-full flex-col items-center justify-center gap-1 min-h-14 rounded-lg border px-1 py-2 text-[11px] leading-4 font-medium text-center whitespace-normal break-normal transition-colors disabled:opacity-50 disabled:cursor-not-allowed [&>svg]:shrink-0 sm:flex-row sm:flex-wrap sm:px-2 sm:text-xs";

export type ServiceBookingCardProps = {
  appointment: any;
  serviceName: string;
  sourceLabel: string;
  durationLabel?: string | null;
  requiresContract?: boolean;
  templates: { id: string; title: string; body: string }[];
  messageMenuOpen: boolean;
  isUpdating?: boolean;
  isStatusBusy?: boolean;
  isDeleting?: boolean;
  reviewSending?: boolean;
  reviewSent?: boolean;
  onToggleMessageMenu: () => void;
  onSendTemplate: (body: string) => void;
  onReceipt: () => void;
  onEdit: () => void;
  onAddPayment: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  onPreviewContract: () => void;
  onSendContract: () => void;
  onToggleContractSigned: () => void;
  onToggleCashDeposited: () => void;
  onSendReview: () => void;
  now?: number;
  onShowInCalendar?: () => void;
};

export function ServiceBookingCard(p: ServiceBookingCardProps) {
  const a = p.appointment;
  const fin = serviceFinancialState(a);
  const effectiveDate = a.dateStr;
  const dual = formatDualDate(effectiveDate);
  const edited = !!(a.editReason || a.lastEditedAt);
  const rescheduled = !!(a.previousDateStr && a.editedDateStr);
  const hasPhone = !!String(a.clientPhone ?? "").replace(/\D/g, "");
  const actionCount = 4 + Number(fin.canCollect) + Number(a.status === "pending")
    + (p.requiresContract && !fin.cancelled ? 3 : 0) + Number(!fin.cancelled) + Number(!!p.onDelete);
  const actionColumns = Math.ceil(actionCount / 2);

  return (
    <div className="flex flex-col bg-card border border-border rounded-xl min-w-0" data-testid={`card-service-booking-${a.id}`}>
      <div className="flex-1 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {a.source === "platform" ? <Globe className="w-4 h-4 text-primary" /> : <Phone className="w-4 h-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <p className="font-semibold text-foreground leading-tight break-words">{a.clientName}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-bold max-w-full">
                  <Briefcase className="w-3 h-3 shrink-0" /><span className="truncate">{p.serviceName}</span>
                </span>
                {a.clientPhone
                  ? <span className="text-sm font-semibold text-foreground shrink-0" dir="ltr">{toAr(a.clientPhone)}</span>
                  : <span className="text-xs text-muted-foreground">لا يوجد رقم تواصل</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {!fin.cancelled && p.now != null && <UpcomingArrivalBadge bookingDate={effectiveDate} now={p.now} />}
                {p.onShowInCalendar && (
                  <button type="button" onClick={p.onShowInCalendar}
                    className="rounded-lg border border-primary/30 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary">
                    عرض في التقويم
                  </button>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status] ?? "bg-muted text-muted-foreground"}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.source === "platform" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>{p.sourceLabel}</span>
                {edited && (
                  <span title={a.editReason ? `السبب: ${a.editReason}` : undefined} className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                    {rescheduled ? "مُعاد جدولته" : "مُعدَّل"}
                  </span>
                )}
                {p.requiresContract && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.contractSigned ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {a.contractSigned ? "العقد موقّع" : "العقد غير موقّع"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-semibold text-primary"><Calendar className="w-3 h-3" />{withHijriEra(dual.hijri)}</span>
              <span>{dual.gregorian} م</span>
              {a.startTime && <span className="flex items-center gap-1 text-foreground"><Clock className="w-3 h-3" />الوقت: <bdi>{toAr(a.startTime)}</bdi></span>}
              {p.durationLabel && <span>{p.durationLabel}</span>}
            </div>
          </div>
        </div>

        {edited && (
          <div className="bg-blue-50/70 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 rounded-lg px-3 py-2 text-xs text-blue-800 dark:text-blue-200 space-y-0.5 break-words">
            <p className="font-semibold">
              {rescheduled
                ? <>أُعيدت الجدولة من {withHijriEra(formatDualDate(a.previousDateStr).hijri)} إلى {withHijriEra(formatDualDate(a.editedDateStr).hijri)}</>
                : "تم تعديل بيانات الحجز"}
            </p>
            {a.editReason && <p className="opacity-80">السبب: {a.editReason}</p>}
            {a.previousStartTime && <p className="opacity-80">الوقت من <bdi>{toAr(a.previousStartTime)}</bdi> إلى <bdi>{a.startTime ? toAr(a.startTime) : "غير محدد"}</bdi></p>}
            {a.previousAmount !== null && a.previousAmount !== undefined && <p className="opacity-80">السعر من {serviceReceiptMoney(Number(a.previousAmount))} إلى {serviceReceiptMoney(fin.total)}</p>}
            {a.previousDurationUnit !== null && a.previousDurationUnit !== undefined && <p className="opacity-80">المدة السابقة: {toAr(a.previousDuration ?? "—")} {a.previousDurationUnit === "days" ? "يوم" : "ساعة"} — المدة الحالية: {p.durationLabel ?? "—"}</p>}
          </div>
        )}

        {a.insuranceStatus === "deducted" && a.insuranceProofImages?.length > 0 && (
          <div className="space-y-2 border-t border-border pt-2 text-xs">
            <p className="font-semibold text-red-600">توثيق خصم التأمين{a.insuranceDeductNote ? `: ${a.insuranceDeductNote}` : ""}</p>
            <InsuranceProofGallery images={a.insuranceProofImages} />
          </div>
        )}
        {(a.serviceAddress || a.notes) && (
          <div className="bg-muted/30 rounded-lg px-3 py-2 text-xs space-y-1 min-w-0">
            {a.serviceAddress && <p className="flex items-start gap-1.5 break-words [overflow-wrap:anywhere]"><MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />{a.serviceAddress}</p>}
            {a.notes && <p className="text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.notes}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-2.5 text-center">
          <div><p className="text-[10px] text-muted-foreground">قيمة الخدمة دون التأمين</p><p className="text-xs font-bold text-foreground">{serviceReceiptMoney(fin.total)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">{fin.total > 0 && fin.remaining === 0 ? "كامل المبلغ" : "المدفوع"}</p><p className="text-xs font-bold text-green-600 dark:text-green-400">{serviceReceiptMoney(fin.paid)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">المتبقي</p><p className={`text-xs font-bold ${fin.remaining === 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>{serviceReceiptMoney(fin.remaining)}</p></div>
        </div>
        {Number(a.insuranceAmount ?? 0) > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            التأمين القابل للاسترداد: {serviceReceiptMoney(Number(a.insuranceAmount))} — منفصل عن المدفوع والمتبقي لأصل الخدمة.
          </p>
        )}

        <div
          className={`grid min-w-0 max-w-full grid-rows-2 items-stretch gap-1.5 ${actionColumns >= 5 ? "[&>button]:px-0.5 [&>button]:text-[10px]" : ""}`}
          style={{ gridTemplateColumns: `repeat(${actionColumns}, minmax(0, 1fr))` }}
          role="group"
          aria-label="إجراءات الحجز"
          data-action-rows="2"
          data-testid={`service-booking-action-strip-${a.id}`}
        >
          <DropdownMenu dir="rtl" open={p.messageMenuOpen} onOpenChange={(open) => { if (open !== p.messageMenuOpen) p.onToggleMessageMenu(); }}>
            <DropdownMenuTrigger asChild>
            <button type="button" disabled={!hasPhone} title={hasPhone ? "إرسال رسالة واتساب" : "لا يوجد رقم واتساب للعميل"} className={`${pill} text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100`} data-testid={`button-service-whatsapp-${a.id}`}>
              <MessageSquare className="w-3.5 h-3.5" />واتساب<ChevronDown className="w-3 h-3" />
            </button>
            </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-60 max-w-[80vw] rounded-xl">
                {p.templates.length > 0 ? p.templates.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => p.onSendTemplate(t.body)} className="text-xs">{t.title}</DropdownMenuItem>
                )) : <p className="px-3 py-2 text-xs text-muted-foreground">فعّل واتساب أو أضف قالباً من إعدادات الرسائل.</p>}
              </DropdownMenuContent>
          </DropdownMenu>
          {fin.canCollect && (
            <button type="button" onClick={p.onAddPayment} className={`${pill} text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100`} data-testid={`button-service-add-payment-${a.id}`}>
              <Plus className="w-3.5 h-3.5" />إضافة دفعة
            </button>
          )}
          <button type="button" onClick={p.onEdit} title="تعديل بيانات الحجز أو إعادة جدولة التاريخ والوقت" className={`${pill} text-primary bg-primary/5 border-primary/20 hover:bg-primary/10`} data-testid={`button-service-edit-${a.id}`}>
            <Edit2 className="w-3.5 h-3.5" />تعديل
          </button>
          <button type="button" onClick={p.onReceipt} className={`${pill} text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:bg-amber-100`} data-testid={`service-receipt-${a.id}`}>
            <Receipt className="w-3.5 h-3.5" />الإيصال
          </button>
          {a.status === "pending" && (
            <button type="button" disabled={p.isStatusBusy} onClick={p.onConfirm} className={`${pill} text-green-700 bg-card border-green-200 hover:bg-green-50`}>
              {p.isStatusBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}تأكيد
            </button>
          )}
          {p.requiresContract && !fin.cancelled && (
            <>
              <button type="button" onClick={p.onPreviewContract} className={`${pill} text-foreground bg-card border-border hover:bg-muted`}><Eye className="w-3.5 h-3.5" />معاينة العقد</button>
              <button type="button" disabled={!hasPhone} title={hasPhone ? "إرسال رابط العقد للعميل عبر واتساب" : "لا يوجد رقم واتساب للعميل"} onClick={p.onSendContract} className={`${pill} text-green-700 bg-card border-green-200 hover:bg-green-50`}><MessageCircle className="w-3.5 h-3.5" />إرسال العقد</button>
              <button type="button" disabled={p.isUpdating} onClick={p.onToggleContractSigned} className={`${pill} text-violet-700 bg-card border-violet-200 hover:bg-violet-50`}><ScrollText className="w-3.5 h-3.5" />{a.contractSigned ? "إلغاء اعتماد التوقيع" : "تحديد كموقّع"}</button>
            </>
          )}
          <button type="button" disabled={p.reviewSending || p.reviewSent} onClick={p.onSendReview} className={`${pill} text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 hover:bg-teal-100`}>
            {p.reviewSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}{p.reviewSent ? "تم فتح رابط التقييم" : "رابط التقييم"}
          </button>
          {!fin.cancelled && (
            <button type="button" disabled={p.isStatusBusy} onClick={p.onCancel} className={`${pill} text-red-600 bg-card border-red-200 hover:bg-red-50`}><XCircle className="w-3.5 h-3.5" />إلغاء الحجز</button>
          )}
          {p.onDelete && (
            <button type="button" disabled={p.isDeleting} onClick={p.onDelete} className={`${pill} text-destructive bg-card border-destructive/30 hover:bg-destructive/10`}>
              {p.isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}حذف السجل
            </button>
          )}
        </div>
      </div>

      <div className={`rounded-b-xl border-t px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs ${STRIP_TONE[fin.strip.tone]}`} data-testid={`strip-service-financial-${a.id}`}>
        <span className="font-bold flex items-center gap-1.5 min-w-0"><Banknote className="w-3.5 h-3.5 shrink-0" />{fin.strip.label}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {fin.cancelled && Number(a.cancelRefundAmount ?? 0) > 0 && <span>المسترد: {serviceReceiptMoney(a.cancelRefundAmount)}</span>}
          {!fin.cancelled && fin.remaining > 0 && <span className="font-semibold">متبقٍ للتحصيل {serviceReceiptMoney(fin.remaining)}</span>}
          {fin.method === "cash" && fin.paid > 0 && (
            <button type="button" disabled={p.isUpdating} onClick={p.onToggleCashDeposited} className="rounded-md border border-current/30 bg-card/70 px-2 py-0.5 font-semibold hover:bg-card disabled:opacity-50">
              {a.cashDeposited ? "إرجاعه كغير مودع" : "تأكيد الإيداع"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
