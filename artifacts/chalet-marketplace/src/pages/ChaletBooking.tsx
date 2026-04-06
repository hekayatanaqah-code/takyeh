import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  MapPin, Users, BedDouble, Calendar,
  ChevronLeft, ShieldCheck, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ChevronRight,
} from "lucide-react";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

const SLOT_META: Record<string, { emoji: string; ar: string; color: string }> = {
  morning: { emoji: "🌅", ar: "صباحي",    color: "#f59e0b" },
  evening: { emoji: "🌙", ar: "مسائي",    color: "#818cf8" },
  fullday: { emoji: "☀️", ar: "يوم كامل", color: "#34d399" },
};

export default function ChaletBooking() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

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

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0c0a09" }}>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "4px solid #f59e0b", borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error || !chalet) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#0c0a09" }}>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 48 }}>🏕️</p>
          <p style={{ color: "#f5f5f4", fontWeight: 700, fontSize: 20 }}>الشاليه غير موجود</p>
        </div>
      </div>
    );
  }

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const coverPhoto = photos[0] ?? null;
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");

  const slots = [
    chalet.slotMorning  && { key: "morning",  price: fmt(chalet.priceMorning),  ci: chalet.morningCheckIn,  co: chalet.morningCheckOut  },
    chalet.slotEvening  && { key: "evening",  price: fmt(chalet.priceEvening),  ci: chalet.eveningCheckIn,  co: chalet.eveningCheckOut  },
    chalet.slotFullDay  && { key: "fullday",  price: fmt(chalet.priceFullDay),  ci: chalet.fullDayCheckIn,  co: chalet.fullDayCheckOut  },
  ].filter(Boolean) as { key: string; price: string | null; ci?: string | null; co?: string | null }[];

  const selectedSlot = slots.find(s => s.key === period);

  const handleBook = () => {
    if (!phone) return;
    let dateLine = "";
    if (date) { try { dateLine = toHijri(new Date(date)); } catch { dateLine = date; } }
    const meta = period ? SLOT_META[period] : null;
    const termsBlock = terms.length ? "\n\n📋 شروط الشاليه:\n" + terms.map(t => `• ${t}`).join("\n") : "";
    const msg = [
      `السلام عليكم، أرغب في حجز شاليه: ${chalet.nameAr}`,
      dateLine && `📅 التاريخ: ${dateLine}`,
      meta && selectedSlot ? `🕐 الفترة: ${meta.emoji} ${meta.ar}` : null,
      selectedSlot?.price ? `💰 السعر: ${selectedSlot.price}` : null,
      termsBlock,
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ── Shared inline style tokens ── */
  const card: React.CSSProperties = {
    background: "#111111",
    border: "1px solid rgba(212,175,55,0.25)",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000000", color: "#ffffff" }}>

      {/* ══════════════════════════════════════════════
          FORCED GLOBAL STYLE OVERRIDE — NO EXTERNAL CSS
      ══════════════════════════════════════════════ */}
      <style>{`
        body, html {
          background-color: #000000 !important;
          color: #ffffff !important;
        }
        #root, [data-reactroot] {
          background-color: #000000 !important;
        }
        .booking-page-wrap {
          background-color: #000000 !important;
          color: #ffffff !important;
          min-height: 100vh;
        }
        .booking-page-wrap * {
          box-sizing: border-box;
        }
        .booking-gold-btn {
          background: #D4AF37 !important;
          color: #000000 !important;
          font-weight: 800 !important;
          border: none !important;
          cursor: pointer !important;
          transition: opacity 0.2s !important;
        }
        .booking-gold-btn:hover {
          opacity: 0.88 !important;
        }
        .booking-card {
          background: #111111 !important;
          border: 1px solid rgba(212,175,55,0.25) !important;
          border-radius: 20px !important;
          overflow: hidden !important;
        }
        @keyframes bk-spin { to { transform: rotate(360deg); } }
        @media (max-width: 767px) {
          .booking-grid { grid-template-columns: 1fr !important; }
          .md-hide-mobile-bar { display: none !important; }
        }
        @media (min-width: 768px) {
          .md-hide-mobile-bar { display: none !important; }
        }
      `}</style>

      <Navbar />

      {/* ── Subtle ambient glow ── */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(212,175,55,0.07) 0%, transparent 70%)",
      }} />

      <div style={{ position: "relative", zIndex: 1, flex: 1 }}>

        {/* Breadcrumb */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 24px 8px" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#78716c", flexWrap: "wrap" }}>
            <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0 }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#f59e0b")}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#78716c")}>الرئيسية</button>
            <ChevronLeft size={12} />
            <button onClick={() => setLocation("/chalets")} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0 }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#f59e0b")}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#78716c")}>الشاليهات</button>
            <ChevronLeft size={12} />
            <button onClick={() => setLocation(`/chalets/${id}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#f59e0b")}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#78716c")}>{chalet.nameAr}</button>
            <ChevronLeft size={12} />
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>الحجز</span>
          </nav>
        </div>

        {/* Page heading */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 24px 28px", textAlign: "right" }}>
          <h1 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 900, lineHeight: 1.2, margin: 0 }}>
            <span style={{ color: "#f59e0b" }}>احجز</span>
            {" "}
            <span style={{ color: "#f5f5f4" }}>شاليهك الآن</span>
          </h1>
          <p style={{ color: "#a8a29e", fontSize: 14, marginTop: 6 }}>أكمل التفاصيل وأرسل طلبك مباشرة للمالك</p>
        </div>

        {/* ── Two-column grid ── */}
        <div style={{
          maxWidth: 1080, margin: "0 auto",
          padding: "0 24px 120px",
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 360px",
          gap: 24,
          alignItems: "start",
        }}
          className="booking-grid"
        >

          {/* ════ BOOKING FORM (left) ════ */}
          <div style={card}>

            {/* Form header */}
            <div style={{
              background: "linear-gradient(135deg, rgba(212,175,55,0.14) 0%, rgba(212,175,55,0.05) 100%)",
              borderBottom: "1px solid rgba(212,175,55,0.2)",
              padding: "20px 24px",
            }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: "#f5f5f4" }}>تفاصيل الحجز</p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a8a29e" }}>اختر التاريخ والفترة للمتابعة</p>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>

              {/* ─ Date ─ */}
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#e7e5e4" }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 10,
                    background: "rgba(245,158,11,0.18)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Calendar size={15} color="#f59e0b" />
                  </span>
                  تاريخ الحجز
                  <span style={{ color: "#f87171", fontSize: 12 }}>*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    height: 50, borderRadius: 12,
                    border: date ? "1.5px solid #D4AF37" : "1.5px solid rgba(212,175,55,0.3)",
                    background: "#1a1a1a",
                    color: "#ffffff", fontSize: 15,
                    padding: "0 16px",
                    outline: "none",
                    colorScheme: "dark",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                />
                {date && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>
                      {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
                    </span>
                  </div>
                )}
              </div>

              {/* ─ Periods ─ */}
              {slots.length > 0 && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#e7e5e4" }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 10,
                      background: "rgba(245,158,11,0.18)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Clock size={15} color="#f59e0b" />
                    </span>
                    الفترة المطلوبة
                    <span style={{ color: "#f87171", fontSize: 12 }}>*</span>
                  </label>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(slots.length, 3)}, 1fr)`,
                    gap: 12,
                  }}>
                    {slots.map(s => {
                      const active = period === s.key;
                      const meta = SLOT_META[s.key];
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setPeriod(s.key)}
                          style={{
                            cursor: "pointer",
                            borderRadius: 14,
                            border: active
                              ? `2px solid ${meta.color}`
                              : "2px solid rgba(120,113,108,0.3)",
                            background: active
                              ? `linear-gradient(145deg, ${meta.color}22 0%, ${meta.color}0a 100%)`
                              : "#1a1a1a",
                            padding: "14px 8px",
                            textAlign: "center",
                            transition: "all 0.2s",
                            boxShadow: active ? `0 0 20px ${meta.color}20` : "none",
                            position: "relative",
                          }}
                        >
                          {active && (
                            <span style={{
                              position: "absolute", top: 8, left: 8,
                              width: 8, height: 8, borderRadius: "50%",
                              background: meta.color,
                            }} />
                          )}
                          <p style={{ fontSize: 24, margin: "0 0 6px" }}>{meta.emoji}</p>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: active ? meta.color : "#d6d3d1" }}>
                            {meta.ar}
                          </p>
                          {s.price && (
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: active ? meta.color : "#a8a29e", fontWeight: 600 }}>
                              {s.price}
                            </p>
                          )}
                          {(s.ci || s.co) && (
                            <p style={{ margin: "6px 0 0", fontSize: 10, color: "#78716c", lineHeight: 1.4 }}>
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

              {/* ─ Price table ─ */}
              {(chalet.priceWeekday || chalet.priceWeekend) && (
                <div style={{
                  borderRadius: 14,
                  border: "1px solid rgba(120,113,108,0.25)",
                  background: "#161412",
                  overflow: "hidden",
                }}>
                  <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid rgba(120,113,108,0.2)" }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 }}>الأسعار</p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    {chalet.priceWeekday && (
                      <div style={{ padding: "12px 16px", textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#78716c" }}>وسط الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#fbbf24", fontSize: 14 }}>من {fmt(chalet.priceWeekday)}</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{ padding: "12px 16px", textAlign: "center", borderRight: "1px solid rgba(120,113,108,0.2)" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#78716c" }}>نهاية الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#fbbf24", fontSize: 14 }}>من {fmt(chalet.priceWeekend)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─ Terms ─ */}
              {terms.length > 0 && (
                <div style={{
                  borderRadius: 14,
                  border: "1px solid rgba(217,119,6,0.25)",
                  background: "rgba(120,53,15,0.12)",
                  overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => setTermsOpen(v => !v)}
                    style={{
                      width: "100%", border: "none", background: "transparent",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 16px", cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8 }}>
                      📋 شروط الحجز
                      <span style={{ fontWeight: 400, fontSize: 11, color: "#d97706", opacity: 0.8 }}>({terms.length} شرط)</span>
                    </span>
                    {termsOpen
                      ? <ChevronUp size={16} color="#f59e0b" />
                      : <ChevronDown size={16} color="#f59e0b" />
                    }
                  </button>
                  {termsOpen ? (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(217,119,6,0.15)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      {terms.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <CheckCircle2 size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12, color: "#d6d3d1", lineHeight: 1.6 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: "0 16px 12px", fontSize: 11, color: "#a16207", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {terms.slice(0, 2).map(t => `• ${t}`).join("  ·  ")}
                      {terms.length > 2 && ` · +${terms.length - 2}`}
                    </p>
                  )}
                </div>
              )}

              {/* ─ CTA ─ */}
              {phone ? (
                <button
                  onClick={handleBook}
                  className="booking-gold-btn"
                  style={{
                    width: "100%", height: 56, borderRadius: 16,
                    background: "#D4AF37",
                    color: "#000000", fontWeight: 800, fontSize: 16,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                    cursor: "pointer", border: "none",
                    boxShadow: "0 4px 24px rgba(212,175,55,0.4)",
                    transition: "transform 0.15s, opacity 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
                >
                  <Calendar size={20} />
                  احجز الآن
                </button>
              ) : (
                <div style={{
                  width: "100%", height: 56, borderRadius: 16,
                  background: "#1c1917", border: "1px solid rgba(120,113,108,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#78716c", fontSize: 14,
                }}>
                  لا يوجد رقم تواصل متاح
                </div>
              )}

              {/* Trust */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, color: "#78716c" }}>
                <ShieldCheck size={14} color="#b45309" />
                ضمان <span style={{ color: "#d97706", fontWeight: 700 }}>حكاية أناقة</span> — تأكد من الحساب قبل الدفع
              </div>
            </div>
          </div>

          {/* ════ CHALET CARD (right) ════ */}
          <div style={{ ...card, position: "sticky", top: 24 }}>

            {/* Photo */}
            <div style={{ position: "relative", aspectRatio: "4/3", overflow: "hidden", background: "#292524" }}>
              {coverPhoto ? (
                <>
                  <img
                    src={coverPhoto}
                    alt={chalet.nameAr}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(to top, rgba(12,10,9,0.85) 0%, rgba(12,10,9,0.1) 60%, transparent 100%)",
                  }} />
                </>
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>🏕️</div>
              )}

              {chalet.isVerified && (
                <div style={{
                  position: "absolute", top: 12, left: 12,
                  background: "rgba(245,158,11,0.92)", backdropFilter: "blur(4px)",
                  padding: "4px 10px", borderRadius: 20,
                  fontSize: 11, fontWeight: 700, color: "#1c1917",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <ShieldCheck size={11} /> موثوق
                </div>
              )}

              {photos.length > 1 && (
                <div style={{
                  position: "absolute", bottom: 12, left: 12,
                  background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                  padding: "3px 10px", borderRadius: 20,
                  fontSize: 11, color: "#fff",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  📷 {photos.length} صور
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#f5f5f4" }}>{chalet.nameAr}</h2>
                {(chalet.location || chalet.district) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <MapPin size={13} color="#f59e0b" />
                    <span style={{ fontSize: 13, color: "#a8a29e" }}>
                      {[chalet.district, chalet.location].filter(Boolean).join("، ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Stats */}
              {(chalet.maxGuests || chalet.bedrooms) && (
                <div style={{ display: "flex", gap: 16 }}>
                  {chalet.maxGuests && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#a8a29e" }}>
                      <Users size={14} color="#d97706" />
                      {chalet.maxGuests} ضيف
                    </div>
                  )}
                  {chalet.bedrooms && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#a8a29e" }}>
                      <BedDouble size={14} color="#d97706" />
                      {chalet.bedrooms} غرف
                    </div>
                  )}
                </div>
              )}

              <div style={{ height: 1, background: "rgba(120,113,108,0.2)" }} />

              {/* Prices */}
              {(chalet.priceWeekday || chalet.priceWeekend || chalet.pricePerNight) && (
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: 1 }}>الأسعار</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {chalet.priceWeekday && (
                      <div style={{
                        borderRadius: 12, border: "1px solid rgba(120,113,108,0.25)",
                        background: "#161412", padding: "10px 12px", textAlign: "center",
                      }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>وسط الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#fbbf24", fontSize: 13 }}>{fmt(chalet.priceWeekday)}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "#57534e" }}>/ ليلة</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{
                        borderRadius: 12, border: "1px solid rgba(120,113,108,0.25)",
                        background: "#161412", padding: "10px 12px", textAlign: "center",
                      }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>نهاية الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#fbbf24", fontSize: 13 }}>{fmt(chalet.priceWeekend)}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "#57534e" }}>/ ليلة</p>
                      </div>
                    )}
                    {!chalet.priceWeekday && !chalet.priceWeekend && chalet.pricePerNight && (
                      <div style={{
                        gridColumn: "span 2",
                        borderRadius: 12, border: "1px solid rgba(120,113,108,0.25)",
                        background: "#161412", padding: "10px 12px", textAlign: "center",
                      }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>السعر لليلة</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#fbbf24", fontSize: 16 }}>{fmt(chalet.pricePerNight)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Slot prices */}
              {slots.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {slots.map(s => {
                    const meta = SLOT_META[s.key];
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                        <span style={{ fontSize: 13, color: "#a8a29e", display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{meta.emoji}</span>
                          <span>فترة {meta.ar}</span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>{s.price ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Check-in/out */}
              {(chalet.checkInTime || chalet.checkOutTime) && (
                <div style={{
                  borderRadius: 12, border: "1px solid rgba(120,113,108,0.2)",
                  background: "#161412", padding: "12px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  {chalet.checkInTime && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={13} color="#f59e0b" />
                      <div>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>تسجيل دخول</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "#e7e5e4" }}>{chalet.checkInTime}</p>
                      </div>
                    </div>
                  )}
                  {chalet.checkOutTime && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "right" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>تسجيل خروج</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "#e7e5e4" }}>{chalet.checkOutTime}</p>
                      </div>
                      <Clock size={13} color="#f59e0b" />
                    </div>
                  )}
                </div>
              )}

              {/* Back to detail */}
              <button
                onClick={() => setLocation(`/chalets/${id}`)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "10px 16px", borderRadius: 12,
                  border: "1px solid rgba(120,113,108,0.3)",
                  color: "#a8a29e", fontSize: 13, fontWeight: 600,
                  background: "transparent",
                  cursor: "pointer",
                  transition: "background 0.2s, color 0.2s",
                  width: "100%",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#1c1917";
                  (e.currentTarget as HTMLButtonElement).style.color = "#e7e5e4";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "#a8a29e";
                }}
              >
                <ChevronRight size={15} />
                عرض تفاصيل الشاليه
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile sticky bar ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: "rgba(12,10,9,0.97)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(245,158,11,0.15)",
        padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 12,
      }} className="md-hide-mobile-bar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f5f5f4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chalet.nameAr}
          </p>
          {chalet.priceWeekday && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#f59e0b" }}>
              يبدأ من {fmt(chalet.priceWeekday)}
            </p>
          )}
        </div>
        {phone && (
          <button
            onClick={handleBook}
            style={{
              flexShrink: 0, height: 44, padding: "0 20px", borderRadius: 14, border: "none",
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
              color: "#fff", fontWeight: 700, fontSize: 14,
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            }}
          >
            احجز الآن
          </button>
        )}
      </div>

      {/* ── Responsive styles ── */}
      <style>{`
        @media (min-width: 768px) {
          .md-hide-mobile-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .booking-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <Footer />
    </div>
  );
}
