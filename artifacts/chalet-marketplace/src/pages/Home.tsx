import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Search, Calendar, Plus, Minus, Tag, Shield, Clock, Zap, Globe, Heart, CreditCard, Star, Users, Home as HomeIcon, Phone, CheckCircle, Eye } from "lucide-react";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function toArabicNum(n: number): string {
  return new Intl.NumberFormat("ar-SA").format(n);
}

function getHijriDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch { return ""; }
}

function getDualDate(dateStr: string): { hijri: string; gregorian: string } {
  if (!dateStr) return { hijri: "", gregorian: "" };
  try {
    const d = new Date(dateStr + "T12:00:00");
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
    const gregorian = new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
    return { hijri, gregorian };
  } catch { return { hijri: "", gregorian: "" }; }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const FEAT_ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "map-pin":      MapPin,
  "shield":       Shield,
  "clock":        Clock,
  "credit-card":  CreditCard,
  "star":         Star,
  "users":        Users,
  "home":         HomeIcon,
  "phone":        Phone,
  "check-circle": CheckCircle,
  "zap":          Zap,
  "calendar":     Calendar,
  "globe":        Globe,
  "heart":        Heart,
  "search":       Eye,
};

function FeatIcon({ iconKey }: { iconKey?: string }) {
  const Icon = FEAT_ICON_MAP[iconKey ?? ""] ?? MapPin;
  return <Icon size={32} />;
}


