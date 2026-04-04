import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, Bed, CheckCircle2, Share2, ChevronRight, ChevronLeft, Phone, ShieldCheck, Star, X, ChevronDown, ChevronUp, CalendarDays, Clock } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TODAY = new Date().toISOString().split("T")[0];

/* ─────────── Types ─────────── */
type Period = "morning" | "evening" | "full_day";

const PERIOD_META: Record<Period, { emoji: string; label: string; labelPlain: string }> = {
  morning:  { emoji: "🌅", label: "🌅 صباحي",    labelPlain: "صباحي" },
  evening:  { emoji: "🌙", label: "🌙 مسائي",    labelPlain: "مسائي" },
  full_day: { emoji: "☀️", label: "☀️ يوم كامل", labelPlain: "يوم كامل" },
};

const ARABIC_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/* ─────────── Helpers ─────────── */
function toNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) || n <= 0 ? null : n;
}
function fmtNum(v: string | null | undefined): string | null {
  const n = toNum(v);
  return n !== null ? n.toLocaleString("ar-SA") : null;
}
function getArabicDay(dateStr: string): string {
  if (!dateStr) return "";
  return ARABIC_DAYS[new Date(dateStr + "T12:00:00").getDay()] ?? "";
}
function getHijri(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric", month: "numeric", day: "numeric",
    }).format(new Date(dateStr + "T12:00:00"));
  } catch { return ""; }
}
function buildDateLine(dateStr: string): string {
  if (!dateStr) return "";
  const day  = getArabicDay(dateStr);
  const hij  = getHijri(dateStr);
  const greg = dateStr.replace(/-/g, "/");
  return `${day} ${hij} هـ (${greg} م)`;
}

