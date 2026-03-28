import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useCreateSubmission } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  Home,
  Phone,
  MapPin,
  Link as LinkIcon,
  FileText,
  DollarSign,
  Plus,
  X,
  Building2,
  Upload,
  Image as ImageIcon,
  Loader2,
  Info,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function useCatalog() {
  const { data: cities = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: amenities = [] } = useQuery<{ id: number; key: string; labelAr: string }[]>({
    queryKey: ["catalog", "amenities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  return { cities, amenities };
}

const MAX_PHOTOS = 5;

interface UploadedPhoto {
  url: string;
  name: string;
  preview: string;
}

async function uploadPhoto(file: File): Promise<string | null> {
  try {
    const res = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "image/jpeg",
      }),
    });
    if (!res.ok) return null;
    const { uploadURL, objectPath } = await res.json() as { uploadURL: string; objectPath: string };

    const uploadRes = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "image/jpeg" },
    });
    if (!uploadRes.ok) return null;

    return `/api/storage${objectPath}`;
  } catch {
    return null;
  }
}

export default function AddChalet() {
  const { cities, amenities } = useCatalog();
  const [submitted, setSubmitted] = useState(false);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAmenities, setSelectedAmenities] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nameAr: "",
    whatsappNumber: "",
    location: "",
    mapsUrl: "",
    descriptionAr: "",
    pricePerNight: "",
  });

  const mutation = useCreateSubmission();

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAmenity = (key: string) => {
    setSelectedAmenities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const processFiles = useCallback(async (files: File[]) => {
    const allowed = files.filter((f) => f.type.startsWith("image/"));
    const remaining = MAX_PHOTOS - photos.length;
    const toUpload = allowed.slice(0, remaining);
    if (toUpload.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    const previews = toUpload.map((f) => ({
      url: "",
      name: f.name,
      preview: URL.createObjectURL(f),
    }));
    setPhotos((prev) => [...prev, ...previews]);

    const startIdx = photos.length;
    const results = await Promise.all(
      toUpload.map((f) => uploadPhoto(f))
    );

    setPhotos((prev) => {
      const updated = [...prev];
      results.forEach((url, i) => {
        if (updated[startIdx + i]) {
          if (url) {
            updated[startIdx + i] = { ...updated[startIdx + i], url };
          } else {
            updated[startIdx + i] = { ...updated[startIdx + i], url: "error" };
          }
        }
      });
      return updated;
    });

    const failed = results.filter((r) => !r).length;
    if (failed > 0) {
      setUploadError(`فشل تحميل ${failed} صورة. يرجى المحاولة مرة أخرى.`);
    }

    setIsUploading(false);
  }, [photos.length]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      const next = [...prev];
      if (next[idx].preview) URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const successfulPhotos = photos.filter((p) => p.url && p.url !== "error").map((p) => p.url);

    mutation.mutate(
      {
        data: {
          nameAr: form.nameAr,
          whatsappNumber: form.whatsappNumber,
          location: form.location,
          mapsUrl: form.mapsUrl,
          descriptionAr: form.descriptionAr,
          pricePerNight: Number(form.pricePerNight),
          amenities: Array.from(selectedAmenities),
          photos: successfulPhotos,
        },
      },
      {
        onSuccess: () => setSubmitted(true),
      }
    );
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ nameAr: "", whatsappNumber: "", location: "", mapsUrl: "", descriptionAr: "", pricePerNight: "" });
    setPhotos([]);
    setSelectedAmenities(new Set());
  };

  const canAddMore = photos.length < MAX_PHOTOS && !isUploading;
  const allUploaded = photos.every((p) => p.url !== "");

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6 mx-auto">
              <CheckCircle className="w-14 h-14 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">تم الاستلام بنجاح!</h1>
            <p className="text-xl text-muted-foreground max-w-md leading-relaxed">
              تم استلام بياناتك بنجاح، سيتم مراجعة الشاليه ونشره قريباً
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              سيتم التواصل معك عبر واتساب بعد المراجعة
            </p>
            <Button className="mt-8" onClick={resetForm}>
              إضافة شاليه آخر
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="container mx-auto px-4 py-12 max-w-3xl"
          >
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
                <Building2 className="w-9 h-9 text-primary-foreground" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                انضم إلينا كمالك
              </h1>
              <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
                أضف شاليهك وابدأ في استقبال الحجوزات من عملاء في منطقة القصيم
              </p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-6 md:p-10 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-8">

                {/* Section: Basic Info */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <Home className="w-5 h-5 text-primary" />
                    المعلومات الأساسية
                  </h2>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="nameAr" className="text-base font-medium">
                        اسم الشاليه <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="nameAr"
                        placeholder="مثال: شاليه النخيل الذهبي"
                        value={form.nameAr}
                        onChange={(e) => handleChange("nameAr", e.target.value)}
                        required
                        className="h-12 text-base"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location" className="text-base font-medium">
                        المدينة <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.location}
                        onValueChange={(val) => handleChange("location", val)}
                        required
                      >
                        <SelectTrigger className="h-12 text-base">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <SelectValue placeholder="اختر المدينة" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {cities.map((city) => (
                            <SelectItem key={city.id} value={city.name}>
                              {city.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="descriptionAr" className="text-base font-medium">
                        وصف الشاليه <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <FileText className="absolute top-3 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Textarea
                          id="descriptionAr"
                          placeholder="صف شاليهك بالتفصيل: الموقع، الخدمات، أي معلومات إضافية..."
                          value={form.descriptionAr}
                          onChange={(e) => handleChange("descriptionAr", e.target.value)}
                          required
                          className="min-h-[120px] text-base pr-10 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Amenities */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    المرافق والمميزات
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-3">
                    {amenities.map(({ key, labelAr }) => (
                      <label
                        key={key}
                        className="flex items-center gap-3 cursor-pointer group p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                        onClick={() => toggleAmenity(key)}
                      >
                        <Checkbox
                          checked={selectedAmenities.has(key)}
                          onCheckedChange={() => toggleAmenity(key)}
                          className="shrink-0"
                        />
                        <span className="text-sm font-medium text-foreground leading-tight">
                          {labelAr}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Section: Contact & Pricing */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    التواصل والتسعير
                  </h2>
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber" className="text-base font-medium">
                        رقم الواتساب <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="whatsappNumber"
                          type="tel"
                          placeholder="05XXXXXXXX"
                          value={form.whatsappNumber}
                          onChange={(e) => handleChange("whatsappNumber", e.target.value)}
                          required
                          className="h-12 text-base pr-10"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pricePerNight" className="text-base font-medium">
                        متوسط السعر (ر.س / ليلة) <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="pricePerNight"
                          type="number"
                          min="1"
                          placeholder="500"
                          value={form.pricePerNight}
                          onChange={(e) => handleChange("pricePerNight", e.target.value)}
                          required
                          className="h-12 text-base pr-10"
                        />
                      </div>
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-1">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        السعر النهائي يعتمد على الموسم ويتم تأكيده عبر واتساب
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mapsUrl" className="text-base font-medium">
                        رابط الموقع على خرائط جوجل أو الموقع الإلكتروني{" "}
                        <span className="text-muted-foreground font-normal text-sm">(اختياري)</span>
                      </Label>
                      <div className="relative">
                        <LinkIcon className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="mapsUrl"
                          type="url"
                          placeholder="https://maps.google.com/... أو رابط الموقع"
                          value={form.mapsUrl}
                          onChange={(e) => handleChange("mapsUrl", e.target.value)}
                          className="h-12 text-base pr-10"
                          dir="ltr"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        يساعد الضيوف على معرفة الموقع بدقة
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section: Photos */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-5 pb-3 border-b border-border flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    صور الشاليه
                    <span className="text-sm font-normal text-muted-foreground">
                      (حتى {MAX_PHOTOS} صور)
                    </span>
                  </h2>

                  {/* Photo Thumbnails */}
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-4">
                      <AnimatePresence>
                        {photos.map((photo, idx) => (
                          <motion.div
                            key={photo.preview}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="relative aspect-square rounded-xl overflow-hidden border border-border group"
                          >
                            <img
                              src={photo.preview}
                              alt={photo.name}
                              className="w-full h-full object-cover"
                            />
                            {/* Upload state overlay */}
                            {photo.url === "" && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                              </div>
                            )}
                            {photo.url === "error" && (
                              <div className="absolute inset-0 bg-destructive/60 flex items-center justify-center">
                                <X className="w-6 h-6 text-white" />
                              </div>
                            )}
                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={() => removePhoto(idx)}
                              className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Upload Drop Zone */}
                  {canAddMore && (
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        isDragging
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          {isUploading ? (
                            <Loader2 className="w-7 h-7 text-primary animate-spin" />
                          ) : (
                            <Upload className="w-7 h-7 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-base">
                            {isUploading ? "جاري رفع الصور..." : "اضغط لاختيار الصور أو اسحب هنا"}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            صور من هاتفك أو جهازك • حتى {MAX_PHOTOS - photos.length} صور إضافية
                          </p>
                        </div>
                        {!isUploading && (
                          <Button type="button" variant="outline" size="sm" className="mt-1 rounded-full">
                            <Plus className="w-4 h-4 me-1" />
                            اختيار الصور
                          </Button>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileInput}
                      />
                    </div>
                  )}

                  {photos.length >= MAX_PHOTOS && (
                    <p className="text-sm text-center text-muted-foreground py-3">
                      وصلت إلى الحد الأقصى للصور ({MAX_PHOTOS} صور)
                    </p>
                  )}

                  {uploadError && (
                    <p className="text-sm text-destructive mt-2">{uploadError}</p>
                  )}
                </div>

                {/* Error message */}
                {mutation.isError && (
                  <div className="bg-destructive/10 text-destructive rounded-xl p-4 text-center">
                    حدث خطأ أثناء إرسال البيانات. يرجى المحاولة مرة أخرى.
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full h-14 text-lg font-bold rounded-2xl shadow-lg shadow-primary/20"
                  disabled={mutation.isPending || isUploading || !allUploaded}
                >
                  {mutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الإرسال...
                    </span>
                  ) : isUploading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      انتظر اكتمال رفع الصور...
                    </span>
                  ) : (
                    "إرسال طلب التسجيل"
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  بالضغط على إرسال، أنت توافق على مراجعة بياناتك من قِبل فريقنا
                </p>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
