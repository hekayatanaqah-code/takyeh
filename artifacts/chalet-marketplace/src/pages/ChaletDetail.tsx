import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const AMENITY_MAP: Record<string, { ar: string; icon: string }> = {
  pool:           { ar: "مسبح",              icon: "🏊" },
  kids_games:     { ar: "ألعاب أطفال",        icon: "🎠" },
  private_majlis: { ar: "مجالس مستقلة",       icon: "🛋️" },
  bbq:            { ar: "ركن شواء",            icon: "🔥" },
  kitchen:        { ar: "مطبخ مجهز",           icon: "🍳" },
  wifi:           { ar: "واي فاي",             icon: "📶" },
  ac:             { ar: "مكيف",                icon: "❄️" },
  parking:        { ar: "موقف سيارات",         icon: "🅿️" },
  garden:         { ar: "حديقة",               icon: "🌿" },
  gym:            { ar: "صالة رياضية",         icon: "🏋️" },
  cinema:         { ar: "سينما خارجية",        icon: "🎬" },
  jacuzzi:        { ar: "جاكوزي",              icon: "🛁" },
  football:       { ar: "ملعب كرة قدم",        icon: "⚽" },
  billiards:      { ar: "بلياردو",             icon: "🎱" },
  table_tennis:   { ar: "تنس طاولة",           icon: "🏓" },
  indoor_pool:    { ar: "مسبح داخلي",          icon: "🏊" },
  outdoor_pool:   { ar: "مسبح خارجي",          icon: "🌊" },
  sauna:          { ar: "ساونا",               icon: "🧖" },
  private_beach:  { ar: "شاطئ خاص",            icon: "🏖️" },
  security:       { ar: "حراسة أمنية",         icon: "🔒" },
  generator:      { ar: "مولد كهربائي",        icon: "⚡" },
  laundry:        { ar: "غسالة",               icon: "🫧" },
  bbq_outdoor:    { ar: "شواء خارجي",          icon: "🍖" },
  prayer_room:    { ar: "غرفة صلاة",           icon: "🕌" },
  baby_items:     { ar: "مستلزمات أطفال",      icon: "🍼" },
  fire_pit:       { ar: "موقد نار",             icon: "🪵" },
  pets_allowed:   { ar: "يسمح بالحيوانات",     icon: "🐾" },
  smart_tv:       { ar: "شاشة ذكية",           icon: "📺" },
  game_room:      { ar: "غرفة ألعاب",          icon: "🎮" },
};

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

function toHijri(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const h = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }).format(d);
    const g = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long", year: "numeric" }).format(d);
    return `${h} / ${g}`;
  } catch { return dateStr; }
}

