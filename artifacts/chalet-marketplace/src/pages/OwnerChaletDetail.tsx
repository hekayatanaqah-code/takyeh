import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, Edit2, MapPin, Phone, Users, BedDouble, Star,
  Clock, FileText, ExternalLink, ChevronLeft, ChevronRight,
  Building2, CheckCircle, AlertCircle, Clock3, XCircle, Loader2,
} from "lucide-react";
import { toAr } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

/* ── Amenity / Category maps ── */
const AMENITY_MAP: Record<string, { ar: string; icon: string }> = {
  pool: { ar: "مسبح", icon: "🏊" },
  kids_games: { ar: "ألعاب أطفال", icon: "🎠" },
  private_majlis: { ar: "مجالس مستقلة", icon: "🛋️" },
  bbq: { ar: "ركن شواء", icon: "🔥" },
  kitchen: { ar: "مطبخ مجهز", icon: "🍳" },
  wifi: { ar: "واي فاي", icon: "📶" },
  ac: { ar: "مكيف", icon: "❄️" },
  parking: { ar: "موقف سيارات", icon: "🅿️" },
  garden: { ar: "حديقة", icon: "🌿" },
  gym: { ar: "صالة رياضية", icon: "🏋️" },
  cinema: { ar: "سينما خارجية", icon: "🎬" },
  jacuzzi: { ar: "جاكوزي", icon: "🛁" },
  football: { ar: "ملعب كرة قدم", icon: "⚽" },
  billiards: { ar: "بلياردو", icon: "🎱" },
  table_tennis: { ar: "تنس طاولة", icon: "🏓" },
  indoor_pool: { ar: "مسبح داخلي", icon: "🏊" },
  outdoor_pool: { ar: "مسبح خارجي", icon: "🌊" },
  sauna: { ar: "ساونا", icon: "🧖" },
  private_beach: { ar: "شاطئ خاص", icon: "🏖️" },
  security: { ar: "حراسة أمنية", icon: "🔒" },
  generator: { ar: "مولد كهربائي", icon: "⚡" },
  laundry: { ar: "غسالة", icon: "🫧" },
  bbq_outdoor: { ar: "شواء خارجي", icon: "🍖" },
  prayer_room: { ar: "غرفة صلاة", icon: "🕌" },
  baby_items: { ar: "مستلزمات أطفال", icon: "🍼" },
  fire_pit: { ar: "موقد نار", icon: "🪵" },
  pets_allowed: { ar: "يسمح بالحيوانات", icon: "🐾" },
  smart_tv: { ar: "شاشة ذكية", icon: "📺" },
  game_room: { ar: "غرفة ألعاب", icon: "🎮" },
  large_garden: { ar: "حديقة واسعة", icon: "🌳" },
  other: { ar: "مرافق إضافية", icon: "✨" },
};

const CATEGORY_MAP: Record<string, string> = {
  villa: "🏰 فيلا",
  chalet: "🏡 شاليه",
  farm: "🌾 مزرعة",
  apartment: "🏢 شقة",
  resort: "🏖️ منتجع",
  camp: "⛺ مخيم",
};

const SECTIONS_MAP: Record<string, string> = {
  families: "👨‍👩‍👧‍👦 عوائل",
  singles: "🧑 عزاب",
  mixed: "👥 مختلط",
  women: "👩 نساء",
};

