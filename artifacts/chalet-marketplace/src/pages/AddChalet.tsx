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
  Plus,
  X,
  Building2,
  Upload,
  Image as ImageIcon,
  Loader2,
  Info,
  Instagram,
  ShieldCheck,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CityOption { id: number; name: string; }
interface DistrictOption { id: number; name: string; cityId: number; }

function useCatalog(selectedCityId: number | null) {
  const { data: cities = [] } = useQuery<CityOption[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: districts = [] } = useQuery<DistrictOption[]>({
    queryKey: ["catalog", "districts", selectedCityId],
    queryFn: async () => {
      const url = selectedCityId
        ? `${BASE}/api/districts?cityId=${selectedCityId}`
        : `${BASE}/api/districts`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: true,
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

  return { cities, districts, amenities };
}

const MAX_PHOTOS = 15;
const MAX_VIDEO_SIZE_MB = 15;

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

async function uploadFile(file: File): Promise<string | null> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${base}/api/storage/uploads/process`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) return null;
    const { url } = await res.json() as { url: string };
    return url ?? null;
  } catch {
    return null;
  }
}

export default function AddChalet() {
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const { cities, districts, amenities } = useCatalog(selectedCityId);
  const [submitted, setSubmitted] = useState(false);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedAmenities, setSelectedAmenities] = useState<Set<string>>(new Set());
  const [customAmenityTags, setCustomAmenityTags] = useState<string[]>([]);
  const [customAmenityInput, setCustomAmenityInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [customDistrict, setCustomDistrict] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nameAr: "",
    whatsappNumber: "",
    location: "",
    mapsUrl: "",
    socialLink: "",
    descriptionAr: "",
  });
  const [propertyType, setPropertyType] = useState("");
  const [sections, setSections] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);

  /* ── Time-slot pricing ── */
  const [slotMorning, setSlotMorning] = useState(true);
  const [slotEvening, setSlotEvening] = useState(true);
  const [slotFullDay, setSlotFullDay] = useState(true);
  const [priceMorning, setPriceMorning] = useState("");
  const [priceEvening, setPriceEvening] = useState("");
  const [priceFullDay, setPriceFullDay] = useState("");

  /* ── Weekday / Weekend pricing ── */
  const [priceWeekday, setPriceWeekday] = useState("");
  const [priceWeekend, setPriceWeekend] = useState("");
  const [seasonalDisclaimer, setSeasonalDisclaimer] = useState(true);

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
      toUpload.map((f) => uploadFile(f))
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

  const addCustomTag = () => {
    const tag = customAmenityInput.trim();
    if (!tag) return;
    if (customAmenityTags.includes(tag)) { setCustomAmenityInput(""); return; }
    setCustomAmenityTags((prev) => [...prev, tag]);
    setCustomAmenityInput("");
  };

  const removeCustomTag = (index: number) => {
    setCustomAmenityTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleVideoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setVideoError("يرجى اختيار ملف فيديو صالح");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
      setVideoError(`الفيديو يتجاوز الحد الأقصى ${MAX_VIDEO_SIZE_MB}MB`);
      return;
    }
    setVideoError(null);
    setIsUploadingVideo(true);
    const preview = URL.createObjectURL(file);
    setVideo({ url: "", name: file.name, preview });
    const url = await uploadFile(file);
    if (url) {
      setVideo({ url, name: file.name, preview });
    } else {
      setVideo({ url: "error", name: file.name, preview });
      setVideoError("فشل رفع الفيديو. يرجى المحاولة مرة أخرى.");
    }
    setIsUploadingVideo(false);
  };

  const removeVideo = () => {
    if (video?.preview) URL.revokeObjectURL(video.preview);
    setVideo(null);
    setVideoError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const successfulPhotos = photos.filter((p) => p.url && p.url !== "error").map((p) => p.url);
    const successfulVideo = video && video.url && video.url !== "error" ? video.url : undefined;

    const finalDistrict = selectedDistrict === "__other__"
      ? customDistrict.trim() || undefined
      : selectedDistrict || undefined;

    const amenitiesList = Array.from(selectedAmenities).filter(k => k !== "__other__");
    for (const tag of customAmenityTags) {
      if (tag.trim()) amenitiesList.push(`other:${tag.trim()}`);
    }

    mutation.mutate(
      {
        data: {
          nameAr: form.nameAr,
          whatsappNumber: form.whatsappNumber,
          location: form.location,
          district: finalDistrict,
          propertyType: propertyType || undefined,
          sections: sections || undefined,
          mapsUrl: form.mapsUrl || undefined,
          socialLink: form.socialLink,
          descriptionAr: form.descriptionAr,
          pricePerNight: 0,
          priceMorning: slotMorning && priceMorning ? Number(priceMorning) : null,
          priceEvening: slotEvening && priceEvening ? Number(priceEvening) : null,
          priceFullDay: slotFullDay && priceFullDay ? Number(priceFullDay) : null,
          slotMorning,
          slotEvening,
          slotFullDay,
          priceWeekday: priceWeekday ? Number(priceWeekday) : null,
          priceWeekend: priceWeekend ? Number(priceWeekend) : null,
          seasonalDisclaimer,
          amenities: amenitiesList,
          photos: successfulPhotos,
          videoUrl: successfulVideo,
        },
      },
      {
        onSuccess: () => setSubmitted(true),
      }
    );
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ nameAr: "", whatsappNumber: "", location: "", mapsUrl: "", socialLink: "", descriptionAr: "" });
    setPropertyType("");
    setSections("");
    setPhotos([]);
    setSelectedAmenities(new Set());
    setCustomAmenityTags([]);
    setCustomAmenityInput("");
    setSelectedCityId(null);
    setSelectedDistrict("");
    setCustomDistrict("");
    setLegalAccepted(false);
    setVideo(null);
    setVideoError(null);
  };

  const canAddMore = photos.length < MAX_PHOTOS && !isUploading;
  const allUploaded = photos.every((p) => p.url !== "") && !isUploadingVideo && (video ? video.url !== "" : true);

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
                        onValueChange={(val) => {
                          handleChange("location", val);
                          const city = cities.find((c) => c.name === val);
                          setSelectedCityId(city?.id ?? null);
                          setSelectedDistrict("");
                          setCustomDistrict("");
                        }}
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

                    {/* Smart District Dropdown */}
                    {form.location && (
                      <div className="space-y-2">
                        <Label htmlFor="district" className="text-base font-medium">
                          الحي أو المنطقة{" "}
                          <span className="text-muted-foreground font-normal text-sm">(اختياري)</span>
                        </Label>
                        <Select
                          value={selectedDistrict}
                          onValueChange={(val) => {
                            setSelectedDistrict(val);
                            if (val !== "__other__") setCustomDistrict("");
                          }}
                        >
                          <SelectTrigger className="h-12 text-base">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder={districts.length > 0 ? "اختر الحي" : "حي / منطقة"} />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {districts.map((d) => (
                              <SelectItem key={d.id} value={d.name}>
                                {d.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="__other__">أخرى...</SelectItem>
                          </SelectContent>
                        </Select>
                        {selectedDistrict === "__other__" && (
                          <Input
                            placeholder="اكتب اسم الحي أو المنطقة"
                            value={customDistrict}
                            onChange={(e) => setCustomDistrict(e.target.value)}
                            className="h-12 text-base"
                          />
                        )}
                      </div>
                    )}

                    {/* Property Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-base font-medium">
                          نوع العقار <span className="text-destructive">*</span>
                        </Label>
                        <Select value={propertyType} onValueChange={setPropertyType} required>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="اختر نوع العقار" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="شالية">🏕️ شالية</SelectItem>
                            <SelectItem value="مزرعة">🌿 مزرعة</SelectItem>
                            <SelectItem value="استراحة">🏡 استراحة</SelectItem>
                            <SelectItem value="مخيم">⛺ مخيم</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-base font-medium">
                          عدد الأقسام <span className="text-destructive">*</span>
                        </Label>
                        <Select value={sections} onValueChange={setSections} required>
                          <SelectTrigger className="h-12 text-base">
                            <SelectValue placeholder="اختر عدد الأقسام" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="قسم واحد">🔑 قسم واحد</SelectItem>
                            <SelectItem value="قسمين منفصلة">🔑🔑 قسمين منفصلة</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                    {/* Other / custom amenity */}
                    <label className="flex items-center gap-3 cursor-pointer group p-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all col-span-full sm:col-span-1">
                      <Checkbox
                        checked={selectedAmenities.has("__other__")}
                        onCheckedChange={() => toggleAmenity("__other__")}
                        className="shrink-0"
                      />
                      <span className="text-sm font-medium text-foreground leading-tight">أخرى</span>
                    </label>
                  </div>
                  {selectedAmenities.has("__other__") && (
                    <div className="mt-4 space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/4 p-4">
                      <p className="text-xs text-muted-foreground">أضف ميزات مخصصة — اكتب الميزة واضغط <strong>Enter</strong> أو <strong>+</strong></p>

                      {/* Tag chips */}
                      {customAmenityTags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customAmenityTags.map((tag, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-sm font-medium"
                            >
                              ✨ {tag}
                              <button
                                type="button"
                                onClick={() => removeCustomTag(i)}
                                className="text-primary/60 hover:text-destructive transition-colors ml-0.5"
                                aria-label={`حذف ${tag}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Input row */}
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="مثال: سينما خارجية، شاحن سيارات..."
                          value={customAmenityInput}
                          onChange={(e) => setCustomAmenityInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }}
                          className="h-10 text-sm flex-1"
                        />
                        <button
                          type="button"
                          onClick={addCustomTag}
                          disabled={!customAmenityInput.trim()}
                          className="h-10 w-10 rounded-xl border border-primary bg-primary text-primary-foreground font-bold text-lg flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
                          aria-label="إضافة ميزة"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
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

                    {/* Time-slot pricing */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium">أسعار الفترات — يبدأ من</Label>
                      <p className="text-xs text-muted-foreground -mt-1">فعّل الفترات التي تتيحها وأدخل السعر الابتدائي (يبدأ من) لكل فترة (اختياري)</p>

                      {/* Morning */}
                      <div className="rounded-xl border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">🌅 فترة صباحية</span>
                          <button
                            type="button"
                            onClick={() => setSlotMorning(!slotMorning)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${slotMorning ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${slotMorning ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {slotMorning && (
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="يبدأ من ... ر.س (اختياري)"
                              value={priceMorning}
                              onChange={(e) => setPriceMorning(e.target.value)}
                              className="h-10 text-sm pl-12"
                              dir="rtl"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">ر.س</span>
                          </div>
                        )}
                      </div>

                      {/* Evening */}
                      <div className="rounded-xl border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">🌙 فترة مسائية</span>
                          <button
                            type="button"
                            onClick={() => setSlotEvening(!slotEvening)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${slotEvening ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${slotEvening ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {slotEvening && (
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="يبدأ من ... ر.س (اختياري)"
                              value={priceEvening}
                              onChange={(e) => setPriceEvening(e.target.value)}
                              className="h-10 text-sm pl-12"
                              dir="rtl"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">ر.س</span>
                          </div>
                        )}
                      </div>

                      {/* Full day */}
                      <div className="rounded-xl border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium flex items-center gap-1.5">☀️ يوم كامل</span>
                          <button
                            type="button"
                            onClick={() => setSlotFullDay(!slotFullDay)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${slotFullDay ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${slotFullDay ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {slotFullDay && (
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              placeholder="يبدأ من ... ر.س (اختياري)"
                              value={priceFullDay}
                              onChange={(e) => setPriceFullDay(e.target.value)}
                              className="h-10 text-sm pl-12"
                              dir="rtl"
                            />
                            <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">ر.س</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Weekday / Weekend pricing */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium">أسعار الأيام <span className="text-destructive">*</span></Label>
                      <p className="text-xs text-muted-foreground -mt-1">أدخل السعر الابتدائي (يبدأ من) لكل نوع من الأيام</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Weekday */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            📅 وسط الأسبوع
                            <span className="text-destructive text-xs">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="1"
                              placeholder="مثال: 500"
                              value={priceWeekday}
                              onChange={(e) => setPriceWeekday(e.target.value)}
                              required
                              className="h-11 text-sm pl-12"
                              dir="rtl"
                            />
                            <span className="absolute left-3 top-3 text-xs text-muted-foreground">ر.س</span>
                          </div>
                        </div>

                        {/* Weekend */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            🎉 نهاية الأسبوع
                            <span className="text-destructive text-xs">*</span>
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="1"
                              placeholder="مثال: 800"
                              value={priceWeekend}
                              onChange={(e) => setPriceWeekend(e.target.value)}
                              required
                              className="h-11 text-sm pl-12"
                              dir="rtl"
                            />
                            <span className="absolute left-3 top-3 text-xs text-muted-foreground">ر.س</span>
                          </div>
                        </div>
                      </div>

                      {/* Seasonal disclaimer checkbox */}
                      <label className="flex items-start gap-3 cursor-pointer group select-none">
                        <div className="relative mt-0.5 shrink-0">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={seasonalDisclaimer}
                            onChange={(e) => setSeasonalDisclaimer(e.target.checked)}
                          />
                          <div className="w-5 h-5 rounded border-2 border-border peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all flex items-center justify-center">
                            {seasonalDisclaimer && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                          </div>
                        </div>
                        <span className="text-sm text-foreground leading-tight">
                          <span className="font-medium text-amber-600">⚠️ تنبيه:</span> الأسعار تختلف في المناسبات والأعياد
                          <span className="block text-xs text-muted-foreground mt-0.5">سيظهر هذا التنبيه أسفل الأسعار في صفحة الشاليه</span>
                        </span>
                      </label>
                    </div>

                    {/* Social Link — mandatory for trust system */}
                    <div className="space-y-2">
                      <Label htmlFor="socialLink" className="text-base font-medium flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        رابط حساب الشاليه (Instagram / Snapchat){" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Instagram className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="socialLink"
                          type="url"
                          placeholder="https://www.instagram.com/your_chalet"
                          value={form.socialLink}
                          onChange={(e) => handleChange("socialLink", e.target.value)}
                          required
                          className="h-12 text-base pr-10"
                          dir="ltr"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        يُستخدم للتحقق من هويتك وإظهار شارة "موثق ✅" على بطاقة الشاليه
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mapsUrl" className="text-base font-medium">
                        رابط الموقع على خرائط جوجل{" "}
                        <span className="text-destructive">*</span>
                        <span className="text-xs font-normal text-muted-foreground mr-1">(إلزامي)</span>
                      </Label>
                      <div className="relative">
                        <LinkIcon className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="mapsUrl"
                          type="url"
                          placeholder="https://maps.google.com/..."
                          value={form.mapsUrl}
                          onChange={(e) => handleChange("mapsUrl", e.target.value)}
                          required
                          className="h-12 text-base pr-10"
                          dir="ltr"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        افتح خرائط جوجل → اضغط على موقع الشاليه → شارك الرابط هنا
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section: Photos & Video */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-2 pb-3 border-b border-border flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    الصور والفيديو
                  </h2>
                  <div className="flex flex-col gap-1 mb-5 bg-muted/40 rounded-xl p-3 text-sm text-muted-foreground">
                    <span>📷 <strong>الصور:</strong> بحد أقصى {MAX_PHOTOS} صورة (حتى 2MB للصورة) صيغة JPG/PNG — تُحفظ تلقائياً بصيغة WebP</span>
                    <span>🎥 <strong>الفيديو:</strong> فيديو واحد (حتى {MAX_VIDEO_SIZE_MB}MB، مدة 30 ثانية) صيغة MP4 — يُضغط تلقائياً</span>
                  </div>

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

                  {/* ── Video Upload ── */}
                  <div className="mt-6 pt-5 border-t border-border">
                    <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      🎥 رفع فيديو للشاليه
                      <span className="font-normal text-muted-foreground text-xs">(فيديو واحد فقط — اختياري)</span>
                    </p>

                    {video ? (
                      <div className="relative rounded-xl border border-border overflow-hidden">
                        <video
                          src={video.preview}
                          className="w-full max-h-48 object-cover"
                          controls
                          muted
                        />
                        {video.url === "" && (
                          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                            <span className="text-white text-sm">جاري معالجة الفيديو...</span>
                          </div>
                        )}
                        {video.url === "error" && (
                          <div className="absolute inset-0 bg-destructive/60 flex items-center justify-center">
                            <X className="w-8 h-8 text-white" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-destructive transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {video.url && video.url !== "error" && (
                          <div className="absolute top-2 right-2 bg-green-600/90 text-white text-xs px-2 py-1 rounded-full">
                            ✓ تم الرفع
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => videoInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-2xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">
                            🎬
                          </div>
                          <p className="font-medium text-foreground text-sm">اضغط لاختيار فيديو</p>
                          <p className="text-xs text-muted-foreground">MP4 / MOV — حتى {MAX_VIDEO_SIZE_MB}MB، مدة 30 ثانية</p>
                        </div>
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={handleVideoInput}
                        />
                      </div>
                    )}
                    {videoError && (
                      <p className="text-sm text-destructive mt-2">{videoError}</p>
                    )}
                  </div>
                </div>

                {/* ── Legal Declaration ──────────────────────── */}
                <div className={`rounded-2xl border-2 p-5 transition-colors ${legalAccepted ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40"}`}>
                  <label className="flex items-start gap-4 cursor-pointer">
                    <Checkbox
                      checked={legalAccepted}
                      onCheckedChange={(v) => setLegalAccepted(Boolean(v))}
                      className="mt-0.5 shrink-0 h-5 w-5"
                    />
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-relaxed mb-1 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                        الإقرار القانوني
                        <span className="text-destructive text-xs">*</span>
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        أقر بأنني المالك أو المفوض الرسمي لهذا العقار، وأتحمل المسؤولية القانونية الكاملة عن صحة البيانات المذكورة.
                      </p>
                    </div>
                  </label>
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
                  disabled={mutation.isPending || isUploading || isUploadingVideo || !allUploaded || !legalAccepted || !propertyType || !sections || !form.mapsUrl}
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
