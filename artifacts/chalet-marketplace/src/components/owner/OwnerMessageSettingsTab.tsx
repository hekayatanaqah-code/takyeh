import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { saudiMoneyMessage } from "@/lib/saudiCurrency";
import { formatDualDate } from "@/lib/hijri";
import { publicContractUrl } from "@/lib/digitalContracts";
import { DEFAULT_DETAILED_RECEIPT_TEMPLATE, DETAILED_RECEIPT_VARIABLES, detailedReceiptValues } from "@/lib/detailedWhatsAppReceipt";
import { Plus, CheckCircle, Trash2, Loader2, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { MessageTemplateEditor } from "@/components/messages/MessageTemplateEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { DEFAULT_OWNER_MESSAGE_SETTINGS, MESSAGE_VARIABLES, OwnerMessageSettings, PREVIEW_SAMPLE_DATA, prepareServiceMessageTemplate, stripEmoji } from "@/components/owner/owner-message-templates";
import { useReadOnly } from "@/components/owner/OwnerDashboardContexts";
import { OwnerBooking } from "@/components/owner/owner-booking-types";
import { serviceDurationLabel, toArN } from "@/components/owner/owner-formatting";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── NotificationSettingsSection ────────────────────────────── */
export function NotificationSettingsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [waEnabled, setWaEnabled] = useState(false);
  const [waPhone, setWaPhone] = useState("");

  const { data, isLoading } = useQuery<{ waEnabled: boolean; waPhone: string | null }>({
    queryKey: ["owner", "notification-settings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/notification-settings");
      return r.ok ? r.json() : { waEnabled: false, waPhone: null };
    },
  });

  useEffect(() => {
    if (data) {
      setWaEnabled(data.waEnabled);
      setWaPhone(data.waPhone ?? "");
    }
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/owner/notification-settings", {
        method: "PATCH",
        body: JSON.stringify({ waEnabled, waPhone: waPhone.trim() || null }),
      });
      if (!r.ok) throw new Error("error");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "notification-settings"] });
      toast({ title: "تم الحفظ", description: "تم تحديث إعدادات الإشعارات" });
    },
  });

  return null;
}

function WhatsAppPreview({
  text,
  establishmentName,
  bookingData,
  hidePeriodLines = false,
}: {
  text: string;
  establishmentName?: string;
  bookingData?: Record<string, string>;
  hidePeriodLines?: boolean;
}) {
  const preview = useMemo(() => {
    if (!text.trim()) return "";
    let result = stripEmoji(hidePeriodLines ? prepareServiceMessageTemplate(text) : text);
    const actualEstablishmentName = establishmentName?.trim() || "اسم المنشأة";
    const replacements = { ...PREVIEW_SAMPLE_DATA, ...bookingData };
    result = result
      .split("{اسم_العقار}").join(actualEstablishmentName)
      .split("{اسم_الخدمة}").join(actualEstablishmentName);
    Object.entries(replacements).forEach(([key, val]) => {
      result = result.split(key).join(val);
    });
    return saudiMoneyMessage(result);
  }, [text, establishmentName, bookingData, hidePeriodLines]);

  if (!preview.trim()) return null;

  return (
    <div
      className="mt-3 rounded-2xl p-3 pb-4 overflow-hidden"
      style={{ backgroundColor: "#efeae2", backgroundImage: "radial-gradient(rgba(17,27,33,.045) 1px, transparent 1px)", backgroundSize: "12px 12px" }}
    >
      <p className="text-[11px] font-semibold text-zinc-800 mb-2.5 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        معاينة الرسالة في واتساب
      </p>
      <div className="flex justify-end">
        <div
          className="relative max-w-[88%] rounded-xl rounded-tr-sm px-3.5 py-2.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap before:absolute before:-right-2 before:top-0 before:border-t-[10px] before:border-t-[#d9fdd3] before:border-l-[10px] before:border-l-transparent"
          dir="rtl"
          style={{
            background: "#d9fdd3",
            color: "#111b21",
            fontFamily: "'Saudi Riyal Symbol', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif",
            wordBreak: "break-word",
          }}
        >
          {preview}
          <span className="block text-left text-[10px] mt-1.5" style={{ color: "#667781" }}>
            ١١:٣٠ ص ✓✓
          </span>
        </div>
      </div>
    </div>
  );
}

