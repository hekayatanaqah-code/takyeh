import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetChaletById } from "@workspace/api-client-react";
import { MapPin, Users, Bed, CheckCircle2, Share2, ChevronRight, Info, Phone, ShieldCheck, Star, X, ChevronDown, CalendarDays, AlertCircle } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Period = "morning" | "evening" | "full_day";

const PERIOD_LABEL: Record<Period, string> = {
  morning: "🌅 صباحي",
  evening: "🌙 مسائي",
  full_day: "☀️ يوم كامل",
};

const PERIOD_LABEL_PLAIN: Record<Period, string> = {
  morning: "صباحي",
  evening: "مسائي",
  full_day: "يوم كامل",
};

const ARABIC_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function getArabicDay(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00"); // noon prevents timezone shifts
  return ARABIC_DAYS[d.getDay()] ?? "";
}

const TODAY = new Date().toISOString().split("T")[0];

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { data: chalet, isLoading, isError } = useGetChaletById(numericId);
  const [emblaRef] = useEmblaCarousel({ direction: "rtl", loop: true });

  const { data: amenityCatalog = [] } = useQuery<{ id: number; key: string; labelAr: string }[]>({
    queryKey: ["catalog", "amenities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const amenityLabelMap = useMemo(() =>
    Object.fromEntries(amenityCatalog.map(a => [a.key, a.labelAr])),
    [amenityCatalog]
  );

  /* Read initial period from URL ?period=morning|evening|full_day */
  const initPeriod = (() => {
    const p = new URLSearchParams(window.location.search).get("period");
    return (p === "morning" || p === "evening" || p === "full_day") ? p as Period : null;
  })();
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(initPeriod);
  const [selectedDate, setSelectedDate] = useState("");
  const [showDateError, setShowDateError] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showBookingConfirmModal, setShowBookingConfirmModal] = useState(false);
  const [showRedirectNotice, setShowRedirectNotice] = useState(false);

  /* ── Loading skeleton ─────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-8">
          <Skeleton className="w-48 h-5 mb-6" />
          <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
            <div className="w-full lg:w-[60%] space-y-3">
              <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
              </div>
            </div>
            <div className="w-full lg:w-[40%] space-y-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-48 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ──────────────────────────────────────── */
  if (isError || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-32 text-center">
          <h2 className="text-2xl font-bold text-destructive mb-4">حدث خطأ</h2>
          <p className="text-muted-foreground mb-8">لم نتمكن من العثور على الشاليه المطلوب.</p>
          <Link href="/chalets"><Button>العودة لقائمة الشاليهات</Button></Link>
        </div>
        <Footer />
      </div>
    );
  }

  const images =
    chalet.photos && chalet.photos.length > 0
      ? chalet.photos
      : [
          `${import.meta.env.BASE_URL}images/chalet-placeholder-1.png`,
          `${import.meta.env.BASE_URL}images/chalet-placeholder-2.png`,
          `${import.meta.env.BASE_URL}images/chalet-placeholder-3.png`,
        ];

  const district = (chalet as any).district as string | undefined;
  const isVerified = Boolean((chalet as any).isVerified);
  const propertyType = (chalet as any).propertyType as string | null | undefined;
  const sections = (chalet as any).sections as string | null | undefined;
  const priceWeekdayRaw = (chalet as any).priceWeekday as string | null | undefined;
  const priceWeekendRaw = (chalet as any).priceWeekend as string | null | undefined;
  const seasonalDisclaimer = Boolean((chalet as any).seasonalDisclaimer ?? true);
  const fmtPrice = (v: string | null | undefined) =>
    v && Number(v) > 0 ? Number(v).toLocaleString("ar-SA") : null;
  // Use pricePerNight as fallback when weekday/weekend aren't set
  const legacyFmt = chalet.pricePerNight > 0 ? chalet.pricePerNight.toLocaleString("ar-SA") : null;
  const weekdayFmt = fmtPrice(priceWeekdayRaw) ?? legacyFmt;
  const weekendFmt = fmtPrice(priceWeekendRaw);
  const hasDayPrices = true; // Always show the price box — use fallbacks as needed
  const locationLabel = district ? `حي ${district}، ${chalet.location}` : chalet.location;
  const periodLine = selectedPeriod ? ` — الفترة: ${PERIOD_LABEL[selectedPeriod]}` : "";

  /* Date/day helpers for WhatsApp message */
  const arabicDay = selectedDate ? getArabicDay(selectedDate) : "";
  const formattedDate = selectedDate ? selectedDate.replace(/-/g, "/") : "";
  const periodPlain = selectedPeriod ? PERIOD_LABEL_PLAIN[selectedPeriod] : "";

  const whatsappMsg = selectedDate
    ? `مرحباً، أود الاستفسار عن حجز ${chalet.nameAr} لـ ${arabicDay} الموافق ${formattedDate}${periodPlain ? ` - الفترة: ${periodPlain}` : ""}.`
    : `مرحباً، أود الاستفسار عن حجز ${chalet.nameAr} في ${chalet.location}${periodLine}.`;

  /* Available slots */
  const slots: Period[] = [
    ...(chalet.slotMorning !== false ? ["morning" as Period] : []),
    ...(chalet.slotEvening !== false ? ["evening" as Period] : []),
    ...(chalet.slotFullDay !== false ? ["full_day" as Period] : []),
  ];

  /**
   * Returns the best price string for a period button.
   * Priority: exact slot price → weekday fallback → pricePerNight fallback → null
   */
  const getPeriodPrice = (p: Period): { text: string; exact: boolean } | null => {
    const c = chalet!;
    const raw =
      p === "morning" ? c.priceMorning :
      p === "evening" ? c.priceEvening :
      c.priceFullDay;

    if (raw && Number(raw) > 0) {
      return { text: `${Number(raw).toLocaleString("ar-SA")} ر.س`, exact: true };
    }

    // Fallback: use weekday starting price
    const weekdayRaw = (c as any).priceWeekday as string | null | undefined;
    if (weekdayRaw && Number(weekdayRaw) > 0) {
      return { text: `يبدأ من ${Number(weekdayRaw).toLocaleString("ar-SA")} ر.س`, exact: false };
    }

    // Ultimate fallback: pricePerNight (legacy field)
    if (c.pricePerNight && c.pricePerNight > 0) {
      return { text: `يبدأ من ${c.pricePerNight.toLocaleString("ar-SA")} ر.س`, exact: false };
    }

    return null;
  };

  /* ── Coordinate extraction from mapsUrl ──────────────── */
  const mapsUrl: string | null | undefined = (chalet as any).mapsUrl;

  function parseLatLng(url: string): { lat: number; lng: number } | null {
    // Format 1: ?q=lat,lng  (e.g. https://maps.google.com/maps?q=26.329,43.975)
    const qMatch = url.match(/[?&]q=([-\d.]+),([-\d.]+)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    // Format 2: @lat,lng,zoom  (e.g. https://www.google.com/maps/@26.329,43.975,15z)
    const atMatch = url.match(/@([-\d.]+),([-\d.]+)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    return null;
  }

  const coords = mapsUrl ? parseLatLng(mapsUrl) : null;

  // Embed URL: exact pin when coords available, text search as fallback
  const mapEmbedUrl = coords
    ? `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&output=embed&hl=ar&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(
        [district, chalet.location, "القصيم، المملكة العربية السعودية"].filter(Boolean).join("، ")
      )}&output=embed&hl=ar`;

  // Direct open link: exact coordinates or search query
  const mapsOpenUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : (mapsUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(
        [chalet.location, "القصيم", "المملكة العربية السعودية"].filter(Boolean).join("، ")
      )}`);

  /* ── Terms helpers ─────────────────────────────────────── */
  const termsText = (chalet as any).termsAndConditions as string | null | undefined;
  const termsList = termsText ? termsText.split("\n").map((l: string) => l.trim()).filter(Boolean) : [];
  const hasTerms = termsList.length > 0;
  const PREVIEW_COUNT = 2;
  const termsPreview = termsList.slice(0, PREVIEW_COUNT);
  const termsHidden = termsList.slice(PREVIEW_COUNT);

  /* Smart message: inline terms if under 300 chars, generic otherwise */
  const TERMS_CHAR_LIMIT = 300;
  const termsInline = termsList.join(" | ");
  const termsAreShort = termsInline.length <= TERMS_CHAR_LIMIT;

  const dateFragment = selectedDate
    ? `لـ ${arabicDay} الموافق ${formattedDate}${periodPlain ? ` - الفترة: ${periodPlain}` : ""}`
    : `في ${chalet.location}${periodLine}`;

  const whatsappMsgWithTerms = hasTerms
    ? termsAreShort
      ? `مرحباً، أود الاستفسار عن حجز ${chalet.nameAr} ${dateFragment}.\n\nلقد اطلعت على شروط المالك الخاصة (مثل: ${termsInline}) وأوافق عليها.\n\nكم مبلغ العربون لتأكيد الحجز؟`
      : `مرحباً، أود الاستفسار عن حجز ${chalet.nameAr} ${dateFragment}.\n\nلقد اطلعت على كافة الشروط الخاصة المذكورة في صفحة الشاليه وأوافق عليها.\n\nكم مبلغ العربون لتأكيد الحجز؟`
    : whatsappMsg;

  const openWhatsApp = (includeTerms = false) => {
    const msg = includeTerms && hasTerms ? whatsappMsgWithTerms : whatsappMsg;
    let rawPhone = chalet.whatsappNumber.replace(/\D/g, "");
    if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
    if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
    const waUrl = `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank");
  };

  /* Show redirect notice, then open WhatsApp after brief delay */
  const handleConfirmAndBook = () => {
    setShowBookingConfirmModal(false);
    setShowTermsModal(false);
    setShowRedirectNotice(true);
    setTimeout(() => {
      setShowRedirectNotice(false);
      openWhatsApp(true);
    }, 1800);
  };

  /* Validate date then open confirm modal or direct WhatsApp */
  const handleBookClick = () => {
    if (!selectedDate) {
      setShowDateError(true);
      document.getElementById("booking-date-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setShowDateError(false), 3000);
      return;
    }
    setShowDateError(false);
    if (hasTerms) {
      setShowBookingConfirmModal(true);
    } else {
      // No terms — go straight to redirect notice
      setShowRedirectNotice(true);
      setTimeout(() => {
        setShowRedirectNotice(false);
        openWhatsApp(false);
      }, 1800);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: chalet.nameAr, text: whatsappMsg, url: window.location.href }).catch(() => null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pb-24 lg:pb-12">

        {/* ── Breadcrumb ─────────────────────────────────────── */}
        <div className="container mx-auto px-4 pt-5 pb-4">
          <div className="flex items-center text-sm text-muted-foreground gap-1">
            <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <Link href="/chalets" className="hover:text-primary transition-colors">الشاليهات</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground font-medium truncate">{chalet.nameAr}</span>
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────── */}
        {/*
          DOM order: content col first, images col second.
          RTL flex-row: first item → RIGHT side, second item → LEFT side.
          So content goes RIGHT (40%) and images go LEFT (60%) on desktop — correct.
          Mobile flex-col:
            content gets order-2 (below images)
            images get order-1 (above content)
        */}
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:gap-10 lg:items-start">

            {/* ═══ RIGHT COLUMN: Title + Booking Card + Description ═══ */}
            {/* Mobile: order-2 (appears after images) */}
            {/* Desktop: order-first → RTL start = right side (40%) */}
            <div className="order-2 lg:order-first lg:w-[40%] space-y-6 pt-4 lg:pt-0 lg:sticky lg:top-[80px]">

              {/* Title + meta */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h1 className="text-2xl lg:text-3xl font-extrabold text-foreground leading-tight">
                    {chalet.nameAr}
                  </h1>
                  {isVerified && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      موثق
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" />
                    {locationLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    تقييم عالٍ
                  </span>
                </div>
                {/* Quick stats chips */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5 text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    {chalet.maxGuests} ضيوف
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5 text-xs font-medium">
                    <Bed className="w-3.5 h-3.5 text-primary" />
                    {chalet.bedrooms} غرف نوم
                  </span>
                  {propertyType && (
                    <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-1.5 text-xs font-semibold">
                      {propertyType}
                    </span>
                  )}
                  {sections && (
                    <span className="inline-flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      {sections}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="h-auto px-3 py-1.5 text-xs"
                  >
                    <Share2 className="w-3.5 h-3.5 me-1.5" />
                    مشاركة
                  </Button>
                </div>
              </div>

              {/* ── WhatsApp Contact Card ───────────────────────── */}
              <div className="bg-card border border-border/60 shadow-lg shadow-primary/5 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#25D366]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">تواصل مع المالك</p>
                    <p className="text-xs text-muted-foreground mt-0.5">الأسعار أدناه — ابدأ بالتواصل للحجز</p>
                  </div>
                </div>

                {/* ── Price Box ── always visible ── */}
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 mb-4 space-y-2.5">
                  {weekdayFmt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <span>📅</span> وسط الأسبوع
                      </span>
                      <span className="text-sm font-bold text-right">
                        يبدأ من <span className="text-primary text-base">{weekdayFmt}</span>{" "}
                        <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                      </span>
                    </div>
                  )}
                  {weekendFmt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <span>🎉</span> نهاية الأسبوع
                      </span>
                      <span className="text-sm font-bold text-right">
                        يبدأ من <span className="text-primary text-base">{weekendFmt}</span>{" "}
                        <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                      </span>
                    </div>
                  ) : weekdayFmt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <span>🎉</span> نهاية الأسبوع
                      </span>
                      <span className="text-xs text-muted-foreground italic">يُحدَّد مع المالك</span>
                    </div>
                  )}
                  {seasonalDisclaimer && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 pt-2 mt-1 border-t border-amber-200/60 dark:border-amber-700/30 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>الأسعار قد تختلف في المواسم والأعياد</span>
                    </p>
                  )}
                </div>

                {/* ── Date Picker ─────────────────────────── */}
                <div className="mb-4" id="booking-date-input">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    تاريخ الحجز <span className="text-destructive">*</span>
                  </p>
                  <div className={`relative rounded-xl border transition-all ${showDateError ? "border-destructive bg-destructive/5 animate-pulse" : selectedDate ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/30"}`}>
                    <input
                      type="date"
                      min={TODAY}
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setShowDateError(false); }}
                      className="w-full bg-transparent px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer"
                      dir="ltr"
                    />
                    {selectedDate && (
                      <div className="px-3 pb-2 -mt-0.5">
                        <span className="text-xs font-semibold text-primary">
                          {arabicDay} الموافق {formattedDate}
                        </span>
                      </div>
                    )}
                  </div>
                  {showDateError && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <p className="text-xs text-destructive font-medium">يرجى اختيار تاريخ الحجز أولاً</p>
                    </div>
                  )}
                </div>

                {/* Period selector */}
                {slots.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">اختر الفترة</p>
                    <div className="flex gap-2 flex-wrap">
                      {slots.map((p) => {
                        const priceInfo = getPeriodPrice(p);
                        const active = selectedPeriod === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setSelectedPeriod(active ? null : p)}
                            className={`flex flex-col items-center px-3 py-2.5 rounded-xl border text-xs font-medium transition-all min-w-[90px] ${
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-secondary/50 text-foreground hover:border-primary/50"
                            }`}
                          >
                            <span className="text-sm">{PERIOD_LABEL[p]}</span>
                            {priceInfo ? (
                              <span className={`mt-1 font-bold text-xs leading-tight text-center ${
                                active ? "text-primary" : priceInfo.exact ? "text-foreground" : "text-muted-foreground"
                              }`}>
                                {priceInfo.text}
                              </span>
                            ) : (
                              <span className="mt-1 text-xs text-muted-foreground/60">سعر عند التواصل</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5 mb-4 py-3 border-y border-border/40">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">مبلغ التأمين</span>
                    <span className="font-semibold">يُحدَّد مع المالك</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">أوقات الدخول والخروج</span>
                    <span className="font-semibold">مرنة بالاتفاق</span>
                  </div>
                </div>

                {/* ── Terms Preview (above book button) ───── */}
                {hasTerms && (
                  <div className="mb-4 rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/30 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">📋</span>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">شروط الشاليه</span>
                    </div>
                    <ul className="space-y-1.5">
                      {termsPreview.map((t: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200">
                          <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                    {termsHidden.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        عرض كامل الشروط ({termsList.length})
                      </button>
                    )}
                  </div>
                )}

                {/* ── Book Button ─────────────────────────── */}
                <Button
                  className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white shadow-lg shadow-[#25D366]/20 border-none transition-all duration-300 hover:scale-[1.02] active:scale-95 py-3 text-base rounded-xl font-bold"
                  onClick={handleBookClick}
                  size="lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-2">
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                  </svg>
                  احجز الآن عبر واتساب
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-3">
                  تواصل مباشرةً مع المالك عبر واتساب للحجز والاستفسار
                </p>

                {/* ── Safety Warning ─────────────────────── */}
                <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3.5 py-3 mt-1">
                  <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    <span className="font-semibold">لضمان حقك:</span> تأكد من مطابقة اسم الحساب البنكي مع اسم المالك الموثق في المنصة.
                  </p>
                </div>
              </div>

              {/* ── Description ────────────────────────────────── */}
              <section>
                <h2 className="text-lg font-bold mb-2">عن الشاليه</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{chalet.descriptionAr}</p>
              </section>

              {/* ── Amenities ──────────────────────────────────── */}
              {chalet.amenities.length > 0 && (() => {
                const standardAmenities = chalet.amenities.filter((a: string) => !a.startsWith("other:"));
                const customTags = chalet.amenities
                  .filter((a: string) => a.startsWith("other:"))
                  .map((a: string) => a.slice(6).trim())
                  .filter(Boolean);
                return (
                  <section>
                    <h2 className="text-lg font-bold mb-3">المرافق والمميزات</h2>

                    {standardAmenities.length > 0 && (
                      <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mb-4">
                        {standardAmenities.map((key: string, idx: number) => (
                          <div key={idx} className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-sm text-foreground">
                              {amenityLabelMap[key] ?? key}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {customTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {customTags.map((tag: string, idx: number) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-sm font-medium"
                          >
                            ✨ {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* ── Location ───────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    الموقع
                  </h2>
                  <a
                    href={mapsOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    فتح في خرائط قوقل
                  </a>
                </div>
                <p className="text-sm font-medium text-foreground mb-3">{locationLabel}</p>
                <div className="w-full rounded-xl overflow-hidden border border-border/50 mb-3" style={{ height: "220px" }}>
                  <iframe
                    key={mapEmbedUrl}
                    title="موقع الشاليه"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={mapEmbedUrl}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                {coords ? (
                  <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 px-3 py-2.5 rounded-xl">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      الموقع الدقيق للشاليه — اضغط "فتح في خرائط قوقل" للتوجيه المباشر.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-secondary/60 px-3 py-2.5 rounded-xl">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      الخريطة تُظهر المنطقة التقريبية. سيتم مشاركة العنوان الدقيق عبر واتساب بعد التواصل مع المالك.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* ═══ LEFT COLUMN: Image Gallery ═══ */}
            {/* Mobile: order-1 (appears first, above content) */}
            {/* Desktop: order-last → RTL end = left side (60%) */}
            <div className="order-1 lg:order-last lg:w-[60%]">

              {/* Desktop gallery: main image + thumbnail strip */}
              <div className="hidden lg:block space-y-3">
                {/* Primary image */}
                <div className="w-full rounded-2xl overflow-hidden bg-muted" style={{ aspectRatio: "16/10" }}>
                  <img
                    src={images[0]}
                    alt={chalet.nameAr}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                  />
                </div>

                {/* Secondary images grid */}
                {images.length > 1 && (
                  <div className={`grid gap-3 ${images.length >= 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {images.slice(1, images.length >= 4 ? 4 : 3).map((img: string, i: number) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-muted relative" style={{ aspectRatio: "4/3" }}>
                        <img
                          src={img}
                          alt={`صورة ${i + 2}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        />
                        {i === (images.length >= 4 ? 2 : 1) && images.length > (images.length >= 4 ? 4 : 3) && (
                          <div className="absolute inset-0 bg-black/55 flex items-center justify-center cursor-pointer hover:bg-black/45 transition-colors">
                            <span className="text-white font-bold text-lg">+{images.length - (images.length >= 4 ? 4 : 3)} صور</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile / Tablet: Embla carousel */}
              <div className="lg:hidden overflow-hidden rounded-2xl bg-muted" ref={emblaRef} dir="rtl">
                <div className="flex">
                  {images.map((img: string, i: number) => (
                    <div key={i} className="flex-[0_0_100%] min-w-0 relative" style={{ aspectRatio: "4/3" }}>
                      <img src={img} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 left-3 bg-black/65 text-white px-2.5 py-1 rounded-full text-xs backdrop-blur-sm font-medium">
                        {i + 1} / {images.length}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />

      {/* ── Mobile Floating WhatsApp bar ─────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 p-3 bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.06)] flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground truncate">{chalet.nameAr}</p>
          <p className="text-xs text-[#25D366] font-semibold">الأسعار عند التواصل</p>
        </div>
        <Button
          className="shrink-0 bg-[#25D366] hover:bg-[#1DA851] text-white border-none px-5 py-2.5 text-sm font-bold rounded-xl"
          onClick={handleBookClick}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-1.5">
            <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
          </svg>
          احجز الآن
        </Button>
      </div>

      {/* ═══════════════════════════════════════════════════
          FULL TERMS MODAL
      ═══════════════════════════════════════════════════ */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowTermsModal(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full sm:max-w-lg bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>📋</span> كامل شروط الشاليه
              </h2>
              <button
                onClick={() => setShowTermsModal(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Terms list */}
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <ul className="space-y-3">
                {termsList.map((t: string, i: number) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <span className="text-primary mt-0.5 shrink-0 font-bold">{i + 1}.</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Footer */}
            <div className="px-5 pb-6 pt-3 border-t border-border shrink-0">
              <Button
                className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl py-3 text-sm font-bold"
                onClick={handleConfirmAndBook}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-2">
                  <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                </svg>
                أوافق وأتعهد بالالتزام — احجز الآن
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          BOOKING CONFIRMATION MODAL
      ═══════════════════════════════════════════════════ */}
      {showBookingConfirmModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowBookingConfirmModal(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>⚠️</span> قواعد هذا الشاليه
              </h2>
              <button
                onClick={() => setShowBookingConfirmModal(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground mb-3">
                تنبيه: يشترط المالك الالتزام بالقواعد التالية:
              </p>
              <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3.5 mb-4 max-h-52 overflow-y-auto">
                <ul className="space-y-2">
                  {termsList.map((t: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                      <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground text-center mb-4">
                بالمتابعة، تقر بأنك اطلعت على الشروط وتوافق عليها.
              </p>
              <Button
                className="w-full bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl py-3.5 text-sm font-bold mb-2.5 shadow-lg shadow-[#25D366]/20"
                onClick={handleConfirmAndBook}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-2">
                  <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                </svg>
                أوافق وأتعهد بالالتزام
              </Button>
              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() => setShowBookingConfirmModal(false)}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          REDIRECT NOTICE (auto-dismiss after 1.8s)
      ═══════════════════════════════════════════════════ */}
      {showRedirectNotice && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative z-10 bg-background rounded-2xl shadow-2xl px-7 py-8 max-w-xs w-full text-center animate-in fade-in zoom-in-90 duration-200">
            <div className="w-14 h-14 bg-[#25D366]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.558 4.118 1.532 5.852L0 24l6.307-1.507A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.366l-.359-.214-3.743.894.934-3.637-.235-.375A9.818 9.818 0 1 1 12 21.818z"/>
              </svg>
            </div>
            <p className="font-bold text-base mb-1.5">جارٍ فتح واتساب...</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              بإتمامك للمراسلة، أنت توافق على شروط المالك المذكورة في الصفحة
            </p>
            <div className="mt-4 flex justify-center">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#25D366] opacity-60 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
