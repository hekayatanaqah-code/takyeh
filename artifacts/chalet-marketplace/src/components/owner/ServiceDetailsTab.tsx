import { Plus, CheckCircle, Trash2, AlertTriangle, Star, Zap, Camera, Loader2, Image as ImageIcon, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import { toAr, fromAr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServicePrimaryCitySelector } from "@/components/service/ServicePrimaryCitySelector";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ServiceCoverageEditor } from "@/components/service/ServiceCoverageEditor";
import { ServiceActivityDetailsSection, ServiceDetailsStickySave } from "@/components/owner/ServiceActivityDetailsSection";
import { QuickSalesSettingsPanel } from "@/components/owner/QuickSalesSettingsPanel";
import { useReadOnly, useServiceErp } from "@/components/owner/OwnerDashboardContexts";
import { BASE, apiFetch } from "@/components/owner/owner-api";
import { uploadFile } from "@/components/owner/finance-shared";
import { fromArN, toArN } from "@/components/owner/owner-formatting";


/* ════════════════════════════════════════════════════════════════
   SERVICE ERP TAB COMPONENTS
   All use ServiceErpCtx to obtain the current providerId.
   ════════════════════════════════════════════════════════════════ */

const AL_QASSIM_CITIES = ["بريدة","عنيزة","الرس","المذنب","الشماسية","البكيرية","رياض الخبراء","البدائع","عيون الجواء"];

/* ── Service Integration Banner (shared modules indicator) ── */
function ServiceIntegrationBanner({ isCrossOwner }: { isCrossOwner: boolean }) {
  if (!isCrossOwner) return null;
  return (
    <div className="mb-4 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm">
      <Zap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <span className="text-foreground">
        <span className="font-bold text-primary">نظام مُدمج:</span> هذا القسم مشترك مع عقاراتك — يُدار فريق عمل واحد وميزانية موحدة لجميع نشاطاتك.
      </span>
    </div>
  );
}

/* ── Service Details Tab ──────────────────────────────────── */
type ServiceDetailsSectionKey = "basic" | "coverage" | "media" | "danger";