const SLOT_CONF = {
  morning: { emoji: "🌅", ar: "صباحي",    bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  evening: { emoji: "🌙", ar: "مسائي",    bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" },
  fullday: { emoji: "☀️", ar: "يوم كامل", bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
};

const CARD: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 20,
  boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
  border: "1px solid #f0f0f0",
};

const SEC: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 18,
  fontWeight: 900,
  color: "#111827",
  borderRight: "4px solid #16a34a",
  paddingRight: 12,
};

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [mainPhoto, setMainPhoto] = useState(0);
  const [termsOpen, setTermsOpen] = useState(false);
  const [bookDate, setBookDate]   = useState("");
  const [period,   setPeriod]     = useState<string | null>(null);

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

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#ffffff", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes cd-spin{to{transform:rotate(360deg)}} body,html,#root{background:#ffffff!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#16a34a", animation: "cd-spin .8s linear infinite", margin: "0 auto 14px" }} />
          <p style={{ color: "#6b7280", fontSize: 14, margin: 0 }}>جاري التحميل...</p>
        </div>
      </div>
    </div>
  );

  if (error || !chalet) return (
    <div style={{ minHeight: "100vh", background: "#ffffff", display: "flex", flexDirection: "column" }}>
      <style>{`body,html,#root{background:#ffffff!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 60, margin: 0 }}>🏕️</p>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>الشاليه غير موجود</p>
        <button onClick={() => setLocation("/chalets")} style={{ padding: "12px 32px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 15 }}>
          عرض جميع الشاليهات
        </button>
      </div>
    </div>
  );

  const photos: string[]    = Array.isArray(chalet.photos)    ? chalet.photos    : [];
  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

  const slots = [
    chalet.slotMorning && { key: "morning", price: fmt(chalet.priceMorning), ci: chalet.morningCheckIn, co: chalet.morningCheckOut },
    chalet.slotEvening && { key: "evening", price: fmt(chalet.priceEvening), ci: chalet.eveningCheckIn, co: chalet.eveningCheckOut },
    chalet.slotFullDay && { key: "fullday", price: fmt(chalet.priceFullDay), ci: chalet.fullDayCheckIn, co: chalet.fullDayCheckOut },
  ].filter(Boolean) as { key: string; price: string | null; ci?: string | null; co?: string | null }[];

  const selSlot = slots.find(s => s.key === period);
  const selConf = period ? SLOT_CONF[period as keyof typeof SLOT_CONF] : null;

  const mapQuery = encodeURIComponent([chalet.nameAr, chalet.district, chalet.location, "القصيم"].filter(Boolean).join(" "));
  const mapSrc = `https://maps.google.com/maps?q=${mapQuery}&output=embed&hl=ar&z=14`;

  const handleBook = () => {
    if (!phone) return;
    const lines = [`السلام عليكم، أرغب في حجز شاليه: ${chalet.nameAr}`];
    if (bookDate) lines.push(`📅 التاريخ: ${toHijri(bookDate)}`);
    if (selConf && selSlot) {
      lines.push(`🕐 الفترة: ${selConf.emoji} ${selConf.ar}`);
      if (selSlot.price) lines.push(`💰 السعر: ${selSlot.price}`);
    }
    if (terms.length) lines.push("\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n"));
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <style>{`
        body, html, #root { background: #f8fafc !important; color: #111827 !important; }
        @keyframes cd-spin { to { transform: rotate(360deg); } }
        @media (max-width: 960px) {
          .cd-grid { flex-direction: column !important; }
          .cd-sidebar { position: static !important; width: 100% !important; }
          .cd-mob { display: flex !important; }
        }
        @media (min-width: 961px) { .cd-mob { display: none !important; } }
      `}</style>

      <Navbar />

      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%", padding: "28px 24px 140px" }}>

        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9ca3af", marginBottom: 20, flexWrap: "wrap" }}>
          {[{ l: "الرئيسية", p: "/" }, { l: "الشاليهات", p: "/chalets" }].map(({ l, p }) => (
            <span key={p} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setLocation(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0, transition: "color .15s" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>{l}</button>
              <span style={{ color: "#d1d5db" }}>›</span>
            </span>
          ))}
          <span style={{ color: "#374151", fontWeight: 700 }}>{chalet.nameAr}</span>
        </nav>

        {/* ── GALLERY ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ position: "relative", borderRadius: 20, overflow: "hidden", background: "#e5e7eb", aspectRatio: "21/9", maxHeight: 480, boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}>
            {photos[mainPhoto]
              ? <img src={photos[mainPhoto]} alt={chalet.nameAr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 80 }}>🏕️</div>
            }
            {chalet.isVerified && (
              <div style={{ position: "absolute", top: 16, right: 16, background: "#16a34a", color: "#fff", padding: "6px 16px", borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>✓ موثوق</div>
            )}
            {photos.length > 1 && (
              <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.45)", color: "#fff", padding: "3px 14px", borderRadius: 20, fontSize: 12 }}>
                {mainPhoto + 1} / {photos.length}
              </div>
            )}
            {photos.length > 1 && <>
              <button onClick={() => setMainPhoto(p => (p - 1 + photos.length) % photos.length)} style={{ position: "absolute", top: "50%", right: 14, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>›</button>
              <button onClick={() => setMainPhoto(p => (p + 1) % photos.length)} style={{ position: "absolute", top: "50%", left: 14, transform: "translateY(-50%)", background: "rgba(255,255,255,0.92)", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>‹</button>
            </>}
          </div>
          {photos.length > 1 && (
            <div style={{ display: "flex", gap: 10, marginTop: 12, overflowX: "auto", paddingBottom: 4, justifyContent: "center" }}>
              {photos.map((p, i) => (
                <button key={i} onClick={() => setMainPhoto(i)} style={{ flexShrink: 0, width: 90, height: 68, borderRadius: 12, overflow: "hidden", border: mainPhoto === i ? "3px solid #16a34a" : "3px solid transparent", padding: 0, cursor: "pointer", background: "none", boxShadow: mainPhoto === i ? "0 0 0 2px #dcfce7" : "none" }}>
                  <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 70 / 30 LAYOUT (RTL: right = main, left = sidebar) ── */}
        <div className="cd-grid" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

          {/* ══ MAIN CONTENT — 70% ══ */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>

            {/* Title card */}
            <div style={CARD}>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900, color: "#111827", lineHeight: 1.2 }}>{chalet.nameAr}</h1>
              {(chalet.location || chalet.district) && (
                <p style={{ margin: "10px 0 0", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📍</span>{[chalet.district, chalet.location].filter(Boolean).join("، ")}
                </p>
              )}
              {chalet.rating && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ color: "#f59e0b", fontSize: 17, letterSpacing: 2 }}>★★★★★</span>
                  <span style={{ color: "#374151", fontWeight: 600, fontSize: 13 }}>تقييم عالي</span>
                </div>
              )}
              <div style={{ height: 1, background: "#f3f4f6", margin: "18px 0" }} />
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  chalet.maxGuests   && { icon: "👥", lbl: "الطاقة الاستيعابية", val: `${chalet.maxGuests} ضيف` },
                  chalet.bedrooms    && { icon: "🛏️", lbl: "غرف النوم",           val: `${chalet.bedrooms} غرفة` },
                  chalet.checkInTime  && { icon: "🕐", lbl: "تسجيل دخول",         val: chalet.checkInTime },
                  chalet.checkOutTime && { icon: "🕓", lbl: "تسجيل خروج",         val: chalet.checkOutTime },
                ].filter(Boolean).map((s: any, i) => (
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

            {/* Description */}
            {chalet.description && (
              <div style={CARD}>
                <h2 style={SEC}>عن الشاليه</h2>
                <p style={{ margin: 0, color: "#4b5563", fontSize: 14, lineHeight: 2 }}>{chalet.description}</p>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>المرافق والخدمات</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                  {amenities.map((key, i) => {
                    const info = AMENITY_MAP[key];
                    if (!info) return null;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1.5px solid #e5e7eb", background: "#fafafa", fontSize: 13, color: "#374151", fontWeight: 600 }}>
                        <span style={{ fontSize: 20 }}>{info.icon}</span>
                        <span>{info.ar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available Periods */}
            {slots.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>الفترات المتاحة</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 14 }}>
                  {slots.map(s => {
                    const c = SLOT_CONF[s.key as keyof typeof SLOT_CONF];
                    return (
                      <div key={s.key} style={{ borderRadius: 14, border: `1.5px solid ${c.border}`, background: c.bg, padding: "18px 20px" }}>
                        <p style={{ fontSize: 26, margin: "0 0 8px" }}>{c.emoji}</p>
                        <p style={{ margin: "0 0 6px", fontWeight: 800, color: c.text, fontSize: 14 }}>{c.ar}</p>
                        {s.price && <p style={{ margin: "0 0 4px", fontWeight: 900, color: c.text, fontSize: 16 }}>{s.price}</p>}
                        {(s.ci || s.co) && (
                          <p style={{ margin: 0, fontSize: 12, color: c.text, opacity: 0.8, lineHeight: 1.7 }}>
                            {s.ci && `دخول ${s.ci}`}{s.ci && s.co && <br />}{s.co && `خروج ${s.co}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Google Map */}
            <div style={CARD}>
              <h2 style={SEC}>الموقع</h2>
              {(chalet.location || chalet.district) && (
                <p style={{ margin: "0 0 14px", fontSize: 14, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📍</span>{[chalet.district, chalet.location, "القصيم"].filter(Boolean).join("، ")}
                </p>
              )}
              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
                <iframe
                  title="موقع الشاليه"
                  src={mapSrc}
                  width="100%"
                  height="320"
                  style={{ display: "block", border: "none" }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            {/* Terms */}
            {terms.length > 0 && (
              <div style={{ ...CARD, border: "1.5px solid #fde68a" }}>
                <button onClick={() => setTermsOpen(v => !v)} style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#92400e" }}>📋 شروط الحجز <span style={{ fontWeight: 500, fontSize: 13 }}>({terms.length} شرط)</span></h2>
                  <span style={{ fontSize: 18, color: "#d97706" }}>{termsOpen ? "▲" : "▼"}</span>
                </button>
                {termsOpen && (
                  <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
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

          </div>

          {/* ══ SIDEBAR — 30% sticky booking card ══ */}
          <div className="cd-sidebar" style={{ width: 350, position: "sticky", top: 84, flexShrink: 0 }}>
            <div style={{ background: "#ffffff", borderRadius: 22, boxShadow: "0 6px 32px rgba(0,0,0,0.10)", border: "1px solid #e8e8e8", overflow: "hidden" }}>

              {/* Price header */}
              <div style={{ padding: "24px 26px 18px", borderBottom: "1px solid #f3f4f6" }}>
                <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: 1 }}>يبدأ من</p>
                <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 900, color: "#111827", lineHeight: 1 }}>
                  {fmt(chalet.priceWeekday ?? chalet.pricePerNight) ?? "تواصل للسعر"}
                </p>
                {(chalet.priceWeekday || chalet.pricePerNight) &&
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>/ ليلة</p>
                }
              </div>

              <div style={{ padding: "20px 26px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Weekday / weekend price chips */}
                {(chalet.priceWeekday || chalet.priceWeekend) && (
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

                {/* Date picker */}
                <div>
                  <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 700, color: "#374151" }}>📅 تاريخ الحجز</label>
                  <input
                    type="date"
                    value={bookDate}
                    onChange={e => setBookDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    style={{ width: "100%", height: 44, borderRadius: 12, border: bookDate ? "2px solid #16a34a" : "2px solid #e5e7eb", background: "#fff", color: "#111827", fontSize: 14, padding: "0 14px", outline: "none", cursor: "pointer", boxSizing: "border-box", transition: "border-color .2s" }}
                  />
                  {bookDate && (
                    <p style={{ margin: "6px 0 0", fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{toHijri(bookDate)}</p>
                  )}
                </div>

                {/* Period selection */}
                {slots.length > 0 && (
                  <div>
                    <label style={{ display: "block", marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#374151" }}>🕐 الفترة المطلوبة</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {slots.map(s => {
                        const c = SLOT_CONF[s.key as keyof typeof SLOT_CONF];
                        const active = period === s.key;
                        return (
                          <button key={s.key} type="button" onClick={() => setPeriod(active ? null : s.key)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: `2px solid ${active ? "#16a34a" : c.border}`, background: active ? "#f0fdf4" : c.bg, cursor: "pointer", outline: "none", transition: "all .15s" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 18 }}>{c.emoji}</span>
                              <div style={{ textAlign: "right" }}>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: active ? "#16a34a" : c.text }}>{c.ar}</p>
                                {(s.ci || s.co) && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>{s.ci}{s.ci && s.co && " — "}{s.co}</p>}
                              </div>
                            </div>
                            {s.price && <span style={{ fontWeight: 900, fontSize: 14, color: active ? "#16a34a" : c.text }}>{s.price}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* WhatsApp Book button */}
                <button
                  onClick={handleBook}
                  disabled={!phone}
                  style={{ width: "100%", height: 52, borderRadius: 14, border: "none", background: phone ? "#16a34a" : "#d1d5db", color: "#fff", fontWeight: 800, fontSize: 16, cursor: phone ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 4, boxShadow: phone ? "0 4px 18px rgba(22,163,74,0.28)" : "none", transition: "background .2s, transform .1s" }}
                  onMouseEnter={e => { if (phone) { e.currentTarget.style.background = "#15803d"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={e => { if (phone) { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.transform = "none"; } }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0 }}>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  احجز الآن عبر واتساب
                </button>

                <p style={{ margin: 0, textAlign: "center", fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                  ✓ تأكد من الحساب الرسمي قبل أي دفع
                </p>

              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile sticky bar */}
      <div className="cd-mob" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "12px 20px", alignItems: "center", gap: 12, boxShadow: "0 -4px 20px rgba(0,0,0,0.08)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chalet.nameAr}</p>
          {fmt(chalet.priceWeekday) && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 800 }}>يبدأ من {fmt(chalet.priceWeekday)}</p>}
        </div>
        {phone && (
          <button onClick={handleBook} style={{ flexShrink: 0, height: 44, padding: "0 20px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 800, fontSize: 14, border: "none", cursor: "pointer" }}>
            احجز الآن
          </button>
        )}
      </div>

      <Footer />
    </div>
  );
}