export default function Home() {
  const [, setLocation] = useLocation();
  const search = useSearch();

  /* ── Read URL params — used when navigating from post-booking suggestion ── */
  const _urlParams = new URLSearchParams(search);
  const _initTab   = _urlParams.get("tab");
  const _initDate  = _urlParams.get("date") ?? "";

  const [searchCity, setSearchCity]         = useState<string>("");
  const [searchDistrict, setSearchDistrict] = useState<string>("");
  const [searchCategory, setSearchCategory] = useState<string>("");
  const [searchPeriod, setSearchPeriod]     = useState<string>("");
  const [bookingDate, setBookingDate]       = useState<string>("");
  const [searchError, setSearchError]       = useState<string>("");
  const [numDays, setNumDays]               = useState<number>(1);
  /* Hero tab — "properties" (default) | "services" — pre-select from URL */
  const [heroTab, setHeroTab]               = useState<"properties" | "services">(
    _initTab === "services" ? "services" : "properties"
  );
  /* Services search state — pre-fill date from URL */
  const [svcCategory, setSvcCategory]       = useState<string>("");
  const [svcCity, setSvcCity]               = useState<string>("");
  const [svcDate, setSvcDate]               = useState<string>(_initDate);

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/page-content`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: cities = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const selectedCityId = cities.find((c) => c.name === searchCity)?.id;
  const { data: districts = [] } = useQuery<{ id: number; name: string; cityId: number }[]>({
    queryKey: ["catalog", "districts", selectedCityId],
    enabled: !!selectedCityId,
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/districts?cityId=${selectedCityId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: categories = [] } = useQuery<{ id: number; nameAr: string }[]>({
    queryKey: ["catalog", "categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  /* ── Service categories for the services search bar ── */
  const { data: serviceCategories = [] } = useQuery<{ id: number; key: string; labelAr: string; emoji: string }[]>({
    queryKey: ["catalog", "service-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/service-categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleServiceSearch = () => {
    const params = new URLSearchParams();
    if (svcCategory && svcCategory !== "all") params.append("category", svcCategory);
    if (svcCity && svcCity !== "all")         params.append("city", svcCity);
    if (svcDate)                               params.append("date", svcDate);
    setLocation(`/services${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handleSearch = () => {
    if (!searchCity || searchCity === "all" || !bookingDate) {
      setSearchError("يرجى تحديد المدينة وتاريخ الحجز للمتابعة");
      return;
    }
    setSearchError("");
    const params = new URLSearchParams();
    if (searchCity && searchCity !== "all") params.append("location", searchCity);
    if (searchDistrict && searchDistrict !== "all") params.append("district", searchDistrict);
    if (searchCategory && searchCategory !== "all") params.append("category", searchCategory);
    if (searchPeriod && searchPeriod !== "all") params.append("period", searchPeriod);
    if (bookingDate) {
      params.append("checkIn", bookingDate);
      params.append("checkOut", addDays(bookingDate, numDays));
    }
    setLocation(`/chalets${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const hijriBookingDate = getHijriDate(bookingDate);
  const dualBookingDate  = getDualDate(bookingDate);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 md:pt-32 md:pb-48 px-4 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src={siteSettings.hero_bg_url || `${import.meta.env.BASE_URL}images/hero-bg.png`}
              alt="Chalet in Al-Qassim"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1920&q=80&fit=crop";
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/80 dark:from-background/90 dark:via-background/80 dark:to-background/90 backdrop-blur-[2px]" />
          </div>

          <div className="container mx-auto relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-4xl mx-auto text-center text-white"
            >
              <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
                {(siteSettings.hero_line1 || siteSettings.hero_line2) ? (
                  <>
                    {siteSettings.hero_line1 && (
                      <span className="block">
                        {(() => {
                          const words = siteSettings.hero_line1.trim().split(/\s+/);
                          const color = siteSettings.hero_word_color || "#F59E0B";
                          return words.map((w, i) =>
                            i === 0
                              ? <span key={i} style={{ color }}>{w}</span>
                              : <span key={i}> {w}</span>
                          );
                        })()}
                      </span>
                    )}
                    {siteSettings.hero_line2 && (
                      <span className="block">{siteSettings.hero_line2}</span>
                    )}
                  </>
                ) : (
                  siteSettings.hero_title || <>اكتشف أجمل الشاليهات في <span className="text-primary">القصيم</span></>
                )}
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-8 max-w-2xl mx-auto">
                {siteSettings.hero_subtitle || "احجز استراحتك أو شاليهك القادم بكل سهولة. خيارات متنوعة تناسب جميع العائلات والمناسبات."}
              </p>

              {/* ── Feature Badges ── */}
              <div className="flex items-center justify-center flex-wrap gap-3 mb-6">
                {[
                  siteSettings.feature_1 || "أفضل الشاليهات",
                  siteSettings.feature_2 || "حجز سهل وآمن",
                  siteSettings.feature_3 || "دعم فني متواصل",
                ].map((feat, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-2 rounded-full text-white text-sm font-medium">
                    <span className="w-5 h-5 rounded-full bg-amber-400/30 flex items-center justify-center text-amber-300 text-xs font-bold">✓</span>
                    {feat}
                  </div>
                ))}
              </div>

              {/* ── Hero Tabs ── */}
              <div className="flex items-center justify-center gap-2 mb-5">
                {(["properties", "services"] as const).map((tab) => {
                  const label   = tab === "properties" ? "أماكن" : "خدمات";
                  const icon    = tab === "properties" ? "🏠" : "🛎️";
                  const active  = heroTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setHeroTab(tab)}
                      className={`flex items-center gap-2 px-7 py-2.5 rounded-full text-sm font-bold border transition-all duration-200 focus:outline-none shadow-md ${
                        active
                          ? "bg-amber-700 border-amber-600 text-white shadow-amber-900/40"
                          : "bg-white/10 backdrop-blur-sm border-white/30 text-white/80 hover:bg-white/20 hover:text-white"
                      }`}
                    >
                      <span>{icon}</span>
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* ══ PROPERTIES TAB — search card + booking summary ══ */}
              {heroTab === "properties" && (<>

              {/* ── Search Card ─────────────────────────────────────── */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-2 md:p-3 rounded-2xl shadow-2xl flex flex-col md:flex-row flex-wrap gap-3">

                {/* City */}
                <div className="flex-1 min-w-[140px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">المدينة</p>
                    <Select value={searchCity} onValueChange={(v) => { setSearchCity(v); setSearchDistrict(""); }}>
                      <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                        <SelectValue placeholder="اختر المدينة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع المدن</SelectItem>
                        {cities.map((city) => (
                          <SelectItem key={city.id} value={city.name}>{city.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* District */}
                <div className="flex-1 min-w-[140px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-primary/70 shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">الحي</p>
                    <Select
                      value={searchDistrict}
                      onValueChange={setSearchDistrict}
                      disabled={!selectedCityId}
                    >
                      <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                        <SelectValue placeholder="الكل" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        {districts.map((d) => (
                          <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Category */}
                <div className="flex-1 min-w-[140px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Tag className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">الفئة</p>
                    <Select value={searchCategory} onValueChange={setSearchCategory}>
                      <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                        <SelectValue placeholder="جميع الفئات" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الفئات</SelectItem>
                        {categories.length === 0 && (
                          <>
                            <SelectItem value="شالية">شالية</SelectItem>
                            <SelectItem value="مزرعة">مزرعة</SelectItem>
                            <SelectItem value="استراحة">استراحة</SelectItem>
                          </>
                        )}
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.nameAr}>{cat.nameAr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Period */}
                <div className="flex-1 min-w-[130px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Tag className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">الفترة</p>
                    <Select value={searchPeriod} onValueChange={setSearchPeriod}>
                      <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                        <SelectValue placeholder="جميع الفترات" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الفترات</SelectItem>
                        <SelectItem value="morning">🌅 صباحي</SelectItem>
                        <SelectItem value="evening">🌙 مسائي</SelectItem>
                        <SelectItem value="full_day">☀️ يوم كامل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Booking date */}
                <div className="flex-1 min-w-[160px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <DualCalendarPicker
                      value={bookingDate}
                      onChange={setBookingDate}
                      placeholder="يوم الحجز"
                      label="يوم الحجز"
                    />
                  </div>
                </div>

                {/* Number of days counter */}
                <div className="bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-center w-full gap-1">
                    <p className="text-xs font-semibold text-muted-foreground whitespace-nowrap">عدد الأيام</p>
                    <div className="flex items-center gap-3" dir="ltr">
                      <button
                        type="button"
                        onClick={() => setNumDays((n) => Math.max(1, n - 1))}
                        disabled={numDays <= 1}
                        className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        aria-label="تقليل عدد الأيام"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xl font-bold text-foreground w-8 text-center tabular-nums">
                        {toArabicNum(numDays)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNumDays((n) => n + 1)}
                        className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-foreground hover:bg-accent transition-colors"
                        aria-label="زيادة عدد الأيام"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Search button */}
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    onClick={handleSearch}
                    className="h-auto md:h-full py-4 px-8 rounded-xl text-lg font-bold shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
                  >
                    <Search className="w-5 h-5 me-2" />
                    ابحث الآن
                  </Button>
                  {searchError && (
                    <p className="text-xs text-amber-300 font-medium text-center px-1 animate-pulse">
                      {searchError}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Booking summary ─────────────────────────────────── */}
              {bookingDate && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-sm text-white/90 font-medium"
                >
                  حجز لمدة{" "}
                  <span className="font-bold text-primary">
                    {toArabicNum(numDays)} {numDays === 1 ? "يوم" : "أيام"}
                  </span>
                  {" "}· تبدأ من{" "}
                  <span className="font-bold">{dualBookingDate.hijri}</span>
                  {dualBookingDate.gregorian && (
                    <span className="font-normal opacity-80"> | الموافق {dualBookingDate.gregorian} م</span>
                  )}
                </motion.p>
              )}

              {/* end of properties tab */}
              </>)}

              {/* ══ SERVICES TAB — search bar ══ */}
              {heroTab === "services" && (
                <motion.div
                  key="services-search"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 p-2 md:p-3 rounded-2xl shadow-2xl flex flex-col md:flex-row flex-wrap gap-3">

                    {/* Service type */}
                    <div className="flex-1 min-w-[160px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                      <span className="text-xl shrink-0">🛎️</span>
                      <div className="w-full">
                        <p className="text-xs font-semibold text-muted-foreground text-right mb-1">نوع الخدمة</p>
                        <Select value={svcCategory} onValueChange={setSvcCategory}>
                          <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                            <SelectValue placeholder="جميع الخدمات" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">جميع الخدمات</SelectItem>
                            {serviceCategories.length === 0 && (
                              <>
                                <SelectItem value="catering">🥩 مطابخ وضيافة</SelectItem>
                                <SelectItem value="events">🎈 فعاليات وحفلات</SelectItem>
                                <SelectItem value="hospitality">☕ خدمات استضافة</SelectItem>
                                <SelectItem value="occasions">🎭 مناسبات خاصة</SelectItem>
                              </>
                            )}
                            {serviceCategories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.key}>
                                {cat.emoji} {cat.labelAr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* City */}
                    <div className="flex-1 min-w-[140px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="w-full">
                        <p className="text-xs font-semibold text-muted-foreground text-right mb-1">المدينة</p>
                        <Select value={svcCity} onValueChange={setSvcCity}>
                          <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                            <SelectValue placeholder="جميع المدن" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">جميع المدن</SelectItem>
                            {cities.map((city) => (
                              <SelectItem key={city.id} value={city.name}>{city.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex-1 min-w-[160px] bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <DualCalendarPicker
                          value={svcDate}
                          onChange={setSvcDate}
                          placeholder="تاريخ الخدمة"
                          label="التاريخ"
                        />
                      </div>
                    </div>

                    {/* Search button */}
                    <Button
                      onClick={handleServiceSearch}
                      className="h-auto md:h-full py-4 px-8 rounded-xl text-lg font-bold shadow-lg bg-amber-700 hover:bg-amber-800 text-white transition-all shrink-0"
                    >
                      <Search className="w-5 h-5 me-2" />
                      ابحث عن خدمة
                    </Button>
                  </div>
                </motion.div>
              )}

            </motion.div>
          </div>
        </section>

        {/* Why choose us */}
        <section className="bg-secondary/50 py-20 px-4">
          <div className="container mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                {siteSettings.feat_section_title || "لماذا تختار شاليهات القصيم؟"}
              </h2>
              <p className="text-muted-foreground text-lg">
                {siteSettings.feat_section_desc || "نحن نسهل عليك العثور على المكان المثالي لمناسباتك العائلية والخاصة"}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
              {[
                {
                  iconKey: siteSettings.feat_card1_icon || "map-pin",
                  title:   siteSettings.feat_card1_title || "تغطية شاملة",
                  text:    siteSettings.feat_card1_text  || "خيارات واسعة تشمل بريدة، عنيزة، الرس وكافة مدن ومحافظات القصيم.",
                },
                {
                  iconKey: siteSettings.feat_card2_icon || "shield",
                  title:   siteSettings.feat_card2_title || "حجز مباشر وآمن",
                  text:    siteSettings.feat_card2_text  || "تواصل مباشر مع الملاك وإدارة الشاليهات عبر الواتساب بدون وسطاء.",
                },
                {
                  iconKey: siteSettings.feat_card3_icon || "credit-card",
                  title:   siteSettings.feat_card3_title || "سهولة الدفع",
                  text:    siteSettings.feat_card3_text  || "طرق دفع متعددة وآمنة تناسب احتياجاتك.",
                },
              ].map((card, i) => (
                <div key={i} className="bg-card p-8 rounded-2xl text-center shadow-sm border border-border/50 hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                    <FeatIcon iconKey={card.iconKey} />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