export function ServiceDetailsTab() {
  const { providerId } = useServiceErp();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [coverageTags, setCoverageTags] = useState<string[]>([]);
  const hydratedProviderId = useRef<number | null>(null);
  const [featureTags, setFeatureTags] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [photoCaptions, setPhotoCaptions] = useState<string[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [openSections, setOpenSections] = useState<Record<ServiceDetailsSectionKey, boolean>>({ basic: true, coverage: false, media: false, danger: false });

  const { data: serviceCities = [], isLoading: citiesLoading, isError: citiesError, refetch: reloadCities } = useQuery<{ id: number; name: string; regionId: number }[]>({
    queryKey: ["service-locations", "cities", "all"],
    queryFn: async () => {
      const r = await apiFetch("/service-cities");
      if (!r.ok) throw new Error("تعذر تحميل مدن الخدمات");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: serviceRegions = [], isLoading: regionsLoading, isError: regionsError, refetch: reloadRegions } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["service-locations", "regions"],
    queryFn: async () => {
      const r = await apiFetch("/service-regions");
      if (!r.ok) throw new Error("تعذر تحميل مناطق الخدمات");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: provider, isLoading } = useQuery({
    queryKey: ["service-provider-detail", providerId],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/approved");
      if (!r.ok) throw new Error("تعذر تحميل بيانات الخدمة");
      const rows = await r.json();
      return rows.find((row: { id: number }) => row.id === providerId) ?? null;
    },
    enabled: !!providerId,
  });

  const needsRegistrationCity = !!provider?.submissionId && !String(provider?.city ?? "").trim();
  const { data: originalSubmission, isPending: registrationPending, isError: registrationError, refetch: reloadRegistration } = useQuery<{ city: string }>({
    queryKey: ["service-details-registration-city", providerId, provider?.submissionId],
    queryFn: async () => {
      const r = await apiFetch(`/providers/my/submissions/${provider.submissionId}`);
      if (!r.ok) throw new Error("تعذر جلب المدينة من التسجيل");
      return r.json();
    },
    enabled: needsRegistrationCity,
  });

  /* Hydrate once per service; background refreshes must not erase unsaved edits. */
  useEffect(() => {
    if (provider && !(needsRegistrationCity && registrationPending) && hydratedProviderId.current !== providerId) {
      hydratedProviderId.current = providerId;
      setForm({
        businessName: provider.businessName ?? "",
        descriptionAr: provider.descriptionAr ?? "",
        whatsappNumber: fromAr(provider.whatsappNumber ?? ""),
        city: String(provider.city ?? "").trim() || String(originalSubmission?.city ?? "").trim(),
        yearsOfExperience: provider.yearsOfExperience ?? "",
        requiresInsurance: Boolean(provider.requiresInsurance),
        requiresContract: Boolean(provider.requiresContract),
        contractText: provider.contractText ?? "",
        includeElectronicSignature: provider.includeElectronicSignature !== false,
        insuranceAmount: provider.insuranceAmount == null ? "" : String(provider.insuranceAmount),
        videoUrl: provider.videoUrl ?? "",
      });
      setCoverageTags([...new Set<string>(provider.coverageTags ?? [])]);
      setFeatureTags((provider.customFeatureTags ?? []).map((tag: string) => toAr(tag)));
      const photos: string[] = provider.galleryPhotos ?? [];
      setLogoUrl(provider.logoUrl ?? "");
      setGalleryPhotos(photos);
      setPhotoCaptions(photos.map((_, index) => provider.photoCaptions?.[index] ?? ""));
    }
  }, [provider, providerId, originalSubmission, needsRegistrationCity, registrationPending]);

  useEffect(() => {
    if (originalSubmission?.city?.trim()) {
      setForm(previous => previous && !previous.city?.trim() ? { ...previous, city: originalSubmission.city.trim() } : previous);
    }
  }, [originalSubmission]);

  if (isLoading || (needsRegistrationCity && registrationPending)) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!provider || !form) return <div className="py-12 text-center text-muted-foreground">تعذر تحميل البيانات</div>;

  async function handleSave() {
    if (isReadOnly) return onBlockedEdit();
    if (saving || uploadingLogo || uploadingGallery || uploadingVideo) return;
    const currentForm = form!;
    if (!currentForm.city?.trim()) {
      setOpenSections(prev => ({ ...prev, basic: true }));
      toast({ title: "المدينة الرئيسية مطلوبة", description: "اختر المدينة الرئيسية لنشاطك", variant: "destructive" });
      return;
    }
    if (currentForm.requiresInsurance && (!currentForm.insuranceAmount || Number(currentForm.insuranceAmount) <= 0)) {
      setOpenSections(prev => ({ ...prev, basic: true }));
      toast({ title: "قيمة التأمين مطلوبة", description: "أدخل قيمة أكبر من صفر للتأمين المسترد", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...currentForm,
          city: currentForm.city.trim(),
          insuranceAmount: currentForm.requiresInsurance ? currentForm.insuranceAmount : null,
          coverageTags,
          customFeatureTags: featureTags.map(fromAr),
          yearsOfExperience: currentForm.yearsOfExperience ? Number(currentForm.yearsOfExperience) : null,
          logoUrl: logoUrl || null,
          galleryPhotos,
          photoCaptions,
          videoUrl: currentForm.videoUrl || null,
        }),
      });
      if (!r.ok) throw new Error();
      const updatedProvider = await r.json();
      queryClient.setQueryData(["service-provider-detail", providerId], updatedProvider);
      queryClient.setQueryData(["my-approved-providers"], (previous: any[] | undefined) =>
        previous?.map(item => item.id === providerId ? { ...item, ...updatedProvider } : item));
      queryClient.invalidateQueries({ queryKey: ["service-provider-detail", providerId] });
      queryClient.invalidateQueries({ queryKey: ["my-approved-providers"] });
      toast({ title: "تم الحفظ ✓", description: "تم تحديث بيانات الخدمة بنجاح" });
    } catch {
      toast({ title: "خطأ", description: "فشل الحفظ، حاول مجدداً", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleToggleActive() {
    if (isReadOnly) return onBlockedEdit();
    setToggling(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}/toggle`, { method: "PATCH" });
      if (!r.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["service-provider-detail", providerId] });
      queryClient.invalidateQueries({ queryKey: ["my-approved-providers"] });
      const d = await r.json();
      toast({ title: d.isActive ? "تم تفعيل الخدمة ✓" : "تم إيقاف الخدمة", description: d.isActive ? "الخدمة ظاهرة الآن في السوق" : "الخدمة مخفية مؤقتاً عن العملاء" });
    } catch {
      toast({ title: "خطأ", description: "فشل التغيير", variant: "destructive" });
    } finally { setToggling(false); }
  }

  async function handleDeleteService() {
    if (isReadOnly) return onBlockedEdit();
    setDeleting(true);
    try {
      const r = await apiFetch(`/providers/my/approved/${providerId}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) {
        if (d.hasUpcomingBookings) {
          toast({ title: "لا يمكن الحذف", description: "لا يمكن الحذف لوجود حجوزات مستقبلية. أوقف الخدمة مؤقتاً.", variant: "destructive" });
        } else {
          toast({ title: "خطأ", description: d.error ?? "فشل الحذف", variant: "destructive" });
        }
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["my-approved-providers"] });
      toast({ title: "تم الحذف", description: "تم حذف الخدمة نهائياً. تبقى السجلات المالية متاحة للاطلاع." });
      setDeleteConfirm(false);
    } catch {
      toast({ title: "خطأ", description: "فشل الحذف، حاول مجدداً", variant: "destructive" });
    } finally { setDeleting(false); }
  }

  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    try {
      const url = await uploadFile(file);
      if (url) setLogoUrl(url);
    } finally { setUploadingLogo(false); }
  }

  async function handleGalleryAdd(file: File) {
    setUploadingGallery(true);
    try {
      const url = await uploadFile(file);
      if (url) {
        setGalleryPhotos(p => [...p, url]);
        setPhotoCaptions(p => [...p, ""]);
      }
    } finally { setUploadingGallery(false); }
  }

  function removeGalleryItem(idx: number) {
    const remainingPhotos = galleryPhotos.filter((_, index) => index !== idx);
    setGalleryPhotos(remainingPhotos);
    setPhotoCaptions(galleryPhotos.flatMap((_, index) => index === idx ? [] : [photoCaptions[index] ?? ""]));
  }

  function updateCaption(idx: number, val: string) {
    setPhotoCaptions(p => { const c = [...p]; c[idx] = val; return c; });
  }

  function setMainFromGallery(idx: number) {
    const photo = galleryPhotos[idx];
    if (!photo) return;
    const order = [idx, ...galleryPhotos.map((_, index) => index).filter(index => index !== idx)];
    setGalleryPhotos(order.map(index => galleryPhotos[index]));
    setPhotoCaptions(order.map(index => photoCaptions[index] ?? ""));
  }

  async function handleActivityVideoUpload(file: File) {
    if (isReadOnly) return onBlockedEdit();
    if (!file.type.startsWith("video/") || file.size > 15 * 1024 * 1024) {
      toast({ title: "تعذر رفع الفيديو", description: "اختر ملف فيديو بحجم لا يتجاوز ١٥ ميجابايت.", variant: "destructive" });
      return;
    }
    setUploadingVideo(true);
    try {
      const url = await uploadFile(file);
      if (!url) throw new Error("Upload failed");
      setForm(previous => previous ? { ...previous, videoUrl: url } : previous);
    } catch {
      toast({ title: "تعذر رفع الفيديو", description: "بقي الفيديو السابق دون تغيير. حاول مجددًا.", variant: "destructive" });
    } finally {
      setUploadingVideo(false);
    }
  }

  const bannerBlock = (
    <>
      {/* Activate / Deactivate Banner */}
      <div className={`flex items-center justify-between gap-4 rounded-2xl px-5 py-3 border ${provider.isActive ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/40" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/40"}`}>
        <div>
          <p className={`text-sm font-bold ${provider.isActive ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {provider.isActive ? "الخدمة نشطة ومرئية للعملاء" : "الخدمة موقوفة — مخفية عن السوق"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{provider.isActive ? "انقر لإيقاف العرض مؤقتاً" : "انقر لإعادة تفعيل الخدمة في السوق"}</p>
        </div>
        <Button onClick={handleToggleActive} disabled={toggling} variant="outline" size="sm"
          className={`rounded-xl gap-1.5 text-xs font-bold ${provider.isActive ? "border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" : "border-green-400 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"}`}>
          {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : provider.isActive ? <><X className="w-3.5 h-3.5" />إيقاف الخدمة</> : <><CheckCircle className="w-3.5 h-3.5" />تفعيل الخدمة</>}
        </Button>
      </div>
    </>
  );
  const logoBlock = (
    <>
      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3" data-testid="service-logo-section">
        <h3 className="text-sm font-bold text-foreground">شعار الخدمة (الصورة الرئيسية للنشاط)</h3>
        <div className="flex items-center gap-4 flex-wrap">
          {logoUrl ? (
            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border bg-muted shrink-0">
              <img src={`${BASE}${logoUrl}`} alt="شعار الخدمة" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = ""; }} />
              <button type="button" onClick={() => setLogoUrl("")} aria-label="إزالة شعار الخدمة"
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border bg-muted/40 flex items-center justify-center text-muted-foreground shrink-0">
              <ImageIcon className="w-7 h-7 opacity-40" />
            </div>
          )}
          <label className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-semibold ${uploadingLogo ? "opacity-60 pointer-events-none" : ""}`}>
            {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {logoUrl ? "تغيير الشعار" : "رفع شعار"}
            <input type="file" accept="image/*" aria-label="رفع شعار الخدمة" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} disabled={uploadingLogo} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">الشعار مستقل عن غلاف معرض الصور؛ لا يتغير عند اختيار صورة رئيسية للمعرض أو حذف صوره.</p>
      </div>
    </>
  );
  const basicGridBlock = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Business Name */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">اسم النشاط</label>
          <Input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} className="rounded-xl" />
        </div>
        {/* WhatsApp */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">رقم الواتساب</label>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={toAr(form.whatsappNumber)}
            onChange={e => setForm({ ...form, whatsappNumber: fromAr(e.target.value) })}
            className="rounded-xl text-right"
            dir="ltr"
          />
        </div>
        {/* City */}
        <div className="space-y-1.5">
          <ServicePrimaryCitySelector key={providerId}
            value={form.city} onChange={city => setForm(previous => previous ? { ...previous, city } : previous)}
            regions={serviceRegions} cities={serviceCities}
            loading={citiesLoading || regionsLoading} error={citiesError || regionsError}
            onRetry={() => { void reloadCities(); void reloadRegions(); }} />
          {registrationError && (
            <p className="text-xs text-destructive" role="alert">تعذر جلب المدينة من طلب التسجيل.{" "}
              <button type="button" className="underline" onClick={() => void reloadRegistration()}>إعادة المحاولة</button>
            </p>
          )}
        </div>
        {/* Years of Experience */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">سنوات الخبرة</label>
          <Input type="number" min={0} value={form.yearsOfExperience} onChange={e => setForm({ ...form, yearsOfExperience: e.target.value })} className="rounded-xl" />
        </div>
      </div>
    </>
  );
  const insuranceBlock = (
    <>
      {/* Refundable insurance settings */}
      <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <label className="text-sm font-bold text-foreground">التأمين المسترد للحجوزات</label>
            <p className="text-xs text-muted-foreground mt-1">عند تشغيله يظهر تبويب إدارة التأمينات لهذه الخدمة.</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={form.requiresInsurance ? "default" : "outline"}
              className="rounded-xl min-w-16"
              onClick={() => setForm({ ...form, requiresInsurance: true })}
            >
              نعم
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!form.requiresInsurance ? "default" : "outline"}
              className="rounded-xl min-w-16"
              onClick={() => setForm({ ...form, requiresInsurance: false, insuranceAmount: "" })}
            >
              لا
            </Button>
          </div>
        </div>
        {form.requiresInsurance && (
          <div className="max-w-xs space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">قيمة التأمين المسترد (ر.س) *</label>
            <Input
              type="text"
              inputMode="decimal"
              value={toArN(form.insuranceAmount)}
              onChange={e => setForm({ ...form, insuranceAmount: fromArN(e.target.value) })}
              placeholder="٥٠٠"
              className="rounded-xl"
              dir="ltr"
            />
          </div>
        )}
      </div>
    </>
  );
  const contractBlock = (
    <>
      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <label className="text-sm font-bold text-foreground">تفعيل عقد الخدمة</label>
            <p className="text-xs text-muted-foreground mt-1">عند تشغيله يظهر تبويب مستقل لإعداد العقود الرقمية ومتابعتها.</p>
          </div>
          <Switch checked={Boolean(form.requiresContract)} onCheckedChange={checked => setForm({ ...form, requiresContract: checked })} />
        </div>
      </div>
    </>
  );
  const descriptionBlock = (
    <>
      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-foreground">وصف الخدمة</label>
        <Textarea value={form.descriptionAr} onChange={e => setForm({ ...form, descriptionAr: e.target.value })} rows={4} className="rounded-xl resize-none" />
      </div>
    </>
  );
  const coverageBlock = (
    <>
      {/* Coverage Tags */}
      <ServiceCoverageEditor
        regions={serviceRegions}
        cities={serviceCities.filter(city => serviceRegions.some(region => region.id === city.regionId))}
        value={coverageTags}
        onChange={setCoverageTags}
        loading={citiesLoading || regionsLoading}
        error={citiesError || regionsError}
        onRetry={() => { void reloadCities(); void reloadRegions(); }}
      />
    </>
  );
  const featuresBlock = (
    <>
      {/* Feature Tags */}
      <div className="space-y-2" dir="rtl">
        <label className="text-sm font-semibold text-foreground">مميزات الخدمة</label>
        <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-xl min-h-[48px]">
          {featureTags.map(tag => (
            <span key={tag} className="flex items-center gap-1.5 bg-background border border-border rounded-full px-3 py-1 text-xs font-semibold">
              <bdi dir="rtl">{toAr(tag)}</bdi>
              <button type="button" onClick={() => setFeatureTags(prev => prev.filter(t => t !== tag))} className="text-muted-foreground hover:text-red-500 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {featureTags.length === 0 && <span className="text-xs text-muted-foreground">لا توجد مميزات — أضف مميزات تظهر في صفحة الخدمة</span>}
        </div>
        <div className="flex gap-2">
          <Input dir="rtl" aria-label="إضافة ميزة للخدمة" value={newFeature} onChange={e => setNewFeature(toAr(e.target.value))} placeholder="مثال: خدمة ٢٤ ساعة، تغطية كاملة..." className="rounded-xl flex-1 text-right"
            onKeyDown={e => { if (e.key === "Enter" && newFeature.trim()) { e.preventDefault(); setFeatureTags(p => [...p, newFeature.trim()]); setNewFeature(""); } }} />
          <Button type="button" variant="outline" className="rounded-xl"
            onClick={() => { if (newFeature.trim()) { setFeatureTags(p => [...p, newFeature.trim()]); setNewFeature(""); } }}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
  const mediaBlock = (
    <>
      {/* ── MEDIA SECTION ── */}
      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-amber-500" />
          الصور والوسائط
        </h3>

        {/* Gallery */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground">معرض الصور ({galleryPhotos.length})</label>
            <label className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-xs font-semibold ${uploadingGallery ? "opacity-60 pointer-events-none" : ""}`}>
              {uploadingGallery ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              إضافة صورة
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleGalleryAdd(f); e.target.value = ""; }} disabled={uploadingGallery} />
            </label>
          </div>

          {galleryPhotos.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-xs bg-muted/30 rounded-xl border border-dashed border-border">
              لا توجد صور في المعرض — أضف صورًا تظهر في صفحة خدمتك
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {galleryPhotos.map((url, idx) => (
                <div key={url} className="space-y-1.5">
                  <div className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group">
                    <img src={`${BASE}${url}`} alt={`gallery-${idx}`} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).src = ""; }} />
                      <button type="button" onClick={() => removeGalleryItem(idx)}
                        aria-label={`حذف الصورة ${toAr(idx + 1)} من المعرض`}
                        className="absolute top-1 left-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    {idx === 0 && (
                      <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">رئيسية</span>
                    )}
                  </div>
                  <Button type="button" variant={idx === 0 ? "default" : "outline"} size="sm"
                    className="w-full h-auto min-h-8 gap-1 px-2 py-1.5 text-xs whitespace-normal"
                    aria-pressed={idx === 0} onClick={() => setMainFromGallery(idx)}>
                    <Star className="w-3 h-3 shrink-0" />
                    {idx === 0 ? "الصورة الرئيسية للمعرض" : "تحديد الصورة الرئيسية"}
                  </Button>
                  <Input
                    value={photoCaptions[idx] ?? ""}
                    onChange={e => updateCaption(idx, e.target.value)}
                    placeholder="وصف الصورة..."
                    className="h-7 text-xs rounded-lg px-2"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
  const noteBlock = (
    <>
      <p className="text-xs text-muted-foreground">اختر الصورة الرئيسية لتظهر أولًا كغلاف للمعرض، ثم اضغط «حفظ التعديلات». تبقى الأوصاف مرتبطة بصورها، ولا يتغير شعار الخدمة.</p>
    </>
  );
  const dangerBlock = (
    <>
      {/* ── Danger Zone: Delete Service ── */}
      <div className="border border-destructive/30 rounded-2xl p-4 space-y-3 bg-destructive/5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <h3 className="text-sm font-bold text-destructive">منطقة الخطر</h3>
        </div>
        {!deleteConfirm ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">سيتم حذف الخدمة نهائياً. تبقى السجلات المالية التاريخية متاحة للاطلاع.</p>
            <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(true)}
              className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0 gap-1.5 text-xs">
              <Trash2 className="w-3.5 h-3.5" />
              حذف الخدمة
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-destructive">هل أنت متأكد من حذف هذا النشاط نهائياً؟</p>
            <p className="text-xs text-muted-foreground">لا يمكن الحذف إذا كانت هناك حجوزات مستقبلية قائمة.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleDeleteService} disabled={deleting}
                className="rounded-xl gap-1.5 text-xs">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                تأكيد الحذف النهائي
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(false)} disabled={deleting}
                className="rounded-xl text-xs">
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const toggleSection = (key: ServiceDetailsSectionKey) => (open: boolean) => setOpenSections(prev => ({ ...prev, [key]: open }));
  return (
    <div className="space-y-4 pt-2" dir="rtl" data-testid="service-activity-details">
      <ServiceDetailsStickySave businessName={form.businessName} saving={saving} uploading={uploadingLogo || uploadingGallery || uploadingVideo}
        readOnly={isReadOnly} onSave={() => { if (uploadingLogo || uploadingGallery || uploadingVideo) return; void handleSave(); }} />
      {bannerBlock}
      <QuickSalesSettingsPanel readOnly={isReadOnly} />
      <ServiceActivityDetailsSection id="basic" index={1} title="المعلومات الأساسية والتأمين"
        hint="الاسم والتواصل والمدينة والوصف والخبرة والتأمين المسترد وإعداد العقود"
        open={openSections.basic} onOpenChange={toggleSection("basic")}>
        {basicGridBlock}
        {descriptionBlock}
        {insuranceBlock}
        {contractBlock}
      </ServiceActivityDetailsSection>
      <ServiceActivityDetailsSection id="coverage" index={2} title="نطاق التغطية والمميزات"
        hint="المناطق والمدن التي تخدمها ومميزات تظهر في صفحة الخدمة"
        open={openSections.coverage} onOpenChange={toggleSection("coverage")}>
        {coverageBlock}
        {featuresBlock}
      </ServiceActivityDetailsSection>
      <ServiceActivityDetailsSection id="media" index={3} title="الصور والوسائط"
        hint="الشعار ومعرض الصور وأوصافها والصورة الرئيسية والفيديو"
        open={openSections.media} onOpenChange={toggleSection("media")}>
        {logoBlock}
        {mediaBlock}
        <div className="space-y-3">
          <label htmlFor={`activity-video-${providerId}`} className="text-sm font-semibold">فيديو النشاط</label>
          <p className="text-xs text-muted-foreground">مقطع اختياري حتى ٣٠ ثانية، بحجم لا يتجاوز ١٥ ميجابايت. يُحفظ التغيير عند الضغط على حفظ التعديلات.</p>
          {form.videoUrl && <div className="space-y-2">
            <video src={form.videoUrl} controls preload="metadata" className="w-full max-h-64 rounded-xl bg-black" data-testid="activity-video-preview" />
            <Button type="button" variant="outline" size="sm" disabled={isReadOnly || saving || uploadingVideo}
              onClick={() => setForm(previous => previous ? { ...previous, videoUrl: "" } : previous)}>إزالة الفيديو</Button>
          </div>}
          <Input id={`activity-video-${providerId}`} type="file" accept="video/*" data-testid="input-activity-video"
            aria-label="رفع فيديو النشاط" disabled={isReadOnly || saving || uploadingVideo}
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleActivityVideoUpload(file);
            }} />
          {uploadingVideo && <p role="status" className="text-xs text-muted-foreground">جارٍ تجهيز الفيديو ورفعه…</p>}
        </div>
        {noteBlock}
      </ServiceActivityDetailsSection>
      <ServiceActivityDetailsSection id="danger" index={4} tone="danger" title="منطقة الخطر"
        hint="حذف الخدمة نهائياً — يتطلب تأكيداً"
        open={openSections.danger} onOpenChange={toggleSection("danger")}>
        {dangerBlock}
      </ServiceActivityDetailsSection>
    </div>
  );
}
