import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  MapPin, Star, Users, BedDouble, Share2,
  ChevronLeft, ChevronRight, X, Instagram,
  ShieldCheck, MessageCircle, Calendar,
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink,
  DollarSign, Clock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ───────── helpers ───────── */

const AMENITY_MAP: Record<string, { ar: string; icon: string }> = {
  pool:           { ar: "مسبح",             icon: "🏊" },
  kids_games:     { ar: "ألعاب أطفال",       icon: "🎠" },
  private_majlis: { ar: "مجالس مستقلة",      icon: "🛋️" },
  bbq:            { ar: "ركن شواء",           icon: "🔥" },
  kitchen:        { ar: "مطبخ مجهز",          icon: "🍳" },
  wifi:           { ar: "واي فاي",            icon: "📶" },
  ac:             { ar: "مكيف",               icon: "❄️" },
  parking:        { ar: "موقف سيارات",        icon: "🅿️" },
  garden:         { ar: "حديقة",              icon: "🌿" },
  gym:            { ar: "صالة رياضية",        icon: "🏋️" },
  cinema:         { ar: "سينما خارجية",       icon: "🎬" },
  jacuzzi:        { ar: "جاكوزي",             icon: "🛁" },
  football:       { ar: "ملعب كرة قدم",       icon: "⚽" },
  billiards:      { ar: "بلياردو",            icon: "🎱" },
  table_tennis:   { ar: "تنس طاولة",          icon: "🏓" },
};

function amenityLabel(key: string) {
  if (key.startsWith("other:")) return { ar: key.slice(6), icon: "✨" };
  return AMENITY_MAP[key] ?? { ar: key, icon: "✅" };
}

function toHijri(date: Date) {
  const day  = date.toLocaleDateString("ar-SA-u-ca-islamic", { weekday: "long" });
  const h    = date.toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "numeric", day: "numeric" });
  const g    = date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory" });
  return `${day} ${h} هـ — ${g} م`;
}

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

function extractCoords(url: string | null | undefined) {
  if (!url) return null;
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: m[1], lng: m[2] };
  return null;
}

/* ───────── types ───────── */
interface Chalet {
  id: number;
  nameAr: string;
  descriptionAr?: string;
  location?: string;
  district?: string;
  maxGuests?: number;
  bedrooms?: number;
  propertyType?: string;
  sections?: string;
  amenities: string[];
  photos: string[];
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
  morningCheckIn?: string | null;
  morningCheckOut?: string | null;
  eveningCheckIn?: string | null;
  eveningCheckOut?: string | null;
  fullDayCheckIn?: string | null;
  fullDayCheckOut?: string | null;
}

