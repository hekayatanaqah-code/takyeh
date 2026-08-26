import { useState, useRef, useCallback } from "react";
import { fromAr, toAr } from "@/lib/utils";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle, Phone, Star, Upload, Image as ImageIcon,
  Loader2, X, Building2, MapPin, Video, ShieldCheck, Briefcase,
  Globe,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAX_GALLERY = 10;

const pricingUnitOptions = [
  { value: "per_day", label: "باليوم" },
  { value: "per_hour", label: "بالساعة" },
  { value: "per_request", label: "بالطلب / بالخدمة" },
];


interface UploadedPhoto {
  url: string;
  name: string;
  preview: string;
}

interface UploadedVideo {
  url: string;
  name: string;
  preview: string;
}

async function uploadCompressed(file: File, type: "image" | "video"): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch(`${BASE}/api/storage/uploads/process`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json() as { url?: string; originalUrl?: string };
    return data.url ?? data.originalUrl ?? null;
  } catch {
    return null;
  }
}

export default function AddServiceProvider() {
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [customCategory, setCustomCategory] = useState("");

  const [form, setForm] = useState({
    businessName: "",
    category: "",
    city: "",
    descriptionAr: "",
    whatsappNumber: "",
    yearsOfExperience: "",
    pricingUnit: "",
    dailyCapacity: "",
  });

  const [logo, setLogo] = useState<UploadedPhoto | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [gallery, setGallery] = useState<UploadedPhoto[]>([]);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);

  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const [coverageTags, setCoverageTags] = useState<string[]>([]);
  const [coverageAll, setCoverageAll] = useState(false);
  const [showCityRequest, setShowCityRequest] = useState(false);
  const [cityRequestInput, setCityRequestInput] = useState("");
  const [cityRequestSent, setCityRequestSent] = useState(false);

  const [customFeatureTags, setCustomFeatureTags] = useState<string[]>([]);
  const [customFeatureInput, setCustomFeatureInput] = useState("");
  const [showCustomFeature, setShowCustomFeature] = useState(false);

  const [legalAccepted, setLegalAccepted] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: serviceCategories = [] } = useQuery<{ id: number; key: string; labelAr: string; emoji: string }[]>({
    queryKey: ["catalog", "service-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/service-categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const otherCategory = serviceCategories.find(
    (category) => category.key === "other" || category.labelAr.trim() === "أخرى",
  );
  const orderedServiceCategories = [
    ...serviceCategories.filter(
      (category) => category.key !== "other" && category.labelAr.trim() !== "أخرى",
    ),
    {
      ...(otherCategory ?? { id: -1, key: "other", labelAr: "أخرى", emoji: "✨" }),
      key: "other",
      labelAr: "أخرى",
      emoji: "✨",
    },
  ];

  const { data: citiesCatalog = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [citySelectVal, setCitySelectVal] = useState("");
  const [customCity, setCustomCity] = useState("");

  const handleChange = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleCityChange = (city: string) => {
    setCitySelectVal(city);
    if (city === "__other__") {
      handleChange("city", "");
      return;
    }
    handleChange("city", city);
    if (city && !coverageTags.includes(city)) {
      setCoverageTags((prev) => [city, ...prev.filter((t) => t !== city)]);
    }
  };

  const toggleCityTag = (city: string, checked: boolean) => {
    setCoverageTags((prev) => {
      const next = checked ? [...prev.filter((t) => t !== city), city] : prev.filter((t) => t !== city);
      setCoverageAll(citiesCatalog.every((c) => next.includes(c.name)));
      return next;
    });
  };

  const toggleAllCities = (checked: boolean) => {
    setCoverageAll(checked);
    setCoverageTags(checked ? citiesCatalog.map((c) => c.name) : (form.city ? [form.city] : []));
  };

  const submitCityRequest = async () => {
    const city = cityRequestInput.trim();
    if (!city) return;
    try {
      await fetch(`${BASE}/api/providers/city-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
        credentials: "include",
      });
      setCityRequestSent(true);
      setCityRequestInput("");
      setShowCityRequest(false);
    } catch {
      // silent
    }
  };

  const removeCoverageTag = (tag: string) => {
    setCoverageTags((prev) => { const next = prev.filter((t) => t !== tag); setCoverageAll(false); return next; });
  };

  const addCustomFeature = () => {
    const tag = customFeatureInput.trim();
    if (!tag || customFeatureTags.includes(tag)) { setCustomFeatureInput(""); return; }
    setCustomFeatureTags((prev) => [...prev, tag]);
    setCustomFeatureInput("");
  };

  const removeCustomFeature = (i: number) =>
    setCustomFeatureTags((prev) => prev.filter((_, idx) => idx !== i));

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploadingLogo(true);
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setLogo({ url: "", name: file.name, preview });
    const url = await uploadCompressed(file, "image");
    if (url) {
      setLogo({ url, name: file.name, preview });
    } else {
      setLogo(null);
      setUploadError("فشل تحميل الشعار. يرجى المحاولة مرة أخرى.");
    }
    setIsUploadingLogo(false);
  };

  const processGalleryFiles = useCallback(async (files: File[]) => {
    const allowed = files.filter((f) => f.type.startsWith("image/"));
    const remaining = MAX_GALLERY - gallery.length;
    const toUpload = allowed.slice(0, remaining);
    if (toUpload.length === 0) return;

    setIsUploadingGallery(true);
    setUploadError(null);

    const previews = toUpload.map((f) => ({ url: "", name: f.name, preview: URL.createObjectURL(f) }));
    const startIdx = gallery.length;
    setGallery((prev) => [...prev, ...previews]);

    const results = await Promise.all(toUpload.map((f) => uploadCompressed(f, "image")));

    setGallery((prev) => {
      const updated = [...prev];
      results.forEach((url, i) => {
        if (updated[startIdx + i]) {
          updated[startIdx + i] = { ...updated[startIdx + i], url: url ?? "error" };
        }
      });
      return updated;
    });

    const failed = results.filter((r) => !r).length;
    if (failed > 0) setUploadError(`فشل تحميل ${failed} صورة.`);
    setIsUploadingGallery(false);
  }, [gallery.length]);

  const handleGalleryInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processGalleryFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const removeGalleryPhoto = (idx: number) =>
    setGallery((prev) => prev.filter((_, i) => i !== idx));

  const handleVideoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setUploadError("يرجى اختيار ملف فيديو صحيح.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setUploadError("حجم الفيديو يتجاوز الحد الأقصى (15MB). يرجى اختيار مقطع أصغر.");
      return;
    }
    setIsUploadingVideo(true);
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setVideo({ url: "", name: file.name, preview });
    const url = await uploadCompressed(file, "video");
    if (url) {
      setVideo({ url, name: file.name, preview });
    } else {
      setVideo(null);
      setUploadError("فشل تحميل الفيديو. يرجى المحاولة مرة أخرى أو اختيار مقطع أقصر.");
    }
    setIsUploadingVideo(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    /* ── Resolve custom city if "other" selected ── */
    let resolvedCity = citySelectVal === "__other__" ? "" : form.city;
    if (citySelectVal === "__other__") {
      const trimmedCity = customCity.trim();
      if (!trimmedCity) {
        setFieldErrors({ city: "يجب إدخال اسم المدينة" });
        setSubmitError("يجب إدخال اسم المدينة");
        return;
      }
      try {
        const r = await fetch(`${BASE}/api/cities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: trimmedCity }),
        });
        const city = await r.json();
        resolvedCity = city.name ?? trimmedCity;
        if (!coverageTags.includes(resolvedCity)) {
          setCoverageTags((prev) => [resolvedCity, ...prev]);
        }
      } catch {
        resolvedCity = trimmedCity;
      }
    }

    // Client-side field validation with specific messages
    const errs: Record<string, string> = {};
    if (!form.businessName.trim()) errs.businessName = "اسم النشاط مطلوب";
    if (!form.category) errs.category = "يرجى اختيار فئة الخدمة";
    if (form.category === "other" && !customCategory.trim()) errs.customCategory = "يرجى كتابة اسم الفئة المخصصة";
    if (!resolvedCity) errs.city = "يرجى اختيار المدينة";
    if (!form.whatsappNumber) errs.whatsappNumber = "رقم الواتساب مطلوب";
    else if (form.whatsappNumber.length < 9) errs.whatsappNumber = "رقم الواتساب يجب أن يكون 9 أرقام على الأقل";
    if (!form.yearsOfExperience) errs.yearsOfExperience = "يرجى إدخال سنوات الخبرة";
    if (!form.pricingUnit) errs.pricingUnit = "يرجى اختيار وحدة التسعير";
    if (!form.dailyCapacity) errs.dailyCapacity = "يرجى إدخال أقصى عدد حجوزات باليوم";
    else if (Number(form.dailyCapacity) < 1) errs.dailyCapacity = "يجب أن يكون العدد حجزاً واحداً على الأقل";
    if (coverageTags.length === 0) errs.coverageTags = "يرجى إضافة نطاق الخدمة (المناطق التي تخدمها)";

    const validGallery = gallery.filter((p) => p.url && p.url !== "error").map((p) => p.url);
    if (validGallery.length < 3) errs.galleryPhotos = `يجب رفع 3 صور على الأقل (لديك ${validGallery.length} حالياً)`;

    if (logo && !logo.url) errs.logoUrl = "انتظر انتهاء تحميل الشعار";
    if (!legalAccepted) errs.legalAccepted = "يجب الموافقة على الإقرار القانوني";

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      // Show summary of first error as the main message
      setSubmitError(Object.values(errs)[0]);
      return;
    }

    setIsSubmitting(true);
    try {
      const finalCategory = form.category === "other" && customCategory.trim()
        ? customCategory.trim()
        : form.category;

      const payload = {
        businessName: form.businessName.trim(),
        category: finalCategory,
        city: resolvedCity,
        descriptionAr: form.descriptionAr.trim() || undefined,
        whatsappNumber: form.whatsappNumber,
        yearsOfExperience: Number(form.yearsOfExperience),
        pricingUnit: form.pricingUnit,
        dailyCapacity: Number(form.dailyCapacity),
        logoUrl: logo?.url || undefined,
        galleryPhotos: validGallery,
        videoUrl: video?.url || undefined,
        coverageTags,
        customFeatureTags,
      };
      const r = await fetch(`${BASE}/api/providers/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as any;
        // Display field-specific errors from the API if available
        if (err.fieldErrors && typeof err.fieldErrors === "object") {
          setFieldErrors(err.fieldErrors);
          setSubmitError(Object.values(err.fieldErrors as Record<string, string>)[0] ?? err.error ?? "فشل إرسال الطلب");
        } else {
          throw new Error(err.error || "فشل إرسال الطلب");
        }
        return;
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "حدث خطأ. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isSubmitting &&
    !isUploadingLogo &&
    !isUploadingGallery &&
    !isUploadingVideo &&
    legalAccepted &&
    coverageTags.length > 0;

  if (authLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="text-6xl mb-4">🔐</div>
            <h2 className="text-2xl font-bold mb-3">يجب تسجيل الدخول أولاً</h2>
            <p className="text-muted-foreground mb-6">لتسجيل خدماتك يجب إنشاء حساب أو تسجيل الدخول.</p>
            <Button onClick={() => login("/add-service-provider")} size="lg" className="w-full">تسجيل الدخول</Button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-foreground mb-3">تم إرسال طلبك!</h2>
            <p className="text-muted-foreground text-lg mb-2 leading-relaxed">
              سيتم مراجعة خدمتك من قِبل فريق الإدارة خلال 24–48 ساعة.
            </p>
            <p className="text-muted-foreground text-sm">
              يمكنك متابعة حالة الطلب من لوحة التحكم.
            </p>
            <Button className="mt-8" onClick={() => window.location.href = `${BASE}/dashboard`}>
              الذهاب إلى لوحة التحكم
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="container mx-auto max-w-2xl">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl mb-4">
              <Star className="w-8 h-8 text-amber-600" />
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-2">تسجيل خدمتك</h1>
            <p className="text-muted-foreground">أضف خدمتك وابدأ الوصول لعملاء جدد في منطقة القصيم</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* ── Section 1: Basic Info ────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                معلومات النشاط
              </h2>

              {/* Business Name */}
              <div className="space-y-1.5">
                <Label htmlFor="businessName">اسم النشاط التجاري <span className="text-red-500">*</span></Label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => handleChange("businessName", e.target.value)}
                  placeholder="مثال: نطيطات الفرح - بريدة"
                  required
                  className={fieldErrors.businessName ? "border-red-500 ring-1 ring-red-500" : ""}
                />
                {fieldErrors.businessName && (
                  <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.businessName}</p>
                )}
              </div>

              {/* Category + City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>فئة الخدمة <span className="text-red-500">*</span></Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => { handleChange("category", v); setCustomCategory(""); }}
                    required
                  >
                    <SelectTrigger className={fieldErrors.category ? "border-red-500 ring-1 ring-red-500" : ""}>
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderedServiceCategories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.emoji} {c.labelAr}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.category && (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.category}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>المدينة الرئيسية <span className="text-red-500">*</span></Label>
                  <Select value={citySelectVal} onValueChange={handleCityChange} required>
                    <SelectTrigger className={fieldErrors.city ? "border-red-500 ring-1 ring-red-500" : ""}>
                      <SelectValue placeholder="اختر المدينة" />
                    </SelectTrigger>
                    <SelectContent>
                      {citiesCatalog.map((c) => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                      <SelectItem value="__other__">مدينة أخرى...</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.city && (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.city}</p>
                  )}
                </div>
              </div>

              {/* Custom values — each field gets its own full-width row */}
              {form.category === "other" && (
                <div className="space-y-1.5">
                  <Label htmlFor="customCategory">
                    اسم الفئة المخصصة <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customCategory"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="مثال: حلويات، ديكورات، نقليات..."
                    autoFocus
                    className={fieldErrors.customCategory ? "border-red-500 ring-1 ring-red-500" : ""}
                  />
                  {fieldErrors.customCategory && (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.customCategory}</p>
                  )}
                </div>
              )}

              {citySelectVal === "__other__" && (
                <div className="space-y-1.5">
                  <Label htmlFor="customCity">
                    اسم المدينة المخصصة <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customCity"
                    placeholder="اكتب اسم المدينة"
                    value={customCity}
                    onChange={(e) => setCustomCity(e.target.value)}
                    className={fieldErrors.city ? "border-red-500 ring-1 ring-red-500" : ""}
                    autoFocus
                  />
                </div>
              )}

              {/* Years of Experience + WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="flex min-w-0 flex-col items-stretch self-start space-y-1.5">
                  <Label htmlFor="experience" className="flex min-h-5 items-center">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      سنوات الخبرة <span className="text-red-500">*</span>
                    </span>
                  </Label>
                  <Input
                    id="experience"
                    type="text"
                    inputMode="numeric"
                    value={toAr(form.yearsOfExperience)}
                    onChange={(e) => handleChange("yearsOfExperience", fromAr(e.target.value).replace(/[^\d]/g, ""))}
                    placeholder="مثال: ٥"
                    className={`h-9 w-full text-right ${fieldErrors.yearsOfExperience ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    dir="ltr"
                    required
                  />
                  {fieldErrors.yearsOfExperience
                    ? <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.yearsOfExperience}</p>
                    : <p className="text-xs text-muted-foreground">تُعرض للعملاء لبناء الثقة</p>
                  }
                </div>

                <div className="flex min-w-0 flex-col items-stretch self-start space-y-1.5">
                  <Label htmlFor="whatsapp" className="flex min-h-5 items-center">رقم واتساب <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="whatsapp"
                      value={toAr(form.whatsappNumber)}
                      onChange={(e) => handleChange("whatsappNumber", fromAr(e.target.value).replace(/[^\d]/g, ""))}
                      placeholder="٠٥XXXXXXXX"
                      className={`h-9 pr-10 ${fieldErrors.whatsappNumber ? "border-red-500 ring-1 ring-red-500" : ""}`}
                      dir="ltr"
                      data-no-arabic=""
                      required
                    />
                  </div>
                  {fieldErrors.whatsappNumber && (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.whatsappNumber}</p>
                  )}
                </div>
              </div>

              {/* Pricing unit + Daily capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="flex min-w-0 flex-col items-stretch self-start space-y-1.5">
                  <Label className="flex min-h-5 items-center">وحدة التسعير <span className="text-red-500">*</span></Label>
                  <Select
                    value={form.pricingUnit}
                    onValueChange={(value) => handleChange("pricingUnit", value)}
                    required
                  >
                    <SelectTrigger className={`h-9 ${fieldErrors.pricingUnit ? "border-red-500 ring-1 ring-red-500" : ""}`}>
                      <SelectValue placeholder="اختر وحدة التسعير" />
                    </SelectTrigger>
                    <SelectContent>
                      {pricingUnitOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.pricingUnit && (
                    <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.pricingUnit}</p>
                  )}
                </div>

                <div className="flex min-w-0 flex-col items-stretch self-start space-y-1.5">
                  <Label htmlFor="dailyCapacity" className="flex min-h-5 items-center">أقصى عدد حجوزات باليوم <span className="text-red-500">*</span></Label>
                  <Input
                    id="dailyCapacity"
                    type="text"
                    inputMode="numeric"
                    value={toAr(form.dailyCapacity)}
                    onChange={(e) => handleChange("dailyCapacity", fromAr(e.target.value).replace(/[^\d]/g, ""))}
                    placeholder="مثال: ١"
                    className={`h-9 w-full text-right ${fieldErrors.dailyCapacity ? "border-red-500 ring-1 ring-red-500" : ""}`}
                    dir="ltr"
                    data-no-arabic=""
                    required
                  />
                  {fieldErrors.dailyCapacity
                    ? <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.dailyCapacity}</p>
                    : <p className="text-xs text-muted-foreground">تحدد عدد الحجوزات المتاحة يومياً</p>
                  }
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="desc">وصف الخدمة</Label>
                <Textarea
                  id="desc"
                  value={form.descriptionAr}
                  onChange={(e) => handleChange("descriptionAr", e.target.value)}
                  placeholder="اكتب وصفاً موجزاً عن خدمتك، ما الذي يميزها؟"
                  rows={4}
                  className="resize-none"
                />
              </div>
            </motion.div>

            {/* ── Section 2: Coverage Tags ─────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className={`bg-card border rounded-2xl p-6 space-y-4 ${fieldErrors.coverageTags ? "border-red-400 dark:border-red-700" : "border-border"}`}>
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2">
                <Globe className="w-5 h-5 text-primary" />
                نطاق الخدمة — نخدمك في <span className="text-[#734f36] text-sm font-semibold">(إلزامي)</span>
              </h2>
              {fieldErrors.coverageTags && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <X className="w-4 h-4 shrink-0" />{fieldErrors.coverageTags}
                </p>
              )}

              {/* Serve all Al-Qassim checkbox */}
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors">
                <Checkbox
                  checked={coverageAll}
                  onCheckedChange={(v) => toggleAllCities(!!v)}
                />
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  نخدمك في <strong>جميع مدن القصيم</strong>
                </span>
              </label>

              {/* City checkboxes grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {citiesCatalog.map((city) => (
                  <label
                    key={city.id}
                    className={`flex items-center gap-2.5 cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition-all ${
                      coverageTags.includes(city.name)
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted text-foreground"
                    }`}
                  >
                    <Checkbox
                      checked={coverageTags.includes(city.name)}
                      onCheckedChange={(v) => toggleCityTag(city.name, !!v)}
                    />
                    <MapPin className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    {city.name}
                  </label>
                ))}
              </div>

              {/* Request new city */}
              <div className="pt-1 border-t border-border">
                {!showCityRequest && !cityRequestSent && (
                  <button
                    type="button"
                    onClick={() => setShowCityRequest(true)}
                    className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    + طلب إضافة مدينة غير مدرجة
                  </button>
                )}
                {cityRequestSent && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    ✓ تم إرسال طلبك للإدارة وسيتم مراجعته
                  </p>
                )}
                {showCityRequest && (
                  <div className="flex gap-2 items-center mt-2">
                    <Input
                      type="text"
                      placeholder="اسم المدينة المطلوبة"
                      value={cityRequestInput}
                      onChange={(e) => setCityRequestInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitCityRequest(); } }}
                      className="h-9 text-sm flex-1"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={submitCityRequest}
                      disabled={!cityRequestInput.trim()}
                      className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                    >
                      إرسال
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCityRequest(false); setCityRequestInput(""); }}
                      className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* ── Section 3: Custom Features (Other) ──────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2">
                <Star className="w-5 h-5 text-primary" />
                مميزات إضافية (اختياري)
              </h2>

              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={showCustomFeature}
                  onCheckedChange={(v) => setShowCustomFeature(!!v)}
                />
                <span className="text-sm font-medium text-foreground">لدي مميزات خاصة أريد ذكرها</span>
              </label>

              {showCustomFeature && (
                <div className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/4 p-4">
                  <p className="text-xs text-muted-foreground">أضف مميزاتك الخاصة — اكتب ثم اضغط <strong>Enter</strong> أو <strong>+</strong></p>

                  {customFeatureTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customFeatureTags.map((tag, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-sm font-medium">
                          ✨ {tag}
                          <button
                            type="button"
                            onClick={() => removeCustomFeature(i)}
                            className="text-primary/60 hover:text-destructive transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="مثال: توصيل مجاني، تركيب بدقيقتين..."
                      value={customFeatureInput}
                      onChange={(e) => setCustomFeatureInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomFeature(); } }}
                      className="h-10 text-sm flex-1"
                    />
                    <button
                      type="button"
                      onClick={addCustomFeature}
                      disabled={!customFeatureInput.trim()}
                      className="h-10 w-10 rounded-xl border border-primary bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* ── Section 4: Logo ──────────────────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                الشعار الرئيسي <span className="text-xs text-[#734f36] font-semibold">(اختياري)</span>
              </h2>

              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} className="hidden" />

              {logo ? (
                <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary/30 group">
                  <img src={logo.preview} alt="شعار" className="w-full h-full object-cover" />
                  {logo.url === "" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setLogo(null)}
                    className="absolute top-1 left-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="flex items-center gap-3 px-5 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm text-muted-foreground"
                >
                  {isUploadingLogo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  {isUploadingLogo ? "جارٍ الضغط والرفع..." : "اختر الشعار"}
                </button>
              )}
            </motion.div>

            {/* ── Section 5: Gallery + Video ───────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                الصور والفيديو
              </h2>

              {/* Media limits info */}
              <div className="bg-muted/50 rounded-xl p-3.5 space-y-1 text-xs text-[#555555]">
                <p>📸 <strong className="text-[#734f36]">الصور:</strong> بحد أقصى {MAX_GALLERY} صور (حتى 2MB للصورة) — تُحوَّل تلقائياً إلى WebP</p>
                <p>🎬 <strong className="text-[#734f36]">الفيديو:</strong> مقطع واحد (حتى 15MB، 30 ثانية) — يُضغَط إلى MP4 تلقائياً</p>
              </div>

              {/* Gallery */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">
                    معرض الصور <span className="text-red-500">*</span>
                    <span className="text-xs text-muted-foreground font-normal ms-2">(3 صور على الأقل)</span>
                  </p>
                  <span className="text-xs text-muted-foreground">{gallery.length} / {MAX_GALLERY}</span>
                </div>
                {fieldErrors.galleryPhotos && (
                  <p className="text-sm text-red-600 dark:text-red-400 mb-2 flex items-center gap-1.5">
                    <X className="w-4 h-4 shrink-0" />{fieldErrors.galleryPhotos}
                  </p>
                )}

                <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleGalleryInput} className="hidden" />

                {gallery.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {gallery.map((photo, idx) => (
                      <div key={photo.preview} className="relative rounded-xl overflow-hidden aspect-square border border-border group">
                        <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                        {photo.url === "" && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          </div>
                        )}
                        {photo.url === "error" && (
                          <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
                            <X className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeGalleryPhoto(idx)}
                          className="absolute top-1 left-1 w-6 h-6 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {gallery.length < MAX_GALLERY && (
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isUploadingGallery}
                    className="w-full flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground"
                  >
                    {isUploadingGallery ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                    <span className="text-sm font-medium">
                      {isUploadingGallery ? "جارٍ الضغط والرفع..." : `أضف صوراً (${MAX_GALLERY - gallery.length} متبقية)`}
                    </span>
                  </button>
                )}
              </div>

              {/* Video */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Video className="w-4 h-4 text-primary" />
                  فيديو تعريفي <span className="text-xs text-[#734f36] font-semibold">(اختياري)</span>
                </p>
                <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoInput} className="hidden" />

                {video ? (
                  <div className="relative rounded-xl overflow-hidden border border-border group">
                    <video src={video.preview} className="w-full max-h-52 object-cover" muted />
                    {video.url === "" && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                        <span className="text-white text-sm">جارٍ ضغط الفيديو ورفعه...</span>
                      </div>
                    )}
                    {video.url !== "" && (
                      <div className="absolute top-2 right-2">
                        <span className="bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">✓ تم الرفع</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setVideo(null)}
                      className="absolute top-2 left-2 w-7 h-7 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={isUploadingVideo}
                    className="w-full flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground"
                  >
                    {isUploadingVideo ? <Loader2 className="w-6 h-6 animate-spin" /> : <Video className="w-6 h-6" />}
                    <span className="text-sm font-medium">
                      {isUploadingVideo ? "جارٍ الضغط والرفع..." : "ارفع مقطع فيديو (حتى 30 ثانية)"}
                    </span>
                  </button>
                )}
              </div>

              {uploadError && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <X className="w-4 h-4 shrink-0" />
                  {uploadError}
                </p>
              )}
            </motion.div>

            {/* ── Section 6: Legal Declaration ─────────────────────── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
              className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-lg font-bold text-[#734f36] pb-3 border-b border-border flex items-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-primary" />
                الإقرار القانوني <span className="text-[#734f36] text-sm font-semibold">(إلزامي)</span>
              </h2>

              <label className="flex items-start gap-3 cursor-pointer group">
                <Checkbox
                  checked={legalAccepted}
                  onCheckedChange={(v) => setLegalAccepted(!!v)}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-sm font-semibold text-[#4b3323] leading-relaxed group-hover:text-[#362318] transition-colors">
                  أقر بأنني المالك أو المفوض الرسمي لهذه الخدمة، وأتحمل المسؤولية القانونية الكاملة عن صحة البيانات المذكورة، وأوافق على شروط وسياسات منصة تكيّة.
                </span>
              </label>
            </motion.div>

            {/* ── Submit ───────────────────────────────────────────── */}
            {submitError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3 text-red-700 dark:text-red-400 text-sm flex items-center gap-2"
              >
                <X className="w-4 h-4 shrink-0" />
                {submitError}
              </motion.div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full text-base font-bold py-6 rounded-2xl"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <><Loader2 className="w-5 h-5 me-2 animate-spin" />جارٍ الإرسال...</>
              ) : (
                <><CheckCircle className="w-5 h-5 me-2" />إرسال الطلب للمراجعة</>
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
