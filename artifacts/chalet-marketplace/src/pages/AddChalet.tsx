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

  const TERMS_PLACEHOLDER = "يمنع التدخين داخل الشاليه\nوقت تسجيل الخروج الساعة ١٠:٠٠ صباحاً\nيمنع إحضار الحيوانات الأليفة\nالضيوف المسموح بهم فقط كما هو محدد عند الحجز\nأي أضرار تلحق بالمكان تُحسب على الضيف";

  const [form, setForm] = useState({
    nameAr: "",
    whatsappNumber: "",
    location: "",
    mapsUrl: "",
    socialLink: "",
    descriptionAr: "",
    termsAndConditions: TERMS_PLACEHOLDER,
  });
  const [propertyType, setPropertyType] = useState("");
  const [sections, setSections] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);

  /* ── Bedrooms / Guests ── */
  const [hasBedrooms, setHasBedrooms] = useState(false);
  const [bedroomCount, setBedroomCount] = useState("");
  const [maxGuestsInput, setMaxGuestsInput] = useState("");

  /* ── 7-day granular pricing grid ── */
  /* dailyPriceGrid[dayIndex][period] — empty string = not available */
  type DayPriceRow = { morning: string; evening: string; fullday: string };
  const initGrid = (): Record<number, DayPriceRow> =>
    Object.fromEntries([0,1,2,3,4,5,6].map(d => [d, { morning: "", evening: "", fullday: "" }]));
  const [dailyPriceGrid, setDailyPriceGrid] = useState<Record<number, DayPriceRow>>(initGrid());

  const setDayCell = (day: number, period: keyof DayPriceRow, val: string) =>
    setDailyPriceGrid(prev => ({ ...prev, [day]: { ...prev[day], [period]: val.replace(/[^\d.]/g, "") } }));

  /* ── Per-period check-in / check-out times ── */
  const [morningCheckIn, setMorningCheckIn] = useState("");
  const [morningCheckOut, setMorningCheckOut] = useState("");
  const [eveningCheckIn, setEveningCheckIn] = useState("");
  const [eveningCheckOut, setEveningCheckOut] = useState("");
  const [fullDayCheckIn, setFullDayCheckIn] = useState("");
  const [fullDayCheckOut, setFullDayCheckOut] = useState("");

  /* Helper: derive payload values from the grid */
  const minPeriodPrice = (period: keyof DayPriceRow): number | null => {
    const vals = [0,1,2,3,4,5,6]
      .map(d => dailyPriceGrid[d][period])
      .filter(v => v.trim() !== "")
      .map(Number)
      .filter(n => !isNaN(n));
    return vals.length > 0 ? Math.min(...vals) : null;
  };
  const buildDailyPricesPayload = (): Record<string, Record<string, number>> | null => {
    const result: Record<string, Record<string, number>> = {};
    (["morning","evening","fullday"] as const).forEach(p => {
      const entries: Record<string, number> = {};
      [0,1,2,3,4,5,6].forEach(d => {
        const v = dailyPriceGrid[d][p];
        if (v.trim() !== "" && !isNaN(Number(v))) entries[String(d)] = Number(v);
      });
      if (Object.keys(entries).length > 0) result[p] = entries;
    });
    return Object.keys(result).length > 0 ? result : null;
  };
  const [seasonalDisclaimer, setSeasonalDisclaimer] = useState(true);

  const mutation = useCreateSubmission();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

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
    setFieldErrors({});
    mutation.reset();

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
          termsAndConditions: form.termsAndConditions || null,
          pricePerNight: 0,
          maxGuests: maxGuestsInput ? Number(maxGuestsInput) : null,
          bedrooms: hasBedrooms && bedroomCount ? Number(bedroomCount) : null,
          priceMorning: minPeriodPrice("morning"),
          priceEvening: minPeriodPrice("evening"),
          priceFullDay: minPeriodPrice("fullday"),
          slotMorning: [0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].morning.trim()),
          slotEvening: [0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].evening.trim()),
          slotFullDay: [0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].fullday.trim()),
          dailyPrices: buildDailyPricesPayload(),
          morningCheckIn: morningCheckIn || null,
          morningCheckOut: morningCheckOut || null,
          eveningCheckIn: eveningCheckIn || null,
          eveningCheckOut: eveningCheckOut || null,
          fullDayCheckIn: fullDayCheckIn || null,
          fullDayCheckOut: fullDayCheckOut || null,
          priceWeekday: (() => {
            const vals = [1,2,3,4].flatMap(d => (["morning","evening","fullday"] as const).map(p => dailyPriceGrid[d][p])).filter(v=>v.trim()).map(Number).filter(n=>!isNaN(n));
            return vals.length > 0 ? Math.min(...vals) : null;
          })(),
          priceWeekend: (() => {
            const vals = [5,6].flatMap(d => (["morning","evening","fullday"] as const).map(p => dailyPriceGrid[d][p])).filter(v=>v.trim()).map(Number).filter(n=>!isNaN(n));
            return vals.length > 0 ? Math.min(...vals) : null;
          })(),
          seasonalDisclaimer,
          amenities: amenitiesList,
          photos: successfulPhotos,
          videoUrl: successfulVideo,
        },
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err: unknown) => {
          try {
            const apiErr = err as { data?: { details?: Record<string, string[]> } };
            if (apiErr?.data?.details && typeof apiErr.data.details === "object") {
              setFieldErrors(apiErr.data.details);
            }
          } catch {
          }
        },
      }
    );
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ nameAr: "", whatsappNumber: "", location: "", mapsUrl: "", socialLink: "", descriptionAr: "", termsAndConditions: TERMS_PLACEHOLDER });
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
    setHasBedrooms(false);
    setBedroomCount("");
    setMaxGuestsInput("");
    setMorningCheckIn(""); setMorningCheckOut("");
    setEveningCheckIn(""); setEveningCheckOut("");
    setFullDayCheckIn(""); setFullDayCheckOut("");
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

                    {/* ── Bedrooms & Guests ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Bedrooms toggle */}
                      <div className="rounded-xl border border-border p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">هل يوجد غرف نوم؟</Label>
                          <button
                            type="button"
                            onClick={() => { setHasBedrooms(!hasBedrooms); if (hasBedrooms) setBedroomCount(""); }}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${hasBedrooms ? "bg-primary" : "bg-muted"}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow ${hasBedrooms ? "translate-x-4" : "translate-x-1"}`} />
                          </button>
                        </div>
                        {hasBedrooms && (
                          <div className="relative">
                            <Input
                              type="number"
                              min="1"
                              max="30"
                              placeholder="عدد الغرف"
                              value={bedroomCount}
                              onChange={(e) => setBedroomCount(e.target.value)}
                              className="h-10 text-sm"
                              dir="rtl"
                            />
                          </div>
                        )}
                        {!hasBedrooms && (
                          <p className="text-xs text-muted-foreground">نظام مفتوح / لا يوجد</p>
                        )}
                      </div>

                      {/* Max guests */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          عدد الضيوف
                          <span className="text-muted-foreground font-normal text-xs me-1"> (اختياري)</span>
                        </Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="1"
                            max="200"
                            placeholder="مثال: 20"
                            value={maxGuestsInput}
                            onChange={(e) => setMaxGuestsInput(e.target.value)}
                            className="h-12 text-base"
                            dir="rtl"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">إذا تُرك فارغاً لن يظهر للضيوف</p>
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

                    {/* ── Terms & Conditions ── */}
                    <div className="space-y-2">
                      <Label htmlFor="termsAndConditions" className="text-base font-medium flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        الشروط والأحكام الخاصة
                        <span className="text-xs font-normal text-muted-foreground">(اختياري — تظهر للضيوف قبل الحجز)</span>
                      </Label>
                      <Textarea
                        id="termsAndConditions"
                        placeholder={TERMS_PLACEHOLDER}
                        value={form.termsAndConditions}
                        onChange={(e) => handleChange("termsAndConditions", e.target.value)}
                        className="min-h-[140px] text-sm resize-none leading-relaxed"
                        dir="rtl"
                      />
                      <p className="text-xs text-muted-foreground">
                        اكتب كل شرط في سطر مستقل. تظهر هذه الشروط في صفحة الشاليه وفي رسالة تأكيد الحجز.
                      </p>
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

                    {/* 7-Day Pricing Grid */}
                    <div className="space-y-3">
                      <Label className="text-base font-medium">جدول الأسعار اليومية</Label>
                      <p className="text-xs text-muted-foreground -mt-1">أدخل سعر كل فترة لكل يوم. اتركه فارغاً إذا كانت الفترة غير متاحة في ذلك اليوم.</p>

                      {/* 7-day pricing table */}
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 340 }}>
                          <thead>
                            <tr style={{ background: "#f8fafc" }}>
                              <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb", minWidth: 80 }}>اليوم</th>
                              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#92400e", borderBottom: "1px solid #e5e7eb" }}>🌅 صباحي</th>
                              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#3730a3", borderBottom: "1px solid #e5e7eb" }}>🌙 مسائي</th>
                              <th style={{ padding: "10px 8px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#065f46", borderBottom: "1px solid #e5e7eb" }}>☀️ يوم كامل</th>
                            </tr>
                          </thead>
                          <tbody>
                            {([
                              { idx: 0, label: "الأحد", isWeekend: false },
                              { idx: 1, label: "الاثنين", isWeekend: false },
                              { idx: 2, label: "الثلاثاء", isWeekend: false },
                              { idx: 3, label: "الأربعاء", isWeekend: false },
                              { idx: 4, label: "الخميس", isWeekend: false },
                              { idx: 5, label: "الجمعة", isWeekend: true },
                              { idx: 6, label: "السبت", isWeekend: true },
                            ] as const).map(({ idx, label, isWeekend }) => (
                              <tr key={idx} style={{ background: isWeekend ? "#fefce8" : "#ffffff", borderTop: "1px solid #f3f4f6" }}>
                                <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, color: isWeekend ? "#92400e" : "#374151", whiteSpace: "nowrap" }}>
                                  {label}{isWeekend ? " 🎉" : ""}
                                </td>
                                {(["morning", "evening", "fullday"] as const).map(period => (
                                  <td key={period} style={{ padding: "6px 6px" }}>
                                    <div style={{ position: "relative" }}>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={dailyPriceGrid[idx][period]}
                                        onChange={e => setDayCell(idx, period, e.target.value)}
                                        placeholder="—"
                                        style={{
                                          width: "100%",
                                          minWidth: 70,
                                          padding: "6px 26px 6px 6px",
                                          borderRadius: 8,
                                          border: "1px solid",
                                          borderColor: dailyPriceGrid[idx][period] ? "#86efac" : "#e5e7eb",
                                          fontSize: 13,
                                          textAlign: "center",
                                          background: dailyPriceGrid[idx][period] ? "#f0fdf4" : "#f9fafb",
                                          outline: "none",
                                          direction: "ltr",
                                          transition: "border-color 0.15s, background 0.15s",
                                        }}
                                      />
                                      {dailyPriceGrid[idx][period] && (
                                        <span style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#9ca3af", pointerEvents: "none" }}>ر.س</span>
                                      )}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground">💡 اتركه فارغاً إذا لم تكن الفترة متاحة في ذلك اليوم — الأسعار تُحسب تلقائياً</p>

                      {/* Check-in / Check-out per period (shown only when that period has at least one price) */}
                      {[0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].morning.trim()) && (
                        <div className="rounded-xl border p-3 space-y-2">
                          <p className="text-sm font-medium flex items-center gap-1.5">🌅 أوقات الفترة الصباحية</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الدخول</p>
                              <Input type="text" placeholder="مثال: ٢:٠٠ م" value={morningCheckIn} onChange={e => setMorningCheckIn(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <Input type="text" placeholder="مثال: ١٠:٠٠ ص" value={morningCheckOut} onChange={e => setMorningCheckOut(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                          </div>
                        </div>
                      )}
                      {[0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].evening.trim()) && (
                        <div className="rounded-xl border p-3 space-y-2">
                          <p className="text-sm font-medium flex items-center gap-1.5">🌙 أوقات الفترة المسائية</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الدخول</p>
                              <Input type="text" placeholder="مثال: ٤:٠٠ م" value={eveningCheckIn} onChange={e => setEveningCheckIn(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <Input type="text" placeholder="مثال: ١٢:٠٠ ص" value={eveningCheckOut} onChange={e => setEveningCheckOut(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                          </div>
                        </div>
                      )}
                      {[0,1,2,3,4,5,6].some(d => !!dailyPriceGrid[d].fullday.trim()) && (
                        <div className="rounded-xl border p-3 space-y-2">
                          <p className="text-sm font-medium flex items-center gap-1.5">☀️ أوقات اليوم الكامل</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الدخول</p>
                              <Input type="text" placeholder="مثال: ٢:٠٠ م" value={fullDayCheckIn} onChange={e => setFullDayCheckIn(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <Input type="text" placeholder="مثال: ١٢:٠٠ ص" value={fullDayCheckOut} onChange={e => setFullDayCheckOut(e.target.value)} className="h-9 text-xs" dir="rtl" />
                            </div>
                          </div>
                        </div>
                      )}

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
                  <div className="bg-destructive/10 text-destructive rounded-xl p-4 space-y-2">
                    <p className="font-semibold text-center">حدث خطأ أثناء إرسال البيانات</p>
                    {Object.keys(fieldErrors).length > 0 ? (
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {Object.entries(fieldErrors).map(([field, errors]) => {
                          const fieldLabels: Record<string, string> = {
                            nameAr: "اسم الشاليه",
                            location: "المدينة",
                            descriptionAr: "وصف الشاليه",
                            whatsappNumber: "رقم الواتساب",
                            mapsUrl: "رابط الخرائط",
                            socialLink: "رابط الحساب",
                            priceWeekday: "سعر وسط الأسبوع",
                            priceWeekend: "سعر نهاية الأسبوع",
                          };
                          return errors.map((msg, i) => (
                            <li key={`${field}-${i}`}>
                              <strong>{fieldLabels[field] ?? field}:</strong> {msg}
                            </li>
                          ));
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-center">يرجى التحقق من البيانات والمحاولة مرة أخرى</p>
                    )}
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