export function OwnerMessageSettingsTab({
  establishmentName,
  providerId,
  chaletNamesBySubmissionId = {},
  chaletTermsBySubmissionId = {},
}: {
  establishmentName?: string;
  providerId?: number | null;
  chaletNamesBySubmissionId?: Record<number, string>;
  chaletTermsBySubmissionId?: Record<number, string>;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const [form, setForm] = useState<OwnerMessageSettings>(DEFAULT_OWNER_MESSAGE_SETTINGS);
  const { data: platformSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const response = await apiFetch("/page-content");
      if (!response.ok) throw new Error("تعذر تحميل اسم المنصة");
      const rows: Array<{ key: string; value: string }> = await response.json();
      return Object.fromEntries(rows.map(row => [row.key, row.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: propertyBookings = [] } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      return r.ok ? r.json() : [];
    },
    enabled: !providerId,
  });

  const { data: serviceAppointments = [] } = useQuery<any[]>({
    queryKey: ["service-appointments", providerId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/approved/${providerId}/appointments`);
      return r.ok ? r.json() : [];
    },
    enabled: !!providerId,
  });

  const latestBooking = useMemo(() => {
    const rows = providerId ? serviceAppointments : propertyBookings;
    return [...rows].sort((a: any, b: any) => {
      const aTime = new Date(a.createdAt ?? a.dateStr ?? a.bookingDate ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? b.dateStr ?? b.bookingDate ?? 0).getTime();
      return bTime - aTime || Number(b.id ?? 0) - Number(a.id ?? 0);
    })[0] as any | undefined;
  }, [providerId, propertyBookings, serviceAppointments]);

  const previewEstablishmentName = providerId
    ? establishmentName
    : chaletNamesBySubmissionId[Number(latestBooking?.submissionId)] || establishmentName;

  const previewBookingData = useMemo<Record<string, string> | undefined>(() => {
    if (!latestBooking) return undefined;
    const dateStr = String(latestBooking.dateStr ?? latestBooking.bookingDate ?? "");
    const dual = dateStr ? formatDualDate(dateStr) : { hijri: "—", gregorian: "—" };
    const total = Number(latestBooking.amount ?? latestBooking.totalPrice ?? 0);
    const paid = Number(latestBooking.deposit ?? latestBooking.depositPaid ?? 0);
    const insurance = Number(latestBooking.insuranceAmount ?? latestBooking.insuranceFee ?? 0);
    const amountText = (value: number) => value > 0 ? toArN(value.toLocaleString("en-US")) : "—";
    const period = latestBooking.duration
      ?? (latestBooking.period === "morning" ? "صباحية" : latestBooking.period === "evening" ? "مسائية" : latestBooking.period === "full_day" ? "يوم كامل" : "—");
    const dayName = dateStr
      ? new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(`${dateStr}T12:00:00`))
      : "—";
    return {
      "{اسم_العميل}": latestBooking.clientName || "—",
      "{رقم_الحجز}": toArN(latestBooking.id ?? ""),
      "{اسم_اليوم_من}": dayName,
      "{اسم_اليوم_إلى}": dayName,
      "{التاريخ}": dual.hijri.replace(/\s*هـ\s*$/, ""),
      "{التاريخ_م}": dual.gregorian,
      "{من_التاريخ}": dual.hijri.replace(/\s*هـ\s*$/, ""),
      "{من_التاريخ_م}": dual.gregorian,
      "{إلى_التاريخ}": dual.hijri.replace(/\s*هـ\s*$/, ""),
      "{إلى_التاريخ_م}": dual.gregorian,
      "{تاريخ_الخدمة}": dual.gregorian,
      "{الفترة}": period,
      "{المدة}": providerId
        ? (serviceDurationLabel(latestBooking.duration, latestBooking.durationUnit)?.replace(/^المدة:\s*/, "") ?? "—")
        : `${toArN(Math.max(1, Number(latestBooking.durationDays ?? 1)))} ${Number(latestBooking.durationDays ?? 1) === 1 ? "يوم" : "أيام"}`,
      "{الفترة_الجديدة}": period,
      "{الفترة_القديمة}": period,
      "{طريقة_تقديم_الخدمة}": latestBooking.serviceDeliveryMethod === "customer_pickup"
        ? "استلام العميل من المقر"
        : latestBooking.serviceDeliveryMethod === "delivery_installation" ? "توصيل وتركيب بموقع العميل" : "—",
      "{عنوان_الخدمة}": latestBooking.serviceAddress || "—",
      "{تفاصيل_الخدمة}": latestBooking.notes || "—",
      "{رابط_العقد_الرقمي}": providerId
        ? publicContractUrl(latestBooking.id, "service", BASE)
        : publicContractUrl(latestBooking.id, "property", BASE),
      "{سبب_الإلغاء}": latestBooking.cancelReason || "حسب الاتفاق",
      "{سبب_التعديل}": latestBooking.rescheduleReason || "—",
      "{الإيجار}": amountText(total),
      "{الإجمالي_الكلي}": amountText(total),
      "{التأمين}": amountText(insurance),
      "{المدفوع}": amountText(paid),
      "{المتبقي}": amountText(Math.max(0, total + insurance - paid)),
      "{المبلغ_المسترد}": amountText(Number(latestBooking.cancelRefundAmount ?? 0)),
      "{إجمالي_الخدمات}": amountText((latestBooking.bookedAddons ?? []).reduce((sum: number, addon: any) => sum + Number(addon.price ?? 0), 0)),
      "{تفاصيل_الخدمات}": (latestBooking.bookedAddons ?? []).map((addon: any) => `${addon.name}: ${amountText(Number(addon.price ?? 0))} ريال`).join("\n") || "—",
    };
  }, [latestBooking, providerId]);

  const receiptPreviewData = useMemo(() => {
    const platformName = platformSettings.site_display_name || platformSettings.site_title || "";
    if (latestBooking && !providerId) {
      return detailedReceiptValues(latestBooking, {
        propertyName: previewEstablishmentName || "العقار",
        platformName,
        terms: chaletTermsBySubmissionId[Number(latestBooking.submissionId)],
        ...formatDualDate(latestBooking.bookingDate),
        assetBaseUrl: `${window.location.origin}${BASE}`,
      });
    }
    return {
      ...PREVIEW_SAMPLE_DATA,
      "{اسم_المنصة}": platformName,
      "{الشروط_والأحكام}": Object.values(chaletTermsBySubmissionId)[0]?.trim() || "لا توجد شروط وأحكام مضافة للعقار.",
      "{حالة_التأمين}": "التأمين محتجز",
      "{صور_التوثيق}": "",
    };
  }, [latestBooking, providerId, previewEstablishmentName, platformSettings, chaletTermsBySubmissionId]);

  const { data, isLoading, isError } = useQuery<OwnerMessageSettings>({
    queryKey: ["owner", "message-settings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/message-settings");
      if (!r.ok) throw new Error("فشل تحميل إعدادات الرسائل");
      return r.json();
    },
  });

  useEffect(() => {
    if (data) {
      const base = { ...DEFAULT_OWNER_MESSAGE_SETTINGS, ...data };
      base.detailedReceiptTemplate = data.detailedReceiptTemplate ?? DEFAULT_DETAILED_RECEIPT_TEMPLATE;
      if (providerId) {
        base.bookingConfirmationTemplate = prepareServiceMessageTemplate(base.bookingConfirmationTemplate);
      }
      base.bookingConfirmationTemplate = base.bookingConfirmationTemplate.replace(
        /المتبقي للدفع عند الوصول:/g,
        "المتبقي:",
      );
      base.bookingConfirmationTemplate = stripEmoji(base.bookingConfirmationTemplate);
      base.cancellationTemplate = stripEmoji(base.cancellationTemplate);
      base.modificationTemplate = stripEmoji(base.modificationTemplate);
      base.customTemplates = (base.customTemplates ?? []).map((template) => ({
        ...template,
        body: stripEmoji(template.body),
      }));
      setForm(base);
    }
  }, [data, providerId]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await apiFetch("/owner/message-settings", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.error || "تعذر حفظ الإعدادات");
      }
      return r.json();
    },
    onSuccess: (saved) => {
      setForm({ ...DEFAULT_OWNER_MESSAGE_SETTINGS, ...saved, detailedReceiptTemplate: saved.detailedReceiptTemplate ?? DEFAULT_DETAILED_RECEIPT_TEMPLATE });
      qc.invalidateQueries({ queryKey: ["owner", "message-settings"] });
      toast({ title: "تم حفظ إعدادات الرسائل", description: "يمكنك الآن اختيار القالب من بطاقة الحجز وفتحه في واتساب يدوياً." });
    },
    onError: (err: any) => {
      const message = err?.message ?? "حدث خطأ غير متوقع";
      toast({
        title: "تعذر الحفظ",
        description: message,
        variant: "destructive",
      });
    },
  });

  function setField<K extends keyof OwnerMessageSettings>(key: K, value: OwnerMessageSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetToDefault(key: "bookingConfirmationTemplate" | "cancellationTemplate" | "modificationTemplate" | "detailedReceiptTemplate") {
    setField(key, DEFAULT_OWNER_MESSAGE_SETTINGS[key] as string);
  }

  function addCustomTemplate() {
    setForm((prev) => ({
      ...prev,
      customTemplates: [...(prev.customTemplates ?? []), { id: String(Date.now()), title: "رسالة إضافية", body: "مرحباً {اسم_العميل}، بخصوص حجزك في {اسم_العقار} بتاريخ {التاريخ}." }],
    }));
  }

  function updateCustomTemplate(id: string, patch: Partial<{ title: string; body: string }>) {
    setForm((prev) => ({
      ...prev,
      customTemplates: (prev.customTemplates ?? []).map((tpl) => tpl.id === id ? { ...tpl, ...patch } : tpl),
    }));
  }

  function removeCustomTemplate(id: string) {
    setForm((prev) => ({ ...prev, customTemplates: (prev.customTemplates ?? []).filter((tpl) => tpl.id !== id) }));
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return <div role="alert" className="rounded-2xl border border-destructive p-4 text-destructive">تعذر تحميل إعدادات الرسائل. أعد المحاولة قبل تعديل القوالب أو حفظها.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Send className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-extrabold text-foreground">إعدادات رسائل واتساب المجانية</h2>
              <SectionGuideButton sectionKey="messageSettings" />
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200">
              جهّز قوالبك هنا، ثم اختر الرسالة من بطاقة الحجز لفتحها في واتساب ومراجعتها قبل الإرسال.
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
            مجاني ويدوي
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">تشغيل قوالب الرسائل</h3>
            <p className="text-xs text-slate-800 dark:text-slate-200 mt-1">عند التشغيل تظهر القوالب في قائمة “إرسال عبر الواتساب” داخل كل حجز.</p>
          </div>
          <Switch checked={form.waEnabled} onCheckedChange={(v) => setField("waEnabled", v)} disabled={isReadOnly} />
        </div>
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-4 text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
          تُملأ المتغيرات ببيانات الحجز تلقائياً. أنت تراجع الرسالة وتضغط إرسال في واتساب؛ لا تُرسل المنصة رسائل دون تدخلك.
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div>
            <h4 className="font-bold text-foreground">تأكيد الحجز الفوري</h4>
            <p className="text-xs text-muted-foreground mt-0.5">قالب يدوي لتأكيد الحجز من بطاقة الحجز.</p>
          </div>
          <MessageTemplateEditor
            label="نص رسالة تأكيد الحجز"
            value={form.bookingConfirmationTemplate}
            onChange={(value) => setField("bookingConfirmationTemplate", value)}
            variables={MESSAGE_VARIABLES}
            rows={10}
            disabled={isReadOnly}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <button type="button" onClick={() => resetToDefault("bookingConfirmationTemplate")} disabled={isReadOnly} className="ms-auto rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
              استعادة القالب الافتراضي
            </button>
          </div>
          <WhatsAppPreview text={form.bookingConfirmationTemplate} establishmentName={previewEstablishmentName} bookingData={previewBookingData} hidePeriodLines={!!providerId} />
        </div>

        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div>
            <h4 className="font-bold text-foreground">إلغاء الحجز</h4>
            <p className="text-xs text-muted-foreground mt-0.5">قالب يدوي لإشعار العميل بالإلغاء وسبب الإلغاء.</p>
          </div>
          <MessageTemplateEditor
            label="نص رسالة إلغاء الحجز"
            value={form.cancellationTemplate}
            onChange={(value) => setField("cancellationTemplate", value)}
            variables={MESSAGE_VARIABLES}
            rows={8}
            disabled={isReadOnly}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <button type="button" onClick={() => resetToDefault("cancellationTemplate")} disabled={isReadOnly} className="ms-auto rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
              استعادة القالب الافتراضي
            </button>
          </div>
          <WhatsAppPreview text={form.cancellationTemplate} establishmentName={previewEstablishmentName} bookingData={previewBookingData} hidePeriodLines={!!providerId} />
        </div>

        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-foreground">تعديل الحجز</h4>
              <p className="text-xs text-muted-foreground mt-0.5">قالب يدوي لإشعار العميل بتعديل التاريخ أو تفاصيل الحجز.</p>
            </div>
          </div>
          <MessageTemplateEditor
            label="نص رسالة تعديل الحجز"
            value={form.modificationTemplate}
            onChange={(value) => setField("modificationTemplate", value)}
            variables={MESSAGE_VARIABLES}
            rows={12}
            disabled={isReadOnly}
          />
          <div className="flex flex-wrap gap-3 items-center">
            <button type="button" onClick={() => resetToDefault("modificationTemplate")} disabled={isReadOnly} className="ms-auto rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
              استعادة القالب الافتراضي
            </button>
          </div>
          <WhatsAppPreview text={form.modificationTemplate} establishmentName={previewEstablishmentName} bookingData={previewBookingData} hidePeriodLines={!!providerId} />
        </div>

        {!providerId && (
          <div className="space-y-3 rounded-2xl border border-border p-4" data-testid="detailed-receipt-template-settings">
            <h4 className="font-bold text-foreground">إيصال واتساب مفصل</h4>
            <MessageTemplateEditor
              label="نص إيصال واتساب المفصل"
              value={form.detailedReceiptTemplate}
              onChange={(value) => setField("detailedReceiptTemplate", value)}
              variables={DETAILED_RECEIPT_VARIABLES}
              rows={16}
              disabled={isReadOnly}
            />
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium leading-7 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
              يُستخدم هذا القالب عند اختيار «إيصال واتساب مفصل» من بطاقة الحجز.
              {" "}<span data-currency-raw>{"{اسم_العقار}"}</span> من العقار المرتبط بالحجز،
              {" "}<span data-currency-raw>{"{اسم_المنصة}"}</span> من إعدادات المنصة،
              {" "}<span data-currency-raw>{"{الشروط_والأحكام}"}</span> من شروط العقار المعتمدة.
              {" "}تعديل القالب لا يغيّر شروط العقار الأصلية.
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => resetToDefault("detailedReceiptTemplate")} disabled={isReadOnly} className="rounded-xl border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                استعادة القالب الافتراضي
              </Button>
            </div>
            <WhatsAppPreview text={form.detailedReceiptTemplate} establishmentName={previewEstablishmentName} bookingData={receiptPreviewData} />
          </div>
        )}

        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-foreground">رسائل إضافية</h4>
              <p className="text-xs text-muted-foreground mt-0.5">أضف قوالب خاصة تظهر ضمن قائمة الإرسال في كل حجز.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => isReadOnly ? onBlockedEdit() : addCustomTemplate()} className="rounded-xl">
              <Plus className="w-4 h-4 ms-1" />
              إضافة رسالة
            </Button>
          </div>
          {(form.customTemplates ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground border border-dashed border-border rounded-xl p-4 text-center">لا توجد رسائل إضافية بعد</p>
          ) : (
            <div className="space-y-3">
              {form.customTemplates.map((tpl) => (
                <div key={tpl.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={tpl.title}
                      onChange={(e) => updateCustomTemplate(tpl.id, { title: e.target.value })}
                      placeholder="عنوان الرسالة"
                      disabled={isReadOnly}
                    />
                    <button
                      type="button"
                      onClick={() => isReadOnly ? onBlockedEdit() : removeCustomTemplate(tpl.id)}
                      className="text-destructive border border-destructive/30 rounded-lg px-3"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <MessageTemplateEditor
                    label={`نص ${tpl.title || "الرسالة الإضافية"}`}
                    value={tpl.body}
                    onChange={(value) => updateCustomTemplate(tpl.id, { body: value })}
                    variables={MESSAGE_VARIABLES}
                    rows={5}
                    disabled={isReadOnly}
                  />
                  <WhatsAppPreview text={tpl.body} establishmentName={previewEstablishmentName} bookingData={previewBookingData} hidePeriodLines={!!providerId} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-border p-4">
          <h4 className="font-bold text-foreground">ملاحظة إرفاق الصور يدوياً</h4>
          <Textarea
            value={form.attachmentNote}
            onChange={(e) => setField("attachmentNote", e.target.value)}
            rows={3}
            dir="rtl"
            disabled={isReadOnly}
            className="text-base font-medium text-foreground"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-6 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            المتغيرات تُستبدل ببيانات الحجز عند فتح واتساب، والإرسال يتم يدوياً بعد مراجعة الرسالة.
          </p>
          <Button
            onClick={() => isReadOnly ? onBlockedEdit() : save.mutate()}
            disabled={save.isPending}
            className="rounded-xl"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <CheckCircle className="w-4 h-4 me-2" />}
            حفظ إعدادات الرسائل
          </Button>
        </div>
      </div>
    </div>
  );
}
