import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SlidersHorizontal, FilterX, CheckSquare, Square } from "lucide-react";
import { useGetChalets } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChaletCard } from "@/components/ui/ChaletCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Chalets() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);

  const [filterCity, setFilterCity]         = useState<string>(searchParams.get("location") || "all");
  const [filterDistrict, setFilterDistrict] = useState<string>(searchParams.get("district") || "all");
  const [filterCategory, setFilterCategory] = useState<string>(searchParams.get("category") || "all");
  const [filterSections, setFilterSections] = useState<string>("all");
  const [filterPeriod, setFilterPeriod]     = useState<string>(searchParams.get("period") || "all");
  const [filterAmenities, setFilterAmenities] = useState<Set<string>>(new Set());

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

  const { data: chalets, isLoading, refetch } = useGetChalets({
    location: filterCity !== "all" ? filterCity : undefined,
  });

  useEffect(() => {
    refetch();
  }, [filterCity, refetch]);

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
            {isLoading ? (
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
