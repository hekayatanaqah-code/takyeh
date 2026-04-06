import { useState } from "react";
import { useParams, useLocation } from "wouter";
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

  const [date, setDate]         = useState("");
  const [period, setPeriod]     = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(false);

  /* ── FORCED GLOBAL CSS: injected once per page mount ── */
  const FORCE_CSS = `
    html, body { background: #000000 !important; color: #ffffff !important; margin: 0; padding: 0; }
    #root { background: #000000 !important; min-height: 100vh; }
    * { box-sizing: border-box; }
    @keyframes bk-spin { to { transform: rotate(360deg); } }
    @media (max-width: 767px) { .bk-grid { grid-template-columns: 1fr !important; } .bk-mobile-bar { display: none !important; } }
    @media (min-width: 768px) { .bk-mobile-bar { display: none !important; } }
  `;

  /* ── Loading ── */
  if (isLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000000" }}>
      <style>{FORCE_CSS}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #D4AF37", borderTopColor: "transparent", animation: "bk-spin 0.8s linear infinite" }} />
      </div>
    </div>
  );

  /* ── Error ── */
  if (error || !chalet) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000000" }}>
      <style>{FORCE_CSS}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 48, margin: 0 }}>🏕️</p>
        <p style={{ color: "#ffffff", fontWeight: 700, fontSize: 20, margin: 0 }}>الشاليه غير موجود</p>
      </div>
    </div>
  );

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const coverPhoto = photos[0] ?? null;
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");

  const slots = [
    chalet.slotMorning && { key: "morning", price: fmt(chalet.priceMorning), ci: chalet.morningCheckIn, co: chalet.morningCheckOut },
    chalet.slotEvening && { key: "evening", price: fmt(chalet.priceEvening), ci: chalet.eveningCheckIn, co: chalet.eveningCheckOut },
    chalet.slotFullDay && { key: "fullday", price: fmt(chalet.priceFullDay), ci: chalet.fullDayCheckIn, co: chalet.fullDayCheckOut },
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

  /* ── Style tokens ── */
  const CARD: React.CSSProperties = {
    background: "#111111",
    border: "1px solid rgba(212,175,55,0.3)",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
  };
  const GOLD_BTN: React.CSSProperties = {
    width: "100%", height: 56, borderRadius: 16, border: "none",
    background: "#D4AF37", color: "#000000", fontWeight: 800, fontSize: 16,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    cursor: "pointer", boxShadow: "0 4px 24px rgba(212,175,55,0.45)",
  };

  return (
    <div dir="rtl" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#000000", color: "#ffffff" }}>

      {/* ══ FORCED STYLES — cannot be overridden ══ */}
      <style>{FORCE_CSS}</style>

      <Navbar />

      <div style={{ position: "relative", zIndex: 1, flex: 1 }}>

        {/* Breadcrumb */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 24px 8px" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#78716c", flexWrap: "wrap" }}>
            <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0 }}>الرئيسية</button>
            <ChevronLeft size={12} />
            <button onClick={() => setLocation("/chalets")} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0 }}>الشاليهات</button>
            <ChevronLeft size={12} />
            <button onClick={() => setLocation(`/chalets/${id}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#78716c", fontSize: 12, padding: 0 }}>{chalet.nameAr}</button>
            <ChevronLeft size={12} />
            <span style={{ color: "#D4AF37", fontWeight: 600 }}>الحجز</span>
          </nav>
        </div>

        {/* Heading */}
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 24px 28px", textAlign: "right" }}>
          <h1 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 900, lineHeight: 1.2, margin: 0 }}>
            <span style={{ color: "#D4AF37" }}>احجز</span>{" "}
            <span style={{ color: "#ffffff" }}>شاليهك الآن</span>
          </h1>
          <p style={{ color: "#a8a29e", fontSize: 14, marginTop: 6, margin: "6px 0 0" }}>أكمل التفاصيل وأرسل طلبك مباشرة للمالك</p>
        </div>

        {/* Two-column grid */}
        <div className="bk-grid" style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px 80px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 24, alignItems: "start" }}>

          {/* ══ BOOKING FORM ══ */}
          <div style={CARD}>
            <div style={{ background: "linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.04))", borderBottom: "1px solid rgba(212,175,55,0.2)", padding: "20px 24px" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: "#ffffff" }}>تفاصيل الحجز</p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#a8a29e" }}>اختر التاريخ والفترة للمتابعة</p>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Date */}
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#ffffff" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(212,175,55,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Calendar size={15} color="#D4AF37" />
                  </span>
                  تاريخ الحجز <span style={{ color: "#f87171", fontSize: 12 }}>*</span>
                </label>
                <input
                  type="date" value={date}
                  onChange={e => setDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  style={{ width: "100%", height: 50, borderRadius: 12, border: `1.5px solid ${date ? "#D4AF37" : "rgba(212,175,55,0.3)"}`, background: "#1a1a1a", color: "#ffffff", fontSize: 15, padding: "0 16px", outline: "none", colorScheme: "dark", cursor: "pointer" }}
                />
                {date && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#D4AF37", fontWeight: 600 }}>
                    {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
                  </p>
                )}
              </div>

              {/* Periods */}
              {slots.length > 0 && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14, fontWeight: 700, color: "#ffffff" }}>
                    <span style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(212,175,55,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Clock size={15} color="#D4AF37" />
                    </span>
                    الفترة المطلوبة <span style={{ color: "#f87171", fontSize: 12 }}>*</span>
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(slots.length, 3)}, 1fr)`, gap: 12 }}>
                    {slots.map(s => {
                      const active = period === s.key;
                      const meta = SLOT_META[s.key];
                      return (
                        <button key={s.key} type="button" onClick={() => setPeriod(s.key)}
                          style={{ cursor: "pointer", borderRadius: 14, border: active ? `2px solid ${meta.color}` : "2px solid rgba(120,113,108,0.3)", background: active ? `${meta.color}22` : "#1a1a1a", padding: "14px 8px", textAlign: "center", transition: "all 0.2s", position: "relative" }}>
                          <p style={{ fontSize: 24, margin: "0 0 6px" }}>{meta.emoji}</p>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: active ? meta.color : "#d6d3d1" }}>{meta.ar}</p>
                          {s.price && <p style={{ margin: "4px 0 0", fontSize: 12, color: active ? meta.color : "#a8a29e", fontWeight: 600 }}>{s.price}</p>}
                          {(s.ci || s.co) && (
                            <p style={{ margin: "6px 0 0", fontSize: 10, color: "#78716c", lineHeight: 1.4 }}>
                              {s.ci && `دخول ${s.ci}`}{s.ci && s.co && <br />}{s.co && `خروج ${s.co}`}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price table */}
              {(chalet.priceWeekday || chalet.priceWeekend) && (
                <div style={{ borderRadius: 14, border: "1px solid rgba(120,113,108,0.25)", background: "#0a0a0a", overflow: "hidden" }}>
                  <p style={{ margin: 0, padding: "10px 16px 8px", fontSize: 11, fontWeight: 700, color: "#78716c", borderBottom: "1px solid rgba(120,113,108,0.2)" }}>الأسعار</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                    {chalet.priceWeekday && (
                      <div style={{ padding: "12px 16px", textAlign: "center" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#78716c" }}>وسط الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#D4AF37", fontSize: 14 }}>من {fmt(chalet.priceWeekday)}</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{ padding: "12px 16px", textAlign: "center", borderRight: "1px solid rgba(120,113,108,0.2)" }}>
                        <p style={{ margin: 0, fontSize: 11, color: "#78716c" }}>نهاية الأسبوع</p>
                        <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#D4AF37", fontSize: 14 }}>من {fmt(chalet.priceWeekend)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Terms */}
              {terms.length > 0 && (
                <div style={{ borderRadius: 14, border: "1px solid rgba(212,175,55,0.2)", background: "rgba(212,175,55,0.04)", overflow: "hidden" }}>
                  <button type="button" onClick={() => setTermsOpen(v => !v)}
                    style={{ width: "100%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#D4AF37" }}>📋 شروط الحجز <span style={{ fontWeight: 400, fontSize: 11, color: "#a8a29e" }}>({terms.length} شرط)</span></span>
                    {termsOpen ? <ChevronUp size={16} color="#D4AF37" /> : <ChevronDown size={16} color="#D4AF37" />}
                  </button>
                  {termsOpen && (
                    <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(212,175,55,0.1)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                      {terms.map((t, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <CheckCircle2 size={14} color="#D4AF37" style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontSize: 12, color: "#d6d3d1", lineHeight: 1.6 }}>{t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── GOLD BOOK BUTTON ── */}
              {phone ? (
                <button onClick={handleBook} style={GOLD_BTN}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.88"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}>
                  <Calendar size={20} />
                  احجز الآن
                </button>
              ) : (
                <div style={{ width: "100%", height: 56, borderRadius: 16, background: "#1a1a1a", border: "1px solid rgba(120,113,108,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#78716c", fontSize: 14 }}>
                  لا يوجد رقم تواصل متاح
                </div>
              )}

              <p style={{ textAlign: "center", fontSize: 11, color: "#78716c", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ShieldCheck size={14} color="#D4AF37" />
                ضمان <strong style={{ color: "#D4AF37" }}>حكاية أناقة</strong> — تأكد من الحساب قبل الدفع
              </p>
            </div>
          </div>

          {/* ══ CHALET SUMMARY CARD ══ */}
          <div style={{ ...CARD, position: "sticky", top: 24 }}>

            {/* Photo */}
            <div style={{ position: "relative", aspectRatio: "4/3", overflow: "hidden", background: "#1a1a1a" }}>
              {coverPhoto ? (
                <>
                  <img src={coverPhoto} alt={chalet.nameAr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 60%)" }} />
                </>
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>🏕️</div>
              )}
              {chalet.isVerified && (
                <div style={{ position: "absolute", top: 12, left: 12, background: "#D4AF37", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: "#000000", display: "flex", alignItems: "center", gap: 4 }}>
                  <ShieldCheck size={11} /> موثوق
                </div>
              )}
              {photos.length > 1 && (
                <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.6)", padding: "3px 10px", borderRadius: 20, fontSize: 11, color: "#ffffff" }}>
                  📷 {photos.length} صور
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#ffffff" }}>{chalet.nameAr}</h2>
                {(chalet.location || chalet.district) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <MapPin size={13} color="#D4AF37" />
                    <span style={{ fontSize: 13, color: "#a8a29e" }}>{[chalet.district, chalet.location].filter(Boolean).join("، ")}</span>
                  </div>
                )}
              </div>

              {(chalet.maxGuests || chalet.bedrooms) && (
                <div style={{ display: "flex", gap: 16 }}>
                  {chalet.maxGuests && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#a8a29e" }}><Users size={14} color="#D4AF37" />{chalet.maxGuests} ضيف</div>}
                  {chalet.bedrooms && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#a8a29e" }}><BedDouble size={14} color="#D4AF37" />{chalet.bedrooms} غرف</div>}
                </div>
              )}

              <div style={{ height: 1, background: "rgba(212,175,55,0.15)" }} />

              {/* Weekly prices */}
              {(chalet.priceWeekday || chalet.priceWeekend) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {chalet.priceWeekday && (
                    <div style={{ borderRadius: 12, border: "1px solid rgba(212,175,55,0.2)", background: "#0a0a0a", padding: "10px 12px", textAlign: "center" }}>
                      <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>وسط الأسبوع</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#D4AF37", fontSize: 13 }}>{fmt(chalet.priceWeekday)}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#57534e" }}>/ ليلة</p>
                    </div>
                  )}
                  {chalet.priceWeekend && (
                    <div style={{ borderRadius: 12, border: "1px solid rgba(212,175,55,0.2)", background: "#0a0a0a", padding: "10px 12px", textAlign: "center" }}>
                      <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>نهاية الأسبوع</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 700, color: "#D4AF37", fontSize: 13 }}>{fmt(chalet.priceWeekend)}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 10, color: "#57534e" }}>/ ليلة</p>
                    </div>
                  )}
                </div>
              )}

              {/* Slot prices */}
              {slots.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {slots.map(s => {
                    const meta = SLOT_META[s.key];
                    return (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#a8a29e" }}>{meta.emoji} فترة {meta.ar}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#D4AF37" }}>{s.price ?? "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Check-in/out */}
              {(chalet.checkInTime || chalet.checkOutTime) && (
                <div style={{ borderRadius: 12, border: "1px solid rgba(212,175,55,0.15)", background: "#0a0a0a", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {chalet.checkInTime && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={13} color="#D4AF37" />
                      <div>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>تسجيل دخول</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "#ffffff" }}>{chalet.checkInTime}</p>
                      </div>
                    </div>
                  )}
                  {chalet.checkOutTime && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "right" }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, color: "#78716c" }}>تسجيل خروج</p>
                        <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 700, color: "#ffffff" }}>{chalet.checkOutTime}</p>
                      </div>
                      <Clock size={13} color="#D4AF37" />
                    </div>
                  )}
                </div>
              )}

              {/* Back link */}
              <button onClick={() => setLocation(`/chalets/${id}`)}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 16px", borderRadius: 12, border: "1px solid rgba(212,175,55,0.2)", color: "#a8a29e", fontSize: 13, fontWeight: 600, background: "transparent", cursor: "pointer", width: "100%" }}>
                <ChevronRight size={15} />
                عرض تفاصيل الشاليه
              </button>
            </div>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}