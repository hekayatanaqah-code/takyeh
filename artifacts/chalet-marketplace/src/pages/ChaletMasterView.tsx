import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import type { DiamondData } from "@/components/chalet/ChaletDiamondContent";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { resolveAmenity } from "@/lib/amenityUtils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(v: string | number | null | undefined) {
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString("ar-SA")} ر.س`;
}

function toHijri(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", { day: "numeric", month: "long", year: "numeric" }).format(d);
    const greg  = new Intl.DateTimeFormat("ar-SA",              { day: "numeric", month: "long", year: "numeric" }).format(d);
    return `${hijri} / ${greg}`;
  } catch { return dateStr; }
}

const CARD: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 20,
  padding: "28px 32px",
  marginBottom: 24,
  boxShadow: "0 2px 16px rgba(0,0,0,0.07)",
  border: "1px solid #f0f0f0",
};

const SEC: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 19,
  fontWeight: 900,
  color: "#111827",
  borderRight: "4px solid #16a34a",
  paddingRight: 12,
};

const SLOT_CONF = {
  morning: { emoji: "🌅", ar: "صباحي",    bg: "#fffbeb", border: "#fde68a", active: "#fef3c7", text: "#92400e" },
  evening: { emoji: "🌙", ar: "مسائي",    bg: "#eef2ff", border: "#c7d2fe", active: "#e0e7ff", text: "#3730a3" },
  fullday: { emoji: "☀️", ar: "يوم كامل", bg: "#ecfdf5", border: "#a7f3d0", active: "#d1fae5", text: "#065f46" },
};

export default function ChaletMasterView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [mainPhoto, setMainPhoto] = useState(0);
  const [termsOpen, setTermsOpen]   = useState(false);
  const [bookDate,  setBookDate]    = useState("");
  const [period,    setPeriod]      = useState<string | null>(null);

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

  const { data: amenitiesCatalog = [] } = useQuery<Array<{ key: string; labelAr: string }>>({
    queryKey: ["catalog", "amenities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    staleTime: 10 * 60 * 1000,
  });

  /* ── loading ── */
  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}} body,html{background:#f9fafb!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #e5e7eb", borderTopColor: "#16a34a", animation: "sp .8s linear infinite", margin: "0 auto 14px" }} />
          <p style={{ color: "#6b7280", fontSize: 14 }}>جاري التحميل...</p>
        </div>
      </div>
    </div>
  );

  /* ── error ── */
  if (error || !chalet) return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
      <style>{`body,html{background:#f9fafb!important}`}</style>
      <Navbar />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 64 }}>🏕️</p>
        <p style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>الشاليه غير موجود</p>
        <button onClick={() => setLocation("/chalets")} style={{ padding: "12px 32px", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 15 }}>
          عرض جميع الشاليهات
        </button>
      </div>
    </div>
  );

  const photos: string[]    = Array.isArray(chalet.photos) ? chalet.photos : [];
  const amenities: string[] = Array.isArray(chalet.amenities) ? chalet.amenities : [];
  const phone  = (chalet.whatsappNumber ?? "").replace(/\D/g, "");
  const terms  = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);

  /* available booking slots */
  const slots = [
    chalet.slotMorning && { key: "morning", price: fmt(chalet.priceMorning), ci: chalet.morningCheckIn, co: chalet.morningCheckOut },
    chalet.slotEvening && { key: "evening", price: fmt(chalet.priceEvening), ci: chalet.eveningCheckIn, co: chalet.eveningCheckOut },
    chalet.slotFullDay && { key: "fullday", price: fmt(chalet.priceFullDay), ci: chalet.fullDayCheckIn, co: chalet.fullDayCheckOut },
  ].filter(Boolean) as { key: string; price: string | null; ci?: string | null; co?: string | null }[];

  const selSlot = slots.find(s => s.key === period);
  const selConf = period ? SLOT_CONF[period as keyof typeof SLOT_CONF] : null;

  /* Google Maps embed URL */
  const mapQuery = encodeURIComponent(
    [chalet.nameAr, chalet.district, chalet.location, "القصيم"].filter(Boolean).join(" ")
  );
  const mapSrc = `https://maps.google.com/maps?q=${mapQuery}&output=embed&hl=ar&z=14`;

  /* WhatsApp booking message */
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
    <div dir="rtl" style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", flexDirection: "column" }}>
      <style>{`
        body,html { background:#f9fafb!important; color:#111827!important; }
        #root { background:#f9fafb!important; }
        @media(max-width:960px){
          .cdg  { flex-direction:column!important; }
          .cdsb { position:static!important; width:100%!important; }
          .cdmb { display:flex!important; }
        }
        @media(min-width:961px){ .cdmb{display:none!important;} }
      `}</style>

      <Navbar />

      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%", padding: "28px 28px 140px" }}>

        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9ca3af", marginBottom: 22, flexWrap: "wrap" }}>
          {[{l:"الرئيسية",p:"/"},{l:"الشاليهات",p:"/chalets"}].map(({l,p})=>(
            <span key={p} style={{display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setLocation(p)} style={{background:"none",border:"none",cursor:"pointer",color:"#9ca3af",fontSize:13,padding:0}}
                onMouseEnter={e=>(e.currentTarget.style.color="#16a34a")}
                onMouseLeave={e=>(e.currentTarget.style.color="#9ca3af")}>{l}</button>
              <span style={{color:"#d1d5db"}}>›</span>
            </span>
          ))}
          <span style={{color:"#374151",fontWeight:700}}>{chalet.nameAr}</span>
        </nav>

        {/* ── FULL-WIDTH GALLERY ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ position:"relative", borderRadius:20, overflow:"hidden", background:"#e5e7eb", aspectRatio:"21/9", maxHeight:480, boxShadow:"0 4px 28px rgba(0,0,0,0.12)" }}>
            {photos[mainPhoto]
              ? <img src={photos[mainPhoto]} alt={chalet.nameAr} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
              : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:90}}>🏕️</div>
            }
            {chalet.isVerified && (
              <div style={{position:"absolute",top:18,right:18,background:"#16a34a",color:"#fff",padding:"6px 16px",borderRadius:24,fontSize:13,fontWeight:700,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>✓ موثوق</div>
            )}
            {photos.length > 1 && (
              <div style={{position:"absolute",bottom:14,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.5)",color:"#fff",padding:"3px 14px",borderRadius:20,fontSize:12}}>
                {mainPhoto+1} / {photos.length}
              </div>
            )}
            {photos.length > 1 && <>
              <button onClick={()=>setMainPhoto(p=>(p-1+photos.length)%photos.length)} style={{position:"absolute",top:"50%",right:16,transform:"translateY(-50%)",background:"rgba(255,255,255,0.92)",border:"none",borderRadius:"50%",width:44,height:44,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.15)"}}>›</button>
              <button onClick={()=>setMainPhoto(p=>(p+1)%photos.length)} style={{position:"absolute",top:"50%",left:16,transform:"translateY(-50%)",background:"rgba(255,255,255,0.92)",border:"none",borderRadius:"50%",width:44,height:44,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 10px rgba(0,0,0,0.15)"}}>‹</button>
            </>}
          </div>
          {photos.length > 1 && (
            <div style={{display:"flex",gap:10,marginTop:12,overflowX:"auto",paddingBottom:4,justifyContent:"center"}}>
              {photos.map((p,i)=>(
                <button key={i} onClick={()=>setMainPhoto(i)} style={{flexShrink:0,width:90,height:68,borderRadius:12,overflow:"hidden",border:mainPhoto===i?"3px solid #16a34a":"3px solid transparent",padding:0,cursor:"pointer",background:"none",boxShadow:mainPhoto===i?"0 0 0 2px #dcfce7":"none"}}>
                  <img src={p} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 70 / 30 SPLIT — RTL: right=main, left=sidebar ── */}
        <div className="cdg" style={{ display:"flex", gap:28, alignItems:"flex-start" }}>

          {/* ══ RIGHT: main content 70% ══ */}
          <div style={{ flex:"1 1 0", minWidth:0 }}>

            {/* Title */}
            <div style={CARD}>
              <h1 style={{margin:0,fontSize:34,fontWeight:900,color:"#111827",lineHeight:1.2}}>{chalet.nameAr}</h1>
              {(chalet.location||chalet.district) && (
                <p style={{margin:"10px 0 0",fontSize:15,color:"#6b7280",display:"flex",alignItems:"center",gap:8}}>
                  <span>📍</span>{[chalet.district,chalet.location].filter(Boolean).join("، ")}
                </p>
              )}
              {chalet.rating && (
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
                  <span style={{color:"#f59e0b",fontSize:18,letterSpacing:2}}>★★★★★</span>
                  <span style={{color:"#374151",fontWeight:600,fontSize:13}}>تقييم عالي</span>
                </div>
              )}
              <div style={{height:1,background:"#f3f4f6",margin:"20px 0"}}/>
              <div style={{display:"flex",gap:28,flexWrap:"wrap"}}>
                {[
                  chalet.maxGuests  && {icon:"👥",lbl:"الطاقة الاستيعابية",val:`${chalet.maxGuests} ضيف`},
                  chalet.bedrooms   && {icon:"🛏️",lbl:"غرف النوم",val:`${chalet.bedrooms} غرفة`},
                  chalet.checkInTime  && {icon:"🕐",lbl:"تسجيل دخول",val:chalet.checkInTime},
                  chalet.checkOutTime && {icon:"🕓",lbl:"تسجيل خروج",val:chalet.checkOutTime},
                ].filter(Boolean).map((s:any,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:24}}>{s.icon}</span>
                    <div>
                      <p style={{margin:0,fontSize:11,color:"#9ca3af"}}>{s.lbl}</p>
                      <p style={{margin:"3px 0 0",fontWeight:800,color:"#111827",fontSize:15}}>{s.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            {chalet.descriptionAr && (
              <div style={CARD}>
                <h2 style={SEC}>عن الشاليه</h2>
                <p style={{margin:0,color:"#4b5563",fontSize:15,lineHeight:2}}>{chalet.descriptionAr}</p>
              </div>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <div style={CARD}>
                <h2 style={SEC}>المرافق والخدمات</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:12}}>
                  {amenities.map((key,i)=>{
                    const { ar, icon } = resolveAmenity(key, amenitiesCatalog);
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:14,border:"1.5px solid #e5e7eb",background:"#fafafa",fontSize:13,color:"#374151",fontWeight:600}}>
                        <span style={{fontSize:22,lineHeight:1}}>{icon}</span>
                        <span>{ar}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available Periods (info display) */}
            {(chalet.slotMorning||chalet.slotEvening||chalet.slotFullDay) && (
              <div style={CARD}>
                <h2 style={SEC}>الفترات المتاحة</h2>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:14}}>
                  {slots.map(s=>{
                    const c = SLOT_CONF[s.key as keyof typeof SLOT_CONF];
                    return (
                      <div key={s.key} style={{borderRadius:14,border:`1.5px solid ${c.border}`,background:c.bg,padding:"20px 22px"}}>
                        <p style={{fontSize:28,margin:"0 0 10px"}}>{c.emoji}</p>
                        <p style={{margin:"0 0 6px",fontWeight:800,color:c.text,fontSize:15}}>{c.ar}</p>
                        {s.price && <p style={{margin:"0 0 6px",fontWeight:900,color:c.text,fontSize:17}}>{s.price}</p>}
                        {(s.ci||s.co) && (
                          <p style={{margin:0,fontSize:12,color:c.text,opacity:0.8,lineHeight:1.7}}>
                            {s.ci&&`دخول ${s.ci}`}{s.ci&&s.co&&<br/>}{s.co&&`خروج ${s.co}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Google Maps — Location section */}
            <div style={CARD}>
              <h2 style={SEC}>الموقع</h2>
              {(chalet.location||chalet.district) && (
                <p style={{margin:"0 0 16px",fontSize:14,color:"#6b7280",display:"flex",alignItems:"center",gap:8}}>
                  <span>📍</span>{[chalet.district,chalet.location,"القصيم"].filter(Boolean).join("، ")}
                </p>
              )}
              <div style={{borderRadius:16,overflow:"hidden",border:"1px solid #e5e7eb",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
                <iframe
                  title="موقع الشاليه"
                  src={mapSrc}
                  width="100%"
                  height="340"
                  style={{display:"block",border:"none"}}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            {/* Terms */}
            {terms.length > 0 && (
              <div style={{...CARD, border:"1.5px solid #fde68a"}}>
                <button onClick={()=>setTermsOpen(v=>!v)} style={{width:"100%",background:"none",border:"none",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",padding:0}}>
                  <h2 style={{margin:0,fontSize:17,fontWeight:800,color:"#92400e"}}>📋 شروط الحجز <span style={{fontWeight:500,fontSize:14}}>({terms.length} شرط)</span></h2>
                  <span style={{fontSize:18,color:"#d97706"}}>{termsOpen?"▲":"▼"}</span>
                </button>
                {termsOpen && (
                  <ul style={{margin:"18px 0 0",padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:12}}>
                    {terms.map((t,i)=>(
                      <li key={i} style={{display:"flex",alignItems:"flex-start",gap:12}}>
                        <span style={{color:"#16a34a",flexShrink:0,marginTop:3}}>✓</span>
                        <span style={{fontSize:14,color:"#374151",lineHeight:1.8}}>{t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>

          {/* ══ LEFT: sticky booking card 30% ══ */}
          <div className="cdsb" style={{ width:360, position:"sticky", top:86, flexShrink:0 }}>
            <div style={{ background:"#fff", borderRadius:22, boxShadow:"0 6px 36px rgba(0,0,0,0.11)", border:"1px solid #e5e7eb", overflow:"hidden" }}>

              {/* Price header */}
              <div style={{padding:"26px 28px 20px", borderBottom:"1px solid #f3f4f6"}}>
                <p style={{margin:0,fontSize:11,color:"#9ca3af",fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>يبدأ من</p>
                <p style={{margin:"6px 0 0",fontSize:30,fontWeight:900,color:"#111827",lineHeight:1}}>
                  {fmt(chalet.priceWeekday??chalet.pricePerNight)??"تواصل للسعر"}
                </p>
                {(chalet.priceWeekday||chalet.pricePerNight) &&
                  <p style={{margin:"4px 0 0",fontSize:13,color:"#9ca3af"}}>/ ليلة</p>
                }
              </div>

              <div style={{padding:"22px 28px",display:"flex",flexDirection:"column",gap:18}}>

                {/* Weekday / Weekend chips */}
                {(chalet.priceWeekday||chalet.priceWeekend) && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {chalet.priceWeekday && (
                      <div style={{textAlign:"center",padding:"12px 6px",borderRadius:12,background:"#f0fdf4",border:"1.5px solid #bbf7d0"}}>
                        <p style={{margin:0,fontSize:10,color:"#6b7280"}}>وسط الأسبوع</p>
                        <p style={{margin:"5px 0 2px",fontWeight:900,color:"#16a34a",fontSize:15}}>{fmt(chalet.priceWeekday)}</p>
                        <p style={{margin:0,fontSize:10,color:"#9ca3af"}}>/ ليلة</p>
                      </div>
                    )}
                    {chalet.priceWeekend && (
                      <div style={{textAlign:"center",padding:"12px 6px",borderRadius:12,background:"#f0fdf4",border:"1.5px solid #bbf7d0"}}>
                        <p style={{margin:0,fontSize:10,color:"#6b7280"}}>نهاية الأسبوع</p>
                        <p style={{margin:"5px 0 2px",fontWeight:900,color:"#16a34a",fontSize:15}}>{fmt(chalet.priceWeekend)}</p>
                        <p style={{margin:0,fontSize:10,color:"#9ca3af"}}>/ ليلة</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── DATE PICKER ── */}
                <div>
                  <label style={{display:"block",marginBottom:8,fontSize:13,fontWeight:700,color:"#374151"}}>
                    📅 تاريخ الحجز
                  </label>
                  <DualCalendarPicker
                    value={bookDate}
                    onChange={setBookDate}
                    placeholder="اختر تاريخ الحجز"
                    minDate={new Date().toISOString().slice(0, 10)}
                    mode="gregorian"
                    className={`min-h-[46px] rounded-xl px-3.5 text-sm transition-colors ${
                      bookDate
                        ? "border-2 border-green-600 bg-white text-gray-900"
                        : "border-2 border-gray-200 bg-white text-gray-900"
                    }`}
                  />
                  {bookDate && (
                    <p style={{margin:"6px 0 0",fontSize:11,color:"#16a34a",fontWeight:600}}>
                      {toHijri(bookDate)}
                    </p>
                  )}
                </div>

                {/* ── PERIOD SELECTION ── */}
                {slots.length > 0 && (
                  <div>
                    <label style={{display:"block",marginBottom:10,fontSize:13,fontWeight:700,color:"#374151"}}>
                      🕐 الفترة المطلوبة
                    </label>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {slots.map(s=>{
                        const c = SLOT_CONF[s.key as keyof typeof SLOT_CONF];
                        const active = period === s.key;
                        return (
                          <button key={s.key} type="button" onClick={()=>setPeriod(s.key)}
                            style={{
                              display:"flex", alignItems:"center", justifyContent:"space-between",
                              padding:"12px 16px", borderRadius:12, border:`2px solid ${active?"#16a34a":c.border}`,
                              background:active?"#f0fdf4":c.bg, cursor:"pointer", outline:"none",
                              transition:"all 0.15s",
                            }}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <span style={{fontSize:20}}>{c.emoji}</span>
                              <div style={{textAlign:"right"}}>
                                <p style={{margin:0,fontWeight:700,fontSize:14,color:active?"#16a34a":c.text}}>{c.ar}</p>
                                {(s.ci||s.co) && <p style={{margin:"2px 0 0",fontSize:11,color:"#9ca3af"}}>{s.ci&&`${s.ci}`}{s.ci&&s.co&&" — "}{s.co&&`${s.co}`}</p>}
                              </div>
                            </div>
                            {s.price && (
                              <span style={{fontWeight:900,fontSize:15,color:active?"#16a34a":c.text}}>{s.price}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── BOOK BUTTON ── */}
                {phone ? (
                  <button onClick={handleBook} style={{
                    width:"100%", height:52, borderRadius:14, border:"none",
                    background:"#16a34a", color:"#fff",
                    fontWeight:800, fontSize:16, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                    marginTop:4,
                    boxShadow:"0 4px 18px rgba(22,163,74,0.30)",
                    transition:"background 0.2s,transform 0.1s",
                  }}
                    onMouseEnter={e=>{e.currentTarget.style.background="#15803d";e.currentTarget.style.transform="translateY(-1px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="#16a34a";e.currentTarget.style.transform="none";}}>
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{width:20,height:20,flexShrink:0}}>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    احجز الآن عبر واتساب
                  </button>
                ) : (
                  <div style={{width:"100%",height:52,borderRadius:14,background:"#f3f4f6",border:"1.5px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",color:"#9ca3af",fontSize:14}}>
                    لا يوجد رقم تواصل
                  </div>
                )}

                <p style={{margin:0,textAlign:"center",fontSize:11,color:"#9ca3af",lineHeight:1.6}}>
                  ✓ تأكد من الحساب الرسمي قبل أي دفع — حكاية أناقة
                </p>

              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Mobile sticky bar */}
      <div className="cdmb" style={{display:"none",position:"fixed",bottom:0,left:0,right:0,zIndex:40,background:"#fff",borderTop:"1px solid #e5e7eb",padding:"12px 20px",alignItems:"center",gap:12,boxShadow:"0 -4px 20px rgba(0,0,0,0.08)"}}>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontWeight:700,fontSize:15,color:"#111827",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chalet.nameAr}</p>
          {fmt(chalet.priceWeekday) && <p style={{margin:"2px 0 0",fontSize:13,color:"#16a34a",fontWeight:800}}>يبدأ من {fmt(chalet.priceWeekday)}</p>}
        </div>
        {phone && (
          <button onClick={handleBook} style={{flexShrink:0,height:46,padding:"0 22px",borderRadius:12,background:"#16a34a",color:"#fff",fontWeight:800,fontSize:14,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
            <svg viewBox="0 0 24 24" fill="currentColor" style={{width:18,height:18}}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            احجز الآن
          </button>
        )}
      </div>

      <Footer />
    </div>
  );
}
