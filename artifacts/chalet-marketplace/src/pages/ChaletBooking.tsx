import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";

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

const SLOT_META: Record<string, { emoji: string; ar: string; bg: string; border: string; text: string }> = {
  morning: { emoji: "🌅", ar: "صباحي",    bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  evening: { emoji: "🌙", ar: "مسائي",    bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" },
  fullday: { emoji: "☀️", ar: "يوم كامل", bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" },
};

export default function ChaletBooking() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [date, setDate]         = useState("");
  const [period, setPeriod]     = useState<string | null>(null);
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
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column" }}>
        <style>{`body,html{background:#fff!important}#root{background:#fff!important}@keyframes bspin{to{transform:rotate(360deg)}}`}</style>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#16a34a", animation: "bspin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#6b7280", fontSize: 14 }}>جاري التحميل...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !chalet) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column" }}>
        <style>{`body,html{background:#fff!important}#root{background:#fff!important}`}</style>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 64 }}>🏕️</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>الشاليه غير موجود</p>
          <button onClick={() => setLocation("/chalets")} style={{
            padding: "10px 28px", borderRadius: 10, background: "#16a34a",
            color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 15,
          }}>عرض جميع الشاليهات</button>
        </div>
      </div>
    );
  }

  const photos: string[] = Array.isArray(chalet.photos) ? chalet.photos : [];
  const coverPhoto = photos[0] ?? null;
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");
  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

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

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>

      <style>{`
        body, html { background: #f9fafb !important; color: #111827 !important; }
        #root { background: #f9fafb !important; }
        @keyframes bspin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .book-grid { flex-direction: column-reverse !important; }
          .book-sidebar { width: 100% !important; position: static !important; }
          .book-mobile-bar { display: flex !important; }
        }
        @media (min-width: 769px) {
          .book-mobile-bar { display: none !important; }
        }
      `}</style>

      <Navbar />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px 20px 120px" }}>

        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9ca3af", marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={() => setLocation("/")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>الرئيسية</button>
          <span>›</span>
          <button onClick={() => setLocation("/chalets")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>الشاليهات</button>
          <span>›</span>
          <button onClick={() => setLocation(`/chalets/${id}`)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13, padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")}
            onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>{chalet.nameAr}</button>
          <span>›</span>
          <span style={{ color: "#374151", fontWeight: 600 }}>الحجز</span>
        </nav>

        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px,4vw,30px)", fontWeight: 900, color: "#111827" }}>
            احجز شاليهك الآن
          </h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 14 }}>أكمل التفاصيل وأرسل طلبك مباشرة للمالك</p>
        </div>

        {/* ── Two-column ── */}
        <div className="book-grid" style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>

          {/* ── FORM (main) ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Date */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
              <label style={{ display: "block", marginBottom: 10, fontSize: 15, fontWeight: 700, color: "#111827" }}>
                📅 تاريخ الحجز <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div
                style={{
                  width: "100%", minHeight: 50, borderRadius: 10,
                  border: date ? "2px solid #16a34a" : "2px solid #d1d5db",
                  background: "#fff", color: "#111827",
                  padding: "0 16px", boxSizing: "border-box",
                  display: "flex", alignItems: "center",
                }}
              >
                <DualCalendarPicker
                value={date}
                  onChange={setDate}
                  minDate={new Date().toISOString().split("T")[0]}
                  placeholder="اختر تاريخ الحجز"
                  mode="gregorian"
                />
              </div>
              {date && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                  📅 {(() => { try { return toHijri(new Date(date)); } catch { return ""; } })()}
                </p>
              )}
            </div>

            {/* Period selection */}
            {slots.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <label style={{ display: "block", marginBottom: 14, fontSize: 15, fontWeight: 700, color: "#111827" }}>
                  🕐 الفترة المطلوبة <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(slots.length, 3)}, 1fr)`, gap: 14 }}>
                  {slots.map(s => {
                    const active = period === s.key;
                    const meta = SLOT_META[s.key];
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setPeriod(s.key)}
                        style={{
                          cursor: "pointer", borderRadius: 12, padding: "16px 10px",
                          border: active ? `2px solid #16a34a` : `2px solid ${meta.border}`,
                          background: active ? "#f0fdf4" : meta.bg,
                          textAlign: "center",
                          transition: "all 0.2s",
                          outline: "none",
                        }}
                      >
                        <p style={{ fontSize: 28, margin: "0 0 8px" }}>{meta.emoji}</p>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: active ? "#16a34a" : meta.text }}>{meta.ar}</p>
                        {s.price && (
                          <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 800, color: active ? "#16a34a" : meta.text }}>{s.price}</p>
                        )}
                        {(s.ci || s.co) && (
                          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
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

            {/* Price summary */}
            {(chalet.priceWeekday || chalet.priceWeekend) && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "20px 28px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
                <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#111827" }}>💰 الأسعار</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {chalet.priceWeekday && (
                    <div style={{ textAlign: "center", padding: "14px", borderRadius: 10, background: "#f9fafb", border: "1.5px solid #e5e7eb" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>وسط الأسبوع</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 800, color: "#16a34a", fontSize: 16 }}>من {fmt(chalet.priceWeekday)}</p>
                    </div>
                  )}
                  {chalet.priceWeekend && (
                    <div style={{ textAlign: "center", padding: "14px", borderRadius: 10, background: "#f9fafb", border: "1.5px solid #e5e7eb" }}>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>نهاية الأسبوع</p>
                      <p style={{ margin: "4px 0 0", fontWeight: 800, color: "#16a34a", fontSize: 16 }}>من {fmt(chalet.priceWeekend)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terms */}
            {terms.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", border: "1.5px solid #fde68a" }}>
                <button
                  onClick={() => setTermsOpen(v => !v)}
                  style={{
                    width: "100%", background: "#fffbeb", border: "none",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 24px", cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>
                    📋 شروط الحجز <span style={{ fontWeight: 400, color: "#d97706" }}>({terms.length} شرط)</span>
                  </span>
                  <span style={{ color: "#d97706", fontSize: 18 }}>{termsOpen ? "▲" : "▼"}</span>
                </button>
                {termsOpen && (
                  <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {terms.map((t, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ color: "#16a34a", flexShrink: 0, marginTop: 2 }}>✓</span>
                        <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Book button (large, on form) */}
            {phone ? (
              <button
                onClick={handleBook}
                style={{
                  width: "100%", height: 56, borderRadius: 14, border: "none",
                  background: "#16a34a", color: "#fff",
                  fontWeight: 800, fontSize: 17, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                  transition: "background 0.2s",
                  boxShadow: "0 4px 16px rgba(22,163,74,0.3)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#15803d")}
                onMouseLeave={e => (e.currentTarget.style.background = "#16a34a")}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                احجز الآن عبر واتساب
              </button>
            ) : (
              <div style={{
                width: "100%", height: 56, borderRadius: 14,
                background: "#f3f4f6", border: "1.5px solid #e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: 14,
              }}>
                لا يوجد رقم تواصل متاح
              </div>
            )}

            {/* Trust note */}
            <p style={{ margin: 0, textAlign: "center", fontSize: 11, color: "#9ca3af" }}>
              ✓ تأكد من الحساب الرسمي قبل أي دفع — حكاية أناقة
            </p>

          </div>

          {/* ── SIDEBAR: Chalet summary ── */}
          <div className="book-sidebar" style={{ width: 320, position: "sticky", top: 88, flexShrink: 0 }}>
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.1)", overflow: "hidden", border: "1px solid #e5e7eb" }}>

              {/* Cover photo */}
              <div style={{ position: "relative", aspectRatio: "4/3", background: "#f3f4f6", overflow: "hidden" }}>
                {coverPhoto ? (
                  <img src={coverPhoto} alt={chalet.nameAr} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🏕️</div>
                )}
                {photos.length > 1 && (
                  <div style={{
                    position: "absolute", bottom: 10, left: 10,
                    background: "rgba(0,0,0,0.55)", color: "#fff",
                    padding: "3px 10px", borderRadius: 20, fontSize: 11,
                  }}>📷 {photos.length} صور</div>
                )}
              </div>

              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" }}>{chalet.nameAr}</h2>
                  {(chalet.location || chalet.district) && (
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                      <span>📍</span>{[chalet.district, chalet.location].filter(Boolean).join("، ")}
                    </p>
                  )}
                </div>

                <div style={{ height: 1, background: "#f3f4f6" }} />

                {/* Prices */}
                {(chalet.priceWeekday || chalet.priceWeekend) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {chalet.priceWeekday && (
                      <div style={{ textAlign: "center", padding: "10px", borderRadius: 8, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>وسط الأسبوع</p>
                        <p style={{ margin: "3px 0 0", fontWeight: 800, color: "#16a34a", fontSize: 13 }}>{fmt(chalet.priceWeekday)}</p>
                        <p style={{ margin: "1px 0 0", fontSize: 9, color: "#9ca3af" }}>/ ليلة</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{ textAlign: "center", padding: "10px", borderRadius: 8, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                        <p style={{ margin: 0, fontSize: 10, color: "#6b7280" }}>نهاية الأسبوع</p>
                        <p style={{ margin: "3px 0 0", fontWeight: 800, color: "#16a34a", fontSize: 13 }}>{fmt(chalet.priceWeekend)}</p>
                        <p style={{ margin: "1px 0 0", fontSize: 9, color: "#9ca3af" }}>/ ليلة</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Slot prices listed */}
                {slots.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {slots.map(s => {
                      const meta = SLOT_META[s.key];
                      return (
                        <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "#6b7280" }}>{meta.emoji} فترة {meta.ar}</span>
                          <span style={{ fontWeight: 700, color: "#374151" }}>{s.price ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Back link */}
                <button
                  onClick={() => setLocation(`/chalets/${id}`)}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 10,
                    border: "1.5px solid #e5e7eb", background: "#fff",
                    color: "#6b7280", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#16a34a"; e.currentTarget.style.color = "#16a34a"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#6b7280"; }}
                >
                  ← عرض تفاصيل الشاليه
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile sticky bar */}
      <div className="book-mobile-bar" style={{
        display: "none",
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "#fff", borderTop: "1px solid #e5e7eb",
        padding: "12px 20px", alignItems: "center", gap: 12,
        boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chalet.nameAr}</p>
          {fmt(chalet.priceWeekday) && (
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#16a34a", fontWeight: 700 }}>من {fmt(chalet.priceWeekday)}</p>
          )}
        </div>
        {phone && (
          <button onClick={handleBook} style={{
            flexShrink: 0, height: 44, padding: "0 20px", borderRadius: 10,
            background: "#16a34a", color: "#fff", fontWeight: 800,
            fontSize: 14, border: "none", cursor: "pointer",
          }}>
            احجز الآن
          </button>
        )}
      </div>

      <Footer />
    </div>
  );
}
