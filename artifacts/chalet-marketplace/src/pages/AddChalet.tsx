import { useState, useRef, useCallback, useEffect } from "react";
import { fromAr, toAr, whatsappDigits } from "@/lib/utils";
import { useSearch, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { checkPropertyIdentity, checkPropertySocialAccount, useCreateSubmission } from "@workspace/api-client-react";
import PropertyTimePicker from "@/components/PropertyTimePicker";
import { toast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { AddonPaymentModal } from "@/components/AddonPaymentModal";
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
  AlertTriangle,
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
  ArrowRight,
  ArrowLeft,
  Lock,
  CreditCard,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function serverFieldErrors(body: { details?: Record<string, string[]>; fields?: string[]; error?: string } | undefined, fallback: string) {
  const errors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(body?.details ?? {})) {
    if (Array.isArray(messages) && messages.length) errors[field] = messages;
  }
  if (Object.keys(errors).length) return errors;
  const message = body?.error || fallback;
  const duplicateFields: Record<string, string[]> = {
    "رقم الواتساب": ["whatsappNumber"],
    "حساب التواصل": ["socialLink"],
    "رابط الإنستقرام": ["socialLink"],
    "الاسم والمدينة والحي": ["nameAr", "location", "district"],
  };
  for (const label of body?.fields ?? []) {
    for (const field of duplicateFields[label] ?? []) errors[field] = [message];
  }
  if (!Object.keys(errors).length && (message.includes("حساب التواصل") || message.includes("Instagram"))) errors.socialLink = [message];
  if (!Object.keys(errors).length && message.includes("رقم الواتساب")) errors.whatsappNumber = [message];
  return Object.keys(errors).length ? errors : { general: [message] };
}

interface RegionOption { id: number; name: string; }
interface CityOption { id: number; name: string; regionId: number | null; }
interface DistrictOption { id: number; name: string; cityId: number; }

function useCatalog(selectedRegionId: number | null, selectedCityId: number | null) {
  const { data: regions = [] } = useQuery<RegionOption[]>({
    queryKey: ["catalog", "regions"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/regions`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: cities = [] } = useQuery<CityOption[]>({
    queryKey: ["catalog", "cities", selectedRegionId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities?regionId=${selectedRegionId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: selectedRegionId != null,
    staleTime: 1000 * 60 * 5,
  });

  const { data: districts = [], isSuccess: districtsLoaded } = useQuery<DistrictOption[]>({
    queryKey: ["catalog", "districts", selectedCityId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/districts?cityId=${selectedCityId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: selectedCityId != null,
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

  const { data: propertyCategories = [] } = useQuery<{ id: number; nameAr: string; emoji: string }[]>({
    queryKey: ["catalog", "categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  return { regions, cities, districts, districtsLoaded, amenities, propertyCategories };
}

const MAX_PHOTOS = 15;
const MAX_VIDEO_SIZE_MB = 15;

interface UploadedPhoto {
  url: string;
  name: string;
  preview: string;
  caption?: string;
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
  const qc = useQueryClient();
  const [showAddonPayment, setShowAddonPayment] = useState(false);
  const promptedForAddon = useRef(false);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const { regions, cities, districts, districtsLoaded, amenities, propertyCategories } = useCatalog(selectedRegionId, selectedCityId);
  const initializedDistrictFor = useRef<number | null>(null);
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
  const [citySelectVal, setCitySelectVal] = useState("");
  const [customCity, setCustomCity] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<UploadedVideo | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const TERMS_PLACEHOLDER = "يمنع التدخين داخل الشاليه\nوقت تسجيل الخروج الساعة ١٠:٠٠ صباحاً\nيمنع إحضار الحيوانات الأليفة\nالضيوف المسموح بهم فقط كما هو محدد عند الحجز\nأي أضرار تلحق بالمكان تُحسب على الضيف";

  const [form, setForm] = useState({
    nameAr: "",
    whatsappNumber: "",
    location: "",
    mapsUrl: "",
    socialLink: "",
    descriptionAr: "",
    termsAndConditions: "",
  });
  const [propertyType, setPropertyType] = useState("");
  const [suggestedCategoryName, setSuggestedCategoryName] = useState("");
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
    setDailyPriceGrid(prev => ({ ...prev, [day]: { ...prev[day], [period]: fromAr(val).replace(/[^\d.]/g, "") } }));

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
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  /* ── Multi-step wizard (new submission only; edit mode shows all) ── */
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;
  const [checkingIdentity, setCheckingIdentity] = useState(false);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const validationRequest = useRef<AbortController | null>(null);

  const reportErrors = (errors: Record<string, string[]>, revealStep = false) => {
    setFieldErrors(errors);
    const messages = Object.values(errors).flat().filter(Boolean);
    if (!messages.length) return;
    if (revealStep && !isEditMode) {
      const basicFields = ["nameAr", "region", "location", "district", "whatsappNumber", "propertyType", "sections", "descriptionAr", "termsAndConditions"];
      if (basicFields.some(field => errors[field])) setStep(1);
      else if (errors.socialLink || errors.mapsUrl) setStep(2);
      else if (errors.photos) setStep(3);
    }
    toast({ variant: "destructive", placement: "bottom-center", title: "يرجى تصحيح البيانات",
      description: messages.join(" — "), duration: 7000 });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const fieldError = (field: string) => fieldErrors[field]?.length ? (
    <p id={`${field}-error`} className="text-xs text-destructive">{fieldErrors[field].join(" — ")}</p>
  ) : null;

  useEffect(() => {
    const errors: Record<string, string[]> = {};
    if (uploadError) errors.photos = [uploadError];
    if (videoError) errors.videoUrl = [videoError];
    if (logoError) errors.logoUrl = [logoError];
    if (Object.keys(errors).length) reportErrors(errors);
  // Only announce new upload failures, not subsequent form edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadError, videoError, logoError]);

  useEffect(() => {
    setIdentityWarning(null);
    return () => {
      validationRequest.current?.abort();
    };
  }, [form.nameAr, form.whatsappNumber, form.location, citySelectVal, customCity, selectedDistrict, customDistrict, form.termsAndConditions]);
  useEffect(() => () => { validationRequest.current?.abort(); }, [form.socialLink, form.mapsUrl]);

  const validatePhotos = (): Record<string, string[]> => {
    if (isUploading || isUploadingVideo || isUploadingLogo || photos.some(p => !p.url)) {
      return { photos: ["انتظر اكتمال رفع الملفات قبل المتابعة."] };
    }
    if (!photos[0]?.url || photos[0].url === "error") {
      return { photos: ["ارفع صورة رئيسية واحدة على الأقل بنجاح قبل المتابعة."] };
    }
    return {};
  };

  const validateStep1 = (): Record<string, string[]> => {
    const errs: Record<string, string[]> = {};
    if (form.nameAr.trim().length < 2) errs.nameAr = ["اسم العقار مطلوب (حرفان على الأقل)"];
    if (!selectedRegionId) errs.region = ["المنطقة مطلوبة"];
    if (!(citySelectVal === "__other__" ? customCity.trim() : form.location)) errs.location = ["المدينة مطلوبة"];
    if (!propertyType) errs.propertyType = ["نوع العقار مطلوب"];
    if (!sections) errs.sections = ["عدد الأقسام مطلوب"];
    if (!(selectedDistrict === "__other__" ? customDistrict.trim() : selectedDistrict)) errs.district = ["الحي أو المنطقة مطلوب"];
    if (!/^(?:05\d{8}|5\d{8}|(?:\+?966|00966)5\d{8})$/.test(fromAr(form.whatsappNumber).replace(/[\s()-]/g, ""))) errs.whatsappNumber = ["أدخل رقم واتساب سعودي صحيح، مثل ٠٥XXXXXXXX."];
    if (!form.termsAndConditions.trim()) errs.termsAndConditions = ["الشروط والأحكام الخاصة مطلوبة"];
    if (propertyType === "__other__" && !suggestedCategoryName.trim()) errs.propertyType = ["يرجى كتابة اسم الفئة المقترحة"];
    return errs;
  };

  const validateStep2 = (): Record<string, string[]> => {
    const errs: Record<string, string[]> = {};
    if (!form.socialLink.trim()) errs.socialLink = ["أدخل رابط حساب Instagram / Snapchat أو معرف الحساب."];
    if (!form.mapsUrl.trim()) errs.mapsUrl = ["رابط الموقع على الخريطة مطلوب."];
    return errs;
  };

  const goNext = async () => {
    if (checkingIdentity || validationRequest.current) return;
    if (step === 1) {
      const errs = validateStep1();
      if (Object.keys(errs).length > 0) {
        reportErrors(errs);
        return;
      }
      const controller = new AbortController();
      validationRequest.current = controller;
      setCheckingIdentity(true);
      setFieldErrors({});
      setIdentityWarning(null);
      try {
        const result = await checkPropertyIdentity({
          nameAr: form.nameAr.trim(),
          location: citySelectVal === "__other__" ? customCity.trim() : form.location,
          district: selectedDistrict === "__other__" ? customDistrict.trim() : selectedDistrict,
          whatsappNumber: form.whatsappNumber,
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!result.available) {
          reportErrors(result.fieldErrors);
          return;
        }
        setIdentityWarning(result.warning);
      } catch {
        if (!controller.signal.aborted) {
          reportErrors({ general: ["تعذّر التحقق من تكرار البيانات. حاول مرة أخرى قبل المتابعة."] });
        }
        return;
      } finally {
        validationRequest.current = null;
        setCheckingIdentity(false);
      }
    }
    if (step === 2) {
      const errs = validateStep2();
      if (Object.keys(errs).length) {
        reportErrors(errs);
        return;
      }
      const controller = new AbortController();
      validationRequest.current = controller;
      setCheckingIdentity(true);
      setFieldErrors({});
      try {
        const result = await checkPropertySocialAccount({ socialLink: form.socialLink.trim() }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!result.available) {
          reportErrors(result.fieldErrors);
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const apiError = error as { data?: { error?: string } };
          reportErrors({ socialLink: [apiError.data?.error || "تعذّر التحقق من حساب التواصل. حاول مرة أخرى قبل المتابعة."] });
        }
        return;
      } finally {
        validationRequest.current = null;
        setCheckingIdentity(false);
      }
    }
    if (step === 3) {
      const errs = validatePhotos();
      if (Object.keys(errs).length) {
        reportErrors(errs);
        return;
      }
    }
    setFieldErrors({});
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setFieldErrors({});
    setStep(s => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Edit mode ── */
  const search = useSearch();
  const [, navigate] = useLocation();
  const editIdParam = new URLSearchParams(search).get("editId");
  const editId = editIdParam ? Number(editIdParam) : null;
  const isEditMode = !!editId;

  const { data: planLimits, refetch: refetchPlanLimits } = useQuery<{
    active: boolean;
    scope: "full" | "property";
    chaletLimit: number;
    chaletCount: number;
    serviceLimit: number;
    serviceCount: number;
    extraChaletPrice?: number | string | null;
  } | null>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/owner/plan-limits`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 1000 * 60,
    enabled: !isEditMode,
  });

  useEffect(() => {
    if (isEditMode || promptedForAddon.current || !planLimits?.active ||
        planLimits.chaletCount < planLimits.chaletLimit || planLimits.extraChaletPrice == null) return;
    promptedForAddon.current = true;
    setShowAddonPayment(true);
  }, [isEditMode, planLimits]);

  const { data: editSub } = useQuery({
    queryKey: ["owner", "submission", editId],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/owner/submissions/${editId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!editId,
  });
  const isResubmission = editSub?.status === "needs_revision";

  /* ── Pre-fill form when edit data arrives ── */
  useEffect(() => {
    if (!editSub) return;
    setForm({
      nameAr: editSub.nameAr ?? "",
      whatsappNumber: whatsappDigits(editSub.whatsappNumber ?? ""),
      location: editSub.location ?? "",
      mapsUrl: editSub.mapsUrl ?? editSub.websiteUrl ?? "",
      socialLink: editSub.socialLink ?? "",
      descriptionAr: editSub.descriptionAr ?? "",
      termsAndConditions: editSub.termsAndConditions ?? "",
    });
    if (editSub.propertyType) setPropertyType(editSub.propertyType);
    else if (editSub.suggestedCategoryName) {
      setPropertyType("__other__");
      setSuggestedCategoryName(editSub.suggestedCategoryName);
    }
    if (editSub.sections) setSections(editSub.sections);
    setHasBedrooms(editSub.bedrooms != null);
    setBedroomCount(editSub.bedrooms != null ? String(editSub.bedrooms) : "");
    setMaxGuestsInput(editSub.maxGuests != null ? String(editSub.maxGuests) : "");
    setMorningCheckIn(editSub.morningCheckIn ?? "");
    setMorningCheckOut(editSub.morningCheckOut ?? "");
    setEveningCheckIn(editSub.eveningCheckIn ?? "");
    setEveningCheckOut(editSub.eveningCheckOut ?? "");
    setFullDayCheckIn(editSub.fullDayCheckIn ?? "");
    setFullDayCheckOut(editSub.fullDayCheckOut ?? "");
    setSeasonalDisclaimer(editSub.seasonalDisclaimer ?? true);
    if (editSub.logoUrl) {
      setLogoUrl(editSub.logoUrl);
      setLogoPreview(editSub.logoUrl.startsWith("http") ? editSub.logoUrl : `${BASE}${editSub.logoUrl}`);
    }
    setLegalAccepted(true);
    /* Photos */
    if (Array.isArray(editSub.photos) && editSub.photos.length > 0) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      setPhotos(editSub.photos.map((url: string, i: number) => ({ url, name: url.split("/").pop() ?? "photo", preview: url.startsWith("http") ? url : `${base}${url}`, caption: editSub.photoCaptions?.[i] ?? "" })));
    }
    /* Video */
    if (editSub.videoUrl) {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      setVideo({ url: editSub.videoUrl, name: "video", preview: editSub.videoUrl.startsWith("http") ? editSub.videoUrl : `${base}${editSub.videoUrl}` });
    }
    /* Amenities */
    if (Array.isArray(editSub.amenities)) {
      const knownKeys = new Set<string>();
      const customTags: string[] = [];
      (editSub.amenities as string[]).forEach((a: string) => {
        if (a.startsWith("other:")) {
          customTags.push(a.slice(6));
        } else {
          knownKeys.add(a);
        }
      });
      setSelectedAmenities(knownKeys);
      setCustomAmenityTags(customTags);
    }
    /* Daily price grid */
    if (editSub.dailyPrices && typeof editSub.dailyPrices === "object") {
      const dp = editSub.dailyPrices as Record<string, Record<string, number>>;
      const grid = initGrid();
      (["morning","evening","fullday"] as const).forEach(p => {
        const periods = dp[p];
        if (!periods) return;
        [0,1,2,3,4,5,6].forEach(d => {
          const v = periods[String(d)];
          if (v != null) grid[d][p] = String(v);
        });
      });
      setDailyPriceGrid(grid);
    } else {
      const grid = initGrid();
      [0,1,2,3,4,5,6].forEach(d => {
        grid[d].morning = editSub.slotMorning !== false && editSub.priceMorning != null ? String(editSub.priceMorning) : "";
        grid[d].evening = editSub.slotEvening !== false && editSub.priceEvening != null ? String(editSub.priceEvening) : "";
        grid[d].fullday = editSub.slotFullDay !== false && (editSub.priceFullDay ?? editSub.pricePerNight) != null
          ? String(editSub.priceFullDay ?? editSub.pricePerNight) : "";
      });
      setDailyPriceGrid(grid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSub]);

  useEffect(() => {
    if (!editSub?.location || cities.length === 0) return;
    const city = cities.find((item) => item.name === editSub.location);
    if (!city) return;
    setCitySelectVal(city.name);
    setSelectedCityId(city.id);
  }, [editSub, cities]);

  useEffect(() => {
    if (!editSub?.district || !editId || initializedDistrictFor.current === editId ||
        !districtsLoaded || !selectedCityId ||
        cities.find(city => city.id === selectedCityId)?.name !== editSub.location) return;
    // Dependent options must exist before initializing Radix's native select.
    // Seed only once so catalog refreshes never overwrite the owner's edits.
    initializedDistrictFor.current = editId;
    const knownDistrict = districts.some(district => district.name === editSub.district);
    setSelectedDistrict(knownDistrict ? editSub.district : "__other__");
    setCustomDistrict(knownDistrict ? "" : editSub.district);
  }, [editSub, editId, districtsLoaded, selectedCityId, cities, districts]);

  useEffect(() => {
    if (!editSub?.region || regions.length === 0 || selectedRegionId) return;
    const region = regions.find((item) => item.name === editSub.region);
    if (region) setSelectedRegionId(region.id);
  }, [editSub, regions, selectedRegionId]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: field === "whatsappNumber" ? whatsappDigits(value) : value }));
    setFieldErrors(previous => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
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

  const setMainPhoto = (idx: number) => {
    if (idx === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [selected] = next.splice(idx, 1);
      return [selected, ...next];
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

  const handleLogoInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("يرجى اختيار ملف صورة صالح"); return; }
    if (file.size > 2 * 1024 * 1024) { setLogoError("حجم الشعار يتجاوز 2MB"); return; }
    setLogoError(null);
    setIsUploadingLogo(true);
    const preview = URL.createObjectURL(file);
    setLogoPreview(preview);
    const url = await uploadFile(file);
    if (url) { setLogoUrl(url); }
    else { setLogoUrl(""); setLogoError("فشل رفع الشعار. يرجى المحاولة مرة أخرى."); }
    setIsUploadingLogo(false);
  };

  const removeLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoUrl("");
    setLogoPreview("");
    setLogoError(null);
  };

  const buildPayload = (locationOverride?: string, districtOverride?: string) => {
    const successfulPhotoObjs = photos.filter((p) => p.url && p.url !== "error");
    const successfulPhotos = successfulPhotoObjs.map((p) => p.url);
    const photoCaptions = successfulPhotoObjs.map((p) => p.caption ?? "");
    const successfulVideo = video && video.url && video.url !== "error" ? video.url : undefined;
    const finalDistrict = districtOverride ?? (selectedDistrict === "__other__"
      ? customDistrict.trim() || undefined
      : selectedDistrict || undefined);
    const amenitiesList = Array.from(selectedAmenities).filter(k => k !== "__other__");
    for (const tag of customAmenityTags) {
      if (tag.trim()) amenitiesList.push(`other:${tag.trim()}`);
    }
    return {
      nameAr: form.nameAr,
      whatsappNumber: whatsappDigits(form.whatsappNumber),
      region: regions.find((region) => region.id === selectedRegionId)?.name ?? "",
      location: locationOverride ?? form.location,
      suggestedCityName: citySelectVal === "__other__" ? customCity.trim() : undefined,
      district: finalDistrict ?? "",
      propertyType: propertyType || undefined,
      suggestedCategoryName: propertyType === "__other__" ? (suggestedCategoryName.trim() || undefined) : undefined,
      sections: sections || undefined,
      mapsUrl: form.mapsUrl || undefined,
      socialLink: form.socialLink,
      descriptionAr: form.descriptionAr,
      termsAndConditions: form.termsAndConditions.trim(),
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
      photoCaptions,
      videoUrl: successfulVideo,
      logoUrl: logoUrl || undefined,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    mutation.reset();
    const requiredErrors = { ...validateStep1(), ...validateStep2(), ...validatePhotos() };
    if (Object.keys(requiredErrors).length) {
      reportErrors(requiredErrors);
      if (!isEditMode) setStep(Object.keys(validateStep1()).length ? 1 : Object.keys(validateStep2()).length ? 2 : 3);
      return;
    }
    if (!isEditMode && !planLimits) {
      reportErrors({ general: ["تعذّر التحقق من حالة الاشتراك. أعد تحميل الصفحة وحاول مجدداً."] });
      return;
    }
    if (!isEditMode && planLimits && (
      planLimits.active === false || planLimits.chaletCount >= planLimits.chaletLimit
    )) {
      if (planLimits.active === false) navigate("/subscription");
      else setShowAddonPayment(true);
      return;
    }

    const resolvedLocation = citySelectVal === "__other__" ? customCity.trim() : form.location;
    const resolvedCityId = selectedCityId;

    /* ── Resolve custom district (if "other" selected) ── */
    let resolvedDistrict: string | undefined;
    if (selectedDistrict === "__other__") {
      const trimmedDistrict = customDistrict.trim();
      if (!trimmedDistrict) {
        reportErrors({ district: ["يجب إدخال اسم الحي أو المنطقة"] });
        return;
      }
      if (resolvedCityId) {
        try {
          const r = await fetch(`${BASE}/api/districts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name: trimmedDistrict, cityId: resolvedCityId }),
          });
          const dist = await r.json();
          resolvedDistrict = dist.name ?? trimmedDistrict;
        } catch {
          resolvedDistrict = trimmedDistrict;
        }
      } else {
        resolvedDistrict = trimmedDistrict;
      }
    } else {
      resolvedDistrict = selectedDistrict || undefined;
    }

    /* ── Validate category suggestion when "other" is selected ── */
    if (propertyType === "__other__" && !suggestedCategoryName.trim()) {
      reportErrors({ propertyType: ["يرجى كتابة اسم الفئة المقترحة"] });
      return;
    }


    /* ── District is required ── */
    if (!resolvedDistrict) {
      reportErrors({ district: ["الحي أو المنطقة مطلوب"] });
      return;
    }

    if (isEditMode && editId) {
      setEditSaving(true);
      try {
        const payload = buildPayload(resolvedLocation, resolvedDistrict);
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const r = await fetch(`${base}/api/owner/submissions/${editId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const errBody = await r.json().catch(() => ({}));
          const msg = errBody?.error ?? "حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى";
          reportErrors(serverFieldErrors(errBody, msg), true);
          return;
        }
        qc.invalidateQueries({ queryKey: ["/api/submissions"] });
        qc.invalidateQueries({ queryKey: ["submissions"] });
        qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
        qc.invalidateQueries({ queryKey: ["owner", "submission", editId], refetchType: "none" });
        setEditSaved(true);
        setTimeout(() => navigate(isResubmission ? "/dashboard?mode=chalets" : `/my-chalet/${editId}`), 1200);
      } catch {
        reportErrors({ general: ["حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى"] });
      } finally {
        setEditSaving(false);
      }
      return;
    }

    mutation.mutate(
      { data: buildPayload(resolvedLocation, resolvedDistrict) as any },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
          qc.invalidateQueries({ queryKey: ["/api/submissions"] });
          setSubmitted(true);
        },
        onError: async (err: unknown) => {
          try {
            const apiErr = err as { data?: { details?: Record<string, string[]>; fields?: string[]; error?: string; upgradeRequired?: boolean } };
            reportErrors(serverFieldErrors(apiErr.data, "حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى"), true);
            if (apiErr?.data?.upgradeRequired) {
              const refreshed = await refetchPlanLimits();
              const currentLimits = refreshed.data ?? planLimits;
              if (currentLimits?.active === false) navigate("/subscription");
              else setShowAddonPayment(true);
            }
          } catch {
            reportErrors({ general: ["حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى"] });
          }
        },
      }
    );
  };

  const resetForm = () => {
    setSubmitted(false);
    setForm({ nameAr: "", whatsappNumber: "", location: "", mapsUrl: "", socialLink: "", descriptionAr: "", termsAndConditions: "" });
    setPropertyType("");
    setSections("");
    setPhotos([]);
    setSelectedAmenities(new Set());
    setCustomAmenityTags([]);
    setCustomAmenityInput("");
    setSelectedRegionId(null);
    setCitySelectVal("");
    setCustomCity("");
    setSelectedCityId(null);
    setSelectedDistrict("");
    setCustomDistrict("");
    setLegalAccepted(false);
    setVideo(null);
    setVideoError(null);
    removeLogo();
    setHasBedrooms(false);
    setBedroomCount("");
    setMaxGuestsInput("");
    setMorningCheckIn(""); setMorningCheckOut("");
    setEveningCheckIn(""); setEveningCheckOut("");
    setFullDayCheckIn(""); setFullDayCheckOut("");
  };

  const canAddMore = photos.length < MAX_PHOTOS && !isUploading;
  const allUploaded = photos.every((p) => p.url !== "") && !isUploadingVideo && !isUploadingLogo && (video ? video.url !== "" : true);

  const planBlocksNewChalet = !isEditMode && !!planLimits
    && (planLimits.active === false || planLimits.chaletCount >= planLimits.chaletLimit);
  if (isEditMode && editSub?.status === "rejected") {
    return (
      <div dir="rtl" className="max-w-lg mx-auto py-16 px-5 text-center space-y-5">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">الطلب مغلق نهائياً</h1>
        <p className="text-muted-foreground">هذا العقار مرفوض ولا يمكن تعديله أو إعادة إرساله. لا يُحتسب ضمن حد الباقة ويمكنك إضافة عقار جديد.</p>
        {editSub.adminNote && <p className="text-destructive">سبب الرفض: {editSub.adminNote}</p>}
        <Button onClick={() => navigate("/dashboard?mode=chalets")}>الذهاب إلى لوحة التحكم</Button>
      </div>
    );
  }
  if (planBlocksNewChalet && !submitted) {
    const subscriptionExpired = planLimits?.active === false;
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <main className="container mx-auto max-w-2xl px-4 py-16">
          <div role="alert" className="rounded-3xl border border-red-300 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/30">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200">
              <Lock className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {subscriptionExpired ? "انتهت صلاحية اشتراكك" : "وصلت إلى حد العقارات في باقتك"}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              {subscriptionExpired
                ? "لا يمكن بدء إضافة عقار جديد قبل تجديد الاشتراك. بيانات عقاراتك الحالية ما زالت محفوظة."
                : "يمكنك توسيع اشتراكك الحالي بشراء سعة لعقار إضافي، أو الاطلاع على الباقات إذا رغبت في ترقية خطتك."}
            </p>
            {!subscriptionExpired ? (
              <div className="mt-6 flex flex-col items-center gap-3">
                {planLimits?.extraChaletPrice != null && (
                  <p className="text-sm text-muted-foreground">
                    سعر إضافة عقار واحد: {toAr(Number(planLimits.extraChaletPrice))} ر.س — دفعة واحدة
                  </p>
                )}
                <Button onClick={() => setShowAddonPayment(true)} className="gap-2">
                  <CreditCard className="h-4 w-4" />
                  شراء عقار إضافي
                </Button>
                <Button variant="outline" onClick={() => navigate("/subscription")}>
                  عرض الباقات
                </Button>
              </div>
            ) : (
              <Button className="mt-6" onClick={() => navigate("/subscription")}>
                <CreditCard className="me-2 h-4 w-4" />
                {subscriptionExpired ? "الانتقال إلى تجديد الاشتراك" : "عرض الباقات"}
              </Button>
            )}
          </div>
        </main>
        <AddonPaymentModal
          open={showAddonPayment}
          onClose={() => setShowAddonPayment(false)}
          addonType="chalet"
          selectableType
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <AnimatePresence mode="wait">
        {(submitted || editSaved) ? (
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
            {isEditMode ? (
              <>
                <h1 className="text-3xl font-bold text-foreground mb-4">{isResubmission ? "تم إعادة إرسال الطلب بنجاح!" : "تم الحفظ بنجاح!"}</h1>
                <p className="text-xl text-muted-foreground max-w-md leading-relaxed">
                  {isResubmission ? "تم إرسال بيانات العقار المعدّلة إلى الإدارة للمراجعة" : "تم تحديث بيانات الشاليه بنجاح"}
                </p>
                <p className="text-sm text-muted-foreground mt-4">{isResubmission ? "جاري العودة إلى لوحة التحكم..." : "جاري العودة لصفحة الشاليه..."}</p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-foreground mb-4">تم الاستلام بنجاح!</h1>
                <p className="text-xl text-muted-foreground max-w-md leading-relaxed">
                  تم استلام بياناتك بنجاح، سيتم مراجعة الشاليه ونشره قريباً
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  سيتم التواصل معك عبر واتساب بعد المراجعة
                </p>
                {planLimits && planLimits.chaletCount >= planLimits.chaletLimit ? (
                  <div className="mt-8 text-center space-y-3">
                    <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl px-5 py-3 text-sm text-orange-700 dark:text-orange-300">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>وصلت إلى الحد الأقصى لعدد الشاليهات في خطتك الحالية</span>
                    </div>
                    {planLimits.extraChaletPrice != null && (
                      <p className="text-xs text-muted-foreground">
                        رسوم الإضافة {toAr(Number(planLimits.extraChaletPrice))} ر.س لمرة واحدة؛ تُضاف إلى اشتراكك الحالي بعد تأكيد الدفع.
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <Button variant="outline" onClick={() => navigate("/subscription")}>عرض الباقات والتجديد</Button>
                      <Button variant="outline" onClick={() => navigate("/dashboard?mode=chalets")}>الذهاب إلى لوحة التحكم</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button onClick={resetForm}>
                      إضافة شاليه آخر
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/dashboard?mode=chalets")}>الذهاب إلى لوحة التحكم</Button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="container mx-auto px-4 py-12 max-w-3xl"
          >
            {isEditMode ? (
              <div className="flex items-center gap-3 mb-8 p-4 rounded-2xl bg-primary/5 border border-primary/15">
                <button
                  type="button"
                  onClick={() => navigate(`/my-chalet/${editId}`)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors text-primary shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <div>
                  <p className="font-bold text-base text-foreground">{isResubmission ? "تعديل وإعادة الإرسال" : "العودة لتفاصيل الشاليه (إلغاء)"}</p>
                  <p className="text-xs text-muted-foreground">{isResubmission ? "عدّل البيانات حسب ملاحظات الإدارة، ثم أعد إرسال الطلب للمراجعة من الزر أسفل الصفحة" : "التعديلات لن تُحفظ إلا بعد الضغط على زر الحفظ أسفل الصفحة"}</p>
                  {isResubmission && editSub.adminNote && <p className="text-sm text-destructive mt-2">سبب الإرجاع للتعديل: {editSub.adminNote}</p>}
                </div>
              </div>
            ) : (
              <div className="text-center mb-10">
                <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
                  <Building2 className="w-9 h-9 text-primary-foreground" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  انضم إلينا كمالك
                </h1>
                <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
                  أضف عقارك وابدأ في استقبال الحجوزات بسهولة
                </p>
              </div>
            )}

            <div className="bg-card border border-border rounded-3xl p-6 md:p-10 shadow-sm">
              <form onSubmit={handleSubmit} onInvalidCapture={event => {
                event.preventDefault();
                const input = event.target as HTMLInputElement;
                reportErrors({ ...validateStep1(), ...validateStep2(),
                  [input.id || "general"]: [input.id === "mapsUrl" ? "أدخل رابط موقع صحيحاً." : "يرجى إكمال هذا الحقل والتحقق من صحة البيانات."] }, true);
              }} className="space-y-8">

                {/* ── Step Progress Bar (new submission only) ── */}
                {!isEditMode && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-3">
                      {[
                        { n: 1, label: "المعلومات الأساسية" },
                        { n: 2, label: "المرافق والأسعار" },
                        { n: 3, label: "الصور والوسائط" },
                        { n: 4, label: "المراجعة والإرسال" },
                      ].map(({ n, label }) => {
                        const done = step > n;
                        const active = step === n;
                        return (
                          <div key={n} className="flex flex-col items-center gap-1.5 flex-1">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"}`}>
                              {done ? "✓" : n}
                            </div>
                            <span className={`text-[10px] text-center leading-tight hidden sm:block ${active ? "text-primary font-semibold" : done ? "text-primary/70" : "text-muted-foreground"}`}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${((step - 1) / 3) * 100}%` }} />
                    </div>
                  </div>
                )}

                {Object.keys(fieldErrors).length > 0 && (
                  <div role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
                    <ul className="list-inside list-disc space-y-1">
                      {Object.entries(fieldErrors).flatMap(([field, errors]) => errors.map((message, index) =>
                        <li key={`${field}-${index}`}>{message}</li>))}
                    </ul>
                  </div>
                )}
                {identityWarning && (
                  <div role="status" className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p>{identityWarning}</p>
                  </div>
                )}

                {/* Section: Basic Info — Step 1 */}
                {(step === 1 || isEditMode) && <>

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
                        aria-invalid={!!fieldErrors.nameAr}
                        aria-describedby={fieldErrors.nameAr ? "nameAr-error" : undefined}
                        className={`h-12 text-base ${fieldErrors.nameAr ? "border-destructive ring-1 ring-destructive" : ""}`}
                      />
                      {fieldError("nameAr")}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber" className="text-base font-medium">
                        رقم الواتساب <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Phone className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input id="whatsappNumber" type="text" inputMode="numeric" pattern="[0-9٠-٩]*" data-no-arabic
                          placeholder="٠٥XXXXXXXX" value={toAr(form.whatsappNumber)}
                          onChange={(e) => handleChange("whatsappNumber", fromAr(e.target.value))}
                          required aria-invalid={!!fieldErrors.whatsappNumber}
                          aria-describedby={fieldErrors.whatsappNumber ? "whatsappNumber-error" : undefined}
                          className={`h-12 text-base pr-10 ${fieldErrors.whatsappNumber ? "border-destructive" : ""}`} />
                      </div>
                      {fieldError("whatsappNumber")}
                      <p className="text-xs text-muted-foreground">يتم التحقق من الرقم وبيانات العقار عند الضغط على «التالي».</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-base font-medium">
                          المنطقة <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={selectedRegionId ? String(selectedRegionId) : ""}
                          onValueChange={(regionId) => {
                            setSelectedRegionId(Number(regionId));
                            setCitySelectVal("");
                            setSelectedCityId(null);
                            handleChange("location", "");
                            setSelectedDistrict("");
                            setCustomDistrict("");
                          }}
                        >
                          <SelectTrigger aria-invalid={!!fieldErrors.region} aria-describedby={fieldErrors.region ? "region-error" : undefined} className={`h-12 text-base ${fieldErrors.region ? "border-red-500 ring-1 ring-red-500" : ""}`}>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder="اختر المنطقة" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {regions.map((region) => (
                              <SelectItem key={region.id} value={String(region.id)}>{region.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {fieldError("region")}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location" className="text-base font-medium">
                          المدينة <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={citySelectVal}
                          onValueChange={(val) => {
                            setCitySelectVal(val);
                            setSelectedDistrict(val === "__other__" ? "__other__" : "");
                            setCustomDistrict("");
                            handleChange("location", val === "__other__" ? "" : val);
                            const city = cities.find((c) => c.name === val);
                            setSelectedCityId(city?.id ?? null);
                          }}
                          disabled={!selectedRegionId}
                          required
                        >
                          <SelectTrigger aria-invalid={!!fieldErrors.location} aria-describedby={fieldErrors.location ? "location-error" : undefined} className={`h-12 text-base ${fieldErrors.location ? "border-destructive ring-1 ring-destructive" : ""}`}>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder={selectedRegionId ? "اختر المدينة" : "اختر المنطقة أولاً"} />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {cities.map((city) => (
                              <SelectItem key={city.id} value={city.name}>
                                {city.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="__other__">أخرى - مدينة غير موجودة</SelectItem>
                          </SelectContent>
                        </Select>
                        {citySelectVal === "__other__" && (
                          <Input
                            value={customCity}
                            onChange={(event) => setCustomCity(event.target.value)}
                            placeholder="اكتب اسم المدينة"
                            aria-invalid={!!fieldErrors.location}
                            aria-describedby={fieldErrors.location ? "location-error" : undefined}
                            className={`h-12 text-base ${fieldErrors.location ? "border-destructive" : ""}`}
                          />
                        )}
                        {fieldError("location")}
                      </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="district" className="text-base font-medium">
                          الحي <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={selectedDistrict}
                          onValueChange={(val) => {
                            setSelectedDistrict(val);
                            if (val !== "__other__") setCustomDistrict("");
                          }}
                          disabled={!selectedCityId || citySelectVal === "__other__"}
                        >
                          <SelectTrigger id="district" aria-invalid={!!fieldErrors.district} aria-describedby={fieldErrors.district ? "district-error" : undefined} className={`h-12 text-base ${fieldErrors.district ? "border-destructive ring-1 ring-destructive" : ""}`}>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground" />
                              <SelectValue placeholder={!selectedCityId ? "اختر المدينة أولاً" : districts.length > 0 ? "اختر الحي" : "لا توجد أحياء مسجلة"} />
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
                            placeholder="اكتب اسم الحي"
                            value={customDistrict}
                            onChange={(e) => setCustomDistrict(e.target.value)}
                            className={`h-12 text-base ${fieldErrors.district ? "border-red-500 ring-1 ring-red-500" : ""}`}
                          />
                        )}
                        {fieldError("district")}
                      </div>

                    {/* Property Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-base font-medium">
                          نوع العقار <span className="text-destructive">*</span>
                        </Label>
                        <Select value={propertyType} onValueChange={(v) => { setPropertyType(v); if (v !== "__other__") setSuggestedCategoryName(""); }} required>
                          <SelectTrigger aria-invalid={!!fieldErrors.propertyType} aria-describedby={fieldErrors.propertyType ? "propertyType-error" : undefined} className={`h-12 text-base ${fieldErrors.propertyType ? "border-destructive ring-1 ring-destructive" : ""}`}>
                            <SelectValue placeholder="اختر نوع العقار" />
                          </SelectTrigger>
                          <SelectContent>
                            {propertyCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.nameAr}>{cat.emoji || "🏠"} {cat.nameAr}</SelectItem>
                              ))}
                            <SelectItem value="__other__">➕ فئة غير موجودة (اقتراح للإدارة)</SelectItem>
                          </SelectContent>
                        </Select>
                        {propertyType === "__other__" && (
                          <div className="mt-2 space-y-1">
                            <Label className="text-sm text-muted-foreground">اسم الفئة المقترحة <span className="text-destructive">*</span></Label>
                            <input
                              value={suggestedCategoryName}
                              onChange={(e) => setSuggestedCategoryName(e.target.value)}
                              placeholder="مثال: شاليه مائي، بيت شعر..."
                              aria-invalid={!!fieldErrors.propertyType}
                              aria-describedby={fieldErrors.propertyType ? "propertyType-error" : undefined}
                              className={`w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring ${fieldErrors.propertyType ? "border-destructive" : "border-input"}`}
                            />
                            <p className="text-xs text-muted-foreground">سيتحقق الفريق من اقتراحك ويضيف الفئة إذا كانت مناسبة.</p>
                          </div>
                        )}
                        {fieldError("propertyType")}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-base font-medium">
                          عدد الأقسام <span className="text-destructive">*</span>
                        </Label>
                        <Select value={sections} onValueChange={setSections} required>
                          <SelectTrigger aria-invalid={!!fieldErrors.sections} aria-describedby={fieldErrors.sections ? "sections-error" : undefined} className={`h-12 text-base ${fieldErrors.sections ? "border-destructive ring-1 ring-destructive" : ""}`}>
                            <SelectValue placeholder="اختر عدد الأقسام" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="قسم واحد">🔑 قسم واحد</SelectItem>
                            <SelectItem value="قسمين منفصلة">🔑🔑 قسمين منفصلة</SelectItem>
                          </SelectContent>
                        </Select>
                        {fieldError("sections")}
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
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={toAr(bedroomCount)}
                            onChange={(event) => setBedroomCount(fromAr(event.target.value).replace(/\D/g, ""))}
                            placeholder="مثال: ٣"
                            className="h-10 text-sm"
                            dir="rtl"
                          />
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
                            type="text"
                            inputMode="numeric"
                            placeholder="مثال: ٢٠"
                            value={toAr(maxGuestsInput)}
                            onChange={(e) => setMaxGuestsInput(fromAr(e.target.value))}
                            className="h-12 text-base"
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
                          aria-invalid={!!fieldErrors.descriptionAr}
                          aria-describedby={fieldErrors.descriptionAr ? "descriptionAr-error" : undefined}
                          className={`min-h-[120px] text-base pr-10 resize-none overflow-hidden ${fieldErrors.descriptionAr ? "border-destructive" : ""}`}
                          onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }}
                        />
                      </div>
                      {fieldError("descriptionAr")}
                    </div>

                    {/* ── Terms & Conditions ── */}
                    <div className="space-y-2">
                      <Label htmlFor="termsAndConditions" className="text-base font-medium flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        الشروط والأحكام الخاصة
                        <span className="text-destructive">*</span>
                        <span className="text-xs font-normal text-muted-foreground">(تظهر للضيوف قبل الحجز)</span>
                      </Label>
                      <Textarea
                        id="termsAndConditions"
                        placeholder={TERMS_PLACEHOLDER}
                        value={form.termsAndConditions}
                        required
                        aria-invalid={!!fieldErrors.termsAndConditions}
                        aria-describedby={fieldErrors.termsAndConditions ? "termsAndConditions-error" : undefined}
                        onChange={(e) => handleChange("termsAndConditions", e.target.value)}
                        className={`min-h-[140px] text-sm resize-none overflow-hidden leading-relaxed ${fieldErrors.termsAndConditions ? "border-destructive ring-1 ring-destructive" : ""}`}
                        dir="rtl"
                        onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }}
                      />
                      {fieldError("termsAndConditions")}
                      <p className="text-xs text-muted-foreground">
                        اكتب كل شرط في سطر مستقل. تظهر هذه الشروط في صفحة الشاليه وفي رسالة تأكيد الحجز.
                      </p>
                    </div>
                  </div>
                </div>

                </>}

                {/* Section: Amenities + Contact & Pricing — Step 2 */}
                {(step === 2 || isEditMode) && <>

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
                        <span className="text-base font-medium text-foreground leading-tight">
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
                      <span className="text-base font-medium text-foreground leading-tight">أخرى</span>
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
                                        value={toAr(dailyPriceGrid[idx][period] || "")}
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
                              <PropertyTimePicker label="وقت دخول الفترة الصباحية" value={morningCheckIn} onChange={setMorningCheckIn} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <PropertyTimePicker label="وقت خروج الفترة الصباحية" value={morningCheckOut} onChange={setMorningCheckOut} />
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
                              <PropertyTimePicker label="وقت دخول الفترة المسائية" value={eveningCheckIn} onChange={setEveningCheckIn} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <PropertyTimePicker label="وقت خروج الفترة المسائية" value={eveningCheckOut} onChange={setEveningCheckOut} />
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
                              <PropertyTimePicker label="وقت دخول اليوم الكامل" value={fullDayCheckIn} onChange={setFullDayCheckIn} />
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">وقت الخروج</p>
                              <PropertyTimePicker label="وقت خروج اليوم الكامل" value={fullDayCheckOut} onChange={setFullDayCheckOut} />
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
                        رابط أو معرف حساب الشاليه (Instagram / Snapchat){" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Instagram className="absolute top-3.5 right-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="socialLink"
                          type="text"
                          placeholder="https://www.instagram.com/your_chalet أو @your_chalet"
                          value={form.socialLink}
                          onChange={(e) => handleChange("socialLink", e.target.value)}
                          required
                          aria-invalid={!!fieldErrors.socialLink}
                          aria-describedby={fieldErrors.socialLink ? "socialLink-error" : undefined}
                          className={`h-12 text-base pr-10 ${fieldErrors.socialLink ? "border-destructive" : ""}`}
                          dir="ltr"
                        />
                      </div>
                      {fieldError("socialLink")}
                      <p className="text-xs text-muted-foreground">
                        يُستخدم للتحقق من هويتك وإظهار شارة "موثق ✅" على بطاقة الشاليه
                      </p>
                      <p className="text-xs text-muted-foreground">سيُفحص الحساب قبل الخطوة التالية. يمكنك إدخال الرابط أو @المعرف؛ ولتحديد المنصة استخدم instagram:المعرف أو snapchat:المعرف.</p>
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
                          aria-invalid={!!fieldErrors.mapsUrl}
                          aria-describedby={fieldErrors.mapsUrl ? "mapsUrl-error" : undefined}
                          className={`h-12 text-base pr-10 ${fieldErrors.mapsUrl ? "border-destructive ring-1 ring-destructive" : ""}`}
                          dir="ltr"
                        />
                      </div>
                      {fieldError("mapsUrl")}
                      <p className="text-xs text-muted-foreground">
                        افتح خرائط جوجل → اضغط على موقع الشاليه → شارك الرابط هنا
                      </p>
                      <p className="text-xs text-muted-foreground">يمكن مشاركة رابط الموقع نفسه بين عقارات المجمع أو الشاليهات المجاورة.</p>
                    </div>
                  </div>
                </div>

                </>}

                {/* Section: Photos & Video — Step 3 */}
                {(step === 3 || isEditMode) && <>

                {/* Section: Photos & Video */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-2 pb-3 border-b border-border flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" />
                    الصور والفيديو — الصورة الرئيسية <span className="text-destructive">*</span>
                  </h2>
                  <div className="flex flex-col gap-1 mb-5 bg-muted/40 rounded-xl p-3 text-sm text-muted-foreground">
                    <span>📷 <strong>الصور:</strong> بحد أقصى {MAX_PHOTOS} صورة (حتى 2MB للصورة) صيغة JPG/PNG — تُحفظ تلقائياً بصيغة WebP</span>
                    <span>🎥 <strong>الفيديو (اختياري):</strong> فيديو واحد (حتى {MAX_VIDEO_SIZE_MB}MB، مدة 30 ثانية) صيغة MP4 — يُضغط تلقائياً</span>
                    <span className="text-primary font-medium"><strong>الصورة الرئيسية مطلوبة:</strong> ارفع صورة واحدة على الأقل. أول صورة تُرفع ستكون الصورة الرئيسية — مرّر على أي صورة أخرى لتعيينها كرئيسية</span>
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
                            className="flex flex-col gap-1"
                          >
                            <div
                              className="relative aspect-square rounded-xl overflow-hidden border group"
                              style={{ borderColor: fieldErrors.photos ? "#dc2626" : idx === 0 ? "#16a34a" : undefined, borderWidth: idx === 0 || fieldErrors.photos ? 2 : 1 }}
                            >
                              <img
                                src={photo.preview}
                                alt={photo.name}
                                className="w-full h-full object-cover"
                              />
                              {/* Main image badge */}
                              {idx === 0 && (
                                <>
                                  <div className="absolute top-1 right-1 bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                                    <span style={{ fontSize: 11 }}>★</span>
                                  </div>
                                  <div className="absolute bottom-0 inset-x-0 bg-primary/80 text-white text-[10px] font-bold text-center py-0.5">
                                    الرئيسية
                                  </div>
                                </>
                              )}
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
                              {/* Set as main button (non-main photos only) */}
                              {idx > 0 && photo.url && photo.url !== "error" && (
                                <button
                                  type="button"
                                  onClick={() => setMainPhoto(idx)}
                                  className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] font-bold py-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/80 text-center"
                                >
                                  تعيين كرئيسية
                                </button>
                              )}
                              {/* Remove button */}
                              <button
                                type="button"
                                onClick={() => removePhoto(idx)}
                                className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="وصف الصورة (اختياري)"
                              value={photo.caption ?? ""}
                              onChange={(e) => setPhotos(prev => prev.map((p, i) => i === idx ? { ...p, caption: e.target.value } : p))}
                              className="w-full text-[10px] px-1.5 py-1 rounded border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary leading-tight"
                            />
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
                      aria-invalid={!!fieldErrors.photos}
                      aria-describedby={fieldErrors.photos ? "photos-error" : undefined}
                      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                        fieldErrors.photos
                          ? "border-destructive bg-destructive/5"
                          : isDragging
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

                  {fieldError("photos")}

                  {/* ── Video Upload ── */}
                  <div className={`mt-6 pt-5 border-t border-border ${fieldErrors.videoUrl ? "rounded-xl ring-2 ring-destructive p-3" : ""}`}>
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
                    {fieldError("videoUrl")}
                  </div>

                  {/* ── Logo Upload ── */}
                  <div className={`mt-6 pt-5 border-t border-border ${fieldErrors.logoUrl ? "rounded-xl ring-2 ring-destructive p-3" : ""}`}>
                    <p className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                      🏷️ شعار الشاليه (لوجو)
                      <span className="font-normal text-muted-foreground text-xs">(اختياري — يظهر في نتائج البحث والعقود)</span>
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">يُفضّل PNG بخلفية شفافة أو جودة عالية · حتى 2MB</p>

                    {logoPreview ? (
                      <div className="relative inline-flex items-center gap-3 bg-muted/40 rounded-xl border border-border px-4 py-3">
                        <div className="w-14 h-14 rounded-lg overflow-hidden border border-border bg-white flex items-center justify-center shrink-0 relative">
                          <img src={logoPreview} alt="شعار الشاليه" className="max-w-full max-h-full object-contain" />
                          {isUploadingLogo && (
                            <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          {logoUrl && !isUploadingLogo && (
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                              تم رفع الشعار بنجاح
                            </span>
                          )}
                          {isUploadingLogo && (
                            <span className="text-xs text-muted-foreground">جاري الرفع...</span>
                          )}
                          <button type="button" onClick={removeLogo} className="text-xs text-destructive hover:underline text-right">
                            حذف الشعار
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => logoInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all inline-flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">🏷️</div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">اختيار شعار الشاليه</p>
                          <p className="text-xs text-muted-foreground">PNG / JPG / WebP</p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoInput}
                    />
                    {fieldError("logoUrl")}
                  </div>
                </div>

                </>}

                {/* Legal + Review — Step 4 */}
                {(step === 4 || isEditMode) && <>

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

                {/* General / duplicate-link error (edit mode + new submission) */}
                {fieldErrors.general && (
                  <div className="bg-destructive/10 text-destructive rounded-xl p-4">
                    <p className="text-sm text-center font-medium">{fieldErrors.general[0]}</p>
                  </div>
                )}

                {/* Field-level errors (new submission mode only) */}
                {!fieldErrors.general && mutation.isError && (
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

                </>}

                {/* ── Navigation Footer ── */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-border">
                  {isEditMode ? (
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-12 text-base font-bold rounded-2xl shadow-lg shadow-primary/20"
                      disabled={editSaving || isUploading || isUploadingVideo || !allUploaded || !legalAccepted}
                    >
                      {editSaving ? (
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</span>
                      ) : isResubmission ? "تعديل وإعادة الإرسال" : "حفظ التعديلات"}
                    </Button>
                  ) : (
                    <>
                      {step > 1 ? (
                        <Button type="button" variant="outline" onClick={goBack} className="flex items-center gap-2 h-11 px-5">
                          <ArrowRight className="w-4 h-4" /> رجوع
                        </Button>
                      ) : <div />}

                      {step < TOTAL_STEPS ? (
                        <Button type="button" onClick={goNext} disabled={checkingIdentity} className="flex items-center gap-2 h-11 px-8">
                          {checkingIdentity ? <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحقق...</> : <>التالي <ArrowLeft className="w-4 h-4" /></>}
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          size="lg"
                          className="h-12 text-base font-bold rounded-2xl shadow-lg shadow-primary/20 flex-1"
                          disabled={mutation.isPending || isUploading || isUploadingVideo || !allUploaded || !legalAccepted || !propertyType || !sections || !form.mapsUrl}
                        >
                          {mutation.isPending ? (
                            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري الإرسال...</span>
                          ) : isUploading ? (
                            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> انتظر اكتمال رفع الصور...</span>
                          ) : "إرسال طلب التسجيل"}
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {step === TOTAL_STEPS && !isEditMode && (
                  <p className="text-center text-sm text-muted-foreground">
                    بالضغط على إرسال، أنت توافق على مراجعة بياناتك من قِبل فريقنا
                  </p>
                )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
