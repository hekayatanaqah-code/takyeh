import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { serviceImageError, moveServicePhoto } from "@/lib/chaletServiceMedia";
import { Plus, CheckCircle, Trash2, Building2, Loader2, MessageSquare, Image as ImageIcon, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { toAr, fromAr } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OwnerChalet } from "@/components/owner/ReviewsTabs";
import { apiFetch } from "@/components/owner/owner-api";
import { uploadFile } from "@/components/owner/finance-shared";
import { SectionGuideButton } from "@/components/owner/SectionGuideButton";


/* ── Chalet Services Tab ──────────────────────── */
export interface ChaletServiceRow {
  id: number;
  chaletId: number;
  name: string;
  category: string | null;
  description: string | null;
  price: string;
  unit: string;
  imageUrl: string | null;
  galleryPhotos: Array<{ url: string; caption: string }> | null;
  isActive: boolean;
  createdAt: string;
  minPersons: number | null;
  maxPersons: number | null;
  maxQuantity: number | null;
}

const SERVICE_CATEGORY_OPTIONS = [
  { value: "ضيافة",         label: "☕ ضيافة" },
  { value: "تنظيف",         label: "🧹 تنظيف" },
  { value: "أثاث إضافي",   label: "🪑 أثاث إضافي" },
  { value: "تزيين",         label: "🎊 تزيين" },
  { value: "نقل",           label: "🚐 نقل" },
  { value: "أمن وحراسة",   label: "🛡️ أمن وحراسة" },
  { value: "تصوير",         label: "📸 تصوير" },
  { value: "طعام",          label: "🍽️ طعام" },
  { value: "أخرى",          label: "✨ أخرى" },
];

const SERVICE_UNIT_OPTIONS = [
  { value: "رسوم ثابتة",    label: "رسوم ثابتة" },
  { value: "بالساعة",       label: "بالساعة" },
  { value: "خدمة مجانية",   label: "خدمة مجانية" },
  { value: "لكل شخص",      label: "لكل شخص" },
  { value: "في الليلة",    label: "في الليلة" },
  { value: "يومياً",       label: "يومياً" },
  { value: "لمرة واحدة",   label: "لمرة واحدة" },
  { value: "لكل جلسة",    label: "لكل جلسة" },
];

const BLANK_SVC_FORM = {
  name: "", category: "", categoryCustom: "", description: "",
  price: "", unit: "رسوم ثابتة", imageUrl: "",
  gallery: [] as Array<{ localId: string; url: string; caption: string; uploading?: boolean }>,
  minPersons: "", maxPersons: "", maxQuantity: "",
};

