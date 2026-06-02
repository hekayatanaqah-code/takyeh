import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";
import { toAr } from "@/lib/utils";
import { toHijri } from "@/lib/hijri";
import { resolveAmenity } from "@/lib/amenityUtils";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";

/* Fix leaflet default icon when bundled with Vite */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ─────────────────── Category / sections maps ─────────────────── */
const CATEGORY_MAP: Record<string, { ar: string; icon: string }> = {
  villa:        { ar: "فيلا",         icon: "🏰" },
  chalet:       { ar: "شاليه",        icon: "🏡" },
  farm:         { ar: "مزرعة",        icon: "🌾" },
  apartment:    { ar: "شقة",          icon: "🏢" },
  resort:       { ar: "منتجع",        icon: "🏖️" },
};

const SECTIONS_MAP: Record<string, { ar: string; icon: string }> = {
  families:     { ar: "قسم عوائل",   icon: "👨‍👩‍👧‍👦" },
  singles:      { ar: "قسم عزاب",    icon: "🧑" },
  mixed:        { ar: "مختلط",        icon: "👥" },
  women:        { ar: "قسم نساء",     icon: "👩" },
};

/* ─────────────────── Helpers ─────────────────── */
function fmt(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

/**
 * Look up the per-day-of-week price for a given period.
 * Returns null if dailyPrices is not set or the specific day is not configured.
 * Falls back to the caller using the base priceMorning/priceEvening/priceFullDay.
 */
function getDayPrice(
  daily: Record<string, Record<string, number>> | null | undefined,
  period: "morning" | "evening" | "fullday",
  dateStr: string
): number | null {
  if (!daily || !dateStr) return null;
  try {
    const dayIdx = new Date(dateStr + "T12:00:00").getDay(); // 0=Sun…6=Sat
    const dayMap = daily[period];
    if (!dayMap) return null;
    const price = dayMap[String(dayIdx)];
    return price != null ? price : null;
  } catch { return null; }
}

const DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function toDateWithDay(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const day  = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
    const full = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long", year: "numeric" }).format(d);
    return `${day}، ${full}`;
  } catch { return toAr(dateStr); }
}

