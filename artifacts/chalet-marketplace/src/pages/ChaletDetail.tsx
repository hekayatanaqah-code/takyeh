import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  MapPin, Star, Users, BedDouble, Share2, Phone,
  ChevronLeft, ChevronRight, X, Instagram,
  ShieldCheck, MessageCircle, Calendar, Clock,
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─────────────────── helpers ─────────────────── */

const AMENITY_LABELS: Record<string, { label: string; icon: string }> = {
  pool:           { label: "مسبح",              icon: "🏊" },
  kids_games:     { label: "ألعاب أطفال",        icon: "🎠" },
  private_majlis: { label: "مجالس مستقلة",       icon: "🛋️" },
  bbq:            { label: "ركن شواء",            icon: "🔥" },
  kitchen:        { label: "مطبخ مجهز",           icon: "🍳" },
  wifi:           { label: "واي فاي",             icon: "📶" },
  ac:             { label: "مكيف",                icon: "❄️" },
  parking:        { label: "موقف سيارات",         icon: "🅿️" },
  garden:         { label: "حديقة",               icon: "🌿" },
  gym:            { label: "صالة رياضية",         icon: "🏋️" },
  cinema:         { label: "سينما خارجية",        icon: "🎬" },
  jacuzzi:        { label: "جاكوزي",              icon: "🛁" },
  football:       { label: "ملعب كرة قدم",        icon: "⚽" },
  billiards:      { label: "بلياردو",             icon: "🎱" },
  table_tennis:   { label: "تنس طاولة",           icon: "🏓" },
};

function getAmenityLabel(key: string) {
  if (key.startsWith("other:")) return { label: key.slice(6), icon: "✨" };
  return AMENITY_LABELS[key] ?? { label: key, icon: "✅" };
}

