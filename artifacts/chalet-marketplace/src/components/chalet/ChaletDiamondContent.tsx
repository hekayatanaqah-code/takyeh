/**
 * ChaletDiamondContent — shared Diamond Edition display component.
 * Props-driven: no data fetching, no Navbar/Footer.
 * Used in both ChaletMasterView (full page) and SubmissionReviewModal (admin popup).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  MapPin, Star, Users, BedDouble, Share2,
  ChevronLeft, ChevronRight, X, Instagram,
  ShieldCheck, MessageCircle, Calendar,
  CheckCircle2, ChevronDown, ChevronUp, ExternalLink,
  DollarSign,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─── helpers ─── */
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
  const day = date.toLocaleDateString("ar-SA-u-ca-islamic", { weekday: "long" });
  const h   = date.toLocaleDateString("ar-SA-u-ca-islamic", { year: "numeric", month: "numeric", day: "numeric" });
  const g   = date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory" });
  return `${day} ${h} هـ — ${g} م`;
}

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

function extractCoords(url?: string | null) {
  if (!url) return null;
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

/* ─── shared data type ─── */
export interface DiamondData {
  id?: number;
  nameAr: string;
  descriptionAr?: string | null;
  location?: string | null;
  district?: string | null;
  maxGuests?: number | null;
  bedrooms?: number | null;
  propertyType?: string | null;
  sections?: string | null;
  amenities?: string[] | null;
  photos?: string[] | null;
  whatsappNumber?: string | null;
  mapsUrl?: string | null;
  socialLink?: string | null;
  termsAndConditions?: string | null;
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

/* ─── Lightbox ─── */
function Lightbox({ photos, startIdx, onClose }: { photos: string[]; startIdx: number; onClose: () => void }) {
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

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/96 flex items-center justify-center"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const d = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(d) > 40) d > 0 ? next() : prev();
        touchX.current = null;
      }}
    >
      <button onClick={onClose}
        className="absolute top-5 left-5 z-10 w-11 h-11 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center border border-white/20 transition-colors"
        aria-label="إغلاق">
        <X className="w-5 h-5 text-white" />
      </button>
      <div className="absolute top-5 right-5 text-white/80 text-sm bg-black/40 px-3 py-1 rounded-full">
        {idx + 1} / {photos.length}
      </div>
      <button onClick={prev}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-amber-500/60 flex items-center justify-center border border-white/20 transition-colors"
        aria-label="السابق">
        <ChevronRight className="w-6 h-6 text-white" />
      </button>
      <img src={photos[idx]} alt={`صورة ${idx + 1}`}
        className="max-h-[88vh] max-w-[92vw] object-contain rounded-xl select-none shadow-2xl" draggable={false} />
      <button onClick={next}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 hover:bg-amber-500/60 flex items-center justify-center border border-white/20 transition-colors"
        aria-label="التالي">
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>
      {photos.length > 1 && (
        <div className="absolute bottom-5 flex gap-2.5">
          {photos.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? "w-6 h-2.5 bg-amber-400" : "w-2.5 h-2.5 bg-white/35 hover:bg-white/60"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Booking panel (shown in page mode only) ─── */
function BookingPanel({ data }: { data: DiamondData }) {
  const [date, setDate]     = useState("");
  const [period, setPeriod] = useState<string | null>(null);
  const [open, setOpen]     = useState(false);

  const terms = (data.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

  const slots = [
    data.slotMorning && { key: "morning",  label: "🌅 صباحي",    price: fmt(data.priceMorning),  ci: data.morningCheckIn,  co: data.morningCheckOut },
    data.slotEvening && { key: "evening",  label: "🌙 مسائي",    price: fmt(data.priceEvening),  ci: data.eveningCheckIn,  co: data.eveningCheckOut },
    data.slotFullDay && { key: "fullday",  label: "☀️ يوم كامل", price: fmt(data.priceFullDay),  ci: data.fullDayCheckIn,  co: data.fullDayCheckOut },
  ].filter(Boolean) as { key: string; label: string; price: string | null; ci?: string | null; co?: string | null }[];

  const handleWhatsApp = () => {
    if (!data.whatsappNumber) return;
    const phone = data.whatsappNumber.replace(/\D/g, "");
    let dateLine = "";
    if (date) { try { dateLine = toHijri(new Date(date)); } catch { dateLine = date; } }
    const slotLabel = slots.find(s => s.key === period)?.label ?? "";
    const slotPrice = slots.find(s => s.key === period)?.price ?? "";
    const termsBlock = terms.length ? "\n\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n") : "";
    const msg = [
      `السلام عليكم، أرغب في حجز شاليه: ${data.nameAr}`,
      dateLine  && `📅 التاريخ: ${dateLine}`,
      slotLabel && `🕐 الفترة: ${slotLabel}`,
      slotPrice && `💰 السعر: ${slotPrice}`,
      termsBlock,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="rounded-2xl border border-amber-900/30 bg-stone-900 shadow-xl overflow-hidden">
      <div className="bg-gradient-to-l from-amber-900/40 to-stone-900 border-b border-amber-900/30 px-5 py-4">
        <p className="font-bold text-amber-300 text-sm">تواصل مع المالك</p>
        <p className="text-xs text-stone-400 mt-0.5">اختر الفترة وأرسل طلب الحجز مباشرة</p>
      </div>
      <div className="p-5 space-y-4">
        {(data.priceWeekday || data.priceWeekend) && (
          <div className="grid grid-cols-2 gap-2">
            {data.priceWeekday && (
              <div className="rounded-xl bg-stone-800 border border-stone-700 p-3 text-center">
                <p className="text-[11px] text-stone-400 mb-1">وسط الأسبوع</p>
                <p className="text-amber-300 font-bold text-sm">من {fmt(data.priceWeekday)}</p>
              </div>
            )}
            {data.priceWeekend && (
              <div className="rounded-xl bg-stone-800 border border-stone-700 p-3 text-center">
                <p className="text-[11px] text-stone-400 mb-1">نهاية الأسبوع</p>
                <p className="text-amber-300 font-bold text-sm">من {fmt(data.priceWeekend)}</p>
              </div>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            تاريخ الحجز <span className="text-red-400">*</span>
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full h-10 rounded-xl border border-stone-700 bg-stone-800 px-3 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
          {date && (
            <p className="text-[11px] text-amber-400/80 pr-1">
              {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
            </p>
          )}
        </div>
        {slots.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-stone-300">الفترة <span className="text-red-400">*</span></p>
            <div className={`grid gap-2 grid-cols-${Math.min(slots.length, 3)}`}>
              {slots.map(s => (
                <button key={s.key} type="button" onClick={() => setPeriod(s.key)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition-all text-xs ${
                    period === s.key ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-stone-700 bg-stone-800 hover:border-amber-700 text-stone-300"
                  }`}>
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
        {terms.length > 0 && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 overflow-hidden">
            <button type="button" onClick={() => setOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold text-amber-400">📋 شروط الشاليه</span>
              {open ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-500" />}
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
        {data.whatsappNumber && (
          <button onClick={handleWhatsApp}
            className="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-base flex items-center justify-center gap-2.5 transition-colors shadow-lg shadow-green-900/30">
            <MessageCircle className="w-5 h-5" />
            احجز الآن عبر واتساب
          </button>
        )}
        <p className="text-center text-[11px] text-stone-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600/70" />
          ضمان <span className="text-amber-600/80 font-semibold">حكاية أناقة</span> — تأكد من الحساب قبل الدفع
        </p>
      </div>
    </div>
  );
}

/* ─── Main exported component ─── */
interface Props {
  data: DiamondData;
  /** "page" = full two-column layout with booking panel (used in ChaletMasterView)
   *  "modal" = single-column compact layout without booking panel (used in admin modal) */
  mode?: "page" | "modal";
}

export function ChaletDiamondContent({ data, mode = "page" }: Props) {
  const photos: string[] = Array.isArray(data.photos) ? data.photos : [];
  const amenities: string[] = Array.isArray(data.amenities) ? data.amenities : [];
  const terms = (data.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const coords = extractCoords(data.mapsUrl);

  const [emblaRef, emblaApi] = useEmblaCarousel({ direction: "rtl", loop: true });
  const [slideIdx, setSlideIdx] = useState(0);
  const [lbIdx, setLbIdx]       = useState<number | null>(null);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", () => setSlideIdx(emblaApi.selectedScrollSnap()));
  }, [emblaApi]);

  const isModal = mode === "modal";

  return (
    <div className="bg-stone-950 text-stone-100" dir="rtl">

      {/* Lightbox */}
      {lbIdx !== null && photos.length > 0 && (
        <Lightbox photos={photos} startIdx={lbIdx} onClose={() => setLbIdx(null)} />
      )}

      {/* ── GALLERY ── */}
      {photos.length > 0 && (
        <div className="mb-6">
          {/* Mobile / modal single-row carousel */}
          <div className={isModal ? "block" : "md:hidden"}>
            <div className="relative rounded-2xl overflow-hidden bg-stone-800">
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex touch-pan-y">
                  {photos.map((url, i) => (
                    <div key={i} className="flex-none w-full aspect-[16/9]" onClick={() => setLbIdx(i)}>
                      <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover cursor-zoom-in" />
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
            </div>
          </div>

          {/* Desktop grid (page mode only) */}
          {!isModal && (
            <div className="hidden md:grid grid-cols-3 gap-1.5 rounded-2xl overflow-hidden h-[320px]">
              <div className="col-span-2 relative cursor-zoom-in group" onClick={() => setLbIdx(0)}>
                <img src={photos[0]} alt="صورة 1" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
              </div>
              <div className="flex flex-col gap-1.5">
                {photos.slice(1, 3).map((url, i) => (
                  <div key={i} className="flex-1 relative cursor-zoom-in group overflow-hidden" onClick={() => setLbIdx(i + 1)}>
                    <img src={url} alt={`صورة ${i + 2}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
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
        </div>
      )}

      {/* ── CONTENT ── */}
      <div className={isModal ? "space-y-5 px-1" : "grid md:grid-cols-[1fr_320px] gap-6 items-start"}>

        {/* Left / main column */}
        <div className="space-y-5">

          {/* Title */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className={`font-extrabold text-stone-50 leading-snug ${isModal ? "text-xl" : "text-2xl md:text-3xl"}`}>
                {data.nameAr}
              </h2>
              {!isModal && (
                <button
                  onClick={() => navigator.share?.({ title: data.nameAr, url: window.location.href })}
                  className="shrink-0 mt-1 w-9 h-9 rounded-full border border-stone-700 flex items-center justify-center hover:bg-stone-800 transition-colors"
                  aria-label="مشاركة">
                  <Share2 className="w-4 h-4 text-stone-400" />
                </button>
              )}
            </div>

            {/* Location + badges */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-stone-400">
              {data.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-500" />
                  {data.location}{data.district && ` · ${data.district}`}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="text-amber-400 font-medium">تقييم عالٍ</span>
              </span>
              {data.isVerified && (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> موثق
                </span>
              )}
            </div>

            {/* Chips */}
            <div className="flex flex-wrap gap-2 mt-3">
              {data.maxGuests && (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-semibold">
                  <Users className="w-3.5 h-3.5" /> {data.maxGuests} ضيوف
                </span>
              )}
              {data.bedrooms != null && (
                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-xl px-3 py-1.5 text-xs font-semibold">
                  <BedDouble className="w-3.5 h-3.5" /> {data.bedrooms} غرف
                </span>
              )}
              {fmt(data.priceWeekday) && (
                <span className="inline-flex items-center gap-1.5 bg-stone-800 text-stone-300 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-semibold">
                  <DollarSign className="w-3.5 h-3.5 text-amber-500" /> يبدأ من {fmt(data.priceWeekday)}
                </span>
              )}
              {data.propertyType && (
                <span className="inline-flex items-center gap-1.5 bg-stone-800 text-stone-300 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-semibold">
                  {data.propertyType}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {data.descriptionAr && (
            <p className="text-stone-300 leading-relaxed text-sm border-t border-stone-800 pt-4">
              {data.descriptionAr}
            </p>
          )}

          {/* Amenities */}
          {amenities.length > 0 && (
            <div className="border-t border-stone-800 pt-4">
              <h3 className="text-sm font-bold text-stone-100 mb-3">المرافق والمميزات</h3>
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-2">
                {amenities.map(key => {
                  const { ar, icon } = amenityLabel(key);
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm text-stone-300">
                      <span className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-base shrink-0">{icon}</span>
                      {ar}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Map */}
          {(coords || data.mapsUrl) && (
            <div className="border-t border-stone-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-stone-100">الموقع</h3>
                {data.mapsUrl && (
                  <a href={data.mapsUrl} target="_blank" rel="noreferrer"
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
                    <MapPin className="w-3.5 h-3.5" /> فتح في خرائط قوقل
                  </a>
                )}
              </div>
              {coords && !isModal ? (
                <div className="rounded-xl overflow-hidden border border-stone-800 h-44">
                  <iframe title="map" width="100%" height="100%" style={{ border: 0 }} loading="lazy"
                    src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&z=15&output=embed`} />
                </div>
              ) : data.mapsUrl ? (
                <a href={data.mapsUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 p-3 rounded-xl border border-stone-800 hover:border-amber-800/50 transition-colors">
                  <ExternalLink className="w-4 h-4" /> فتح الموقع على خرائط قوقل
                </a>
              ) : null}
            </div>
          )}

          {/* Terms box */}
          {terms.length > 0 && (
            <div className="border-t border-stone-800 pt-4">
              <div className="rounded-2xl border border-amber-700/40 bg-gradient-to-br from-amber-950/40 to-stone-900 p-5">
                <h3 className="text-sm font-bold text-amber-400 mb-4 flex items-center gap-2">
                  📋 شروط الشاليه
                </h3>
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
          {data.socialLink && (
            <div className="border-t border-stone-800 pt-4">
              <a href={data.socialLink} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 p-4 rounded-xl border border-stone-800 hover:border-pink-800/60 hover:bg-pink-950/20 transition-colors group">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-stone-100 text-sm group-hover:text-pink-400 transition-colors">تابع الشاليه على إنستغرام</p>
                  <p className="text-xs text-stone-500 truncate">{data.socialLink}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-stone-600 mr-auto group-hover:text-pink-400 transition-colors shrink-0" />
              </a>
            </div>
          )}
        </div>

        {/* Right column: booking panel (page mode only) */}
        {!isModal && (
          <div className="hidden md:block sticky top-6">
            <BookingPanel data={data} />
          </div>
        )}
      </div>

      {/* Mobile booking panel (page mode only) */}
      {!isModal && (
        <div className="md:hidden mt-6">
          <BookingPanel data={data} />
        </div>
      )}
    </div>
  );
}