function resolveAmenity(raw: string): { ar: string; icon: string } {
  const t = raw.trim();
  if (AMENITY_MAP[t]) return AMENITY_MAP[t];
  const ci = t.indexOf(":");
  if (ci !== -1) { const after = t.slice(ci + 1).trim(); if (after) return { ar: after, icon: "✨" }; }
  if (/[\u0600-\u06FF]/.test(t)) return { ar: t, icon: "✨" };
  return { ar: t.replace(/_/g, " "), icon: "✨" };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    pending: { label: "قيد المراجعة", icon: <Clock3 className="w-3.5 h-3.5" />, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    approved: { label: "مفعّل", icon: <CheckCircle className="w-3.5 h-3.5" />, className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    rejected: { label: "مرفوض", icon: <XCircle className="w-3.5 h-3.5" />, className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.className}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function fmtPrice(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

/* ── Photo carousel ── */
function PhotoCarousel({ photos, storageBase }: { photos: string[]; storageBase: string }) {
  const [idx, setIdx] = useState(0);
  if (!photos.length) {
    return (
      <div className="rounded-2xl bg-muted/40 border border-border flex items-center justify-center h-52">
        <p className="text-muted-foreground text-sm">لا توجد صور</p>
      </div>
    );
  }
  const resolveUrl = (u: string) => u.startsWith("http") ? u : `${storageBase}${u}`;
  return (
    <div className="relative rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9", maxHeight: 340 }}>
      <img
        key={idx}
        src={resolveUrl(photos[idx])}
        alt={`صورة ${idx + 1}`}
        className="w-full h-full object-cover"
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIdx((p) => (p - 1 + photos.length) % photos.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIdx((p) => (p + 1) % photos.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            {toAr(idx + 1)} / {toAr(photos.length)}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Thumbnail strip ── */
function PhotoStrip({ photos, storageBase }: { photos: string[]; storageBase: string }) {
  const resolveUrl = (u: string) => u.startsWith("http") ? u : `${storageBase}${u}`;
  if (photos.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
      {photos.map((p, i) => (
        <img
          key={i}
          src={resolveUrl(p)}
          alt={`مصغر ${i + 1}`}
          className="w-16 h-12 object-cover rounded-lg border border-border shrink-0"
        />
      ))}
    </div>
  );
}

/* ── Section card ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

/* ── Main page ── */
export default function OwnerChaletDetail() {
  const params = useParams<{ id: string }>();
  const submissionId = params?.id;
  const [, navigate] = useLocation();

  const { data: sub, isLoading, error } = useQuery({
    queryKey: ["owner", "submission", submissionId],
    queryFn: async () => {
      const r = await apiFetch(`/owner/submissions/${submissionId}`);
      if (!r.ok) throw new Error("لم يتم العثور على الشاليه");
      return r.json();
    },
    enabled: !!submissionId,
  });

  const storageBase = `${BASE}/api`;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-4" dir="rtl">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg font-bold">تعذّر تحميل بيانات الشاليه</p>
        <Link href="/dashboard">
          <Button variant="outline">العودة للوحة التحكم</Button>
        </Link>
      </div>
    );
  }

  const editUrl = `/add-chalet?editId=${submissionId}`;

  const photos: string[] = Array.isArray(sub.photos) ? sub.photos : [];
  const amenities: string[] = Array.isArray(sub.amenities) ? sub.amenities : [];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/dashboard">
              <button className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/60 transition-colors text-muted-foreground">
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight truncate">{sub.nameAr}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                {statusBadge(sub.status)}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5 rounded-xl shrink-0"
            onClick={() => navigate(editUrl)}
          >
            <Edit2 className="w-3.5 h-3.5" />
            تعديل
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Photos */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <PhotoCarousel photos={photos} storageBase={storageBase} />
          <PhotoStrip photos={photos} storageBase={storageBase} />
        </motion.div>

        {/* Basic Info */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Section title="المعلومات الأساسية">
            <div className="grid grid-cols-2 gap-3">
              {sub.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">المدينة</p>
                    <p className="text-sm font-semibold">{sub.location}</p>
                    {sub.district && <p className="text-xs text-muted-foreground">{sub.district}</p>}
                  </div>
                </div>
              )}
              {sub.whatsappNumber && (
                <div className="flex items-start gap-2">
                  <Phone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">واتساب</p>
                    <p className="text-sm font-semibold" dir="ltr">{sub.whatsappNumber}</p>
                  </div>
                </div>
              )}
              {sub.maxGuests && (
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">سعة الضيوف</p>
                    <p className="text-sm font-semibold">{toAr(sub.maxGuests)} ضيف</p>
                  </div>
                </div>
              )}
              {sub.bedrooms != null && (
                <div className="flex items-start gap-2">
                  <BedDouble className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">الغرف</p>
                    <p className="text-sm font-semibold">{toAr(sub.bedrooms)} غرفة</p>
                  </div>
                </div>
              )}
              {sub.propertyType && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">النوع</p>
                    <p className="text-sm font-semibold">{CATEGORY_MAP[sub.propertyType] ?? sub.propertyType}</p>
                  </div>
                </div>
              )}
              {sub.sections && (
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">الأقسام</p>
                    <p className="text-sm font-semibold">{SECTIONS_MAP[sub.sections] ?? sub.sections}</p>
                  </div>
                </div>
              )}
            </div>
            {(sub.mapsUrl || sub.socialLink) && (
              <div className="flex gap-2 pt-1 flex-wrap">
                {sub.mapsUrl && (
                  <a href={sub.mapsUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 rounded-xl">
                      <ExternalLink className="w-3 h-3" />
                      خريطة جوجل
                    </Button>
                  </a>
                )}
                {sub.socialLink && (
                  <a href={sub.socialLink} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 rounded-xl">
                      <ExternalLink className="w-3 h-3" />
                      حساب التواصل
                    </Button>
                  </a>
                )}
              </div>
            )}
          </Section>
        </motion.div>

        {/* Pricing */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Section title="الأسعار">
            <div className="space-y-2">
              {[
                { label: "☀️ الفترة الصباحية", price: sub.priceMorning, slot: sub.slotMorning, checkIn: sub.morningCheckIn, checkOut: sub.morningCheckOut },
                { label: "🌙 الفترة المسائية", price: sub.priceEvening, slot: sub.slotEvening, checkIn: sub.eveningCheckIn, checkOut: sub.eveningCheckOut },
                { label: "📅 يوم كامل", price: sub.priceFullDay, slot: sub.slotFullDay, checkIn: sub.fullDayCheckIn, checkOut: sub.fullDayCheckOut },
              ].map(({ label, price, slot, checkIn, checkOut }) => (
                (price || slot) ? (
                  <div key={label} className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{label}</p>
                      {(checkIn || checkOut) && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {checkIn && `${checkIn}`}{checkIn && checkOut && " — "}{checkOut && `${checkOut}`}
                        </p>
                      )}
                    </div>
                    <div className="text-left">
                      {price ? (
                        <p className="text-base font-bold text-primary">{fmtPrice(price)}</p>
                      ) : (
                        <span className="text-xs text-muted-foreground">متاح</span>
                      )}
                    </div>
                  </div>
                ) : null
              ))}
              {!sub.priceMorning && !sub.priceEvening && !sub.priceFullDay && (
                <p className="text-sm text-muted-foreground text-center py-2">لم يتم تحديد الأسعار بعد</p>
              )}
            </div>
            {/* Daily price grid summary */}
            {sub.dailyPrices && Object.keys(sub.dailyPrices).length > 0 && (
              <div className="mt-2 rounded-xl bg-primary/5 border border-primary/10 px-3 py-2">
                <p className="text-xs font-semibold text-primary mb-1.5">جدول الأسعار الأسبوعي</p>
                {(() => {
                  const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
                  const dp = sub.dailyPrices as Record<string, Record<string, number>>;
                  return (
                    <div className="grid grid-cols-7 gap-1">
                      {[0,1,2,3,4,5,6].map((d) => {
                        const prices = Object.values(dp).map((periods) => periods[String(d)]).filter(Boolean);
                        const min = prices.length ? Math.min(...prices) : null;
                        return (
                          <div key={d} className="text-center">
                            <p className="text-[9px] text-muted-foreground">{days[d].slice(0,3)}</p>
                            <p className="text-[10px] font-bold">{min ? toAr(min) : "—"}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </Section>
        </motion.div>

        {/* Description */}
        {sub.descriptionAr && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Section title="الوصف">
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{sub.descriptionAr}</p>
            </Section>
          </motion.div>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
            <Section title={`المرافق والخدمات (${toAr(amenities.length)})`}>
              <div className="flex flex-wrap gap-2">
                {amenities.map((a) => {
                  const { ar, icon } = resolveAmenity(a);
                  return (
                    <span key={a} className="inline-flex items-center gap-1.5 text-sm bg-primary/8 text-primary rounded-full px-3 py-1.5 font-medium border border-primary/15">
                      <span>{icon}</span>{ar}
                    </span>
                  );
                })}
              </div>
            </Section>
          </motion.div>
        )}

        {/* Terms & Conditions */}
        {sub.termsAndConditions && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
            <Section title="الشروط والأحكام">
              <div className="rounded-xl bg-muted/30 p-3">
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{sub.termsAndConditions}</p>
              </div>
            </Section>
          </motion.div>
        )}

        {/* Video */}
        {sub.videoUrl && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <Section title="الفيديو التعريفي">
              <video
                src={sub.videoUrl.startsWith("http") ? sub.videoUrl : `${storageBase}${sub.videoUrl}`}
                controls
                className="w-full rounded-xl max-h-72 object-cover"
              />
            </Section>
          </motion.div>
        )}

        {/* Edit CTA */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-sm">تعديل بيانات الشاليه</p>
              <p className="text-xs text-muted-foreground mt-0.5">تعديل الصور والأسعار والمرافق والوصف وجميع التفاصيل</p>
            </div>
            <Button className="gap-1.5 rounded-xl shrink-0" onClick={() => navigate(editUrl)}>
              <Edit2 className="w-4 h-4" />
              تعديل
            </Button>
          </div>
        </motion.div>

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
