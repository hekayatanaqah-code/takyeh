import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  MapPin, Star, Users, BedDouble, Calendar, MessageCircle,
  ChevronLeft, ShieldCheck, CheckCircle2, ChevronDown, ChevronUp,
  Clock, Sun, Sunset, Zap, ChevronRight,
} from "lucide-react";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Hijri helper ── */
function toHijri(date: Date): string {
  try {
    const h = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      day: "numeric", month: "long", year: "numeric",
    }).format(date);
    const g = new Intl.DateTimeFormat("ar-SA", {
      day: "numeric", month: "long", year: "numeric",
    }).format(date);
    return `${h} — ${g}`;
  } catch {
    return date.toLocaleDateString("ar-SA");
  }
}

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

/* ── Slot icon ── */
function SlotIcon({ k }: { k: string }) {
  if (k === "morning") return <Sun className="w-5 h-5" />;
  if (k === "evening") return <Sunset className="w-5 h-5" />;
  return <Zap className="w-5 h-5" />;
}

export default function ChaletBooking() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: chalet, isLoading, error } = useQuery<DiamondData>({
    queryKey: ["chalet-master", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  const [date, setDate]     = useState("");
  const [period, setPeriod] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-5xl">🏕️</p>
            <p className="text-xl font-bold text-stone-100">الشاليه غير موجود</p>
          </div>
        </div>
      </div>
    );
  }

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const coverPhoto = photos[0] ?? null;
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");

  const slots = [
    chalet.slotMorning  && { key: "morning",  labelAr: "صباحي",    emoji: "🌅", price: fmt(chalet.priceMorning),  ci: chalet.morningCheckIn,  co: chalet.morningCheckOut  },
    chalet.slotEvening  && { key: "evening",  labelAr: "مسائي",    emoji: "🌙", price: fmt(chalet.priceEvening),  ci: chalet.eveningCheckIn,  co: chalet.eveningCheckOut  },
    chalet.slotFullDay  && { key: "fullday",  labelAr: "يوم كامل", emoji: "☀️", price: fmt(chalet.priceFullDay),  ci: chalet.fullDayCheckIn,  co: chalet.fullDayCheckOut  },
  ].filter(Boolean) as { key: string; labelAr: string; emoji: string; price: string | null; ci?: string | null; co?: string | null }[];

  const selectedSlot = slots.find(s => s.key === period);

  const handleBook = () => {
    if (!phone) return;
    let dateLine = "";
    if (date) { try { dateLine = toHijri(new Date(date)); } catch { dateLine = date; } }
    const termsBlock = terms.length ? "\n\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n") : "";
    const msg = [
      `السلام عليكم، أرغب في حجز شاليه: ${chalet.nameAr}`,
      dateLine && `📅 التاريخ: ${dateLine}`,
      selectedSlot?.labelAr && `🕐 الفترة: ${selectedSlot.emoji} ${selectedSlot.labelAr}`,
      selectedSlot?.price && `💰 السعر: ${selectedSlot.price}`,
      termsBlock,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const hasPrice = chalet.priceWeekday || chalet.priceWeekend || chalet.pricePerNight;

  return (
    <div className="min-h-screen flex flex-col bg-stone-950" dir="rtl">
      <Navbar />

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 pt-4 pb-2 max-w-5xl">
        <nav className="text-xs text-stone-500 flex items-center gap-1.5 flex-wrap">
          <a href={`${BASE}/`} className="hover:text-amber-400 transition-colors">الرئيسية</a>
          <ChevronLeft className="w-3 h-3" />
          <a href={`${BASE}/chalets`} className="hover:text-amber-400 transition-colors">الشاليهات</a>
          <ChevronLeft className="w-3 h-3" />
          <a href={`${BASE}/chalets/${id}`} className="hover:text-amber-400 transition-colors truncate max-w-[120px]">
            {chalet.nameAr}
          </a>
          <ChevronLeft className="w-3 h-3" />
          <span className="text-amber-400 font-semibold">الحجز</span>
        </nav>
      </div>

      <main className="flex-1 container mx-auto px-4 py-6 pb-28 md:pb-12 max-w-5xl">
        {/* ── Page title ── */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-extrabold text-stone-50 leading-snug">
            <span className="text-amber-400">احجز</span> شاليهك الآن
          </h1>
          <p className="text-stone-400 text-sm mt-1">أكمل التفاصيل وأرسل طلبك مباشرة للمالك</p>
        </div>

        {/* ── Two-column grid ── */}
        <div className="grid md:grid-cols-[1fr_380px] gap-6 items-start">

          {/* ════ LEFT: Booking Form ════ */}
          <div className="order-2 md:order-1">
            <div className="rounded-2xl border border-stone-800 bg-stone-900/80 shadow-2xl overflow-hidden">

              {/* Form header */}
              <div className="px-6 py-5 border-b border-stone-800 bg-gradient-to-l from-amber-950/30 to-stone-900">
                <p className="font-bold text-lg text-stone-50">تفاصيل الحجز</p>
                <p className="text-sm text-stone-400 mt-0.5">اختر التاريخ والفترة للمتابعة</p>
              </div>

              <div className="p-6 space-y-7">

                {/* ─ Date Field ─ */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-stone-200">
                    <span className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <Calendar className="w-4 h-4 text-amber-400" />
                    </span>
                    تاريخ الحجز
                    <span className="text-red-400 text-xs">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full h-12 rounded-xl border border-stone-700 bg-stone-800 px-4 pr-4 text-sm text-stone-100
                                 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50
                                 transition-all placeholder:text-stone-600
                                 [color-scheme:dark] cursor-pointer"
                    />
                  </div>
                  {date && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <p className="text-xs text-amber-400/90 font-medium">
                        {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
                      </p>
                    </div>
                  )}
                </div>

                {/* ─ Period Selector ─ */}
                {slots.length > 0 && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-bold text-stone-200">
                      <span className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-amber-400" />
                      </span>
                      الفترة المطلوبة
                      <span className="text-red-400 text-xs">*</span>
                    </label>
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(slots.length, 3)}, 1fr)` }}>
                      {slots.map(s => {
                        const active = period === s.key;
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setPeriod(s.key)}
                            className={`relative rounded-xl border p-3.5 text-center transition-all duration-200 group
                              ${active
                                ? "border-amber-500 bg-gradient-to-b from-amber-500/20 to-amber-600/10 shadow-lg shadow-amber-900/30"
                                : "border-stone-700 bg-stone-800 hover:border-amber-700/60 hover:bg-stone-750"
                              }`}
                          >
                            {active && (
                              <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-amber-400" />
                            )}
                            <p className="text-xl mb-1">{s.emoji}</p>
                            <p className={`font-bold text-sm ${active ? "text-amber-300" : "text-stone-200 group-hover:text-stone-100"}`}>
                              {s.labelAr}
                            </p>
                            {s.price && (
                              <p className={`text-xs mt-1 font-semibold ${active ? "text-amber-400" : "text-stone-400"}`}>
                                {s.price}
                              </p>
                            )}
                            {(s.ci || s.co) && (
                              <p className="text-[10px] mt-1.5 text-stone-500 leading-tight">
                                {s.ci && `دخول ${s.ci}`}
                                {s.ci && s.co && <br />}
                                {s.co && `خروج ${s.co}`}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ─ Price breakdown (weekday / weekend) ─ */}
                {(chalet.priceWeekday || chalet.priceWeekend) && (
                  <div className="rounded-xl bg-stone-800/60 border border-stone-700/60 p-4">
                    <p className="text-xs font-bold text-stone-400 mb-3 uppercase tracking-wider">الأسعار</p>
                    <div className="grid grid-cols-2 gap-3">
                      {chalet.priceWeekday && (
                        <div className="text-center">
                          <p className="text-[11px] text-stone-500 mb-0.5">وسط الأسبوع</p>
                          <p className="text-amber-300 font-bold text-sm">من {fmt(chalet.priceWeekday)}</p>
                        </div>
                      )}
                      {chalet.priceWeekend && (
                        <div className="text-center border-r border-stone-700">
                          <p className="text-[11px] text-stone-500 mb-0.5">نهاية الأسبوع</p>
                          <p className="text-amber-300 font-bold text-sm">من {fmt(chalet.priceWeekend)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─ Terms accordion ─ */}
                {terms.length > 0 && (
                  <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTermsOpen(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-amber-900/10 transition-colors"
                    >
                      <span className="text-sm font-bold text-amber-400 flex items-center gap-2">
                        📋 شروط الحجز
                        <span className="text-xs text-amber-500/60 font-normal">({terms.length} شرط)</span>
                      </span>
                      {termsOpen
                        ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-amber-500 shrink-0" />
                      }
                    </button>
                    {termsOpen && (
                      <div className="px-4 pb-4 space-y-2.5 border-t border-amber-700/20 pt-3">
                        {terms.map((t, i) => (
                          <div key={i} className="flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <span className="text-xs text-amber-100/80 leading-relaxed">{t}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!termsOpen && (
                      <p className="px-4 pb-3 text-[11px] text-amber-500/60 line-clamp-1">
                        {terms.slice(0, 2).map(t => `• ${t}`).join("  ·  ")}
                        {terms.length > 2 && ` · +${terms.length - 2}`}
                      </p>
                    )}
                  </div>
                )}

                {/* ─ CTA Button ─ */}
                {phone ? (
                  <button
                    onClick={handleBook}
                    className="w-full h-14 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] active:bg-[#1aab52]
                               text-white font-bold text-base flex items-center justify-center gap-3
                               transition-all duration-200 shadow-xl shadow-green-900/30
                               hover:shadow-green-900/50 hover:-translate-y-0.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    احجز الآن عبر واتساب
                  </button>
                ) : (
                  <div className="w-full h-14 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center">
                    <p className="text-stone-500 text-sm">لا يوجد رقم تواصل متاح</p>
                  </div>
                )}

                {/* Trust badge */}
                <div className="flex items-center justify-center gap-2 text-[11px] text-stone-500 pt-1">
                  <ShieldCheck className="w-4 h-4 text-amber-600/60" />
                  <span>
                    ضمان <span className="text-amber-600/80 font-semibold">حكاية أناقة</span> — تأكد من الحساب قبل الدفع
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ════ RIGHT: Chalet Summary Card ════ */}
          <div className="order-1 md:order-2 md:sticky md:top-6">
            <div className="rounded-2xl border border-stone-800 bg-stone-900 shadow-2xl overflow-hidden">

              {/* Cover photo */}
              <div className="relative aspect-[4/3] overflow-hidden bg-stone-800">
                {coverPhoto ? (
                  <>
                    <img
                      src={coverPhoto}
                      alt={chalet.nameAr}
                      className="w-full h-full object-cover"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/20 to-transparent" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-600">
                    <span className="text-6xl">🏕️</span>
                  </div>
                )}

                {/* Category badge */}
                {chalet.category && (
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-xs text-amber-300 font-semibold">
                    {chalet.category}
                  </div>
                )}

                {/* Verified badge */}
                {chalet.isVerified && (
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-amber-500/90 text-[11px] text-stone-900 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3" /> موثوق
                  </div>
                )}

                {/* Photo count */}
                {photos.length > 1 && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs text-white bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <span>📷</span>
                    <span>{photos.length} صور</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-5 space-y-4">
                {/* Name */}
                <div>
                  <h2 className="text-xl font-extrabold text-stone-50 leading-snug">{chalet.nameAr}</h2>
                  {(chalet.location || chalet.district) && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-sm text-stone-400">
                        {[chalet.district, chalet.location].filter(Boolean).join("، ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-sm text-stone-400">
                  {chalet.maxGuests && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-amber-500/70" />
                      <span>{chalet.maxGuests} ضيف</span>
                    </div>
                  )}
                  {chalet.bedrooms && (
                    <div className="flex items-center gap-1.5">
                      <BedDouble className="w-4 h-4 text-amber-500/70" />
                      <span>{chalet.bedrooms} غرف</span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-stone-800" />

                {/* Price highlight */}
                {hasPrice && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">تفاصيل الأسعار</p>
                    <div className="grid grid-cols-2 gap-2">
                      {chalet.priceWeekday && (
                        <div className="rounded-xl bg-stone-800/80 border border-stone-700/60 p-3 text-center">
                          <p className="text-[10px] text-stone-500 mb-1">وسط الأسبوع</p>
                          <p className="text-amber-300 font-bold text-sm leading-tight">
                            {fmt(chalet.priceWeekday)}
                          </p>
                          <p className="text-[10px] text-stone-600 mt-0.5">/ ليلة</p>
                        </div>
                      )}
                      {chalet.priceWeekend && (
                        <div className="rounded-xl bg-stone-800/80 border border-stone-700/60 p-3 text-center">
                          <p className="text-[10px] text-stone-500 mb-1">نهاية الأسبوع</p>
                          <p className="text-amber-300 font-bold text-sm leading-tight">
                            {fmt(chalet.priceWeekend)}
                          </p>
                          <p className="text-[10px] text-stone-600 mt-0.5">/ ليلة</p>
                        </div>
                      )}
                      {!chalet.priceWeekday && !chalet.priceWeekend && chalet.pricePerNight && (
                        <div className="col-span-2 rounded-xl bg-stone-800/80 border border-stone-700/60 p-3 text-center">
                          <p className="text-[10px] text-stone-500 mb-1">السعر لليلة</p>
                          <p className="text-amber-300 font-bold text-base">{fmt(chalet.pricePerNight)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Slot prices */}
                {slots.length > 0 && (
                  <div className="space-y-2">
                    {slots.map(s => (
                      <div key={s.key} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-stone-400 flex items-center gap-2">
                          <span>{s.emoji}</span>
                          <span>فترة {s.labelAr}</span>
                        </span>
                        <span className="text-sm font-bold text-amber-300">
                          {s.price ?? "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Check-in times */}
                {(chalet.checkInTime || chalet.checkOutTime) && (
                  <div className="rounded-xl bg-stone-800/50 border border-stone-700/40 px-4 py-3 flex items-center justify-between">
                    {chalet.checkInTime && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <div>
                          <p className="text-[10px] text-stone-500">تسجيل دخول</p>
                          <p className="text-sm font-bold text-stone-200">{chalet.checkInTime}</p>
                        </div>
                      </div>
                    )}
                    {chalet.checkOutTime && (
                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <p className="text-[10px] text-stone-500">تسجيل خروج</p>
                          <p className="text-sm font-bold text-stone-200">{chalet.checkOutTime}</p>
                        </div>
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                    )}
                  </div>
                )}

                {/* Back link */}
                <a
                  href={`${BASE}/chalets/${id}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-stone-700 hover:border-stone-600 text-sm text-stone-400 hover:text-stone-200 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                  عرض تفاصيل الشاليه
                </a>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-stone-950/95 backdrop-blur border-t border-stone-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-100 truncate">{chalet.nameAr}</p>
            {hasPrice && (
              <p className="text-xs text-amber-400">
                {chalet.priceWeekday
                  ? `يبدأ من ${fmt(chalet.priceWeekday)}`
                  : fmt(chalet.pricePerNight) ?? ""
                }
              </p>
            )}
          </div>
          {phone && (
            <button
              onClick={handleBook}
              className="shrink-0 h-11 px-5 rounded-2xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold text-sm flex items-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> احجز الآن
            </button>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
