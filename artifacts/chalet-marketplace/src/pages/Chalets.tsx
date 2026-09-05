import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { SlidersHorizontal, FilterX, CheckSquare, Square, CalendarDays, LayoutGrid, Map as MapIcon, MapPin } from "lucide-react";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { hijriAndGregorian } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChaletCard } from "@/components/ui/ChaletCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

/* Fix leaflet's broken default icon path when bundled with Vite */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* Al-Qassim city coordinates lookup */
const CITY_COORDS: Record<string, [number, number]> = {
  "بريدة":        [26.3292, 43.9743],
  "عنيزة":        [26.0842, 43.9937],
  "الرس":         [25.8639, 43.4975],
  "المذنب":       [25.8635, 43.2977],
  "الشماسية":     [25.8977, 43.3947],
  "البكيرية":     [26.1495, 43.6518],
  "رياض الخبراء": [25.9239, 43.6118],
  "عيون الجواء":  [26.0569, 43.3878],
  "الأسياح":      [25.9667, 43.7833],
  "ضرية":         [26.0003, 42.5736],
  "النبهانية":    [25.8500, 43.8000],
  "البدائع":      [26.0039, 43.7467],
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Chalets() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);

  const [filterCity, setFilterCity]         = useState<string>(searchParams.get("location") || "all");
  const [filterDistrict, setFilterDistrict] = useState<string>(searchParams.get("district") || "all");
  const [filterCategory, setFilterCategory] = useState<string>(searchParams.get("category") || "all");
  const [filterSections, setFilterSections] = useState<string>(searchParams.get("sections") || "all");
  const [filterPeriod, setFilterPeriod]     = useState<string>(searchParams.get("period") || "all");
  const [filterAmenities, setFilterAmenities] = useState<Set<string>>(new Set());
  const [filterMaxPrice, setFilterMaxPrice] = useState<string>(searchParams.get("maxPrice") || "");
  const [filterDate, setFilterDate]         = useState<string>(searchParams.get("checkIn") || "");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: cities = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const selectedCityId = cities.find((c) => c.name === filterCity)?.id;
  const { data: districts = [] } = useQuery<{ id: number; name: string }[]>({
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

  const { data: amenitiesCatalog = [] } = useQuery<{ id: number; key: string; labelAr: string }[]>({
    queryKey: ["catalog", "amenities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/amenities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: chalets, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["chalets", filterCity, filterDate, filterPeriod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCity && filterCity !== "all") params.set("location", filterCity);
      if (filterDate) params.set("date", filterDate);
      if (filterPeriod && filterPeriod !== "all") params.set("period", filterPeriod);
      const r = await fetch(`${BASE}/api/chalets?${params.toString()}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    refetch();
  }, [filterCity, filterDate, filterPeriod, refetch]);

  /* Reset visible count whenever any filter changes */
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filterCity, filterDistrict, filterCategory, filterSections, filterPeriod, filterDate, filterMaxPrice, filterAmenities]);

  /* ── Next Available: city + date but no results ──────────────────
     Calls /api/chalets/next-available which returns:
       { cityEmpty: boolean, chalets: [..., nextAvailableDate: string] }
     cityEmpty = true  → no properties registered in this city at all
     cityEmpty = false → properties exist but this date is taken; chalets have next dates
  ────────────────────────────────────────────────────────────────── */
  const needsNextAvail = filterCity !== "all" && !!filterDate;

  const { data: nextAvailResult } = useQuery<{
    cityEmpty: boolean;
    chalets: any[];
  }>({
    queryKey: ["chalets-next-avail", filterCity, filterDate, filterPeriod],
    enabled: needsNextAvail,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("location", filterCity);
      params.set("date", filterDate);
      if (filterPeriod && filterPeriod !== "all") params.set("period", filterPeriod);
      const r = await fetch(`${BASE}/api/chalets/next-available?${params.toString()}`, { credentials: "include" });
      if (!r.ok) return { cityEmpty: false, chalets: [] };
      return r.json();
    },
    staleTime: 1000 * 60 * 2,
  });

  const cityIsEmpty    = nextAvailResult?.cityEmpty ?? false;
  const nextAvailChalets = nextAvailResult?.chalets ?? [];

  /* ── Nearby cities: shown only when the selected city has NO registered chalets ── */
  function haversineKm(a: [number, number], b: [number, number]) {
    const R = 6371;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a[0] * Math.PI) / 180) *
        Math.cos((b[0] * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  const nearestCities: string[] = (() => {
    const origin = CITY_COORDS[filterCity];
    if (!origin) return [];
    return Object.entries(CITY_COORDS)
      .filter(([name]) => name !== filterCity)
      .sort(([, a], [, b]) => haversineKm(origin, a) - haversineKm(origin, b))
      .slice(0, 3)
      .map(([name]) => name);
  })();

  const { data: nearbyChalets = [] } = useQuery<any[]>({
    queryKey: ["chalets-nearby", ...nearestCities],
    enabled: cityIsEmpty && nearestCities.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        nearestCities.map(async (city) => {
          const params = new URLSearchParams({ location: city });
          const r = await fetch(`${BASE}/api/chalets?${params.toString()}`, { credentials: "include" });
          return r.ok ? r.json() : [];
        })
      );
      return results.flat();
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredChalets = (chalets ?? []).filter((c) => {
    if (filterCity && filterCity !== "all" && (c as any).location !== filterCity) return false;
    if (filterDistrict && filterDistrict !== "all") {
      const chaletDistrict = ((c as any).district ?? "").trim();
      if (!chaletDistrict || chaletDistrict !== filterDistrict.trim()) return false;
    }
    if (filterCategory && filterCategory !== "all") {
      /* Properties with no category are unclassified — include them in every category search */
      const chaletCat = (c as any).category;
      if (chaletCat && chaletCat !== filterCategory) return false;
    }
    if (filterSections && filterSections !== "all") {
      /* Treat null/empty sections as "قسم واحد" — properties added before the field existed */
      const chaletSections = (c as any).sections || "قسم واحد";
      if (chaletSections !== filterSections) return false;
    }
    if (filterAmenities.size > 0) {
      const chaletAmenities: string[] = (c as any).amenities ?? [];
      for (const key of filterAmenities) {
        if (!chaletAmenities.includes(key)) return false;
      }
    }
    if (filterMaxPrice) {
      const max = Number(filterMaxPrice);
      const weekday = Number((c as any).priceWeekday ?? 0);
      const weekend = Number((c as any).priceWeekend ?? 0);
      const minPrice = Math.min(weekday || Infinity, weekend || Infinity);
      if (minPrice !== Infinity && minPrice > max) return false;
    }
    return true;
  });

  const toggleAmenity = (key: string) => {
    setFilterAmenities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetFilters = () => {
    setFilterCity("all");
    setFilterDistrict("all");
    setFilterCategory("all");
    setFilterSections("all");
    setFilterPeriod("all");
    setFilterAmenities(new Set());
    setFilterMaxPrice("");
    setFilterDate("");
  };

  /* ── Pre-compute next-available grouped by date (outside JSX to avoid Map shadowing) ── */
  const nextAvailGroups: Array<{ date: string; chalets: any[] }> = (() => {
    if (!nextAvailChalets.length) return [];
    const acc: Record<string, any[]> = {};
    for (const c of nextAvailChalets) {
      const d = String(c.nextAvailableDate);
      if (!acc[d]) acc[d] = [];
      acc[d].push(c);
    }
    return Object.keys(acc)
      .sort()
      .map((date) => ({ date, chalets: acc[date] }));
  })();

  const FilterControls = () => (
    <div className="space-y-6">

      {/* 1. الفئة */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">الفئة</label>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="bg-background">
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

      {/* 2. الفترة */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">الفترة</label>
        <Select value={filterPeriod} onValueChange={setFilterPeriod}>
          <SelectTrigger className="bg-background">
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

      {/* 3. عدد الأقسام */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">عدد الأقسام</label>
        <Select value={filterSections} onValueChange={setFilterSections}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="الكل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="قسم واحد">🔑 قسم واحد</SelectItem>
            <SelectItem value="قسمين منفصلة">🔑🔑 قسمين منفصلة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. الحي */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">الحي</label>
        <Select value={filterDistrict} onValueChange={setFilterDistrict} disabled={!selectedCityId}>
          <SelectTrigger className="bg-background">
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

      {/* الميزانية */}
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">الميزانية القصوى (ريال)</label>
        <div className="relative">
          <input
            type="number"
            min="0"
            step="50"
            placeholder="مثال: 1000"
            value={filterMaxPrice}
            onChange={(e) => setFilterMaxPrice(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 pl-12 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            dir="rtl"
          />
          <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">ر.س</span>
        </div>
        <p className="text-xs text-muted-foreground">يُقارن بسعر وسط الأسبوع</p>
      </div>

      {/* المرافق */}
      {amenitiesCatalog.length > 0 && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">المرافق والمميزات</label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
            {amenitiesCatalog.map((amenity) => {
              const checked = filterAmenities.has(amenity.key);
              return (
                <button
                  key={amenity.id}
                  type="button"
                  onClick={() => toggleAmenity(amenity.key)}
                  className="flex items-center gap-2 w-full text-sm text-right hover:text-primary transition-colors py-0.5"
                >
                  {checked
                    ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                    : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span>{amenity.labelAr}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── تاريخ الحجز + المدينة (compact — محددان مسبقاً) ── */}
      <div className="border-t border-border/50 pt-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">تاريخ الحجز</label>
          <div className="relative">
            <DualCalendarPicker
              value={filterDate}
              onChange={setFilterDate}
              placeholder="اختر تاريخ الحجز"
              className="rounded-md border border-input bg-background px-3 pr-8 py-2 text-xs hover:bg-accent/30 transition-colors"
            />
            <CalendarDays className="absolute top-1/2 -translate-y-1/2 right-2.5 w-3.5 h-3.5 text-primary pointer-events-none" />
          </div>
          {filterDate && (
            <button type="button" onClick={() => setFilterDate("")} className="text-xs text-destructive hover:underline">
              مسح التاريخ
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">المدينة</label>
          <Select value={filterCity} onValueChange={(v) => { setFilterCity(v); setFilterDistrict("all"); }}>
            <SelectTrigger className="bg-background h-8 text-xs">
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

      <Button variant="outline" className="w-full text-destructive border-destructive/20 hover:bg-destructive/10" onClick={resetFilters}>
        <FilterX className="w-4 h-4 me-2" />
        مسح الفلاتر
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-secondary/20">
      <Navbar />

      <section
        className="relative isolate min-h-[320px] bg-cover bg-center px-4 pt-24 pb-12 flex items-center overflow-hidden"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/hero-bg.png)` }}
        data-testid="banner-chalets-hero"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/45 to-black/70" />
        <div className="container mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <p className="text-amber-200 font-semibold mb-3 tracking-wide drop-shadow-md">أماكن مختارة بعناية</p>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight drop-shadow-lg">
              الشاليهات المتاحة
            </h1>
            <p className="text-white/90 text-lg max-w-xl mx-auto leading-relaxed drop-shadow-md">
              استعرض أجمل الشاليهات واحجز ما يناسبك
            </p>
          </motion.div>
        </div>
      </section>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Mobile Filter Button */}
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full flex items-center justify-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  تصفية النتائج
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl pt-8">
                <SheetTitle className="mb-6 font-bold text-xl">تصفية النتائج</SheetTitle>
                <FilterControls />
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-72 shrink-0">
            <div className="bg-card border border-border/50 rounded-2xl shadow-sm sticky top-4 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">تصفية النتائج</h2>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
                <FilterControls />
              </div>
            </div>
          </aside>

          {/* Results Grid */}
          <div className="flex-1">
            {/* ── View mode toggle + date label ── */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {filterDate ? (
                <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 flex-1 min-w-0">
                  <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-foreground font-medium truncate">{hijriAndGregorian(filterDate)}</span>
                </div>
              ) : <div />}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1 shrink-0">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">عرض القائمة</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "map" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <MapIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">عرض الخريطة</span>
                </button>
              </div>
            </div>

            {/* ── Horizontal filter chips ── */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 [&::-webkit-scrollbar]:hidden" dir="rtl">
              {[{ v: "all", l: "جميع الفئات" }, ...categories.map(c => ({ v: c.nameAr, l: c.nameAr }))].map(o => (
                <button key={o.v} onClick={() => setFilterCategory(o.v)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${filterCategory === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5"}`}>
                  {o.l}
                </button>
              ))}
              <div className="w-px bg-border/60 shrink-0 self-stretch my-0.5" />
              {[{ v: "all", l: "كل الفترات" }, { v: "morning", l: "🌅 صباحي" }, { v: "evening", l: "🌙 مسائي" }, { v: "full_day", l: "☀️ يوم كامل" }].map(o => (
                <button key={o.v} onClick={() => setFilterPeriod(o.v)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${filterPeriod === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5"}`}>
                  {o.l}
                </button>
              ))}
              <div className="w-px bg-border/60 shrink-0 self-stretch my-0.5" />
              {[{ v: "all", l: "كل الأقسام" }, { v: "قسم واحد", l: "🔑 قسم واحد" }, { v: "قسمين منفصلة", l: "🔑🔑 قسمين" }].map(o => (
                <button key={o.v} onClick={() => setFilterSections(o.v)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${filterSections === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5"}`}>
                  {o.l}
                </button>
              ))}
            </div>

            {/* ── Map View ── */}
            {viewMode === "map" && (
              <div className="rounded-2xl overflow-hidden border border-border shadow-sm" style={{ height: 500 }}>
                {filteredChalets.length === 0 ? (
                  <div className="h-full bg-muted flex items-center justify-center text-muted-foreground text-sm">لا توجد نتائج للعرض على الخريطة</div>
                ) : (
                  <MapContainer
                    center={[26.2, 43.9]}
                    zoom={9}
                    style={{ height: "100%", width: "100%" }}
                    zoomControl={false}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />
                    {filteredChalets.map((chalet) => {
                      const lat = (chalet as any).latitude ? Number((chalet as any).latitude) : null;
                      const lng = (chalet as any).longitude ? Number((chalet as any).longitude) : null;
                      const cityCoords = CITY_COORDS[chalet.location];
                      const coords: [number, number] | null = lat && lng ? [lat, lng] : cityCoords ?? null;
                      if (!coords) return null;
                      /* When falling back to city center, spread markers in a circle so they don't stack */
                      const hasRealCoords = !!(lat && lng);
                      const jitterLat = hasRealCoords ? 0 : Math.sin(chalet.id * 2.3) * 0.018;
                      const jitterLng = hasRealCoords ? 0 : Math.cos(chalet.id * 1.7) * 0.018;
                      return (
                        <Marker key={chalet.id} position={[coords[0] + jitterLat, coords[1] + jitterLng]}>
                          <Popup minWidth={200}>
                            <div dir="rtl" style={{ textAlign: "right", width: 200, paddingBottom: 6, boxSizing: "border-box" }}>
                              {/* Name + Logo row */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                {(chalet as any).logoUrl && (
                                  <div style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "#f9fafb", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <img src={(chalet as any).logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                  </div>
                                )}
                                <p style={{ fontWeight: 700, fontSize: 14, color: "#111827", margin: 0, flex: 1 }}>{chalet.nameAr}</p>
                              </div>
                              <p style={{ fontSize: 12, color: "#374151", fontWeight: 500, margin: "0 0 6px" }}>{chalet.location}</p>
                              {chalet.priceWeekday && (
                                <p style={{ fontSize: 12, color: "#5c3d25", fontWeight: 700, margin: "0 0 8px" }}>
                                  يبدأ من {Number(chalet.priceWeekday).toLocaleString("ar-SA")} ر.س
                                </p>
                              )}
                              <a
                                href={`${BASE}/chalets/${chalet.id}`}
                                style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 700, background: "#8C6246", color: "#ffffff", padding: "7px 12px", borderRadius: 8, textDecoration: "none", lineHeight: 1.4 }}
                              >
                                عرض التفاصيل
                              </a>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}
                  </MapContainer>
                )}
              </div>
            )}

            {viewMode === "grid" && (
              isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="space-y-4">
                      <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredChalets.length === 0 ? (
                <>
                  {/* ══════════════════════════════════════════════════
                      SCENARIO A: Specific city + date → city is EMPTY
                      (no properties registered in this city at all)
                  ══════════════════════════════════════════════════ */}
                  {filterCity !== "all" && filterDate && cityIsEmpty && (
                    <>
                      <div className="bg-card rounded-2xl border border-border/50 p-8 text-center flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mb-4">
                          <MapPin className="w-8 h-8 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">
                          لا توجد شاليهات مسجّلة حالياً في {filterCity}
                        </h3>
                        <p className="text-muted-foreground mb-5">
                          نحن نعمل على توفيرها قريباً — إليك أقرب المدن المتاحة.
                        </p>
                        <Button variant="outline" onClick={resetFilters} className="gap-2">
                          <FilterX className="w-4 h-4" />
                          استعرض جميع المدن
                        </Button>
                      </div>

                      {/* Nearby cities suggestion */}
                      {nearbyChalets.length > 0 && (
                        <div>
                          <div className="flex items-center gap-3 mb-5">
                            <div className="flex-1 h-px bg-border" />
                            <span className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 px-4 py-2 rounded-full whitespace-nowrap">
                              <MapPin className="w-4 h-4" />
                              شاليهات في أقرب مدينة متاحة — {nearestCities.filter((_, i) => nearbyChalets.some((c: any) => c.location === nearestCities[i])).slice(0,2).join(" · ")}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {nearbyChalets.slice(0, 6).map((chalet: any) => (
                              <ChaletCard
                                key={chalet.id}
                                chalet={chalet}
                                selectedPeriod={filterPeriod !== "all" ? (filterPeriod as "morning" | "evening" | "full_day") : undefined}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* ══════════════════════════════════════════════════
                      SCENARIO B: City + date → date is taken,
                      but city has chalets available on other dates
                  ══════════════════════════════════════════════════ */}
                  {filterCity !== "all" && filterDate && !cityIsEmpty && (
                    <>
                      {/* Compact banner — no button, results follow immediately */}
                      <div className="flex items-start gap-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl px-5 py-4 mb-6">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/50 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          <CalendarDays className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="text-right flex-1">
                          <p className="font-bold text-amber-800 dark:text-amber-300 text-base leading-snug mb-1">
                            عفواً، التاريخ المحدد محجوز بالكامل في {filterCity}
                          </p>
                          <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                            {nextAvailGroups.length > 0
                              ? "إليك الشاليهات المتاحة في أقرب تاريخ ممكن:"
                              : "لم نجد تواريخ متاحة في الـ٤٥ يوماً القادمة — جرّب تاريخاً مختلفاً."}
                          </p>
                        </div>
                      </div>

                      {/* Next available chalets — grouped by date (pre-computed above) */}
                      {nextAvailGroups.length > 0 && (
                        <div className="space-y-8">
                          {nextAvailGroups.map(({ date, chalets: groupChalets }) => (
                            <div key={date}>
                              <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-border" />
                                <span className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-4 py-2 rounded-full whitespace-nowrap">
                                  <CalendarDays className="w-4 h-4" />
                                  متاح بتاريخ: {hijriAndGregorian(date + "T12:00:00")}
                                </span>
                                <div className="flex-1 h-px bg-border" />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {groupChalets.map((chalet: any) => (
                                  <ChaletCard
                                    key={chalet.id}
                                    chalet={chalet}
                                    selectedPeriod={filterPeriod !== "all" ? (filterPeriod as "morning" | "evening" | "full_day") : undefined}
                                    searchDate={date}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* No upcoming dates found — offer manual clear */}
                      {nextAvailGroups.length === 0 && (
                        <div className="text-center py-4">
                          <Button variant="outline" onClick={() => setFilterDate("")} className="gap-2">
                            <FilterX className="w-4 h-4" />
                            عرض كل شاليهات {filterCity}
                          </Button>
                        </div>
                      )}
                    </>
                  )}

                  {/* ══════════════════════════════════════════════════
                      SCENARIO C: Generic no results (no city or no date)
                  ══════════════════════════════════════════════════ */}
                  {(filterCity === "all" || !filterDate) && (
                    <div className="bg-card rounded-2xl border border-border/50 p-12 text-center flex flex-col items-center">
                      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                        <FilterX className="w-10 h-10 text-muted-foreground" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">لا توجد نتائج مطابقة</h3>
                      <p className="text-muted-foreground mb-6">حاول تغيير خيارات البحث للوصول لنتائج أفضل.</p>
                      <Button onClick={resetFilters} className="gap-2">
                        <FilterX className="w-4 h-4" />
                        مسح جميع الفلاتر
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {filteredChalets.slice(0, visibleCount).map((chalet) => (
                      <ChaletCard
                        key={chalet.id}
                        chalet={chalet}
                        selectedPeriod={filterPeriod !== "all" ? (filterPeriod as "morning" | "evening" | "full_day") : undefined}
                        searchDate={filterDate || undefined}
                      />
                    ))}
                  </div>
                  {visibleCount < filteredChalets.length && (
                    <div className="mt-8 flex flex-col items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        عرض {Math.min(visibleCount, filteredChalets.length)} من أصل {filteredChalets.length} شاليه
                      </p>
                      <Button
                        variant="outline"
                        className="gap-2 border-primary/30 text-primary hover:bg-primary/5 px-8"
                        onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                      >
                        عرض المزيد
                      </Button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
