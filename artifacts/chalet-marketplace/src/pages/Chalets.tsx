import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SlidersHorizontal, FilterX, CheckSquare, Square, CalendarDays, LayoutGrid, Map } from "lucide-react";
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
  "بريدة": [26.3292, 43.9743],
  "عنيزة": [26.0842, 43.9937],
  "الرس": [25.8639, 43.4975],
  "المذنب": [25.8635, 43.2977],
  "الشماسية": [25.8977, 43.3947],
  "البكيرية": [26.1495, 43.6518],
  "رياض الخبراء": [25.9239, 43.6118],
  "عيون الجواء": [26.0569, 43.3878],
  "الأسياح": [25.9667, 43.7833],
  "ضرية": [26.0003, 42.5736],
  "النبهانية": [25.8500, 43.8000],
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
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");

  /* Read check-in date from search params (passed by the home search bar) */
  const searchDate = searchParams.get("checkIn") || "";

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
    queryKey: ["chalets", filterCity, searchDate, filterPeriod],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterCity && filterCity !== "all") params.set("location", filterCity);
      if (searchDate) params.set("date", searchDate);
      if (filterPeriod && filterPeriod !== "all") params.set("period", filterPeriod);
      const r = await fetch(`${BASE}/api/chalets?${params.toString()}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    refetch();
  }, [filterCity, searchDate, filterPeriod, refetch]);

  const filteredChalets = (chalets ?? []).filter((c) => {
    if (filterDistrict && filterDistrict !== "all" && (c as any).district !== filterDistrict) return false;
    if (filterCategory && filterCategory !== "all" && (c as any).category !== filterCategory) return false;
    if (filterSections && filterSections !== "all" && (c as any).sections !== filterSections) return false;
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
  };

  const FilterControls = () => (
    <div className="space-y-8">
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">المدينة</label>
        <Select value={filterCity} onValueChange={(v) => { setFilterCity(v); setFilterDistrict("all"); }}>
          <SelectTrigger className="bg-background">
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

      {amenitiesCatalog.length > 0 && (
        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground">المرافق والمميزات</label>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
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

      <Button variant="outline" className="w-full text-destructive border-destructive/20 hover:bg-destructive/10" onClick={resetFilters}>
        <FilterX className="w-4 h-4 me-2" />
        مسح الفلاتر
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-secondary/20">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">الشاليهات المتاحة</h1>
          <p className="text-muted-foreground">استعرض أجمل الشاليهات واحجز ما يناسبك</p>
        </div>

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
            <div className="bg-card border border-border/50 rounded-2xl p-6 sticky top-24 shadow-sm">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border/50">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold">تصفية النتائج</h2>
              </div>
              <FilterControls />
            </div>
          </aside>

          {/* Results Grid */}
          <div className="flex-1">
            {/* ── View mode toggle + date label ── */}
            <div className="flex items-center justify-between gap-3 mb-4">
              {searchDate ? (
                <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 flex-1 min-w-0">
                  <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-foreground font-medium truncate">{hijriAndGregorian(searchDate)}</span>
                </div>
              ) : <div />}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1 shrink-0">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">شبكة</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "map" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Map className="w-4 h-4" />
                  <span className="hidden sm:inline">خريطة</span>
                </button>
              </div>
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
                      /* Jitter chalets in the same city so they don't stack */
                      const jitter = (chalet.id % 100) * 0.002 - 0.1;
                      return (
                        <Marker key={chalet.id} position={[coords[0] + jitter, coords[1] + jitter]}>
                          <Popup>
                            <div dir="rtl" className="text-right min-w-[180px]">
                              <p className="font-bold text-sm mb-1">{chalet.nameAr}</p>
                              <p className="text-xs text-gray-500 mb-2">{chalet.location}</p>
                              {chalet.priceWeekday && (
                                <p className="text-xs text-primary font-semibold">
                                  يبدأ من {Number(chalet.priceWeekday).toLocaleString("ar-SA")} ر.س
                                </p>
                              )}
                              <a
                                href={`${BASE}/chalet/${chalet.id}`}
                                className="block mt-2 text-center text-xs bg-primary text-white py-1.5 px-3 rounded-lg hover:bg-primary/90 transition-colors"
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
                <div className="bg-card rounded-2xl border border-border/50 p-12 text-center flex flex-col items-center">
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                    <FilterX className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">لا توجد نتائج مطابقة</h3>
                  <p className="text-muted-foreground mb-6">حاول تغيير خيارات البحث للوصول لنتائج أفضل.</p>
                  <Button onClick={resetFilters}>عرض جميع الشاليهات</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {filteredChalets.map((chalet) => (
                    <ChaletCard
                      key={chalet.id}
                      chalet={chalet}
                      selectedPeriod={filterPeriod !== "all" ? (filterPeriod as "morning" | "evening" | "full_day") : undefined}
                      searchDate={searchDate || undefined}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