/* ───────── LIGHTBOX ───────── */
function Lightbox({
  photos, startIdx, onClose,
}: { photos: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  const touchX = useRef<number | null>(null);

  const prev = useCallback(() => setIdx(i => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") prev();
      if (e.key === "ArrowLeft")  next();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose, prev, next]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/96 flex items-center justify-center"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 40) d > 0 ? next() : prev();
        touchX.current = null;
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-5 left-5 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors border border-white/20"
        aria-label="إغلاق"
      >
        <X className="w-5 h-5 text-white" />
      </button>

      {/* Counter */}
      <div className="absolute top-5 right-5 text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
        {idx + 1} / {photos.length}
      </div>

      {/* Arrows */}
      <button onClick={prev} aria-label="السابق"
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-amber-500/60 flex items-center justify-center transition-colors border border-white/20">
        <ChevronRight className="w-6 h-6 text-white" />
      </button>

      <img
        src={`${BASE}${photos[idx]}`}
        alt={`صورة ${idx + 1}`}
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-xl select-none shadow-2xl"
        draggable={false}
      />

      <button onClick={next} aria-label="التالي"
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-amber-500/60 flex items-center justify-center transition-colors border border-white/20">
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>

      {/* Dots */}
      {photos.length > 1 && (
        <div className="absolute bottom-5 flex gap-2.5">
          {photos.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? "w-6 h-2.5 bg-amber-400" : "w-2.5 h-2.5 bg-white/35 hover:bg-white/60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── BOOKING PANEL ───────── */
function BookingPanel({ chalet }: { chalet: Chalet }) {
  const [date, setDate]     = useState("");
  const [period, setPeriod] = useState<string | null>(null);
  const [open, setOpen]     = useState(false);

  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

  const slots = [
    chalet.slotMorning && { key: "morning",  label: "🌅 صباحي",    price: fmt(chalet.priceMorning),  ci: chalet.morningCheckIn,  co: chalet.morningCheckOut },
    chalet.slotEvening && { key: "evening",  label: "🌙 مسائي",    price: fmt(chalet.priceEvening),  ci: chalet.eveningCheckIn,  co: chalet.eveningCheckOut },
    chalet.slotFullDay && { key: "fullday",  label: "☀️ يوم كامل", price: fmt(chalet.priceFullDay),  ci: chalet.fullDayCheckIn,  co: chalet.fullDayCheckOut },
  ].filter(Boolean) as { key: string; label: string; price: string | null; ci?: string | null; co?: string | null }[];

  const handleWhatsApp = () => {
    const phone = chalet.whatsappNumber.replace(/\D/g, "");
    let dateLine = "";
    if (date) { try { dateLine = toHijri(new Date(date)); } catch { dateLine = date; } }
    const slotLabel = slots.find(s => s.key === period)?.label ?? "";
    const slotPrice = slots.find(s => s.key === period)?.price ?? "";
    const termsBlock = terms.length
      ? "\n\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n")
      : "";
    const msg = [
      `السلام عليكم، أرغب في حجز شاليه: ${chalet.nameAr}`,
      dateLine  && `📅 التاريخ: ${dateLine}`,
      slotLabel && `🕐 الفترة: ${slotLabel}`,
      slotPrice && `💰 السعر: ${slotPrice}`,
      termsBlock,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="rounded-2xl border border-amber-900/30 bg-stone-900 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-l from-amber-900/40 to-stone-900 border-b border-amber-900/30 px-5 py-4">
        <p className="font-bold text-amber-300 text-sm">تواصل مع المالك</p>
        <p className="text-xs text-stone-400 mt-0.5">اختر الفترة وأرسل طلب الحجز مباشرة</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Price summary */}
        {(chalet.priceWeekday || chalet.priceWeekend) && (
          <div className="grid grid-cols-2 gap-2">
            {chalet.priceWeekday && (
              <div className="rounded-xl bg-stone-800 border border-stone-700 p-3 text-center">
                <p className="text-[11px] text-stone-400 mb-1">وسط الأسبوع</p>
                <p className="text-amber-300 font-bold text-sm">من {fmt(chalet.priceWeekday)}</p>
              </div>
            )}
            {chalet.priceWeekend && (
              <div className="rounded-xl bg-stone-800 border border-stone-700 p-3 text-center">
                <p className="text-[11px] text-stone-400 mb-1">نهاية الأسبوع</p>
                <p className="text-amber-300 font-bold text-sm">من {fmt(chalet.priceWeekend)}</p>
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            تاريخ الحجز <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full h-10 rounded-xl border border-stone-700 bg-stone-800 px-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-600"
          />
          {date && (
            <p className="text-[11px] text-amber-400/80 pr-1">
              {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
            </p>
          )}
        </div>

        {/* Slots */}
        {slots.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-stone-300">
              الفترة <span className="text-red-400">*</span>
            </p>
            <div className={`grid gap-2 grid-cols-${Math.min(slots.length, 3)}`}>
              {slots.map(s => (
                <button key={s.key} type="button"
                  onClick={() => setPeriod(s.key)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition-all text-xs ${
                    period === s.key
                      ? "border-amber-500 bg-amber-500/15 text-amber-300"
                      : "border-stone-700 bg-stone-800 hover:border-amber-700 text-stone-300"
                  }`}
                >
                  <p className="font-bold">{s.label}</p>
                  {s.price && <p className="text-[10px] mt-0.5 opacity-80">{s.price}</p>}
                  {(s.ci || s.co) && (
                    <p className="text-[10px] mt-0.5 opacity-60">
                      {s.ci && `دخول ${s.ci}`}{s.ci && s.co && " · "}{s.co && `خروج ${s.co}`}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Terms collapsible */}
        {terms.length > 0 && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold text-amber-400 flex items-center gap-2">
                📋 شروط الشاليه
              </span>
              {open
                ? <ChevronUp className="w-4 h-4 text-amber-500" />
                : <ChevronDown className="w-4 h-4 text-amber-500" />}
            </button>
            <div className={`px-4 overflow-hidden transition-all duration-300 ${open ? "pb-4 max-h-[400px]" : "max-h-0"}`}>
              <ul className="space-y-2">
                {terms.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-200/90">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            {!open && (
              <p className="px-4 pb-3 text-[11px] text-amber-500/70 line-clamp-2">
                {terms.slice(0, 2).map(t => `• ${t}`).join("  ·  ")}
                {terms.length > 2 && ` · +${terms.length - 2} شروط`}
              </p>
            )}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleWhatsApp}
          className="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-base flex items-center justify-center gap-2.5 transition-colors shadow-lg shadow-green-900/30"
        >
          <MessageCircle className="w-5 h-5" />
          احجز الآن عبر واتساب
        </button>

        <p className="text-center text-[11px] text-stone-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600/70" />
          ضمان <span className="text-amber-600/80 font-semibold">حكاية أناقة</span> — تأكد من الحساب قبل الدفع
        </p>
      </div>
    </div>
  );
}

/* ───────── MAIN PAGE ───────── */
export default function ChaletMasterView() {
  const { id } = useParams<{ id: string }>();

  const { data: chalet, isLoading, error } = useQuery<Chalet>({
    queryKey: ["chalet-master", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  /* gallery */
  const photos: string[] = Array.isArray(chalet?.photos) ? chalet!.photos : [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ direction: "rtl", loop: true });
  const [slideIdx, setSlideIdx] = useState(0);
  const [lbIdx, setLbIdx]       = useState<number | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", () => setSlideIdx(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  /* ── LOADING ── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-10 space-y-4 max-w-5xl">
          {[280, 160, 200].map((h, i) => (
            <div key={i} style={{ height: h }} className="rounded-2xl bg-stone-800/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* ── ERROR ── */
  if (error || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-5xl">🏕️</p>
            <p className="text-xl font-bold text-stone-100">الشاليه غير موجود</p>
            <p className="text-stone-400">تأكد من الرابط أو عد للقائمة</p>
          </div>
        </div>
      </div>
    );
  }

  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const coords = extractCoords(chalet.mapsUrl);

  return (
    <div className="min-h-screen flex flex-col bg-stone-950" dir="rtl">
      <Navbar />

      {/* Lightbox */}
      {lbIdx !== null && photos.length > 0 && (
        <Lightbox photos={photos} startIdx={lbIdx} onClose={() => setLbIdx(null)} />
      )}

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 pt-4 pb-1 max-w-5xl">
        <nav className="text-xs text-stone-500 flex items-center gap-1.5 flex-wrap">
          <a href={`${BASE}/`} className="hover:text-amber-400 transition-colors">الرئيسية</a>
          <ChevronLeft className="w-3 h-3" />
          <a href={`${BASE}/chalets`} className="hover:text-amber-400 transition-colors">الشاليهات</a>
          <ChevronLeft className="w-3 h-3" />
          <span className="text-stone-300 font-medium truncate max-w-[160px]">{chalet.nameAr}</span>
        </nav>
      </div>

      <main className="flex-1 container mx-auto px-4 pb-28 md:pb-12 max-w-5xl space-y-6">

        {/* ── GALLERY ── */}
        <section>
          {/* Mobile: embla */}
          <div className="md:hidden relative rounded-2xl overflow-hidden bg-stone-800">
            {photos.length > 0 ? (
              <>
                <div className="overflow-hidden" ref={emblaRef}>
                  <div className="flex touch-pan-y">
                    {photos.map((url, i) => (
                      <div key={i} className="flex-none w-full aspect-[16/10]" onClick={() => setLbIdx(i)}>
                        <img src={`${BASE}${url}`} alt={`صورة ${i + 1}`}
                          className="w-full h-full object-cover cursor-zoom-in" />
                      </div>
                    ))}
                  </div>
                </div>
                {photos.length > 1 && (
                  <>
                    <button onClick={() => emblaApi?.scrollPrev()}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white backdrop-blur-sm">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={() => emblaApi?.scrollNext()}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white backdrop-blur-sm">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm">
                  {slideIdx + 1} / {photos.length}
                </div>
                <button onClick={() => setLbIdx(0)}
                  className="absolute bottom-3 left-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> عرض كامل
                </button>
              </>
            ) : (
              <div className="aspect-[16/10] flex items-center justify-center">
                <p className="text-5xl">🏕️</p>
              </div>
            )}
          </div>

          {/* Desktop: grid */}
          {photos.length > 0 && (
            <div className="hidden md:grid grid-cols-3 gap-1.5 rounded-2xl overflow-hidden h-[340px]">
              {/* Main image */}
              <div className="col-span-2 relative cursor-zoom-in group" onClick={() => setLbIdx(0)}>
                <img src={`${BASE}${photos[0]}`} alt="صورة 1"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {/* Secondary */}
              <div className="flex flex-col gap-1.5">
                {photos.slice(1, 3).map((url, i) => (
                  <div key={i} className="flex-1 relative cursor-zoom-in group overflow-hidden" onClick={() => setLbIdx(i + 1)}>
                    <img src={`${BASE}${url}`} alt={`صورة ${i + 2}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    {i === 1 && photos.length > 3 && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                        <span className="text-white font-bold text-xl">+{photos.length - 3}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── TWO COLUMNS ── */}
        <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── LEFT: INFO ── */}
          <div className="space-y-6">

            {/* Title + share */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl md:text-3xl font-extrabold text-stone-50 leading-snug">
                  {chalet.nameAr}
                </h1>
                <button
                  onClick={() => navigator.share?.({ title: chalet.nameAr, url: window.location.href })}
                  className="shrink-0 mt-1 w-9 h-9 rounded-full border border-stone-700 flex items-center justify-center hover:bg-stone-800 transition-colors"
                  aria-label="مشاركة"
                >
                  <Share2 className="w-4 h-4 text-stone-400" />
                </button>
              </div>

              {/* Location + badges */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-stone-400">
                {chalet.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    {chalet.location}{chalet.district && ` · ${chalet.district}`}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-amber-400 font-medium">تقييم عالٍ</span>
                </span>
                {chalet.isVerified && (
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" /> موثق
                  </span>
                )}
              </div>

              {/* Info chips */}
              <div className="flex flex-wrap gap-2 mt-3">
                {chalet.maxGuests && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-semibold">
                    <Users className="w-3.5 h-3.5" /> {chalet.maxGuests} ضيوف
                  </span>
                )}
                {chalet.bedrooms != null && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-semibold">
                    <BedDouble className="w-3.5 h-3.5" /> {chalet.bedrooms} غرف
                  </span>
                )}
                {fmt(chalet.priceWeekday) && (
                  <span className="inline-flex items-center gap-1.5 bg-stone-800 text-stone-300 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-semibold">
                    <DollarSign className="w-3.5 h-3.5 text-amber-500" /> يبدأ من {fmt(chalet.priceWeekday)}
                  </span>
                )}
                {chalet.propertyType && (
                  <span className="inline-flex items-center gap-1.5 bg-stone-800 text-stone-300 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-semibold">
                    {chalet.propertyType}
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {chalet.descriptionAr && (
              <p className="text-stone-300 leading-relaxed text-[15px] border-t border-stone-800 pt-5">
                {chalet.descriptionAr}
              </p>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div className="border-t border-stone-800 pt-5">
                <h2 className="text-base font-bold text-stone-100 mb-4">المرافق والمميزات</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-2">
                  {amenities.map(key => {
                    const { ar, icon } = amenityLabel(key);
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm text-stone-300">
                        <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-base shrink-0">
                          {icon}
                        </span>
                        {ar}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Map */}
            {(coords || chalet.mapsUrl) && (
              <div className="border-t border-stone-800 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-stone-100">الموقع</h2>
                  {chalet.mapsUrl && (
                    <a href={chalet.mapsUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                      <MapPin className="w-3.5 h-3.5" /> فتح في خرائط قوقل
                    </a>
                  )}
                </div>
                {coords ? (
                  <div className="rounded-xl overflow-hidden border border-stone-800 h-48">
                    <iframe title="map" width="100%" height="100%" style={{ border: 0 }} loading="lazy"
                      src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`} />
                  </div>
                ) : (
                  <a href={chalet.mapsUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 p-4 rounded-xl border border-stone-800 hover:border-amber-800/50 transition-colors">
                    <ExternalLink className="w-4 h-4" /> فتح الموقع على خرائط قوقل
                  </a>
                )}
              </div>
            )}

            {/* TERMS BOX — desktop full view */}
            {terms.length > 0 && (
              <div className="hidden md:block border-t border-stone-800 pt-5">
                <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/40 to-stone-900 p-5">
                  <h2 className="text-base font-bold text-amber-400 mb-4 flex items-center gap-2">
                    📋 شروط الشاليه
                  </h2>
                  <ul className="space-y-2.5">
                    {terms.map((t, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-amber-100/80">
                        <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Instagram */}
            {chalet.socialLink && (
              <div className="border-t border-stone-800 pt-5">
                <a href={chalet.socialLink} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border border-stone-800 hover:border-pink-800/60 hover:bg-pink-950/20 transition-colors group">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shrink-0 shadow-lg shadow-pink-900/30">
                    <Instagram className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-100 text-sm group-hover:text-pink-400 transition-colors">
                      تابع الشاليه على إنستغرام
                    </p>
                    <p className="text-xs text-stone-500 truncate">{chalet.socialLink}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-stone-600 mr-auto group-hover:text-pink-400 transition-colors shrink-0" />
                </a>
              </div>
            )}
          </div>

          {/* ── RIGHT: BOOKING CARD (desktop) ── */}
          <div className="hidden md:block sticky top-6">
            <BookingPanel chalet={chalet} />
          </div>
        </div>

        {/* Mobile: booking card */}
        <div className="md:hidden">
          <BookingPanel chalet={chalet} />
        </div>

      </main>

      {/* Mobile sticky bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-stone-950/95 backdrop-blur border-t border-stone-800 px-4 py-3 safe-b">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-100 truncate">{chalet.nameAr}</p>
            {fmt(chalet.priceWeekday) && (
              <p className="text-xs text-amber-400">يبدأ من {fmt(chalet.priceWeekday)}</p>
            )}
          </div>
          <button
            onClick={() => {
              const phone = chalet.whatsappNumber.replace(/\D/g, "");
              const termsBlock = terms.length
                ? "\n\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n")
                : "";
              const msg = `السلام عليكم، أرغب في حجز شاليه: ${chalet.nameAr}${termsBlock}`;
              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
            }}
            className="shrink-0 h-11 px-5 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-green-900/30"
          >
            <MessageCircle className="w-4 h-4" /> احجز الآن
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
