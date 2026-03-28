import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SlidersHorizontal, FilterX } from "lucide-react";
import { useGetChalets } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChaletCard } from "@/components/ui/ChaletCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export default function Chalets() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  
  // State for filters
  const [filterLocation, setFilterLocation] = useState<string>(searchParams.get("location") || "all");
  const [filterGuests, setFilterGuests] = useState<string>(searchParams.get("maxGuests") || "");

  // Fetch data
  const { data: chalets, isLoading, refetch } = useGetChalets({
    location: filterLocation !== "all" ? filterLocation : undefined,
    maxGuests: filterGuests ? Number(filterGuests) : undefined,
    maxPrice: undefined,
  });

  // Effect to sync URL params on load
  useEffect(() => {
    refetch();
  }, [filterLocation, filterGuests, refetch]);

  const resetFilters = () => {
    setFilterLocation("all");
    setFilterGuests("");
  };

  const FilterControls = () => (
    <div className="space-y-8">
      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">المدينة</label>
        <Select value={filterLocation} onValueChange={setFilterLocation}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="اختر المدينة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع المدن</SelectItem>
            <SelectItem value="بريدة">بريدة</SelectItem>
            <SelectItem value="عنيزة">عنيزة</SelectItem>
            <SelectItem value="الرس">الرس</SelectItem>
            <SelectItem value="البكيرية">البكيرية</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <label className="text-sm font-semibold text-foreground">عدد الضيوف كحد أدنى</label>
        <Select value={filterGuests} onValueChange={setFilterGuests}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="الكل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 أشخاص فأكثر</SelectItem>
            <SelectItem value="10">10 أشخاص فأكثر</SelectItem>
            <SelectItem value="20">20 شخص فأكثر</SelectItem>
          </SelectContent>
        </Select>
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
            ) : chalets?.length === 0 ? (
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
                {chalets?.map((chalet: import("@workspace/api-client-react").Chalet) => (
                  <ChaletCard key={chalet.id} chalet={chalet} />
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