export function ChaletServicesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const uploadEpoch = useRef(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...BLANK_SVC_FORM });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mainImgUploading, setMainImgUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: chalets = [], isLoading: chaletsLoading } = useQuery<OwnerChalet[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    if (chalets.length > 0 && selectedId === null) setSelectedId(chalets[0].id);
  }, [chalets, selectedId]);

  const { data: services = [], isLoading: servicesLoading } = useQuery<ChaletServiceRow[]>({
    queryKey: ["owner", "chalet-services", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const r = await apiFetch(`/owner/chalets/${selectedId}/services`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: selectedId !== null,
  });

  function resetForm() {
    ++uploadEpoch.current;
    setConfirmDeleteId(null);
    setForm({ ...BLANK_SVC_FORM });
    setFieldErrors({});
    setEditingId(null);
    setShowForm(false);
    setMainImgUploading(false);
  }

  function openEdit(svc: ChaletServiceRow) {
    ++uploadEpoch.current;
    setMainImgUploading(false);
    const isCustom = svc.category ? !SERVICE_CATEGORY_OPTIONS.some((o) => o.value === svc.category && o.value !== "أخرى") && svc.category !== "أخرى" : false;
    setForm({
      name: svc.name,
      category: isCustom ? "أخرى" : (svc.category ?? ""),
      categoryCustom: isCustom ? (svc.category ?? "") : "",
      description: svc.description ?? "",
      price: svc.price,
      unit: svc.unit,
      imageUrl: svc.imageUrl ?? "",
      gallery: (svc.galleryPhotos ?? []).map(photo => ({ ...photo, localId: crypto.randomUUID() })),
      minPersons: svc.minPersons != null ? String(svc.minPersons) : "",
      maxPersons: svc.maxPersons != null ? String(svc.maxPersons) : "",
      maxQuantity: svc.maxQuantity != null ? String(svc.maxQuantity) : "",
    });
    setFieldErrors({});
    setEditingId(svc.id);
    setShowForm(true);
  }

  function buildPayload() {
    const finalCategory = form.category === "أخرى"
      ? form.categoryCustom.trim() || "أخرى"
      : form.category || undefined;
    return {
      name: form.name.trim(),
      category: finalCategory,
      description: form.description.trim() || null,
      price: Number(form.price),
      unit: form.unit,
      imageUrl: form.imageUrl || null,
      galleryPhotos: form.gallery.filter((g) => g.url).map(({ url, caption }) => ({ url, caption })),
      minPersons: form.unit === "لكل شخص" && form.minPersons !== "" ? Number(form.minPersons) : null,
      maxPersons: form.unit === "لكل شخص" && form.maxPersons !== "" ? Number(form.maxPersons) : null,
      maxQuantity: form.maxQuantity === "" ? null : Number(form.maxQuantity),
    };
  }

  const saveService = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("no chalet");
      setFieldErrors({});
      // Client-side validation
      const errs: Record<string, string> = {};
      if (!form.name.trim()) errs.name = "اسم الخدمة مطلوب";
      if (form.price === "" || isNaN(Number(form.price)) || Number(form.price) < 0) errs.price = "أدخل سعرًا صحيحًا (يمكن أن يكون صفرًا للخدمات المجانية)";
      if (form.category === "أخرى" && !form.categoryCustom.trim()) errs.categoryCustom = "يرجى كتابة اسم الفئة";
      if (form.maxQuantity !== "" && (!Number.isSafeInteger(Number(form.maxQuantity)) || Number(form.maxQuantity) < 0 || Number(form.maxQuantity) > 1000000)) {
        errs.maxQuantity = "أدخل عدداً صحيحاً من ٠ إلى ١٬٠٠٠٬٠٠٠ أو اتركه فارغاً.";
      }
      if (Object.keys(errs).length > 0) { setFieldErrors(errs); throw new Error("validation"); }

      const url = editingId
        ? `/owner/chalets/${selectedId}/services/${editingId}`
        : `/owner/chalets/${selectedId}/services`;
      const r = await apiFetch(url, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify(buildPayload()),
      });
      if (!r.ok) {
        const d = await r.json();
        if (d.fieldErrors) setFieldErrors(d.fieldErrors);
        throw new Error(d.error ?? "خطأ في الحفظ");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "chalet-services", selectedId] });
      qc.invalidateQueries({ queryKey: ["owner", "submission-addons"] });
      qc.invalidateQueries({ queryKey: ["chalet-addons"] });
      resetForm();
    },
  });

  const deleteService = useMutation({
    mutationFn: async (serviceId: number) => {
      if (!selectedId) throw new Error("no chalet");
      const response = await apiFetch(`/owner/chalets/${selectedId}/services/${serviceId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("تعذّر حذف الخدمة؛ لم تتغير بياناتها.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "chalet-services", selectedId] });
      qc.invalidateQueries({ queryKey: ["owner", "submission-addons"] });
      qc.invalidateQueries({ queryKey: ["chalet-addons"] });
      setConfirmDeleteId(null);
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ serviceId, isActive }: { serviceId: number; isActive: boolean }) => {
      if (!selectedId) throw new Error("no chalet");
      const response = await apiFetch(`/owner/chalets/${selectedId}/services/${serviceId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      if (!response.ok) throw new Error("تعذّر تغيير حالة الخدمة.");
    },
    onMutate: async ({ serviceId, isActive }) => {
      const key = ["owner", "chalet-services", selectedId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ChaletServiceRow[]>(key);
      qc.setQueryData<ChaletServiceRow[]>(key, old => old?.map(service => service.id === serviceId ? { ...service, isActive } : service));
      return { previous, key };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
      toast({ title: error.message, variant: "destructive" });
    },
    onSettled: (_data, _error, _variables, context) => {
      qc.invalidateQueries({ queryKey: context?.key ?? ["owner", "chalet-services", selectedId] });
      qc.invalidateQueries({ queryKey: ["owner", "submission-addons"] });
      qc.invalidateQueries({ queryKey: ["chalet-addons"] });
    },
  });

  async function handleMainImageUpload(file: File) {
    const error = serviceImageError(file);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    const epoch = uploadEpoch.current;
    setMainImgUploading(true);
    try {
      const url = await uploadFile(file);
      if (epoch !== uploadEpoch.current) return;
      if (url) setForm((f) => ({ ...f, imageUrl: url }));
      else toast({ title: "تعذّر رفع الصورة؛ أعد المحاولة.", variant: "destructive" });
    } finally {
      if (epoch === uploadEpoch.current) setMainImgUploading(false);
    }
  }

  async function handleGalleryAdd(file: File) {
    const error = serviceImageError(file);
    if (error) { toast({ title: error, variant: "destructive" }); return; }
    if (form.gallery.length >= 5) return;
    const localId = crypto.randomUUID();
    const epoch = uploadEpoch.current;
    setForm((f) => ({ ...f, gallery: [...f.gallery, { localId, url: "", caption: "", uploading: true }] }));
    const url = await uploadFile(file);
    if (epoch !== uploadEpoch.current) return;
    if (!url) toast({ title: "تعذّر رفع الصورة؛ أعد المحاولة.", variant: "destructive" });
    setForm((f) => {
      const g = url ? f.gallery.map(photo => photo.localId === localId ? { ...photo, url, uploading: false } : photo)
        : f.gallery.filter(photo => photo.localId !== localId);
      return { ...f, gallery: g };
    });
  }

  function removeGalleryItem(idx: number) {
    setForm((f) => ({ ...f, gallery: f.gallery.filter((_, i) => i !== idx) }));
  }

  function updateGalleryCaption(idx: number, caption: string) {
    setForm((f) => {
      const g = [...f.gallery];
      g[idx] = { ...g[idx], caption };
      return { ...f, gallery: g };
    });
  }

  const selectedChalet = chalets.find((c) => c.id === selectedId) ?? null;
  const serviceFieldLabelCls = "text-sm font-semibold text-foreground";
  const inputCls = (field: string) =>
    `w-full h-10 px-3 rounded-lg border ${fieldErrors[field] ? "border-destructive ring-1 ring-destructive" : "border-border"} bg-background text-base text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary`;

  if (chaletsLoading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;

  if (chalets.length === 0) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
      <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-muted-foreground">لا توجد عقارات مرتبطة بحسابك بعد</p>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">إدارة الخدمات والمرافق</h2>
            <p className="text-muted-foreground text-sm">أضف خدمات ومرافق إضافية لكل عقار (مدفوعة أو مجانية)</p>
          </div>
          <SectionGuideButton sectionKey="services" />
        </div>
      </div>

      {/* Chalet selector */}
      {chalets.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {chalets.map((c) => (
            <button
              key={c.id}
              disabled={saveService.isPending || deleteService.isPending || toggleActive.isPending}
              onClick={() => { setSelectedId(c.id); resetForm(); }}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                selectedId === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.nameAr}
            </button>
          ))}
        </div>
      )}

      {/* Services list + form */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">{selectedChalet?.nameAr ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{services.length} خدمة مضافة</p>
          </div>
          {!showForm && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 rounded-xl px-3 py-1.5 hover:bg-primary/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إضافة خدمة
            </button>
          )}
        </div>

        {/* Add / Edit form */}
        {showForm && (
          <div className="px-5 py-5 border-b border-border bg-muted/20 space-y-4">
            <p className="text-base font-semibold text-foreground">{editingId ? "تعديل الخدمة" : "خدمة جديدة"}</p>

            {/* Row 1: name + category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={serviceFieldLabelCls}>اسم الخدمة <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  placeholder="مثال: ضيافة، تنظيف، أثاث إضافي"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputCls("name")}
                />
                {fieldErrors.name && <p className="text-[11px] text-destructive">{fieldErrors.name}</p>}
              </div>

              <div className="space-y-2">
                <label className={serviceFieldLabelCls}>الفئة</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, categoryCustom: "" }))}
                  className={inputCls("category")}
                >
                  <option value="">— اختر فئة —</option>
                  {SERVICE_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {/* Custom category input — only when "أخرى" is selected */}
              {form.category === "أخرى" && (
                <div className="space-y-2 sm:col-span-2">
                  <label className={serviceFieldLabelCls}>اسم الفئة المخصصة <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    placeholder="اكتب اسم الفئة..."
                    value={form.categoryCustom}
                    onChange={(e) => setForm((f) => ({ ...f, categoryCustom: e.target.value }))}
                    className={inputCls("categoryCustom")}
                    autoFocus
                  />
                  {fieldErrors.categoryCustom && <p className="text-[11px] text-destructive">{fieldErrors.categoryCustom}</p>}
                </div>
              )}
            </div>

            {/* Row 2: price + unit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className={`${serviceFieldLabelCls} flex flex-wrap items-center gap-x-1.5 gap-y-0.5`}>
                  <span>السعر (ر.س) <span className="text-destructive">*</span></span>
                  {form.unit === "خدمة مجانية" && <span className="text-green-600">(صفر للخدمات المجانية)</span>}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="٠"
                  value={toAr(form.price)}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    price: e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/[^\d.]/g, ""),
                  }))}
                  className={inputCls("price") + " text-right"}
                  disabled={form.unit === "خدمة مجانية"}
                />
                {fieldErrors.price && <p className="text-[11px] text-destructive">{fieldErrors.price}</p>}
              </div>
              <div className="space-y-2">
                <label className={serviceFieldLabelCls}>نوع الرسوم</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    unit: e.target.value,
                    price: e.target.value === "خدمة مجانية" ? "0" : (f.price === "0" && e.target.value !== "خدمة مجانية" ? "" : f.price),
                  }))}
                  className={inputCls("unit")}
                >
                  {SERVICE_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="service-max-quantity" className={serviceFieldLabelCls}>الكمية المتاحة لكل حجز (اختياري)</label>
              <input id="service-max-quantity" inputMode="numeric" placeholder="اتركه فارغاً إن لم يوجد حد"
                value={toAr(form.maxQuantity)} className={inputCls("maxQuantity")}
                onChange={event => setForm(previous => ({ ...previous, maxQuantity: fromAr(event.target.value).replace(/[^\d]/g, "") }))} />
              <p className="text-sm text-foreground/80">حد مستقل لكل حجز، وليس مخزوناً يومياً مشتركاً. الصفر يعني عدم توفر الخدمة حالياً.</p>
              {fieldErrors.maxQuantity && <p role="alert" className="text-sm text-destructive">{fieldErrors.maxQuantity}</p>}
            </div>

            {/* Row 2b: min/max persons — only for "لكل شخص" */}
            {form.unit === "لكل شخص" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className={serviceFieldLabelCls}>الحد الأدنى للأشخاص (اختياري)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="مثال: ٢"
                    value={toAr(form.minPersons)}
                    onChange={(e) => setForm((f) => ({ ...f, minPersons: e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "") }))}
                    className={inputCls("minPersons") + " text-right"}
                  />
                  {fieldErrors.minPersons && <p className="text-[11px] text-destructive">{fieldErrors.minPersons}</p>}
                </div>
                <div className="space-y-2">
                  <label className={serviceFieldLabelCls}>الحد الأقصى للأشخاص (اختياري)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="مثال: ١٠"
                    value={toAr(form.maxPersons)}
                    onChange={(e) => setForm((f) => ({ ...f, maxPersons: e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "") }))}
                    className={inputCls("maxPersons") + " text-right"}
                  />
                  {fieldErrors.maxPersons && <p className="text-[11px] text-destructive">{fieldErrors.maxPersons}</p>}
                </div>
              </div>
            )}

            {/* Row 3: description */}
            <div className="space-y-2">
              <label className={serviceFieldLabelCls}>وصف الخدمة (اختياري)</label>
              <input
                type="text"
                placeholder="تفاصيل إضافية أو شروط الخدمة..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={inputCls("description")}
              />
            </div>

            {/* Row 4: Main image */}
            <div className="space-y-2">
              <label className={`${serviceFieldLabelCls} flex items-center gap-1`}>
                <ImageIcon className="w-3.5 h-3.5" />
                الصورة الرئيسية للخدمة
              </label>
              {form.imageUrl ? (
                <div className="relative inline-block">
                  <img src={form.imageUrl} alt="صورة الخدمة" className="w-28 h-20 object-cover rounded-lg border border-border" />
                  <button
                    onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center shadow"
                  >×</button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed ${mainImgUploading ? "border-primary/40" : "border-border hover:border-primary/50"} rounded-xl cursor-pointer transition-colors bg-background`}>
                  {mainImgUploading
                    ? <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    : <><ImageIcon className="w-5 h-5 text-muted-foreground/50 mb-1" /><span className="text-xs text-muted-foreground">اضغط لرفع صورة</span></>
                  }
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMainImageUpload(f); e.target.value = ""; }} disabled={mainImgUploading} />
                </label>
              )}
            </div>

            <p className="text-sm font-medium text-foreground">الحد الأقصى لكل صورة: ٢ ميجابايت (2MB). حتى ٥ صور إضافية؛ استخدم الأسهم لتغيير ترتيب عرضها.</p>
            {/* Row 5: Gallery images with captions */}
            <div className="space-y-2">
              <label className={`${serviceFieldLabelCls} flex items-center gap-1`}>
                <ImageIcon className="w-3.5 h-3.5" />
                صور إضافية مع وصف (اختياري)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {form.gallery.map((item, idx) => (
                  <div key={item.localId} className="border border-border rounded-lg overflow-hidden bg-background">
                    {item.uploading ? (
                      <div className="h-20 flex items-center justify-center bg-muted/30"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <div className="relative">
                        <img src={item.url} alt="" className="w-full h-20 object-cover" />
                        <button
                          type="button" aria-label={`حذف الصورة ${toAr(idx + 1)}`}
                          onClick={() => removeGalleryItem(idx)}
                          className="absolute top-1 right-1 w-8 h-8 bg-black/80 text-white rounded-full text-base flex items-center justify-center hover:bg-destructive transition-colors"
                        >×</button>
                      </div>
                    )}
                    <input
                      type="text"
                      aria-label={`وصف الصورة ${toAr(idx + 1)}`}
                      placeholder="وصف الصورة..."
                      value={item.caption}
                      onChange={(e) => updateGalleryCaption(idx, e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border-t border-border bg-transparent focus:outline-none focus:bg-muted/20"
                    />
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5 border-t border-border">
                      <button type="button" aria-label={`تقديم الصورة ${toAr(idx + 1)}`} disabled={idx === 0}
                        className="px-2 py-1 text-sm font-semibold text-foreground disabled:opacity-40"
                        onClick={() => setForm(previous => ({ ...previous, gallery: moveServicePhoto(previous.gallery, idx, idx - 1) }))}>↑</button>
                      <span className="text-sm font-medium">{toAr(idx + 1)}</span>
                      <button type="button" aria-label={`تأخير الصورة ${toAr(idx + 1)}`} disabled={idx === form.gallery.length - 1}
                        className="px-2 py-1 text-sm font-semibold text-foreground disabled:opacity-40"
                        onClick={() => setForm(previous => ({ ...previous, gallery: moveServicePhoto(previous.gallery, idx, idx + 1) }))}>↓</button>
                    </div>
                  </div>
                ))}
                {form.gallery.length < 5 && (
                  <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors bg-background">
                    <Plus className="w-4 h-4 text-muted-foreground/50 mb-1" />
                    <span className="text-xs text-muted-foreground">إضافة صورة</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGalleryAdd(f); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={resetForm} disabled={saveService.isPending} className="text-sm text-foreground font-medium px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">إلغاء</button>
              <button
                onClick={() => saveService.mutate()}
                disabled={saveService.isPending || mainImgUploading || form.gallery.some(photo => photo.uploading)}
                className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saveService.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {editingId ? "حفظ التعديلات" : "إضافة الخدمة"}
              </button>
            </div>
            {saveService.isError && (saveService.error as Error).message !== "validation" && (
              <p className="text-xs text-destructive text-center">
                {Object.keys(fieldErrors).length > 0
                  ? "يوجد خطأ في الحقول — راجع الحقول المُميّزة أعلاه"
                  : (saveService.error as Error).message}
              </p>
            )}
          </div>
        )}

        {/* Services list */}
        {servicesLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
            <MessageSquare className="w-10 h-10 opacity-20" />
            <p className="text-sm">لم تُضف أي خدمات لهذا العقار بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {services.map((svc) => (
              <div key={svc.id} className={`flex flex-wrap sm:flex-nowrap items-start gap-3 px-4 sm:px-5 py-5 transition-colors ${!svc.isActive ? "bg-muted/20" : ""}`}>
                {/* Thumbnail */}
                {svc.imageUrl
                  ? <img src={svc.imageUrl} alt={svc.name} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-border" />
                  : <div className="w-14 h-14 rounded-xl bg-muted/40 shrink-0 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-muted-foreground/30" /></div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-base sm:text-lg">{svc.name}</p>
                    {svc.category && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{svc.category}</span>
                    )}
                    {!svc.isActive && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">معطّل</span>}
                    {(svc.galleryPhotos?.length ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground">{toAr(svc.galleryPhotos!.length)} صور</span>
                    )}
                  </div>
                  {svc.description && <p className="text-sm sm:text-base font-medium text-foreground/90 mt-1 leading-relaxed break-words">{svc.description}</p>}
                  {svc.maxQuantity != null && <p className="text-sm font-medium text-foreground mt-1">{svc.maxQuantity === 0 ? "لا توجد كمية متاحة حالياً" : `المتاح لكل حجز: ${toAr(svc.maxQuantity)}`}</p>}
                  <p className="text-base sm:text-lg font-semibold text-foreground mt-2 flex flex-wrap items-center gap-1">
                    {svc.unit === "خدمة مجانية" || Number(svc.price) === 0
                      ? <span className="text-green-800 dark:text-green-300">🎁 خدمة مجانية</span>
                      : <><span className="text-foreground">{toAr(Math.round(Number(svc.price)))} ر.س</span><span className="text-sm text-foreground/90 font-medium"> / {svc.unit}</span></>
                    }
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                  {/* Edit */}
                  <button
                    onClick={() => openEdit(svc)}
                    disabled={saveService.isPending}
                    title="تعديل"
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-foreground bg-muted/60 hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* Toggle active */}
                  <div className="flex items-center gap-2 px-2">
                    <Switch aria-label={`تفعيل خدمة ${svc.name}`} checked={svc.isActive} disabled={toggleActive.isPending}
                      onCheckedChange={isActive => toggleActive.mutate({ serviceId: svc.id, isActive })} />
                    <span className="text-sm font-semibold text-foreground">{svc.isActive ? "مفعلة" : "معطلة"}</span>
                  </div>
                  {/* Delete */}
                  <button
                      onClick={() => setConfirmDeleteId(svc.id)}
                      title="حذف"
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-destructive bg-red-50 dark:bg-red-900/20 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open && !deleteService.isPending) setConfirmDeleteId(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الخدمة</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-foreground">
              هل تريد حذف «{services.find(service => service.id === confirmDeleteId)?.name}»؟ ستُزال من قائمة الخدمات المتاحة، ولن تتأثر تفاصيل الحجوزات السابقة. لا يمكن التراجع عن الحذف.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={deleteService.isPending} onClick={() => setConfirmDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" disabled={deleteService.isPending} onClick={() => { if (confirmDeleteId !== null) deleteService.mutate(confirmDeleteId); }}>
              {deleteService.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف الخدمة نهائياً"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