function hijriLine(date: Date) {
  const dayName = date.toLocaleDateString("ar-SA-u-ca-islamic", { weekday: "long" });
  const hijri   = date.toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "numeric", day: "numeric" });
  const greg    = date.toLocaleDateString("ar-SA-u-ca-islamic-nu-latn", {
    calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return `${dayName} ${hijri} هـ (${greg} م)`;
}

function extractCoords(url: string | null | undefined) {
  if (!url) return null;
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  const m2 = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m2 ? { lat: m2[1], lng: m2[2] } : null;
}

/* ─────────────────── types ─────────────────── */
interface ChaletData {
  id: number;
  nameAr: string;
  descriptionAr: string;
  location: string;
  district?: string;
  propertyType?: string;
  sections?: string;
  maxGuests?: number;
  bedrooms?: number;
  amenities: string[];
  photos: string[];
  videoUrl?: string;
  whatsappNumber: string;
  mapsUrl?: string;
  socialLink?: string;
  termsAndConditions?: string;
  isVerified?: boolean;
  priceMorning?: string | number | null;
  priceEvening?: string | number | null;
  priceFullDay?: string | number | null;
  priceWeekday?: string | number | null;
  priceWeekend?: string | number | null;
  slotMorning?: boolean;
  slotEvening?: boolean;
  slotFullDay?: boolean;
  seasonalDisclaimer?: boolean;
  morningCheckIn?: string | null;
  morningCheckOut?: string | null;
  eveningCheckIn?: string | null;
  eveningCheckOut?: string | null;
  fullDayCheckIn?: string | null;
  fullDayCheckOut?: string | null;
}

/* ─────────────────── lightbox ─────────────────── */
function Lightbox({ photos, startIdx, onClose }: { photos: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(() => setIdx(i => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") prev();
      if (e.key === "ArrowLeft") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchStartX.current === null) return;
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
        touchStartX.current = null;
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
        aria-label="إغلاق"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 right-4 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
        {idx + 1} / {photos.length}
      </div>

      {/* Prev arrow */}
      <button
        onClick={prev}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
        aria-label="السابق"
      >
        <ChevronRight className="w-6 h-6 text-white" />
      </button>

      {/* Image */}
      <img
        src={`${BASE}${photos[idx]}`}
        alt={`صورة ${idx + 1}`}
        className="max-h-[85vh] max-w-[92vw] object-contain rounded-lg select-none"
        draggable={false}
      />

      {/* Next arrow */}
      <button
        onClick={next}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
        aria-label="التالي"
      >
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>

      {/* Dots */}
      {photos.length > 1 && (
        <div className="absolute bottom-5 flex gap-2">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── booking card ─────────────────── */
function BookingCard({ chalet }: { chalet: ChaletData }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState<"morning" | "evening" | "fullday" | null>(null);
  const [termsExpanded, setTermsExpanded] = useState(false);

  const termsList = chalet.termsAndConditions
    ? chalet.termsAndConditions.split("\n").map(t => t.trim()).filter(Boolean)
    : [];

  const price = (v: string | number | null | undefined) =>
    v != null ? `${Number(v).toLocaleString("ar-SA")} ر.س` : null;

  const periods = [
    chalet.slotMorning  && { key: "morning",  label: "🌅 صباحي",   price: price(chalet.priceMorning),  checkIn: chalet.morningCheckIn,  checkOut: chalet.morningCheckOut },
    chalet.slotEvening  && { key: "evening",  label: "🌙 مسائي",   price: price(chalet.priceEvening),  checkIn: chalet.eveningCheckIn,  checkOut: chalet.eveningCheckOut },
    chalet.slotFullDay  && { key: "fullday",  label: "☀️ يوم كامل", price: price(chalet.priceFullDay),  checkIn: chalet.fullDayCheckIn,  checkOut: chalet.fullDayCheckOut },
  ].filter(Boolean) as { key: string; label: string; price: string | null; checkIn?: string | null; checkOut?: string | null }[];

  const handleWhatsApp = () => {
    const phone = chalet.whatsappNumber.replace(/\D/g, "");
    let dateLine = "";
    if (selectedDate) {
      try { dateLine = hijriLine(new Date(selectedDate)); } catch { dateLine = selectedDate; }
    }
    const periodLabel = periods.find(p => p.key === selectedPeriod)?.label ?? "";
    const periodPrice = periods.find(p => p.key === selectedPeriod)?.price ?? "";
    const termsBlock = termsList.length
      ? "\n\n📋 شروط الشاليه:\n" + termsList.map(t => `• ${t}`).join("\n")
      : "";

    const msg = [
      `السلام عليكم، أرغب في حجز ${chalet.nameAr}`,
      dateLine && `📅 التاريخ: ${dateLine}`,
      periodLabel && `🕐 الفترة: ${periodLabel}`,
      periodPrice && `💰 السعر: ${periodPrice}`,
      termsBlock,
    ].filter(Boolean).join("\n");

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-primary/8 border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
          <Phone className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground text-sm">تواصل مع المالك</p>
          <p className="text-xs text-muted-foreground">الأسعار أدناه — أبدأ بالتواصل للحجز</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Weekday / Weekend prices */}
        {(chalet.priceWeekday || chalet.priceWeekend) && (
          <div className="grid grid-cols-2 gap-2">
            {chalet.priceWeekday && (
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">📅 وسط الأسبوع</p>
                <p className="font-bold text-foreground">يبدأ من <span className="text-primary">{Number(chalet.priceWeekday).toLocaleString("ar-SA")}</span> ر.س</p>
              </div>
            )}
            {chalet.priceWeekend && (
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-0.5">🎉 نهاية الأسبوع</p>
                <p className="font-bold text-foreground">يبدأ من <span className="text-primary">{Number(chalet.priceWeekend).toLocaleString("ar-SA")}</span> ر.س</p>
              </div>
            )}
          </div>
        )}
        {chalet.seasonalDisclaimer && (
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
            ⚠️ الأسعار قد تختلف في المواسم والأعياد
          </p>
        )}

        {/* Date picker */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary" />
            تاريخ الحجز <span className="text-destructive text-xs">*</span>
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {selectedDate && (
            <p className="text-xs text-muted-foreground pr-1">
              {(() => { try { return hijriLine(new Date(selectedDate)); } catch { return ""; } })()}
            </p>
          )}
        </div>

        {/* Period selector */}
        {periods.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">اختر الفترة <span className="text-destructive text-xs">*</span></p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(periods.length, 3)}, 1fr)` }}>
              {periods.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelectedPeriod(p.key as typeof selectedPeriod)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition-all ${
                    selectedPeriod === p.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary/40 text-foreground"
                  }`}
                >
                  <p className="text-xs font-semibold">{p.label}</p>
                  {p.price && <p className="text-[11px] text-muted-foreground mt-0.5">يبدأ من {p.price}</p>}
                  {(p.checkIn || p.checkOut) && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {p.checkIn && `دخول ${p.checkIn}`}{p.checkIn && p.checkOut && " · "}{p.checkOut && `خروج ${p.checkOut}`}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Insurance note */}
        {chalet.priceWeekday && (
          <p className="text-xs text-muted-foreground text-center">مبلغ التأمين: يُحدد مع المالك</p>
        )}

        {/* Terms box */}
        {termsList.length > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-700/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setTermsExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-right"
            >
              <span className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                📋 شروط الشاليه
              </span>
              <span className="text-amber-700 dark:text-amber-400">
                {termsExpanded
                  ? <ChevronUp className="w-4 h-4" />
                  : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            <div className={`px-4 overflow-hidden transition-all duration-300 ${termsExpanded ? "pb-4 max-h-[500px]" : "max-h-0"}`}>
              <ul className="space-y-1.5">
                {termsList.map((term, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <span>{term}</span>
                  </li>
                ))}
              </ul>
            </div>
            {!termsExpanded && (
              <p className="px-4 pb-3 text-xs text-amber-700 dark:text-amber-400">
                {termsList.slice(0, 2).map(t => `• ${t}`).join(" · ")}
                {termsList.length > 2 && ` · +${termsList.length - 2} شروط أخرى`}
              </p>
            )}
          </div>
        )}

        {/* WhatsApp button */}
        <Button
          onClick={handleWhatsApp}
          className="w-full h-13 text-base font-bold rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white shadow-lg shadow-green-500/20 gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          احجز الآن عبر واتساب
        </Button>

        {/* Trust badge */}
        <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>ضمان <strong className="text-foreground">حكاية أناقة</strong> — تأكد من الحساب قبل الدفع</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── main page ─────────────────── */
export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  const numericId = parseInt(id ?? "0", 10);

  const { data: chalet, isLoading, error } = useQuery<ChaletData>({
    queryKey: ["chalet-detail", numericId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${numericId}`, { credentials: "include" });
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    enabled: numericId > 0,
    staleTime: 0,
    refetchOnMount: true,
  });

  /* gallery */
  const photos: string[] = Array.isArray(chalet?.photos) ? chalet!.photos : [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ direction: "rtl", loop: true });
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lbIdx, setLbIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", () => setGalleryIdx(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  /* ── LOADING ── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-10 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* ── ERROR ── */
  if (error || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-4xl">🏕️</p>
            <p className="text-xl font-bold text-foreground">الشاليه غير موجود</p>
            <p className="text-muted-foreground">تأكد من الرابط أو عد للقائمة</p>
          </div>
        </div>
      </div>
    );
  }

  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];
  const coords = extractCoords(chalet.mapsUrl);
  const termsList = chalet.termsAndConditions
    ? chalet.termsAndConditions.split("\n").map(t => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />

      {/* Lightbox */}
      {lbIdx !== null && (
        <Lightbox photos={photos} startIdx={lbIdx} onClose={() => setLbIdx(null)} />
      )}

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 pt-4 pb-1">
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <a href={`${BASE}/`} className="hover:text-primary transition-colors">الرئيسية</a>
          <ChevronLeft className="w-3 h-3" />
          <a href={`${BASE}/chalets`} className="hover:text-primary transition-colors">الشاليهات</a>
          <ChevronLeft className="w-3 h-3" />
          <span className="text-foreground font-medium truncate max-w-[160px]">{chalet.nameAr}</span>
        </nav>
      </div>

      <main className="flex-1 container mx-auto px-4 pb-28 md:pb-10 space-y-6 max-w-5xl">

        {/* ── GALLERY ── */}
        <section>
          {/* Mobile: Embla carousel */}
          <div className="md:hidden relative rounded-2xl overflow-hidden bg-muted">
            {photos.length > 0 ? (
              <>
                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex touch-pan-y">
                    {photos.map((url, i) => (
                      <div key={i} className="flex-none w-full aspect-[16/10]" onClick={() => setLbIdx(i)}>
                        <img
                          src={`${BASE}${url}`}
                          alt={`صورة ${i + 1}`}
                          className="w-full h-full object-cover cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Arrow buttons */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => emblaApi?.scrollPrev()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => emblaApi?.scrollNext()}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
                  {galleryIdx + 1} / {photos.length}
                </div>
              </>
            ) : (
              <div className="aspect-[16/10] flex items-center justify-center">
                <p className="text-muted-foreground text-4xl">🏕️</p>
              </div>
            )}
          </div>

          {/* Desktop: grid */}
          {photos.length > 0 && (
            <div className="hidden md:grid grid-cols-3 gap-2 rounded-2xl overflow-hidden h-80">
              <div className="col-span-2 row-span-2 relative cursor-pointer" onClick={() => setLbIdx(0)}>
                <img src={`${BASE}${photos[0]}`} alt="صورة 1" className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
              </div>
              {photos.slice(1, 3).map((url, i) => (
                <div key={i} className="relative cursor-pointer" onClick={() => setLbIdx(i + 1)}>
                  <img src={`${BASE}${url}`} alt={`صورة ${i + 2}`} className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
                  {i === 1 && photos.length > 3 && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-bold text-lg">+{photos.length - 3}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── TWO COLUMN LAYOUT ── */}
        <div className="grid md:grid-cols-[1fr_340px] gap-6 items-start">

          {/* LEFT COLUMN */}
          <div className="space-y-6">

            {/* Title block */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-snug">{chalet.nameAr}</h1>
                <button
                  className="shrink-0 mt-1 w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  onClick={() => navigator.share?.({ title: chalet.nameAr, url: window.location.href })}
                  aria-label="مشاركة"
                >
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  {chalet.location}{chalet.district && ` · ${chalet.district}`}
                </span>
                {chalet.isVerified && (
                  <span className="flex items-center gap-1 text-primary font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" /> موثق
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> تقييم عالٍ
                </span>
              </div>

              {/* Chips row */}
              <div className="flex flex-wrap gap-2">
                {chalet.maxGuests && (
                  <span className="chip-primary">
                    <Users className="w-3.5 h-3.5" /> {chalet.maxGuests} ضيوف
                  </span>
                )}
                {chalet.bedrooms != null && (
                  <span className="chip-primary">
                    <BedDouble className="w-3.5 h-3.5" /> {chalet.bedrooms} غرف نوم
                  </span>
                )}
                {chalet.propertyType && <span className="chip">{chalet.propertyType}</span>}
                {chalet.sections && <span className="chip">{chalet.sections}</span>}
              </div>
            </div>

            {/* Description */}
            {chalet.descriptionAr && (
              <p className="text-muted-foreground leading-relaxed text-base">{chalet.descriptionAr}</p>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-foreground mb-3">المرافق والمميزات</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {amenities.map(key => {
                    const { label, icon } = getAmenityLabel(key);
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm text-foreground">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <span>{icon} {label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Map */}
            {(chalet.mapsUrl || coords) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-foreground">الموقع</h2>
                  {chalet.mapsUrl && (
                    <a
                      href={chalet.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      <MapPin className="w-3.5 h-3.5" /> فتح في خرائط قوقل
                    </a>
                  )}
                </div>
                {coords ? (
                  <div className="rounded-xl overflow-hidden border border-border h-52">
                    <iframe
                      title="map"
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`}
                    />
                  </div>
                ) : chalet.mapsUrl && (
                  <a
                    href={chalet.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline p-3 rounded-xl border border-border"
                  >
                    <ExternalLink className="w-4 h-4" /> فتح الموقع على خرائط قوقل
                  </a>
                )}
              </div>
            )}

            {/* Terms (full view — desktop) */}
            {termsList.length > 0 && (
              <div className="hidden md:block rounded-2xl border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-700/40 p-5">
                <h2 className="text-base font-bold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
                  📋 شروط الشاليه
                </h2>
                <ul className="space-y-2">
                  {termsList.map((term, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <span>{term}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Instagram */}
            {chalet.socialLink && (
              <a
                href={chalet.socialLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-pink-400/60 hover:bg-pink-50/50 dark:hover:bg-pink-950/20 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm group-hover:text-pink-600 transition-colors">
                    تابع الشاليه على إنستغرام
                  </p>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{chalet.socialLink}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground mr-auto group-hover:text-pink-500 transition-colors" />
              </a>
            )}
          </div>

          {/* RIGHT COLUMN — booking card (desktop) */}
          <div className="hidden md:block sticky top-6">
            <BookingCard chalet={chalet} />
          </div>
        </div>
      </main>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{chalet.nameAr}</p>
            <p className="text-xs text-muted-foreground">الأسعار عند التواصل</p>
          </div>
          <button
            onClick={() => {
              const phone = chalet.whatsappNumber.replace(/\D/g, "");
              window.open(`https://wa.me/${phone}`, "_blank");
            }}
            className="shrink-0 h-11 px-5 rounded-2xl bg-[#25D366] text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-green-500/20"
          >
            <MessageCircle className="w-4 h-4" /> احجز الآن
          </button>
        </div>
      </div>

      {/* Mobile booking card (above footer, below sticky bar) */}
      <div className="md:hidden container mx-auto px-4 pb-6 max-w-5xl">
        <BookingCard chalet={chalet} />
      </div>

      <Footer />
    </div>
  );
}
