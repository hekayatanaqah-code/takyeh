import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, AlertTriangle, RotateCcw, Lock, Zap, Edit2, Loader2, X, PauseCircle } from "lucide-react";
import { toAr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDualDate } from "@/lib/hijri";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { getLocalDateStr, groupBlockedDatesIntoRanges } from "@/components/owner/owner-calendar";


/* ── Upgrade Popup + Chalets Tab ─────────────── */
export function UpgradePlanDialog({
  open,
  onClose,
  onRequestAddon,
  context,
  active,
  extraPrice,
  freeAccess = false,
}: {
  open: boolean;
  onClose: () => void;
  onRequestAddon: () => void;
  context: "chalet" | "service";
  active?: boolean;
  extraPrice?: number | string | null;
  freeAccess?: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            خيارات السعة والاشتراك
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {freeAccess
              ? "حسابك يتمتع بصلاحية مجانية كاملة؛ إذا واجهت مشكلة في السعة فتواصل مع الدعم."
              : context === "chalet"
              ? "لقد وصلت إلى الحد الأقصى من العقارات في خطتك الحالية. يمكنك إضافة سعة إلى اشتراكك أو اختيار خطة أعلى."
              : "لقد وصلت إلى الحد الأقصى من الخدمات. يمكنك إضافة سعة إلى اشتراكك أو اختيار خطة أعلى."}
          </DialogDescription>
        </DialogHeader>
        {!freeAccess && active && extraPrice != null && (
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold text-foreground">
                {context === "chalet" ? "أضف عقاراً إلى اشتراكك الحالي" : "أضف خدمة إلى اشتراكك الحالي"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                اختر العدد الذي تحتاجه؛ سعر كل إضافة {toAr(Number(extraPrice))} ر.س، برسوم لمرة واحدة. سيظهر الإجمالي قبل الدفع.
              </p>
            </div>
            <Button
              className="shrink-0"
              onClick={() => {
                onClose();
                onRequestAddon();
              }}
            >
              طلب إضافات
            </Button>
          </div>
        )}
        {!freeAccess && (
          <Button variant="outline" className="w-full mt-4" onClick={() => { onClose(); navigate("/subscription"); }}>
            عرض الباقات والأسعار الحالية
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Chalet Basic Data Dialog ─────────────── */
export function EditChaletDialog({
  open, sub, onClose, onSaved,
}: {
  open: boolean;
  sub: { id: number; nameAr: string; descriptionAr?: string; priceMorning?: string | null; priceEvening?: string | null; priceFullDay?: string | null; reminderEnabled?: boolean; reminderDays?: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nameAr, setNameAr] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [priceMorning, setPriceMorning] = useState("");
  const [priceEvening, setPriceEvening] = useState("");
  const [priceFullDay, setPriceFullDay] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDays, setReminderDays] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sub && open) {
      setNameAr(sub.nameAr ?? "");
      setDescriptionAr(sub.descriptionAr ?? "");
      setPriceMorning(sub.priceMorning ? String(Number(sub.priceMorning)) : "");
      setPriceEvening(sub.priceEvening ? String(Number(sub.priceEvening)) : "");
      setPriceFullDay(sub.priceFullDay ? String(Number(sub.priceFullDay)) : "");
      setReminderEnabled(Boolean(sub.reminderEnabled));
      setReminderDays(sub.reminderDays ?? 1);
    }
  }, [sub, open]);

  function normNum(v: string) {
    return v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  }

  async function handleSave() {
    if (!sub || !nameAr.trim()) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/owner/submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nameAr: nameAr.trim(),
          descriptionAr: descriptionAr.trim(),
          priceMorning: priceMorning || "",
          priceEvening: priceEvening || "",
          priceFullDay: priceFullDay || "",
          reminderEnabled,
          reminderDays,
        }),
      });
      if (!r.ok) { toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" }); return; }
      toast({ title: "تم تحديث بيانات العقار بنجاح" });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary" />
            تعديل بيانات العقار
          </DialogTitle>
          <DialogDescription>تعديل الاسم والأسعار والوصف — تظهر فوراً على صفحة العقار</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم العقار <span className="text-destructive">*</span></label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="اسم العقار" className="text-right" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">الوصف</label>
            <textarea
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="وصف مختصر للعقار..."
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">الأسعار (ر.س)</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "☀️ صباحي", val: priceMorning, set: setPriceMorning },
                { label: "🌙 مسائي", val: priceEvening, set: setPriceEvening },
                { label: "📅 يوم كامل", val: priceFullDay, set: setPriceFullDay },
              ] as const).map(({ label, val, set }) => (
                <div key={label} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={toAr(val)}
                    onChange={(e) => set(normNum(e.target.value))}
                    placeholder="٠"
                    className="text-right text-sm h-9"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── WhatsApp Booking Reminder ── */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">تذكير واتساب للحجوزات</p>
                <p className="text-xs text-muted-foreground mt-0.5">إرسال رسالة واتساب للعميل قبل موعد الحجز</p>
              </div>
              <button
                type="button"
                onClick={() => setReminderEnabled(!reminderEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reminderEnabled ? "bg-emerald-500" : "bg-muted"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${reminderEnabled ? "-translate-x-6" : "-translate-x-1"}`} />
              </button>
            </div>
            {reminderEnabled && (
              <div className="flex items-center gap-3">
                <label className="text-sm text-muted-foreground shrink-0">عدد الأيام قبل الحجز</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={toAr(reminderDays)}
                  onChange={(e) => {
                    const n = parseInt(normNum(e.target.value)) || 1;
                    setReminderDays(Math.max(1, Math.min(7, n)));
                  }}
                  className="w-20 text-center h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">{toAr(reminderDays)} {reminderDays === 1 ? "يوم" : "أيام"}</span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!nameAr.trim() || saving} onClick={handleSave} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            حفظ التعديلات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── ResubmitDialog — owner edits a needs_revision submission ── */
export function ResubmitDialog({
  open, sub, onClose, onSaved,
}: {
  open: boolean;
  sub: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  /* ── All editable fields, pre-populated from submission ── */
  const [nameAr, setNameAr]                       = useState("");
  const [location, setLocation]                   = useState("");
  const [district, setDistrict]                   = useState("");
  const [descriptionAr, setDescriptionAr]         = useState("");
  const [whatsappNumber, setWhatsappNumber]       = useState("");
  const [pricePerNight, setPricePerNight]         = useState("");
  const [priceMorning, setPriceMorning]           = useState("");
  const [priceEvening, setPriceEvening]           = useState("");
  const [priceFullDay, setPriceFullDay]           = useState("");
  const [maxGuests, setMaxGuests]                 = useState("");
  const [bedrooms, setBedrooms]                   = useState("");
  const [mapsUrl, setMapsUrl]                     = useState("");
  const [socialLink, setSocialLink]               = useState("");
  const [termsAndConditions, setTermsAndConditions]         = useState("");
  const [chaletLogoUrl, setChaletLogoUrl]                   = useState("");
  const [cancellationWindowEnabled, setCancellationWindowEnabled] = useState(false);
  const [cancellationWindowHours, setCancellationWindowHours]     = useState("24");
  const [bookingPolicyText, setBookingPolicyText]                 = useState("");
  const [photos, setPhotos]                       = useState<string[]>([]);
  const [amenities, setAmenities]                 = useState<string[]>([]);
  const [ownerRevisionNote, setOwnerRevisionNote] = useState("");
  const [saving, setSaving]                       = useState(false);

  /* Amenities catalog (public endpoint — no auth needed) */
  const { data: amenitiesCatalog = [] } = useQuery<Array<{ id: number; key: string; labelAr: string; isActive: boolean }>>({
    queryKey: ["amenities-catalog-resubmit"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`);
      return r.ok ? r.json() : [];
    },
    staleTime: 1000 * 60 * 5,
    enabled: open,
  });

  /* Pre-populate ALL fields when dialog opens */
  useEffect(() => {
    if (sub && open) {
      setNameAr(sub.nameAr ?? "");
      setLocation(sub.location ?? "");
      setDistrict(sub.district ?? "");
      setDescriptionAr(sub.descriptionAr ?? "");
      setWhatsappNumber(sub.whatsappNumber ?? "");
      setPricePerNight(sub.pricePerNight  ? String(Number(sub.pricePerNight))  : "");
      setPriceMorning (sub.priceMorning   ? String(Number(sub.priceMorning))   : "");
      setPriceEvening (sub.priceEvening   ? String(Number(sub.priceEvening))   : "");
      setPriceFullDay (sub.priceFullDay   ? String(Number(sub.priceFullDay))   : "");
      setMaxGuests    (sub.maxGuests  != null ? String(sub.maxGuests)  : "");
      setBedrooms     (sub.bedrooms   != null ? String(sub.bedrooms)   : "");
      setMapsUrl      (sub.mapsUrl    ?? "");
      setSocialLink   (sub.socialLink ?? "");
      setTermsAndConditions(sub.termsAndConditions ?? "");
      setChaletLogoUrl((sub as any).logoUrl ?? "");
      setCancellationWindowEnabled(!!(sub as any).cancellationWindowEnabled);
      setCancellationWindowHours(String((sub as any).cancellationWindowHours ?? 24));
      setBookingPolicyText((sub as any).bookingPolicyText ?? "");
      setPhotos  (Array.isArray(sub.photos)    ? [...sub.photos]    : []);
      setAmenities(Array.isArray(sub.amenities) ? [...sub.amenities] : []);
      setOwnerRevisionNote(sub.ownerRevisionNote ?? "");
    }
  }, [sub, open]);

  function normNum(v: string) {
    return v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  }

  function removePhoto(url: string) {
    setPhotos(prev => prev.filter(p => p !== url));
  }

  function toggleAmenity(key: string) {
    setAmenities(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function handleResubmit() {
    if (!sub) return;
    if (!nameAr.trim())              { toast({ title: "اسم العقار مطلوب",          variant: "destructive" }); return; }
    if (!descriptionAr.trim())       { toast({ title: "الوصف مطلوب",                 variant: "destructive" }); return; }
    if (!whatsappNumber.trim())      { toast({ title: "رقم الواتساب مطلوب",         variant: "destructive" }); return; }
    if (whatsappNumber.length < 9)   { toast({ title: "رقم الواتساب يجب أن يكون ٩ أرقام على الأقل", variant: "destructive" }); return; }
    if (!mapsUrl.trim())             { toast({ title: "رابط الخرائط مطلوب",         variant: "destructive" }); return; }
    if (!socialLink.trim())          { toast({ title: "حساب إنستقرام / سناب شات مطلوب", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nameAr:         nameAr.trim(),
        descriptionAr:  descriptionAr.trim(),
        whatsappNumber: whatsappNumber.trim(),
        location:       location.trim() || sub.location,
        district:       district.trim() || null,
        photos,
        amenities,
        mapsUrl:            mapsUrl.trim()            || null,
        socialLink:         socialLink.trim()         || null,
        termsAndConditions: termsAndConditions.trim() || null,
        logoUrl:            chaletLogoUrl.trim()      || null,
        ownerRevisionNote:  ownerRevisionNote.trim()  || null,
        cancellationWindowEnabled,
        cancellationWindowHours: cancellationWindowHours ? Number(cancellationWindowHours) : 24,
        bookingPolicyText: bookingPolicyText.trim() || null,
      };
      if (pricePerNight) body.pricePerNight = Number(pricePerNight);
      if (priceMorning)  body.priceMorning  = Number(priceMorning);
      if (priceEvening)  body.priceEvening  = Number(priceEvening);
      if (priceFullDay)  body.priceFullDay  = Number(priceFullDay);
      if (maxGuests)     body.maxGuests     = Number(maxGuests);
      if (bedrooms !== "") body.bedrooms    = Number(bedrooms);

      const r = await apiFetch(`/submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        toast({ title: "حدث خطأ", description: data?.error ?? "فشل الإرسال", variant: "destructive" });
        return;
      }
      toast({ title: "✅ تمت إعادة التقديم", description: "سيراجع الفريق طلبك قريباً وسيتم التواصل معك" });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-orange-500" />
            تعديل وإعادة التقديم
          </DialogTitle>
          <DialogDescription>
            {sub?.nameAr} — راجع ملاحظات الإدارة وأجرِ التعديلات المطلوبة
          </DialogDescription>
        </DialogHeader>

        {/* ── Scrollable form body ── */}
        <div className="overflow-y-auto flex-1 space-y-5 pe-1 py-1">

          {/* Admin note banner */}
          {sub?.adminNote && (
            <div className="flex items-start gap-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/40 px-3.5 py-3">
              <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-orange-700 dark:text-orange-400 mb-0.5">ملاحظات الإدارة</p>
                <p className="text-xs text-orange-800 dark:text-orange-300 leading-relaxed">{sub.adminNote}</p>
              </div>
            </div>
          )}

          {/* ── Section: Core info ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">المعلومات الأساسية</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">اسم العقار *</label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="اسم العقار" className="text-right" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">المدينة / المنطقة *</label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="مثال: بريدة" className="text-right" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">الحي / المجمع</label>
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="اختياري" className="text-right" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">الوصف *</label>
              <textarea
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                placeholder="وصف مختصر للعقار..."
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">رقم الواتساب *</label>
              <Input value={whatsappNumber ? toAr(whatsappNumber) : ""} onChange={(e) => setWhatsappNumber(normNum(e.target.value))} placeholder="٠٥XXXXXXXX" dir="ltr" inputMode="tel" className="text-right" />
            </div>
          </div>

          {/* ── Section: Pricing ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">الأسعار (ر.س)</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">السعر الأساسي لليلة</label>
              <Input type="text" inputMode="numeric" dir="ltr" value={pricePerNight ? toAr(pricePerNight) : ""} onChange={(e) => setPricePerNight(normNum(e.target.value))} placeholder="٠" className="text-right" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "☀️ صباحي",    val: priceMorning, set: setPriceMorning },
                { label: "🌙 مسائي",    val: priceEvening, set: setPriceEvening },
                { label: "📅 يوم كامل", val: priceFullDay, set: setPriceFullDay },
              ] as const).map(({ label, val, set }) => (
                <div key={label} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                  <Input type="text" inputMode="numeric" dir="ltr" value={val ? toAr(val) : ""} onChange={(e) => set(normNum(e.target.value))} placeholder="٠" className="text-right text-sm h-9" />
                </div>
              ))}
            </div>
          </div>

          {/* ── Section: Details ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">التفاصيل</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">عدد الضيوف</label>
                <Input type="text" inputMode="numeric" dir="ltr" value={maxGuests ? toAr(maxGuests) : ""} onChange={(e) => setMaxGuests(normNum(e.target.value))} placeholder="٠" className="text-right h-9" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">غرف النوم</label>
                <Input type="text" inputMode="numeric" dir="ltr" value={bedrooms ? toAr(bedrooms) : ""} onChange={(e) => setBedrooms(normNum(e.target.value))} placeholder="٠" className="text-right h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">رابط الخرائط *</label>
              <Input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.google.com/..." dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">حساب إنستقرام / سناب شات *</label>
              <Input value={socialLink} onChange={(e) => setSocialLink(e.target.value)} placeholder="https://instagram.com/..." dir="ltr" />
            </div>
          </div>

          {/* ── Section: Photos ── */}
          {photos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">
                الصور الحالية — {toAr(photos.length)} صورة
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((url, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border border-border" style={{ aspectRatio: "1" }}>
                    <img src={url} alt={`صورة ${toAr(i + 1)}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      title="حذف الصورة"
                      className="absolute top-1 inset-inline-start-1 w-6 h-6 rounded-full bg-destructive/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">مرّر على الصورة واضغط (×) لإزالتها. لا يمكن استرجاع الصور المحذوفة.</p>
            </div>
          )}

          {/* ── Section: Amenities ── */}
          {amenitiesCatalog.filter(a => a.isActive).length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">المرافق والخدمات</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {amenitiesCatalog.filter(a => a.isActive).map((item) => {
                  const checked = amenities.includes(item.key);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleAmenity(item.key)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium text-right transition-colors ${
                        checked
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      <div className={`w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                        {checked && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                      </div>
                      {item.labelAr}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Section: Contract Settings ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">إعدادات العقد الرقمي</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">شعار العقار (رابط صورة — يظهر في رأسية العقد)</label>
              <Input
                value={chaletLogoUrl}
                onChange={(e) => setChaletLogoUrl(e.target.value)}
                placeholder="https://..."
                dir="ltr"
                className="h-9 text-sm"
              />
              {chaletLogoUrl && (
                <div className="flex items-center gap-2 mt-1">
                  <img
                    src={chaletLogoUrl}
                    alt="معاينة الشعار"
                    className="w-12 h-12 rounded-lg object-cover border border-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <p className="text-xs text-muted-foreground">معاينة الشعار</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">بنود عقد الإيجار الرقمي (تظهر في العقد المُرسَل للعميل)</label>
              <textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                placeholder="أدخل الشروط والأحكام الخاصة بعقد الإيجار..."
                rows={4}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* ── Section: Cancellation Policy ── */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide border-b pb-1.5">سياسة الإلغاء (اختياري)</p>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3.5 py-3">
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">تفعيل نافذة الإلغاء المجاني</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">يُتيح للعميل إلغاء حجزه واسترداد العربون كاملاً خلال المهلة المحددة</p>
              </div>
              <Switch
                checked={cancellationWindowEnabled}
                onCheckedChange={setCancellationWindowEnabled}
              />
            </div>
            {cancellationWindowEnabled && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">مدة نافذة الإلغاء (بالساعات)</label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={cancellationWindowHours}
                  onChange={(e) => setCancellationWindowHours(e.target.value)}
                  placeholder="24"
                  dir="ltr"
                  className="text-right h-9 w-32"
                />
                <p className="text-[11px] text-muted-foreground">مثال: ٢٤ ساعة = يوم كامل من وقت الحجز</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">نص سياسة الحجز الظاهر للعملاء (اختياري)</label>
              <textarea
                value={bookingPolicyText}
                onChange={(e) => setBookingPolicyText(e.target.value)}
                placeholder="مثال: الإلغاء مجاني خلال ٢٤ ساعة من الحجز. بعدها يُحتجز العربون."
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* ── Section: Owner Revision Note ── */}
          <div className="space-y-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 px-3.5 py-3">
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400">ملاحظة للمراجع (اختياري)</p>
            <textarea
              value={ownerRevisionNote}
              onChange={(e) => setOwnerRevisionNote(e.target.value)}
              placeholder="أضف ملاحظة تريد إيصالها للمراجع مع هذا التعديل..."
              rows={2}
              className="w-full rounded-xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-950/30 px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
          </div>

        </div>{/* end scrollable area */}

        <DialogFooter className="gap-2 shrink-0 pt-3 border-t">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            disabled={saving}
            onClick={handleResubmit}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            إعادة التقديم للمراجعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockedRangeRow({
  range,
  onUnblock,
}: {
  range: { startDate: string; endDate: string; notes: string; ids: number[] };
  onUnblock?: (startDate: string, endDate: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs" dir="rtl">
      <span className="text-foreground leading-relaxed">
        🔒 <strong>{range.notes}</strong>
        <span className="block text-muted-foreground mt-0.5">
          {formatDualDate(range.startDate).hijri.replace(/\s*هـ\s*$/, "")} هـ
          {" — "}{formatDualDate(range.endDate).hijri}
        </span>
      </span>
      <button type="button" disabled={busy || !onUnblock}
        onClick={async () => {
          if (!onUnblock) return;
          setBusy(true);
          try { await onUnblock(range.startDate, range.endDate); }
          finally { setBusy(false); }
        }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-400 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-950/20 font-bold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50">
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "إلغاء الإغلاق 🔓"}
      </button>
    </div>
  );
}

export function BlockDatesDialog({
  open, chalet, onClose, onBlocked, chaletBlocks, onUnblockRange,
}: {
  open: boolean;
  chalet: { id: number; nameAr: string } | null;
  onClose: () => void;
  onBlocked: () => void;
  chaletBlocks?: Array<{ id: number; dateStr: string; notes: string | null }>;
  onUnblockRange?: (startDate: string, endDate: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("صيانة");
  const [extraNotes, setExtraNotes] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() { setStartDate(""); setEndDate(""); setReason("صيانة"); setExtraNotes(""); }

  async function handleBlock() {
    if (!chalet || !startDate || !endDate) return;
    setLoading(true);
    const combinedNotes = extraNotes.trim() ? `${reason} — ${extraNotes.trim()}` : reason;
    try {
      const r = await apiFetch("/owner/availability/bulk", {
        method: "POST",
        body: JSON.stringify({ chaletId: chalet.id, startDate, endDate, notes: combinedNotes }),
      });
      if (!r.ok) { toast({ title: "حدث خطأ", variant: "destructive" }); return; }
      const data = await r.json();
      toast({ title: `تم إغلاق ${toAr(data.blocked)} يوم بنجاح`, description: `${chalet.nameAr} — ${reason}` });
      onBlocked();
      onClose();
      reset();
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            إغلاق أيام — {chalet?.nameAr}
          </DialogTitle>
          <DialogDescription>حدد نطاق التاريخ لمنع حجوزات الضيوف (صيانة، فعالية خاصة، إلخ)</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker
                value={startDate}
                onChange={setStartDate}
                placeholder="اختر تاريخ البداية"
                label="من تاريخ"
              />
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker
                value={endDate}
                onChange={setEndDate}
                placeholder="اختر تاريخ النهاية"
                label="إلى تاريخ"
                minDate={startDate || undefined}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">سبب الإغلاق</label>
            <div className="flex gap-2 flex-wrap">
              {["صيانة", "فعالية خاصة", "إجازة", "تجديد"].map((r) => (
                <button key={r} onClick={() => setReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${reason === r ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                  {r}
                </button>
              ))}
            </div>
            <Input className="mt-2" placeholder="تفاصيل إضافية... (اختياري)" value={extraNotes} onChange={(e) => setExtraNotes(e.target.value)} />
          </div>
          {startDate && endDate && startDate <= endDate && (() => {
            const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
            const startFmt = formatDualDate(startDate);
            const endFmt   = formatDualDate(endDate);
            return (
              <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dir="rtl">
                سيتم إغلاق {toAr(days)} {days === 1 ? "يوم" : "أيام"} من
                {" "}({startFmt.hijri} / {startFmt.gregorian})
                {" "}إلى
                {" "}({endFmt.hijri} / {endFmt.gregorian})
              </div>
            );
          })()}
        </div>

        {/* Upcoming blocked periods */}
        {(() => {
          const ranges = groupBlockedDatesIntoRanges(chaletBlocks ?? []);
          if (!ranges.length) return null;
          return (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                الفترات المغلقة حالياً
              </p>
              {ranges.map((range, i) => (
                <BlockedRangeRow key={i} range={range} onUnblock={onUnblockRange} />
              ))}
            </div>
          );
        })()}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>إلغاء</Button>
          <Button
            disabled={!startDate || !endDate || !reason.trim() || loading || startDate > endDate}
            onClick={handleBlock}
            className="bg-gray-700 hover:bg-gray-800 text-white gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            إغلاق الأيام
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PauseChaletDialog({
  chalet,
  onClose,
  onSave,
}: {
  chalet: any | null;
  onClose: () => void;
  onSave: (chaletId: number, pausedFrom: string | null, pausedUntil: string | null, clear?: boolean) => Promise<void>;
}) {
  const [pausedFrom, setPausedFrom] = useState("");
  const [pausedUntil, setPausedUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (chalet) {
      setPausedFrom(chalet.pausedFrom ?? getLocalDateStr());
      setPausedUntil(chalet.pausedUntil ?? "");
    }
  }, [chalet]);

  if (!chalet) return null;

  const submit = async (clear = false) => {
    if (!clear && (!pausedFrom || (pausedUntil && pausedUntil < pausedFrom))) return;
    setSaving(true);
    try {
      await onSave(chalet.id, pausedFrom || null, pausedUntil || null, clear);
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message ?? "تعذر حفظ الإيقاف", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-base">إيقاف مؤقت — {chalet.nameAr}</DialogTitle>
        <DialogDescription className="text-right">
          خلال فترة الإيقاف لن يظهر العقار للزوار، ولن يُقبل عليه حجز يدوي جديد من لوحة المالك.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">تاريخ البداية</label>
          <div className="rounded-xl border border-border bg-background px-3 py-2 min-h-[2.5rem] flex items-center text-sm">
            <DualCalendarPicker value={pausedFrom} onChange={setPausedFrom} placeholder="اختر تاريخ البداية" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold">تاريخ النهاية <span className="text-xs text-muted-foreground font-normal">(اختياري)</span></label>
          <div className="rounded-xl border border-border bg-background px-3 py-2 min-h-[2.5rem] flex items-center text-sm">
            <DualCalendarPicker value={pausedUntil} onChange={setPausedUntil} placeholder="بدون تاريخ نهاية" />
          </div>
          {pausedUntil && (
            <button type="button" onClick={() => setPausedUntil("")} className="text-xs text-muted-foreground hover:text-foreground">
              مسح تاريخ النهاية
            </button>
          )}
        </div>
      </div>
      <DialogFooter className="gap-2 flex-wrap">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>إغلاق</Button>
        {chalet.pausedFrom ? (
          <Button type="button" onClick={() => submit(true)} disabled={saving} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            إلغاء الإيقاف وتنشيط العقار
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => submit(false)}
            disabled={saving || !pausedFrom || (!!pausedUntil && pausedUntil < pausedFrom)}
            className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PauseCircle className="w-4 h-4" />}
            حفظ الإيقاف
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
