import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Users, Search, Calendar } from "lucide-react";
import { useGetChalets, Chalet } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ChaletCard } from "@/components/ui/ChaletCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Home() {
  const [, setLocation] = useLocation();
  const [searchLocation, setSearchLocation] = useState<string>("");
  const [guests, setGuests] = useState<string>("");
  const [checkIn, setCheckIn] = useState<string>("");
  const [checkOut, setCheckOut] = useState<string>("");

  const { data: chalets, isLoading } = useGetChalets();
  const { data: cities = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["catalog", "cities"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/cities`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchLocation && searchLocation !== "all") params.append("location", searchLocation);
    if (guests) params.append("maxGuests", guests);
    if (checkIn) params.append("checkIn", checkIn);
    if (checkOut) params.append("checkOut", checkOut);
    setLocation(`/chalets${params.toString() ? `?${params.toString()}` : ''}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative pt-24 pb-32 md:pt-32 md:pb-48 px-4 overflow-hidden">
          {/* Background Image */}
          <div className="absolute inset-0 z-0">
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-bg.png`} 
              alt="Chalet in Al-Qassim" 
              className="w-full h-full object-cover"
              onError={(e) => {
                {/* fallback to beautiful desert resort */}
                (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1920&q=80&fit=crop`;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/60 to-foreground/80 dark:from-background/90 dark:via-background/80 dark:to-background/90 backdrop-blur-[2px]"></div>
          </div>

          <div className="container mx-auto relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center text-white"
            >
              <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
                اكتشف أجمل الشاليهات في <span className="text-primary">القصيم</span>
              </h1>
              <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl mx-auto">
                احجز استراحتك أو شاليهك القادم بكل سهولة. خيارات متنوعة تناسب جميع العائلات والمناسبات بأسعار تنافسية.
              </p>

              {/* Search Glassmorphism Card */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-2 md:p-3 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-3">
                <div className="flex-1 bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">المدينة</p>
                    <Select value={searchLocation} onValueChange={setSearchLocation}>
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

                <div className="flex-1 bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">تاريخ الوصول</p>
                    <Input
                      type="date"
                      value={checkIn}
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="border-0 p-0 h-auto focus-visible:ring-0 shadow-none text-foreground font-medium bg-transparent"
                    />
                  </div>
                </div>

                <div className="flex-1 bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">تاريخ المغادرة</p>
                    <Input
                      type="date"
                      value={checkOut}
                      onChange={(e) => setCheckOut(e.target.value)}
                      min={checkIn}
                      className="border-0 p-0 h-auto focus-visible:ring-0 shadow-none text-foreground font-medium bg-transparent"
                    />
                  </div>
                </div>

                <div className="flex-1 bg-white dark:bg-card rounded-xl px-4 py-2 flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="w-full">
                    <p className="text-xs font-semibold text-muted-foreground text-right mb-1">عدد الضيوف</p>
                    <Select value={guests} onValueChange={setGuests}>
                      <SelectTrigger className="w-full border-0 p-0 h-auto focus:ring-0 shadow-none text-foreground font-medium">
                        <SelectValue placeholder="اختر العدد" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">حتى 5 أشخاص</SelectItem>
                        <SelectItem value="10">حتى 10 أشخاص</SelectItem>
                        <SelectItem value="20">حتى 20 شخص</SelectItem>
                        <SelectItem value="50">أكثر من 20 شخص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button 
                  onClick={handleSearch}
                  className="h-auto md:h-full py-4 px-8 rounded-xl text-lg font-bold shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all shrink-0"
                >
                  <Search className="w-5 h-5 me-2" />
                  ابحث الآن
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Featured Section */}
        <section className="py-20 px-4 container mx-auto">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-2">شاليهات مميزة</h2>
              <p className="text-muted-foreground">أفضل الشاليهات المختارة بعناية لإقامتك</p>
            </div>
            <Button variant="outline" onClick={() => setLocation('/chalets')} className="hidden md:flex">
              عرض الكل
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {chalets?.slice(0, 6).map((chalet: Chalet, index: number) => (
                <motion.div
                  key={chalet.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <ChaletCard chalet={chalet} />
                </motion.div>
              ))}
            </div>
          )}
          
          <div className="mt-10 text-center md:hidden">
            <Button variant="outline" size="lg" className="w-full" onClick={() => setLocation('/chalets')}>
              عرض جميع الشاليهات
            </Button>
          </div>
        </section>

        {/* Why choose us */}
        <section className="bg-secondary/50 py-20 px-4">
          <div className="container mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-bold text-foreground mb-4">لماذا تختار شاليهات القصيم؟</h2>
              <p className="text-muted-foreground text-lg">نحن نسهل عليك العثور على المكان المثالي لمناسباتك العائلية والخاصة</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-card p-8 rounded-2xl text-center shadow-sm border border-border/50 hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">تغطية شاملة</h3>
                <p className="text-muted-foreground">خيارات واسعة تشمل بريدة، عنيزة، الرس وكافة مدن ومحافظات القصيم.</p>
              </div>
              <div className="bg-card p-8 rounded-2xl text-center shadow-sm border border-border/50 hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">حجز مباشر وآمن</h3>
                <p className="text-muted-foreground">تواصل مباشر مع الملاك وإدارة الشاليهات عبر الواتساب بدون وسطاء.</p>
              </div>
              <div className="bg-card p-8 rounded-2xl text-center shadow-sm border border-border/50 hover:shadow-md transition-shadow">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l2-9 5 18 2-9h5"></path></svg>
                </div>
                <h3 className="text-xl font-bold mb-3">معلومات دقيقة</h3>
                <p className="text-muted-foreground">تفاصيل كاملة عن المرافق والصور والأسعار لتتخذ قرارك بثقة.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