/* ─────────── PLACEHOLDERS ─────────── */
const PLACEHOLDERS = [
  `${import.meta.env.BASE_URL}images/chalet-placeholder-1.png`,
  `${import.meta.env.BASE_URL}images/chalet-placeholder-2.png`,
  `${import.meta.env.BASE_URL}images/chalet-placeholder-3.png`,
];

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);

  /* ── Data fetching ────────────────────────────────────────── */
  const { data: chalet, isLoading, isError } = useQuery<any>({
    queryKey: ["chalet", numericId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${numericId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
  });

  const { data: amenityCatalog = [] } = useQuery<{ id: number; key: string; labelAr: string }[]>({
    queryKey: ["amenities-catalog"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      return r.json();
    },
  });

  /* ── Image list (real or placeholders) ───────────────────── */
  const images: string[] = useMemo(
    () => (chalet?.photos?.length > 0 ? chalet.photos : PLACEHOLDERS),
    [chalet],
  );

  /* ── Carousel (mobile) ───────────────────────────────────── */
  const [emblaRef] = useEmblaCarousel({ direction: "rtl", loop: true });

  /* ── Lightbox ────────────────────────────────────────────── */
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const openLb  = useCallback((i: number) => { setLbIdx(i); window.history.pushState({ lb: true }, ""); }, []);
  const closeLb = useCallback(() => setLbIdx(null), []);
  const lbPrev  = useCallback((n: number) => setLbIdx(i => i !== null ? (i - 1 + n) % n : null), []);
  const lbNext  = useCallback((n: number) => setLbIdx(i => i !== null ? (i + 1) % n : null), []);

  useEffect(() => {
    if (lbIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape")     { window.history.back(); }
      if (e.key === "ArrowLeft")  lbNext(images.length);
      if (e.key === "ArrowRight") lbPrev(images.length);
    };
    const onPop = () => closeLb();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.style.overflow = "";
    };
  }, [lbIdx, lbPrev, lbNext, closeLb, images.length]);

  /* ── Booking state ───────────────────────────────────────── */
  const [selectedDate,    setSelectedDate]    = useState("");
  const [selectedPeriod,  setSelectedPeriod]  = useState<Period | null>(null);
  const [dateErr,         setDateErr]         = useState(false);
  const [periodErr,       setPeriodErr]       = useState(false);
  const [showAllTerms,    setShowAllTerms]    = useState(false);
  const [redirecting,     setRedirecting]     = useState(false);

  /* ── Map parse ───────────────────────────────────────────── */
  function parseCoords(url: string | null): { lat: string; lng: string } | null {
    if (!url) return null;
    const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    return m ? { lat: m[1], lng: m[2] } : null;
  }

  /* ── DEBUG: prove data is reaching the component ─────────── */
  if (chalet) {
    console.log('CHALET_DEBUG_DATA:', {
      nameAr: chalet.nameAr,
      descriptionAr: chalet.descriptionAr,
      termsAndConditions: chalet.termsAndConditions,
      socialLink: chalet.socialLink,
      maxGuests: chalet.maxGuests,
      bedrooms: chalet.bedrooms,
      amenities: chalet.amenities,
      priceMorning: chalet.priceMorning,
      priceEvening: chalet.priceEvening,
      priceFullDay: chalet.priceFullDay,
    });
  }

  /* ─────────────────────────────────────── LOADING ─────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="w-48 h-5" />
          <Skeleton className="w-full aspect-[16/9] rounded-2xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────── ERROR ────────────── */
  if (isError || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center py-32 text-center px-4">
          <p className="text-2xl mb-2">🏚️</p>
          <h2 className="text-xl font-bold text-destructive mb-3">لم يُعثر على الشاليه</h2>
          <Link href="/chalets"><Button>العودة للقائمة</Button></Link>
        </div>
        <Footer />
      </div>
    );
  }

  /* ─────────────────────────────────────── DERIVED DATA ─────── */
  const isVerified:         boolean              = Boolean(chalet.isVerified);
  const district:           string | null        = chalet.district ?? null;
  const propertyType:       string | null        = chalet.propertyType ?? null;
  const sections:           string | null        = chalet.sections ?? null;
  const maxGuests:          number | null        = chalet.maxGuests ?? null;
  const bedrooms:           number | null        = chalet.bedrooms ?? null;
  const descriptionAr:      string | null        = chalet.descriptionAr || null;
  const socialLink:         string | null        = chalet.socialLink ?? null;
  const mapsUrl:            string | null        = chalet.mapsUrl ?? null;
  const videoUrl:           string | null        = chalet.videoUrl ?? null;

  // Pricing
  const weekdayFmt  = fmtNum(chalet.priceWeekday)  ?? fmtNum(String(chalet.pricePerNight));
  const weekendFmt  = fmtNum(chalet.priceWeekend);
  const morningFmt  = fmtNum(chalet.priceMorning);
  const eveningFmt  = fmtNum(chalet.priceEvening);
  const fullDayFmt  = fmtNum(chalet.priceFullDay);
  const showSeasonal = Boolean(chalet.seasonalDisclaimer ?? true);

  // Slots
  const slots: Period[] = [
    ...(chalet.slotMorning  !== false ? ["morning"  as Period] : []),
    ...(chalet.slotEvening  !== false ? ["evening"  as Period] : []),
    ...(chalet.slotFullDay  !== false ? ["full_day" as Period] : []),
  ];
  const periodPriceMap: Record<Period, string | null> = {
    morning:  morningFmt,
    evening:  eveningFmt,
    full_day: fullDayFmt,
  };

  // Per-period check-in/out
  const periodTimes: Record<Period, { in: string | null; out: string | null }> = {
    morning:  { in: chalet.morningCheckIn  ?? null, out: chalet.morningCheckOut  ?? null },
    evening:  { in: chalet.eveningCheckIn  ?? null, out: chalet.eveningCheckOut  ?? null },
    full_day: { in: chalet.fullDayCheckIn  ?? null, out: chalet.fullDayCheckOut  ?? null },
  };
  const activeTimes = selectedPeriod ? periodTimes[selectedPeriod] : { in: chalet.checkInTime ?? null, out: chalet.checkOutTime ?? null };

  // Terms
  const termsList: string[] = chalet.termsAndConditions
    ? chalet.termsAndConditions.split("\n").map((l: string) => l.trim()).filter(Boolean)
    : [];
  const PREVIEW = 3;
  const termsVisible = showAllTerms ? termsList : termsList.slice(0, PREVIEW);

  // Location
  const locationLabel = district ? `حي ${district}، ${chalet.location}` : chalet.location;
  const coords        = parseCoords(mapsUrl);
  const mapEmbedUrl   = coords
    ? `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&output=embed&hl=ar&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(locationLabel + " القصيم المملكة العربية السعودية")}&output=embed&hl=ar`;
  const mapsOpenUrl   = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : mapsUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(locationLabel)}`;

  // Amenities
  const amenityMap = Object.fromEntries(amenityCatalog.map((a) => [a.key, a.labelAr]));
  const standardAmenities = (chalet.amenities as string[]).filter((a) => !a.startsWith("other:"));
  const customTags         = (chalet.amenities as string[])
    .filter((a) => a.startsWith("other:"))
    .map((a) => a.slice(6).trim())
    .filter(Boolean);

  // Date helpers
  const arabicDay   = getArabicDay(selectedDate);
  const hijriDate   = getHijri(selectedDate);
  const gregDate    = selectedDate.replace(/-/g, "/");
  const dateLine    = buildDateLine(selectedDate);
  const periodPlain = selectedPeriod ? PERIOD_META[selectedPeriod].labelPlain : "";
  const periodPrice = selectedPeriod ? periodPriceMap[selectedPeriod] : null;

  // WhatsApp message
  const termsText = termsList.length > 0
    ? `\n\n📋 *شروط المالك:*\n${termsList.map((t) => `• ${t}`).join("\n")}`
    : "";
  const priceText = periodPrice ? `\n💰 السعر: ${periodPrice} ر.س` : "";
  const waMsg = selectedDate
    ? `مرحباً، أود الاستفسار عن حجز *${chalet.nameAr}*\n📅 التاريخ: ${dateLine}${selectedPeriod ? `\n⏰ الفترة: ${periodPlain}` : ""}${priceText}${termsText}\n\nكم مبلغ العربون لتأكيد الحجز؟`
    : `مرحباً، أود الاستفسار عن حجز *${chalet.nameAr}* في ${chalet.location}.`;

  function openWhatsApp() {
    let ph = chalet.whatsappNumber.replace(/\D/g, "");
    if (ph.startsWith("00")) ph = ph.slice(2);
    if (ph.startsWith("0"))  ph = "966" + ph.slice(1);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(waMsg)}`, "_blank");
  }

  function handleBook() {
    if (!selectedDate) {
      setDateErr(true);
      document.getElementById("date-input")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setDateErr(false), 3000);
      return;
    }
    if (slots.length > 0 && !selectedPeriod) {
      setPeriodErr(true);
      document.getElementById("period-selector")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setPeriodErr(false), 3000);
      return;
    }
    setRedirecting(true);
    setTimeout(() => { setRedirecting(false); openWhatsApp(); }, 1500);
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pb-28 lg:pb-12">

        {/* ── Breadcrumb ──────────────────────────────────── */}
        <div className="container mx-auto px-4 pt-5 pb-3">
          <div className="flex items-center text-sm text-muted-foreground gap-1 flex-wrap">
            <Link href="/"       className="hover:text-primary transition-colors">الرئيسية</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <Link href="/chalets" className="hover:text-primary transition-colors">الشاليهات</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground font-medium truncate max-w-[200px]">{chalet.nameAr}</span>
          </div>
        </div>

        {/* ── Main two-column layout ───────────────────────── */}
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:gap-10 lg:items-start">

            {/* ═══ RIGHT COLUMN: Info + Booking (sticky) ══════ */}
            <div className="order-2 lg:order-first lg:w-[42%] space-y-5 pt-4 lg:pt-0 lg:sticky lg:top-[80px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto">

              {/* Title + meta */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h1 className="text-2xl lg:text-3xl font-extrabold text-foreground leading-tight">
                    {chalet.nameAr}
                  </h1>
                  {isVerified && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap">
                      <ShieldCheck className="w-3.5 h-3.5" /> موثق
                    </span>
                  )}
                </div>

                {/* Location + rating */}
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" /> {locationLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> تقييم عالٍ
                  </span>
                </div>

                {/* Chips grid */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {maxGuests && maxGuests > 0 && (
                    <span className="chip"><Users className="w-3.5 h-3.5 text-primary" /> {maxGuests} ضيوف</span>
                  )}
                  {bedrooms && bedrooms > 0 && (
                    <span className="chip"><Bed className="w-3.5 h-3.5 text-primary" /> {bedrooms} غرف نوم</span>
                  )}
                  {propertyType && (
                    <span className="chip-primary">{propertyType}</span>
                  )}
                  {sections && (
                    <span className="chip">{sections}</span>
                  )}
                  <button onClick={() => navigator.share?.({ title: chalet.nameAr, url: window.location.href }).catch(() => null)}
                    className="chip hover:bg-primary/10 transition-colors cursor-pointer">
                    <Share2 className="w-3.5 h-3.5" /> مشاركة
                  </button>
                </div>
              </div>

              {/* ── Description ─────────────────────────────── */}
              {descriptionAr && (
                <div className="bg-secondary/40 rounded-xl px-4 py-3 border border-border/40">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{descriptionAr}</p>
                </div>
              )}

              {/* ══════════════════════════════════════════════
                  BOOKING CARD
              ══════════════════════════════════════════════ */}
              <div className="bg-card border border-border/60 shadow-lg shadow-primary/5 rounded-2xl p-5 space-y-4">

                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#25D366]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">تواصل مع المالك</p>
                    <p className="text-xs text-muted-foreground mt-0.5">الأسعار أدناه — ابدأ بالتواصل للحجز</p>
                  </div>
                </div>

                {/* Price Box */}
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 space-y-2">
                  {weekdayFmt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">📅 وسط الأسبوع</span>
                      <span className="text-sm font-bold">يبدأ من <span className="text-primary text-base">{weekdayFmt}</span> ر.س</span>
                    </div>
                  )}
                  {weekendFmt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1.5">🎉 نهاية الأسبوع</span>
                      <span className="text-sm font-bold">يبدأ من <span className="text-primary text-base">{weekendFmt}</span> ر.س</span>
                    </div>
                  ) : weekdayFmt ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">🎉 نهاية الأسبوع</span>
                      <span className="text-xs text-muted-foreground italic">يُحدَّد مع المالك</span>
                    </div>
                  ) : null}
                  {showSeasonal && (
                    <p className="text-xs text-amber-600 pt-1.5 mt-1 border-t border-amber-200/60 flex items-center gap-1.5">
                      ⚠️ الأسعار قد تختلف في المواسم والأعياد
                    </p>
                  )}
                </div>

                {/* Date Picker */}
                <div id="date-input">
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" /> تاريخ الحجز <span className="text-destructive">*</span>
                  </label>
                  <div className={`relative rounded-xl border transition-all ${dateErr ? "border-destructive bg-destructive/5 animate-pulse" : selectedDate ? "border-primary/50 bg-primary/5" : "border-border bg-secondary/30"}`}>
                    <input
                      type="date"
                      min={TODAY}
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setDateErr(false); }}
                      className="w-full bg-transparent px-3 py-2.5 text-sm rounded-xl outline-none cursor-pointer"
                      dir="ltr"
                    />
                    {selectedDate && (
                      <p className="px-3 pb-2 text-xs font-semibold text-primary -mt-0.5">
                        {dateLine}
                      </p>
                    )}
                  </div>
                  {dateErr && <p className="text-xs text-destructive mt-1 flex items-center gap-1">⚠️ يرجى تحديد تاريخ الحجز أولاً</p>}
                </div>

                {/* Period Selector */}
                {slots.length > 0 && (
                  <div id="period-selector">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      اختر الفترة <span className="text-destructive">*</span>
                    </p>
                    <div className={`grid gap-2 ${slots.length === 1 ? "grid-cols-1" : slots.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
                      {slots.map((p) => {
                        const price = periodPriceMap[p];
                        const meta  = PERIOD_META[p];
                        const active = selectedPeriod === p;
                        return (
                          <button
                            key={p}
                            onClick={() => { setSelectedPeriod(p); setPeriodErr(false); }}
                            className={`rounded-xl border px-3 py-2.5 text-right transition-all text-sm ${active ? "border-primary bg-primary/10 text-primary font-bold shadow-sm" : "border-border bg-secondary/30 hover:border-primary/40"} ${p === "full_day" && slots.length === 3 ? "col-span-2" : ""}`}
                          >
                            <div className="font-semibold">{meta.label}</div>
                            {price && <div className="text-xs text-muted-foreground mt-0.5">يبدأ من {price} ر.س</div>}
                          </button>
                        );
                      })}
                    </div>
                    {periodErr && <p className="text-xs text-destructive mt-1">⚠️ يرجى اختيار الفترة</p>}
                  </div>
                )}

                {/* Check-in / Check-out times */}
                {(activeTimes.in || activeTimes.out) && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> الدخول: {activeTimes.in ?? "—"}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> الخروج: {activeTimes.out ?? "—"}</span>
                  </div>
                )}

                {/* Deposit / Insurance note */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>مبلغ التأمين</span>
                  <span className="font-medium">يُحدَّد مع المالك</span>
                </div>

                {/* ── Special Terms Box ─────────────────────── */}
                {termsList.length > 0 && (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-900/10 dark:border-amber-700/40 px-4 py-3">
                    <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2 mb-2">
                      📋 شروط الشاليه
                    </h3>
                    <ul className="space-y-1.5">
                      {termsVisible.map((t, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                          <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                    {termsList.length > PREVIEW && (
                      <button
                        onClick={() => setShowAllTerms((v) => !v)}
                        className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1 hover:underline"
                      >
                        {showAllTerms
                          ? <><ChevronUp className="w-3.5 h-3.5" /> إخفاء الشروط</>
                          : <><ChevronDown className="w-3.5 h-3.5" /> عرض كامل الشروط ({termsList.length})</>}
                      </button>
                    )}
                  </div>
                )}

                {/* Book Button */}
                <button
                  onClick={handleBook}
                  disabled={redirecting}
                  className="w-full bg-[#25D366] hover:bg-[#1fbd5a] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2.5 text-base transition-all shadow-md shadow-[#25D366]/30 disabled:opacity-70"
                >
                  {redirecting ? (
                    <span className="animate-pulse">جارٍ التحويل لواتساب…</span>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.103 1.508 5.83L.057 23.454l5.797-1.521A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.52-5.17-1.424l-.371-.218-3.44.902.918-3.352-.24-.386A9.962 9.962 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                      </svg>
                      احجز الآن عبر واتساب
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  تواصل مباشرة مع المالك عبر واتساب للحجز والاستفسار
                </p>

                {/* Trust note */}
                <div className="bg-secondary/30 rounded-xl px-3 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-amber-500 shrink-0 mt-0.5">💡</span>
                  <span>
                    <strong className="text-foreground">لضمان حقك:</strong> تأكد من مطابقة اسم الحساب البنكي مع اسم المالك الموثق في المنصة.
                  </span>
                </div>

                {/* Instagram / Social Link */}
                {socialLink && (
                  <a
                    href={socialLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-sm font-semibold text-pink-600 hover:text-pink-500 transition-colors py-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                      <circle cx="12" cy="12" r="4"/>
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                    </svg>
                    تابع الشاليه على إنستغرام
                  </a>
                )}
              </div>
            </div>

            {/* ═══ LEFT COLUMN: Gallery + Details ════════════ */}
            <div className="order-1 lg:order-last lg:w-[58%] space-y-6">

              {/* ── MOBILE carousel ─────────────────────────── */}
              <div className="lg:hidden relative overflow-hidden rounded-2xl">
                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex">
                    {images.map((src, i) => (
                      <div key={i} className="flex-[0_0_100%] min-w-0">
                        <img
                          src={src} alt={`صورة ${i + 1}`}
                          onClick={() => openLb(i)}
                          className="w-full aspect-[4/3] object-cover cursor-zoom-in"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs font-medium px-3 py-1 rounded-full backdrop-blur-sm">
                  {images.length} / 1
                </div>
              </div>

              {/* ── DESKTOP gallery grid ─────────────────────── */}
              <div className="hidden lg:block">
                {images.length === 1 ? (
                  <img src={images[0]} alt="صورة الشاليه" onClick={() => openLb(0)}
                    className="w-full aspect-[16/10] object-cover rounded-2xl cursor-zoom-in" />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {/* Main large image */}
                    <div className="col-span-2">
                      <img src={images[0]} alt="صورة رئيسية" onClick={() => openLb(0)}
                        className="w-full aspect-[16/9] object-cover rounded-2xl cursor-zoom-in hover:brightness-95 transition-all" />
                    </div>
                    {/* Thumbnails row */}
                    {images.slice(1, 5).map((src, i) => {
                      const realIdx = i + 1;
                      const isLast  = realIdx === 4 && images.length > 5;
                      return (
                        <div key={i} className="relative">
                          <img src={src} alt={`صورة ${realIdx + 1}`} onClick={() => openLb(realIdx)}
                            className="w-full aspect-[4/3] object-cover rounded-xl cursor-zoom-in hover:brightness-90 transition-all" />
                          {isLast && (
                            <button onClick={() => openLb(realIdx)}
                              className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                              +{images.length - 5} صور
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Amenities & Features ─────────────────────── */}
              {(standardAmenities.length > 0 || customTags.length > 0) && (
                <section>
                  <h2 className="text-lg font-bold mb-3">المرافق والمميزات</h2>
                  {standardAmenities.length > 0 && (
                    <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mb-4">
                      {standardAmenities.map((key, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                          <span className="text-sm">{amenityMap[key] ?? key}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {customTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {customTags.map((tag, idx) => (
                        <span key={idx} className="chip-primary">✨ {tag}</span>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* ── Video ────────────────────────────────────── */}
              {videoUrl && (
                <section>
                  <h2 className="text-lg font-bold mb-3">فيديو الشاليه</h2>
                  <video src={videoUrl} controls className="w-full rounded-xl border border-border" />
                </section>
              )}

              {/* ── Location Map ─────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" /> الموقع
                  </h2>
                  <a href={mapsOpenUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-primary flex items-center gap-1.5 hover:underline">
                    <MapPin className="w-3.5 h-3.5" /> فتح في خرائط قوقل
                  </a>
                </div>
                <div className="rounded-2xl overflow-hidden border border-border h-56">
                  <iframe
                    src={mapEmbedUrl} title="موقع الشاليه" width="100%" height="100%"
                    style={{ border: 0 }} loading="lazy" allowFullScreen
                  />
                </div>
              </section>

            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* ═══════════════════════════════════════════════════════
          LIGHTBOX MODAL
      ═══════════════════════════════════════════════════════ */}
      {lbIdx !== null && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/95"
          onClick={() => { window.history.back(); }}
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(delta) < 40) return;
            delta < 0 ? lbNext(images.length) : lbPrev(images.length);
          }}
        >
          {/* X Close button — top-right */}
          <button
            onClick={(e) => { e.stopPropagation(); window.history.back(); }}
            className="absolute top-4 right-4 z-10 w-12 h-12 rounded-full bg-white/15 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-colors shadow-xl"
            aria-label="إغلاق"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 inset-x-0 flex justify-center z-10 pointer-events-none">
            <span className="bg-black/60 text-white text-sm font-medium px-4 py-1.5 rounded-full backdrop-blur-sm">
              {lbIdx + 1} / {images.length}
            </span>
          </div>

          {/* Prev arrow (right side in RTL) */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); lbPrev(images.length); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
              aria-label="السابق"
            >
              <ChevronRight className="w-7 h-7" />
            </button>
          )}

          {/* Next arrow (left side in RTL) */}
          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); lbNext(images.length); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
              aria-label="التالي"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}

          {/* Image */}
          <div className="relative max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
            <img
              key={lbIdx}
              src={images[lbIdx]}
              alt={`صورة ${lbIdx + 1}`}
              className="max-w-full max-h-[88vh] object-contain rounded-xl shadow-2xl select-none"
              draggable={false}
            />
          </div>

          {/* Dot indicators */}
          {images.length > 1 && images.length <= 12 && (
            <div className="absolute bottom-5 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none">
              {images.map((_, i) => (
                <span key={i} className={`w-2 h-2 rounded-full transition-all ${i === lbIdx ? "bg-white scale-125" : "bg-white/40"}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sticky WhatsApp bottom bar (mobile) ────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-background border-t border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">{chalet.nameAr}</p>
            <p className="text-xs text-muted-foreground">الأسعار عند التواصل</p>
          </div>
          <button
            onClick={handleBook}
            className="shrink-0 bg-[#25D366] text-white text-sm font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-md shadow-[#25D366]/30"
          >
            احجز الآن
          </button>
        </div>
      </div>
    </div>
  );
}
