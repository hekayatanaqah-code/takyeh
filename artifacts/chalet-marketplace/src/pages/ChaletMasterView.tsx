import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
};

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

/* ── shared card style ── */
const CARD: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 18,
  padding: "32px 36px",
  marginBottom: 24,
  boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
  border: "1px solid #f0f0f0",
};

/* ── shared section-title style ── */
const SEC_TITLE: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: 20,
  fontWeight: 900,
  color: "#111827",
  borderRight: "4px solid #16a34a",
  paddingRight: 12,
};

export default function ChaletMasterView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [mainPhoto, setMainPhoto] = useState(0);
  const [termsOpen, setTermsOpen] = useState(false);

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

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
        <style>{`@keyframes mspin{to{transform:rotate(360deg)}} body,html{background:#f9fafb!important}`}</style>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#16a34a", animation: "mspin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#6b7280", fontSize: 14 }}>جاري التحميل...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !chalet) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
        <style>{`body,html{background:#f9fafb!important}`}</style>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 64 }}>🏕️</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>الشاليه غير موجود</p>
          <p style={{ color: "#6b7280" }}>تأكد من الرابط أو عد للقائمة</p>
          <button onClick={() => setLocation("/chalets")} style={{ marginTop: 8, padding: "12px 32px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 15 }}>
            عرض جميع الشاليهات
          </button>
        </div>
      </div>
    );
  }

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];

  const handleWhatsApp = () => {
    if (!phone) return;
    const msg = `السلام عليكم، أرغب في الاستفسار عن شاليه: ${chalet.nameAr}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
      <style>{`
        body, html { background: #f9fafb !important; color: #111827 !important; }
        #root { background: #f9fafb !important; }
        @media (max-width: 900px) {
          .dg { flex-direction: column !important; }
          .dsb { position: static !important; width: 100% !important; }
          .dmb { display: flex !important; }
        }
        @media (min-width: 901px) { .dmb { display: none !important; } }
      `}</style>

      <Navbar />

      <main style={{ flex: 1, maxWidth: 1160, margin: "0 auto", width: "100%", padding: "32px 32px 140px" }}>

        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9ca3af", marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "الرئيسية", path: "/" },
            { label: "الشاليهات", path: "/chalets" },
          ].map(({ label, path }) => (
            <span key={path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setLocation(path)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>{label}</button>
              <span style={{ color: "#d1d5db" }}>›</span>
            </span>
          ))}
          <span style={{ color: "#374151", fontWeight: 700 }}>{chalet.nameAr}</span>
        </nav>

        {/* ── CENTERED IMAGE GALLERY ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{
            position: "relative", borderRadius: 20, overflow: "hidden",
            background: "#e5e7eb", maxHeight: 520,
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            aspectRatio: "16/9",
          }}>
            {photos[mainPhoto] ? (
              <img src={photos[mainPhoto]} alt={chalet.nameAr}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>🏕️</div>
            )}

            {chalet.isVerified && (
              <div style={{ position: "absolute", top: 20, right: 20, background: "#16a34a", color: "#fff", padding: "7px 16px", borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                ✓ موثوق
              </div>
            )}

            {photos.length > 1 && (
              <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", padding: "4px 14px", borderRadius: 20, fontSize: 12 }}>
                {mainPhoto + 1} / {photos.length}
              </div>
            )}

            {photos.length > 1 && (
              <>
                <button onClick={() => setMainPhoto(p => (p - 1 + photos.length) % photos.length)} style={{ position: "absolute", top: "50%", right: 16, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>›</button>
                <button onClick={() => setMainPhoto(p => (p + 1) % photos.length)} style={{ position: "absolute", top: "50%", left: 16, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 44, height: 44, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>‹</button>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div style={{ display: "flex", gap: 12, marginTop: 14, overflowX: "auto", paddingBottom: 4, justifyContent: "center" }}>
              {photos.map((p, i) => (
                <button key={i} onClick={() => setMainPhoto(i)} style={{ flexShrink: 0, width: 96, height: 72, borderRadius: 12, overflow: "hidden", border: mainPhoto === i ? "3px solid #16a34a" : "3px solid transparent", padding: 0, cursor: "pointer", background: "none", transition: "border-color 0.2s", boxShadow: mainPhoto === i ? "0 0 0 2px #dcfce7" : "none" }}>
                  <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── MAIN CONTENT + SIDEBAR ── */}
        <div className="dg" style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>

          {/* ── DETAILS COLUMN ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Title card */}
            <div style={CARD}>
              <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{chalet.nameAr}</h1>

              {(chalet.location || chalet.district) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, color: "#6b7280", fontSize: 15 }}>
                  <span style={{ fontSize: 18 }}>📍</span>
                  <span>{[chalet.district, chalet.location].filter(Boolean).join("، ")}</span>
                </div>
              )}

              {chalet.rating && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ color: "#f59e0b", fontSize: 18, letterSpacing: 2 }}>★★★★★</span>
                  <span style={{ color: "#374151", fontWeight: 600, fontSize: 13 }}>تقييم عالي</span>
                </div>
              )}

              <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

              {/* Stats */}
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {[
                  chalet.maxGuests && { icon: "👥", label: "الطاقة الاستيعابية", val: `${chalet.maxGuests} ضيف` },
                  chalet.bedrooms && { icon: "🛏️", label: "غرف النوم", val: `${chalet.bedrooms} غرفة` },
                  chalet.checkInTime && { icon: "🕐", label: "تسجيل دخول", val: chalet.checkInTime },
                  chalet.checkOutTime && { icon: "🕓", label: "تسجيل خروج", val: chalet.checkOutTime },
                ].filter(Boolean).map((s: any, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{s.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>{s.label}</p>
                      <p style={{ margin: "3px 0 0", fontWeight: 800, color: "#111827", fontSize: 15 }}>{s.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            {chalet.description && (
              <div style={CARD}>
                <h2 style={SEC_TITLE}>عن الشاليه</h2>
                <p style={{ margin: 0, color: "#4b5563", fontSize: 15, lineHeight: 2 }}>{chalet.description}</p>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC_TITLE}>المرافق والخدمات</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
                  {amenities.map((key, i) => {
                    const info = AMENITY_MAP[key];
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e5e7eb", background: "#fafafa", fontSize: 13, color: "#374151", fontWeight: 600, transition: "border-color 0.2s" }}>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>{info?.icon ?? "✓"}</span>
                        <span>{info?.ar ?? key}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pricing slots */}
            {(chalet.slotMorning || chalet.slotEvening || chalet.slotFullDay) && (
              <div style={CARD}>
                <h2 style={SEC_TITLE}>الفترات المتاحة</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16 }}>
                  {chalet.slotMorning && (
                    <div style={{ borderRadius: 14, border: "1.5px solid #fde68a", background: "#fffbeb", padding: "20px 22px" }}>
                      <p style={{ fontSize: 28, margin: "0 0 10px" }}>🌅</p>
                      <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#92400e", fontSize: 15 }}>فترة صباحية</p>
                      {fmt(chalet.priceMorning) && <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#d97706", fontSize: 18 }}>{fmt(chalet.priceMorning)}</p>}
                      {chalet.morningCheckIn && <p style={{ margin: 0, fontSize: 12, color: "#a16207", lineHeight: 1.7 }}>دخول {chalet.morningCheckIn} — خروج {chalet.morningCheckOut}</p>}
                    </div>
                  )}
                  {chalet.slotEvening && (
                    <div style={{ borderRadius: 14, border: "1.5px solid #c7d2fe", background: "#eef2ff", padding: "20px 22px" }}>
                      <p style={{ fontSize: 28, margin: "0 0 10px" }}>🌙</p>
                      <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#3730a3", fontSize: 15 }}>فترة مسائية</p>
                      {fmt(chalet.priceEvening) && <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#4338ca", fontSize: 18 }}>{fmt(chalet.priceEvening)}</p>}
                      {chalet.eveningCheckIn && <p style={{ margin: 0, fontSize: 12, color: "#4338ca", lineHeight: 1.7 }}>دخول {chalet.eveningCheckIn} — خروج {chalet.eveningCheckOut}</p>}
                    </div>
                  )}
                  {chalet.slotFullDay && (
                    <div style={{ borderRadius: 14, border: "1.5px solid #a7f3d0", background: "#ecfdf5", padding: "20px 22px" }}>
                      <p style={{ fontSize: 28, margin: "0 0 10px" }}>☀️</p>
                      <p style={{ margin: "0 0 8px", fontWeight: 800, color: "#065f46", fontSize: 15 }}>يوم كامل</p>
                      {fmt(chalet.priceFullDay) && <p style={{ margin: "0 0 6px", fontWeight: 900, color: "#059669", fontSize: 18 }}>{fmt(chalet.priceFullDay)}</p>}
                      {chalet.fullDayCheckIn && <p style={{ margin: 0, fontSize: 12, color: "#059669", lineHeight: 1.7 }}>دخول {chalet.fullDayCheckIn} — خروج {chalet.fullDayCheckOut}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terms */}
            {terms.length > 0 && (
              <div style={{ ...CARD, border: "1.5px solid #fde68a", padding: "24px 36px" }}>
                <button onClick={() => setTermsOpen(v => !v)} style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#92400e" }}>📋 شروط الحجز <span style={{ fontWeight: 500, fontSize: 14 }}>({terms.length} شرط)</span></h2>
                  <span style={{ fontSize: 18, color: "#d97706" }}>{termsOpen ? "▲" : "▼"}</span>
                </button>
                {termsOpen && (
                  <ul style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {terms.map((t, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ color: "#16a34a", flexShrink: 0, marginTop: 3, fontSize: 16 }}>✓</span>
                        <span style={{ fontSize: 14, color: "#374151", lineHeight: 1.8 }}>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>

          {/* ── SIDEBAR (single solid white card, no gradient) ── */}
          <div className="dsb" style={{ width: 352, position: "sticky", top: 90, flexShrink: 0 }}>
            <div style={{
              background: "#ffffff",
              borderRadius: 20,
              boxShadow: "0 6px 32px rgba(0,0,0,0.10)",
              border: "1px solid #e5e7eb",
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}>

              {/* Price display — inside the white card, no colored header */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>يبدأ من</p>
                <p style={{ margin: "6px 0 2px", fontSize: 32, fontWeight: 900, color: "#111827", lineHeight: 1 }}>
                  {fmt(chalet.priceWeekday ?? chalet.pricePerNight) ?? "تواصل للسعر"}
                </p>
                {(chalet.priceWeekday || chalet.pricePerNight) && (
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>/ ليلة</p>
                )}
              </div>

              <div style={{ height: 1, background: "#f3f4f6", marginBottom: 20 }} />

              {/* Weekday / Weekend price chips */}
              {(chalet.priceWeekday || chalet.priceWeekend) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {chalet.priceWeekday && (
                    <div style={{ textAlign: "center", padding: "14px 8px", borderRadius: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#6b7280", fontWeight: 500 }}>وسط الأسبوع</p>
                      <p style={{ margin: "6px 0 2px", fontWeight: 900, color: "#16a34a", fontSize: 16 }}>{fmt(chalet.priceWeekday)}</p>
                      <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>/ ليلة</p>
                    </div>
                  )}
                  {chalet.priceWeekend && (
                    <div style={{ textAlign: "center", padding: "14px 8px", borderRadius: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#6b7280", fontWeight: 500 }}>نهاية الأسبوع</p>
                      <p style={{ margin: "6px 0 2px", fontWeight: 900, color: "#16a34a", fontSize: 16 }}>{fmt(chalet.priceWeekend)}</p>
                      <p style={{ margin: 0, fontSize: 10, color: "#9ca3af" }}>/ ليلة</p>
                    </div>
                  )}
                </div>
              )}

              {/* Book Now — mt-4 above, separated from price */}
              {id && (
                <button
                  onClick={() => setLocation(`/chalets/${id}/book`)}
                  style={{
                    width: "100%", height: 54, borderRadius: 14, border: "none",
                    background: "#16a34a", color: "#fff",
                    fontWeight: 800, fontSize: 16, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    marginTop: 4,
                    boxShadow: "0 4px 16px rgba(22,163,74,0.28)",
                    transition: "background 0.2s, transform 0.1s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "none"; }}
                >
                  📅 احجز الآن
                </button>
              )}

              {/* WhatsApp — mb-3 below, separated from trust text */}
              {phone && (
                <button
                  onClick={handleWhatsApp}
                  style={{
                    width: "100%", height: 50, borderRadius: 14,
                    border: "2px solid #16a34a", background: "#fff",
                    color: "#16a34a", fontWeight: 700, fontSize: 15, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                    marginTop: 12, marginBottom: 16,
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#f0fdf4"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                >
                  <svg viewBox="0 0 24 24" fill="#16a34a" style={{ width: 20, height: 20, flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  تواصل واتساب
                </button>
              )}

              <p style={{ margin: 0, textAlign: "center", fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                ✓ تأكد من الحساب الرسمي قبل أي دفع
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile sticky bar */}
      <div className="dmb" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "14px 24px", alignItems: "center", gap: 14, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chalet.nameAr}</p>
          {fmt(chalet.priceWeekday) && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#16a34a", fontWeight: 800 }}>يبدأ من {fmt(chalet.priceWeekday)}</p>}
        </div>
        <button onClick={() => setLocation(`/chalets/${id}/book`)} style={{ flexShrink: 0, height: 46, padding: "0 24px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          📅 احجز الآن
        </button>
      </div>

      <Footer />
    </div>
  );
}