const SLOT_CONF = {
  morning: { emoji: "🌅", ar: "صباحي",    bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  evening: { emoji: "🌙", ar: "مسائي",    bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" },
  fullday: { emoji: "☀️", ar: "يوم كامل", bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
};

/* ─────────────────── Shared style tokens ─────────────────── */
const CARD: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 20,
  padding: "24px 28px",
  marginBottom: 20,
  boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
  border: "1px solid #f0f0f0",
};

const SEC: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: 17,
  fontWeight: 900,
  color: "#111827",
  borderRight: "4px solid #16a34a",
  paddingRight: 12,
};

/* ═══════════════════════════════════════════════════════════
   ChaletDetail
═══════════════════════════════════════════════════════════ */
export default function ChaletDetail() {
  const { id }       = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search       = useSearch();
  const qp           = new URLSearchParams(search);

  /* Booking context passed as URL query params from the search/listing page */
  const selectedDate   = qp.get("date")   ?? "";
  const selectedPeriod = qp.get("period") ?? "";

  const [mainPhoto,      setMainPhoto]      = useState(0);
  const [termsOpen,      setTermsOpen]      = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const { data: chalet, isLoading, error } = useQuery<DiamondData>({
    queryKey: ["chalet-detail", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  /* ── Amenities catalog (DB labels take priority over fallback map) ── */
  const { data: amenitiesCatalog = [] } = useQuery<Array<{ key: string; labelAr: string }>>({
    queryKey: ["catalog", "amenities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  /* ── Site settings (for customisable WA template) ── */
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ["page-content"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  interface ChaletReview { id: number; rating: number; comment: string | null; photoUrls: string[]; guestName: string | null; isAnonymous: boolean; isVerified: boolean; isHidden: boolean; ownerReply: string | null; ownerReplyAt: string | null; createdAt: string }
  const { data: reviews = [] } = useQuery<ChaletReview[]>({
    queryKey: ["chalet-reviews", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}/reviews`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  interface ChaletAddon { id: number; name: string; category: string | null; description: string | null; price: string; unit: string; }
  const { data: chaletAddons = [] } = useQuery<ChaletAddon[]>({
    queryKey: ["chalet-addons", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}/services`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  /* ── Loading ── */
  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes cd-spin{to{transform:rotate(360deg)}} body,html,#root{background:#f8fafc!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#16a34a", animation: "cd-spin .8s linear infinite", margin: "0 auto 14px" }} />
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>جاري التحميل...</p>
        </div>
      </div>
    </div>
  );

  /* ── Error ── */
  if (error || !chalet) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <style>{`body,html,#root{background:#f8fafc!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 60, margin: 0 }}>🏕️</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>الشاليه غير موجود</p>
        <button onClick={() => setLocation("/chalets")}
          style={{ padding: "12px 32px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 15 }}>
          عرض جميع الشاليهات
        </button>
      </div>
    </div>
  );

  /* ── Derived data ── */
  const photos:    string[] = Array.isArray(chalet.photos)    ? chalet.photos    : [];
  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

  /* Resolve per-day price (from dailyPrices JSONB) or fall back to base period price */
  const dayOfWeek = selectedDate ? new Date(selectedDate + "T12:00:00").getDay() : -1;
  const dayNameAr = dayOfWeek >= 0 ? DAY_NAMES_AR[dayOfWeek] : null;

  const resolvePeriodPrice = (period: "morning" | "evening" | "fullday", base: string | number | null | undefined) => {
    const dayPrice = getDayPrice((chalet as any).dailyPrices, period, selectedDate);
    return dayPrice != null ? fmt(dayPrice) : fmt(base);
  };

  const slots = [
    chalet.slotMorning && {
      key: "morning", label: "صباحي", emoji: "🌅",
      price: resolvePeriodPrice("morning", chalet.priceMorning),
      hasDayPrice: getDayPrice((chalet as any).dailyPrices, "morning", selectedDate) != null,
      ci: chalet.morningCheckIn, co: chalet.morningCheckOut,
    },
    chalet.slotEvening && {
      key: "evening", label: "مسائي", emoji: "🌙",
      price: resolvePeriodPrice("evening", chalet.priceEvening),
      hasDayPrice: getDayPrice((chalet as any).dailyPrices, "evening", selectedDate) != null,
      ci: chalet.eveningCheckIn, co: chalet.eveningCheckOut,
    },
    chalet.slotFullDay && {
      key: "fullday", label: "يوم كامل", emoji: "☀️",
      price: resolvePeriodPrice("fullday", chalet.priceFullDay),
      hasDayPrice: getDayPrice((chalet as any).dailyPrices, "fullday", selectedDate) != null,
      ci: chalet.fullDayCheckIn, co: chalet.fullDayCheckOut,
    },
  ].filter(Boolean).filter((s: any) => {
    /* When dailyPrices is set AND a date is selected:
       hide any period that has no price for that specific day */
    const daily = (chalet as any).dailyPrices as Record<string, Record<string, number>> | null;
    if (daily && selectedDate) return s.hasDayPrice;
    return true;
  }) as { key: string; label: string; emoji: string; price: string | null; hasDayPrice: boolean; ci?: string | null; co?: string | null }[];

  /* active period = what was selected on the search/listing page */
  const activePeriod = slots.find(s => s.key === selectedPeriod);
  const activePeriodConf = selectedPeriod ? SLOT_CONF[selectedPeriod as keyof typeof SLOT_CONF] : null;

  /* price to display in sidebar: period price if selected, else weekday/per-night */
  const displayPrice = activePeriod?.price ?? fmt(chalet.priceWeekday ?? chalet.pricePerNight);

  /* category & sections resolved labels */
  const catInfo  = chalet.category ? (CATEGORY_MAP[chalet.category]  ?? { ar: chalet.category,  icon: "🏠" }) : null;
  const secInfo  = chalet.sections ? (SECTIONS_MAP[chalet.sections]  ?? { ar: chalet.sections,   icon: "👥" }) : null;

  /* Map — Leaflet for exact coords, Google Maps fallback otherwise */
  const hasCoords = chalet.latitude != null && chalet.longitude != null;
  const googleMapsLink = hasCoords
    ? `https://www.google.com/maps?q=${chalet.latitude},${chalet.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([chalet.nameAr, chalet.district, chalet.location, "القصيم"].filter(Boolean).join(" "))}`;
  const fallbackMapSrc = `https://maps.google.com/maps?q=${encodeURIComponent([chalet.nameAr, chalet.district, chalet.location, "القصيم"].filter(Boolean).join(" "))}&output=embed&hl=ar&z=14&iwloc=near`;

  /* ── Build the WhatsApp message ── */
  const buildWaMessage = () => {
    if (!chalet) return "";

    const DEFAULT_TEMPLATE =
`السلام عليكم، أريد حجز {chalet_name} عبر منصة شاليهات القصيم 🌴
تفاصيل الحجز:
اليوم: {day_name}
التاريخ الهجري: {hijri_date} هـ
التاريخ الميلادي: {gregorian_date} م
الفترة: {period_name}
الإجمالي: {total_price}
هل الحجز متاح؟`;

    const template = siteSettings?.wa_message_template?.trim() || DEFAULT_TEMPLATE;

    /* Date variables */
    let dayName = "", hijriDate = "", gregDate = "";
    if (selectedDate) {
      const d = new Date(selectedDate + "T12:00:00");
      dayName   = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
      hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/\s*هـ$/, "");
      gregDate  = new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "long", year: "numeric", calendar: "gregory" }).format(d);
    }

    /* Period variable */
    let periodLabel = "";
    if (activePeriod) {
      const timeRange = (activePeriod.ci && activePeriod.co)
        ? ` (${toAr(activePeriod.ci)} - ${toAr(activePeriod.co)})`
        : "";
      periodLabel = `${activePeriod.emoji ? activePeriod.emoji + " " : ""}${activePeriod.label}${timeRange}`;
    } else if (selectedPeriod) {
      periodLabel = selectedPeriod;
    }

    /* Price variable — already formatted with currency via fmt() */
    const priceVar = displayPrice ?? "";

    const msg = template
      .replace(/{chalet_name}/g,     chalet.nameAr ?? "")
      .replace(/{day_name}/g,        dayName)
      .replace(/{hijri_date}/g,      hijriDate)
      .replace(/{gregorian_date}/g,  gregDate)
      .replace(/{period_name}/g,     periodLabel)
      .replace(/{total_price}/g,     priceVar);

    /* Final pass — ensure any residual Western digits become Arabic-Indic */
    return toAr(msg);
  };

  /* Step 1 — click button → show terms modal (if terms exist, else open directly) */
  const handleBook = () => {
    if (!phone) return;
    if (terms.length > 0) {
      setTermsModalOpen(true);
    } else {
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWaMessage())}`, "_blank");
    }
  };

  /* Step 2 — user agreed in modal → open WhatsApp */
  const confirmBook = () => {
    setTermsModalOpen(false);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWaMessage())}`, "_blank");
  };

  /* ════════════════════════════════════════════
     Render
  ════════════════════════════════════════════ */
  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <style>{`
        body, html, #root { background: #f8fafc !important; color: #111827 !important; }
        @keyframes cd-spin { to { transform: rotate(360deg); } }
        @media (max-width: 960px) {
          .cd-grid    { flex-direction: column !important; }
          .cd-sidebar { position: static !important; width: 100% !important; }
          .cd-mob     { display: flex !important; }
        }
        @media (min-width: 961px) { .cd-mob { display: none !important; } }
      `}</style>

      <Navbar />

      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%", padding: "24px 20px 120px" }}>

        {/* ── Breadcrumb ── */}
        <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9ca3af", marginBottom: 20, flexWrap: "wrap" }}>
          {[{ l: "الرئيسية", p: "/" }, { l: "الشاليهات", p: "/chalets" }].map(({ l, p }) => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setLocation(p)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>{l}</button>
              <span style={{ color: "#d1d5db" }}>›</span>
            </span>
          ))}
          <span style={{ color: "#374151", fontWeight: 700 }}>{chalet.nameAr}</span>
        </nav>

        {/* ── GALLERY ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#e5e7eb", aspectRatio: "21/9", maxHeight: 480, boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
            {photos[mainPhoto]
              ? <img src={photos[mainPhoto]} alt={chalet.nameAr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>🏕️</div>
            }
            {chalet.isVerified && (
              <div style={{ position: "absolute", top: 16, right: 16, background: "#16a34a", color: "#fff", padding: "5px 14px", borderRadius: 24, fontSize: 12, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>✓ موثوق</div>
            )}
            {photos.length > 1 && (
              <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.45)", color: "#fff", padding: "3px 12px", borderRadius: 20, fontSize: 12 }}>
                {toAr(mainPhoto + 1)} / {toAr(photos.length)}
              </div>
            )}
            {photos.length > 1 && <>
              <button onClick={() => setMainPhoto(p => (p - 1 + photos.length) % photos.length)}
                style={{ position: "absolute", top: "50%", right: 14, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>›</button>
              <button onClick={() => setMainPhoto(p => (p + 1) % photos.length)}
                style={{ position: "absolute", top: "50%", left: 14, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>‹</button>
            </>}
          </div>
          {photos.length > 1 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, overflowX: "auto", paddingBottom: 4, justifyContent: "center" }}>
              {photos.map((p, i) => (
                <button key={i} onClick={() => setMainPhoto(i)}
                  style={{ flexShrink: 0, width: 88, height: 64, borderRadius: 12, overflow: "hidden", border: mainPhoto === i ? "3px solid #16a34a" : "3px solid transparent", padding: 0, cursor: "pointer", background: "none", boxShadow: mainPhoto === i ? "0 0 0 2px #dcfce7" : "none" }}>
                  <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 70 / 30 GRID ── */}
        <div className="cd-grid" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* ════════════ MAIN CONTENT — 70% ════════════ */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>

            {/* Title + Info bar + Quick stats */}
            <div style={CARD}>

              {/* Name + Logo row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {(() => {
                  const logoUrl = (chalet as any).logoUrl as string | null | undefined;
                  if (!logoUrl) return null;
                  return (
                    <div style={{
                      width: 64, height: 64, borderRadius: "50%",
                      border: "2px solid #e5e7eb",
                      background: "#f9fafb",
                      overflow: "hidden",
                      flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <img
                        src={logoUrl}
                        alt={`شعار ${chalet.nameAr}`}
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    </div>
                  );
                })()}
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: "#111827", lineHeight: 1.25 }}>{chalet.nameAr}</h1>
              </div>

              {(chalet.location || chalet.district) && (
                <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📍</span>{[chalet.district, chalet.location].filter(Boolean).join("، ")}
                </p>
              )}

              {chalet.isVerified && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "4px 12px", borderRadius: 20, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <span style={{ color: "#f59e0b", fontSize: 15 }}>★★★★★</span>
                  <span style={{ color: "#15803d", fontWeight: 600, fontSize: 12 }}>تقييم عالي</span>
                </div>
              )}

              {/* ── Info pills — shown only when data exists ── */}
              {(() => {
                const catLabel = chalet.propertyType || chalet.category;
                const secLabel = chalet.sections;
                if (!catLabel && !secLabel) return null;
                return (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                    {catLabel && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                        <span style={{ fontSize: 18 }}>🏷️</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, color: "#6b7280", fontWeight: 600 }}>الفئة</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 800, color: "#15803d" }}>{catLabel}</p>
                        </div>
                      </div>
                    )}
                    {secLabel && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 14, background: "#fefce8", border: "1.5px solid #fde68a" }}>
                        <span style={{ fontSize: 18 }}>🔑</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, color: "#6b7280", fontWeight: 600 }}>عدد الأقسام</p>
                          <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 800, color: "#92400e" }}>{secLabel}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ height: 1, background: "#f3f4f6", margin: "18px 0" }} />

              {/* Quick stats row */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {([
                  chalet.maxGuests    && { icon: "👥", lbl: "الطاقة الاستيعابية", val: `${toAr(chalet.maxGuests)} ضيف` },
                  chalet.bedrooms     && { icon: "🛏️", lbl: "غرف النوم",          val: `${toAr(chalet.bedrooms)} غرفة` },
                  chalet.checkInTime  && { icon: "🕐", lbl: "وقت الدخول",         val: chalet.checkInTime },
                  chalet.checkOutTime && { icon: "🕓", lbl: "وقت الخروج",         val: chalet.checkOutTime },
                ] as const).filter(Boolean).map((s: any, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{s.lbl}</p>
                      <p style={{ margin: "3px 0 0", fontWeight: 800, color: "#111827", fontSize: 14 }}>{s.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Description ── */}
            {chalet.descriptionAr && (
              <div style={CARD}>
                <h2 style={SEC}>عن الشاليه</h2>
                <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 2 }}>{chalet.descriptionAr}</p>
              </div>
            )}

            {/* ── ALL Amenities (nothing filtered out) ── */}
            {amenities.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>المرافق والخدمات</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
                  {amenities.map((raw, i) => {
                    const { ar, icon } = resolveAmenity(raw, amenitiesCatalog);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1.5px solid #e5e7eb", background: "#fafafa", fontSize: 13, color: "#374151", fontWeight: 600 }}>
                        <span style={{ fontSize: 19, flexShrink: 0 }}>{icon}</span>
                        <span style={{ lineHeight: 1.4 }}>{ar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Add-on Services ── */}
            {chaletAddons.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>خدمات إضافية متوفرة عند الطلب</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                  {chaletAddons.map(svc => {
                    const isFree = svc.unit === "خدمة مجانية" || Number(svc.price) === 0;
                    return (
                      <div key={svc.id} style={{ borderRadius: 14, border: "1.5px solid #e5e7eb", background: "#fafafa", padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: "#111827", lineHeight: 1.4 }}>{svc.name}</p>
                          <span style={{
                            background: isFree ? "#f0fdf4" : "#fefce8",
                            color: isFree ? "#15803d" : "#92400e",
                            border: `1.5px solid ${isFree ? "#bbf7d0" : "#fde68a"}`,
                            borderRadius: 8, padding: "3px 9px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            {isFree ? "🎁 خدمة مجانية" : `${Number(svc.price).toLocaleString("ar-SA")} ر.س / ${svc.unit}`}
                          </span>
                        </div>
                        {svc.description && (
                          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{svc.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#f0f9ff", border: "1.5px solid #bae6fd", fontSize: 13, color: "#0369a1", fontWeight: 600 }}>
                  💬 لطلب أي من هذه الخدمات، تواصل مع صاحب الشاليه عند الحجز.
                </div>
              </div>
            )}

            {/* ── Available Periods (info-only, not selection) ── */}
            {slots.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>الفترات المتاحة</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 14 }}>
                  {slots.map(s => {
                    const c = SLOT_CONF[s.key as keyof typeof SLOT_CONF];
                    return (
                      <div key={s.key} style={{ borderRadius: 14, border: `1.5px solid ${c.border}`, background: c.bg, padding: "18px 18px" }}>
                        <p style={{ fontSize: 26, margin: "0 0 8px" }}>{s.emoji}</p>
                        <p style={{ margin: "0 0 6px", fontWeight: 800, color: c.text, fontSize: 14 }}>{s.label}</p>
                        {s.price && (
                          <>
                            <p style={{ margin: "0 0 2px", fontSize: 12, color: c.text, opacity: 0.9, fontWeight: 700 }}>
                              {s.hasDayPrice && dayNameAr ? `سعر يوم ${dayNameAr}` : "يبدأ من"}
                            </p>
                            <p style={{ margin: "0 0 4px", fontWeight: 900, color: c.text, fontSize: 17 }}>{s.price}</p>
                          </>
                        )}
                        {(s.ci || s.co) && (
                          <p style={{ margin: 0, fontSize: 12, color: c.text, opacity: 0.8, lineHeight: 1.7 }}>
                            {s.ci && `دخول ${toAr(s.ci)}`}{s.ci && s.co && <br />}{s.co && `خروج ${toAr(s.co)}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Seasonal disclaimer ── */}
                <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 12, background: "#fff7ed", border: "1.5px solid #fed7aa", display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
                  <p style={{ margin: 0, fontSize: 13, color: "#c2410c", fontWeight: 700, lineHeight: 1.7 }}>
                    تنبيه: تختلف الأسعار في أيام المناسبات، الإجازات الرسمية، والأعياد.
                  </p>
                </div>
              </div>
            )}

            {/* ── Google Map ── */}
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ ...SEC, margin: 0 }}>الموقع</h2>
                <a
                  href={googleMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 10,
                    background: "#8C6246", color: "#fff",
                    fontSize: 13, fontWeight: 700, textDecoration: "none",
                    boxShadow: "0 2px 6px rgba(140,98,70,0.3)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  الفتح في خرائط Google
                </a>
              </div>
              {(chalet.location || chalet.district) && (
                <p style={{ margin: "0 0 14px", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📍</span>{[chalet.district, chalet.location, "القصيم"].filter(Boolean).join("، ")}
                </p>
              )}
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", height: 340 }}>
                {hasCoords ? (
                  <MapContainer
                    center={[chalet.latitude as number, chalet.longitude as number]}
                    zoom={16}
                    style={{ height: "100%", width: "100%" }}
                    zoomControl={true}
                    scrollWheelZoom={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[chalet.latitude as number, chalet.longitude as number]} />
                  </MapContainer>
                ) : (
                  <iframe
                    title="موقع الشاليه"
                    src={fallbackMapSrc}
                    width="100%"
                    height="340"
                    style={{ display: "block", border: "none" }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}
              </div>
            </div>

            {/* ── Terms ── */}
            {terms.length > 0 && (
              <div style={{ ...CARD, border: "1.5px solid #fde68a" }}>
                <button onClick={() => setTermsOpen(v => !v)}
                  style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#92400e" }}>
                    📋 شروط الحجز <span style={{ fontWeight: 500, fontSize: 13 }}>({toAr(terms.length)} شرط)</span>
                  </h2>
                  <span style={{ fontSize: 16, color: "#d97706" }}>{termsOpen ? "▲" : "▼"}</span>
                </button>
                {termsOpen && (
                  <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {terms.map((t, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ color: "#16a34a", flexShrink: 0, marginTop: 3 }}>✓</span>
                        <span style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          {/* ── Reviews ── */}
          {reviews.length > 0 && (
            <div style={{ ...CARD, marginTop: 0 }}>
              <h2 style={{ ...SEC, marginBottom: 16 }}>
                ⭐ آراء النزلاء
                <span style={{ fontWeight: 500, fontSize: 13, color: "#6b7280", marginRight: 8 }}>
                  ({toAr(reviews.length)} تقييم)
                </span>
              </h2>

              {/* Average stars */}
              {(() => {
                const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
                const rounded = Math.round(avg * 10) / 10;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 32, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{rounded.toFixed(1)}</span>
                    <div>
                      <div style={{ display: "flex", gap: 3, direction: "ltr" }}>
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ fontSize: 20, color: s <= Math.round(avg) ? "#f59e0b" : "#d1d5db" }}>★</span>
                        ))}
                      </div>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>من 5 نجوم</p>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {reviews.map((rev) => (
                  <div key={rev.id} style={{ padding: "14px 16px", background: "#f9fafb", borderRadius: 12, border: "1px solid #f3f4f6" }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 3, direction: "ltr" }}>
                        {[1,2,3,4,5].map(s => (
                          <span key={s} style={{ fontSize: 16, color: s <= rev.rating ? "#f59e0b" : "#d1d5db" }}>★</span>
                        ))}
                      </div>
                      {/* Reviewer name / anonymous badge */}
                      {rev.isVerified && (
                        rev.isAnonymous || !rev.guestName ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#16a34a", fontWeight: 700, background: "#f0fdf4", padding: "2px 8px", borderRadius: 20, border: "1px solid #bbf7d0" }}>
                            نزيل مؤكد ✅
                          </span>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#16a34a", fontWeight: 700, background: "#f0fdf4", padding: "2px 8px", borderRadius: 20, border: "1px solid #bbf7d0" }}>
                            {(() => {
                              const parts = rev.guestName!.trim().split(/\s+/);
                              const first = parts[0] ?? "";
                              const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
                              return `${first}${lastInitial}`;
                            })()} ✅
                          </span>
                        )
                      )}
                      <span style={{ marginRight: "auto", fontSize: 12, color: "#9ca3af" }}>
                        {new Date(rev.createdAt).toLocaleDateString("ar-SA")}
                      </span>
                    </div>
                    {/* Comment */}
                    {rev.comment && (
                      <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>{rev.comment}</p>
                    )}
                    {/* Photos */}
                    {rev.photoUrls?.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        {rev.photoUrls.map((url: string, i: number) => (
                          <img key={i} src={url} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb", cursor: "pointer" }}
                            onClick={() => window.open(url, "_blank")}
                          />
                        ))}
                      </div>
                    )}
                    {/* Owner reply */}
                    {rev.ownerReply && (
                      <div style={{ marginTop: 12, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, borderRightWidth: 3, borderRightColor: "#16a34a" }}>
                        <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                          🏡 رد صاحب الشاليه
                        </p>
                        <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{rev.ownerReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          </div>

          {/* ════════════ SIDEBAR — 30% ════════════ */}
          <div className="cd-sidebar" style={{ width: 340, position: "sticky", top: 84, flexShrink: 0 }}>
            <div style={{ background: "#ffffff", borderRadius: 22, boxShadow: "0 6px 32px rgba(0,0,0,0.10)", border: "1px solid #e8e8e8", overflow: "hidden" }}>

              {/* Price header */}
              <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #f3f4f6", background: "#f9feff" }}>
                <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
                  {activePeriod ? "الإجمالي" : "تبدأ من"}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 30, fontWeight: 900, color: "#111827", lineHeight: 1 }}>
                  {displayPrice ?? "تواصل للسعر"}
                </p>
                {displayPrice && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                    {activePeriod ? `/ ${activePeriod.label}` : "/ ليلة"}
                  </p>
                )}
              </div>

              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Weekday / weekend chips */}
                {(chalet.priceWeekday || chalet.priceWeekend) && !activePeriod && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {chalet.priceWeekday && (
                      <div style={{ textAlign: "center", padding: "12px 6px", borderRadius: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>وسط الأسبوع</p>
                        <p style={{ margin: "5px 0 2px", fontWeight: 900, color: "#16a34a", fontSize: 14 }}>{fmt(chalet.priceWeekday)}</p>
                        <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>/ ليلة</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{ textAlign: "center", padding: "12px 6px", borderRadius: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>نهاية الأسبوع</p>
                        <p style={{ margin: "5px 0 2px", fontWeight: 900, color: "#16a34a", fontSize: 14 }}>{fmt(chalet.priceWeekend)}</p>
                        <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>/ ليلة</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Selected booking summary (passed from search/listing) ── */}
                {(selectedDate || activePeriod) && (
                  <div style={{ borderRadius: 14, border: "1.5px solid #bbf7d0", background: "#f0fdf4", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "#15803d" }}>تفاصيل الحجز المحددة</p>

                    {selectedDate && (() => {
                      const d = new Date(selectedDate + "T12:00:00");
                      const dayName  = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(d);
                      /* Hijri: ar-SA-u-ca-islamic-umalqura already appends هـ — strip it; the template re-adds it */
                      const hijriDate = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(d).replace(/\s*هـ$/, "");
                      /* Gregorian: u-nu-arab extension forces Arabic-Indic digits (٢٠٢٦ not 2026) */
                      const gregDate  = new Intl.DateTimeFormat("ar-SA-u-nu-arab", { day: "numeric", month: "long", year: "numeric", calendar: "gregory" }).format(d);
                      return (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span style={{ fontSize: 18, marginTop: 2 }}>📅</span>
                          <div>
                            <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>تاريخ الحجز</p>
                            <p style={{ margin: "3px 0 0", fontWeight: 700, color: "#111827", fontSize: 13, lineHeight: 1.6 }}>
                              {dayName}، {hijriDate} هـ / {gregDate} م
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {activePeriod && activePeriodConf && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{activePeriod.emoji}</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>الفترة</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 700, color: "#111827", fontSize: 13 }}>
                            {activePeriod.label}
                            {(activePeriod.ci || activePeriod.co) && (
                              <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 11, marginRight: 6 }}>
                                ({toAr(activePeriod.ci)}{activePeriod.ci && activePeriod.co && " – "}{toAr(activePeriod.co)})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {activePeriod?.price && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>💰</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>الإجمالي</p>
                          <p style={{ margin: "2px 0 0", fontWeight: 900, color: "#16a34a", fontSize: 16 }}>{activePeriod.price}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* If nothing selected from search, show a soft hint */}
                {!selectedDate && !activePeriod && (
                  <div style={{ borderRadius: 12, background: "#f9fafb", border: "1px dashed #d1d5db", padding: "14px 16px", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", lineHeight: 1.8 }}>
                      اختر التاريخ والفترة من صفحة البحث<br />ثم عد لإتمام الحجز
                    </p>
                  </div>
                )}

                {/* WhatsApp Book button */}
                <button
                  onClick={handleBook}
                  disabled={!phone}
                  style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: phone ? "#16a34a" : "#d1d5db", color: "#fff", fontWeight: 800, fontSize: 16, cursor: phone ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: phone ? "0 4px 18px rgba(22,163,74,0.28)" : "none", transition: "background .2s, transform .1s" }}
                  onMouseEnter={e => { if (phone) { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={e => { if (phone) { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "none"; } }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  احجز الآن عبر واتساب
                </button>

                {/* ── Service Suggestion Button (admin-controlled) ── */}
                {siteSettings?.svc_btn_enabled === "true" && (() => {
                  const btnLabel = siteSettings?.svc_btn_label?.trim() || "🛎️ تنسيق خدمات إضافية لمناسبتك (ذبائح، ضيافة...)";
                  const btnColor = siteSettings?.svc_btn_color?.trim() || "#b45309";
                  return (
                    <button
                      onClick={() => setLocation(`/?tab=services${selectedDate ? `&date=${selectedDate}` : ""}`)}
                      style={{
                        width: "100%", height: 46, borderRadius: 14,
                        border: `2px solid ${btnColor}`,
                        background: "transparent",
                        color: btnColor,
                        fontWeight: 700, fontSize: 14,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        transition: "background .2s, color .2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = btnColor; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = btnColor; }}
                    >
                      {btnLabel}
                    </button>
                  );
                })()}

                <p style={{ margin: 0, textAlign: "center", fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                  ✓ تأكد من الحساب الرسمي قبل أي دفع
                </p>

              </div>
            </div>
          </div>

        </div>
      </main>

      {/* ── Mobile sticky bar ── */}
      <div className="cd-mob" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "12px 20px", alignItems: "center", gap: 12, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chalet.nameAr}</p>
          {displayPrice && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 800 }}>يبدأ من {displayPrice}</p>}
        </div>
        {phone && (
          <button onClick={handleBook}
            style={{ flexShrink: 0, height: 44, padding: "0 20px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer" }}>
            احجز الآن
          </button>
        )}
      </div>

      <Footer />

      {/* ══════════════ TERMS MODAL ══════════════ */}
      {termsModalOpen && (
        <div
          onClick={() => setTermsModalOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            dir="rtl"
            style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}
          >
            {/* Modal header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafafa" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>📋</span>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: "#111827" }}>شروط الحجز</h3>
                <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500 }}>({terms.length} شرط)</span>
              </div>
              <button
                onClick={() => setTermsModalOpen(false)}
                style={{ background: "#f3f4f6", border: "none", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}
              >✕</button>
            </div>

            {/* Chalet name sub-header */}
            <div style={{ padding: "12px 24px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#15803d", fontWeight: 700 }}>🏡 {chalet.nameAr}</p>
            </div>

            {/* Terms list – scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {terms.map((t, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#f9fafb", border: "1px solid #f3f4f6" }}>
                    <span style={{ color: "#16a34a", fontWeight: 900, fontSize: 15, flexShrink: 0, marginTop: 2 }}>✓</span>
                    <span style={{ fontSize: 14, color: "#374151", lineHeight: 1.9 }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Modal footer actions */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 12, background: "#fafafa" }}>
              <button
                onClick={confirmBook}
                style={{ flex: 1, height: 50, borderRadius: 14, border: "none", background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 16px rgba(22,163,74,0.30)", transition: "background .2s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#15803d")}
                onMouseLeave={e => (e.currentTarget.style.background = "#16a34a")}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                أوافق وأكمل الحجز عبر واتساب
              </button>
              <button
                onClick={() => setTermsModalOpen(false)}
                style={{ height: 50, padding: "0 20px", borderRadius: 14, border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                رجوع
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
