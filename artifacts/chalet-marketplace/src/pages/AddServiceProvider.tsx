import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle, Phone, Star, Upload, Image as ImageIcon,
  Loader2, X, Building2, MapPin,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SERVICE_CATEGORIES = [
  { value: "bounce_houses",       label: "🎪 نطيطات" },
  { value: "ice_cream",           label: "🍦 آيس كريم" },
  { value: "productive_families", label: "🎀 أسر منتجة" },
  { value: "catering",            label: "🍽️ تموين وضيافة" },
  { value: "photography",         label: "📸 تصوير" },
  { value: "decoration",          label: "🎊 ديكور وتزيين" },
  { value: "entertainment",       label: "🎶 ترفيه وأناشيد" },
  { value: "other",               label: "✨ أخرى" },
];

const CITIES = ["بريدة", "عنيزة", "الرس", "المذنب", "الشماسية", "البكيرية", "رياض الخبراء", "البدائع", "عيون الجواء", "أخرى"];

const MAX_GALLERY = 8;

interface UploadedPhoto {
  url: string;
  name: string;
  preview: string;
}

async function uploadPhoto(file: File): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
      credentials: "include",
    });
    if (!res.ok) return null;
    const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };
    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "image/jpeg" },
    });
    if (!uploadRes.ok) return null;
    return `${BASE}/api/storage${objectPath}`;
  } catch {
    return null;
  }
}

export default function AddServiceProvider() {
  const { isAuthenticated, login, isLoading: authLoading } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    businessName: "",
    category: "",
    city: "",
    descriptionAr: "",
    whatsappNumber: "",
  });

  const [logo, setLogo] = useState<UploadedPhoto | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [gallery, setGallery] = useState<UploadedPhoto[]>([]);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (field: string, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setLogo({ url: "", name: file.name, preview });
    const url = await uploadPhoto(file);
    if (url) {
      setLogo({ url, name: file.name, preview });
    } else {
      setLogo(null);
      setUploadError("فشل تحميل الشعار. يرجى المحاولة مرة أخرى.");
    }
    setIsUploadingLogo(false);
    e.target.value = "";
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

    const results = await Promise.all(toUpload.map((f) => uploadPhoto(f)));

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.businessName || !form.category || !form.city || !form.whatsappNumber) {
      setSubmitError("يرجى تعبئة جميع الحقول المطلوبة.");
      return;
    }
    const validGallery = gallery.filter((p) => p.url && p.url !== "error").map((p) => p.url);
    if (validGallery.length < 3) {
      setSubmitError("يجب رفع 3 صور على الأقل للمعرض.");
      return;
    }
    if (logo && !logo.url) {
      setSubmitError("انتظر انتهاء تحميل الشعار.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        logoUrl: logo?.url || undefined,
        galleryPhotos: validGallery,
      };
      const r = await fetch(`${BASE}/api/providers/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error || "فشل إرسال الطلب");
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "حدث خطأ. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
              سيتم مراجعة خدمتك من قِبل فريق الإدارة خلال 24-48 ساعة.
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
            <p className="text-muted-foreground">أضف خدمتك وابدأ الوصول لعملاء جدد في القصيم</p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* ── Section 1: Basic Info ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                معلومات النشاط
              </h2>

              <div className="space-y-1.5">
                <Label htmlFor="businessName">اسم النشاط التجاري <span className="text-red-500">*</span></Label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => handleChange("businessName", e.target.value)}
                  placeholder="مثال: نطيطات الفرح - بريدة"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>فئة الخدمة <span className="text-red-500">*</span></Label>
                  <Select value={form.category} onValueChange={(v) => handleChange("category", v)} required>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>المدينة <span className="text-red-500">*</span></Label>
                  <Select value={form.city} onValueChange={(v) => handleChange("city", v)} required>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المدينة" />
                    </SelectTrigger>
                    <SelectContent>
                      {CITIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">رقم واتساب <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="whatsapp"
                    value={form.whatsappNumber}
                    onChange={(e) => handleChange("whatsappNumber", e.target.value.replace(/\D/g, ""))}
                    placeholder="05xxxxxxxx"
                    className="pr-10"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

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

            {/* ── Section 2: Logo ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-primary" />
                الشعار الرئيسي
              </h2>
              <p className="text-sm text-muted-foreground">شعار نشاطك التجاري (اختياري — يُعرض على البطاقة)</p>

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
                  <Upload className="w-5 h-5" />
                  اختر الشعار
                </button>
              )}
            </motion.div>

            {/* ── Section 3: Gallery ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  معرض الصور
                  <span className="text-red-500 text-sm font-normal">(3 صور على الأقل)</span>
                </h2>
                <span className="text-xs text-muted-foreground">{gallery.length} / {MAX_GALLERY}</span>
              </div>

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryInput}
                className="hidden"
              />

              {gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
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
                  className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">
                    {isUploadingGallery ? "جارٍ الرفع..." : `أضف صوراً (${MAX_GALLERY - gallery.length} متبقية)`}
                  </span>
                </button>
              )}

              {uploadError && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <X className="w-4 h-4" />
                  {uploadError}
                </p>
              )}

              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3.5 py-2.5">
                <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  الصور الجيدة تزيد من فرص قبول طلبك وتجذب العملاء بشكل أكبر
                </p>
              </div>
            </motion.div>

            {/* ── Submit ── */}
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
              className="w-full text-base font-bold py-6"
              disabled={isSubmitting || isUploadingLogo || isUploadingGallery}
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
