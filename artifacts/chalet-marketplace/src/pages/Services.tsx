import { useState, useMemo, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Phone, MapPin, Loader2, Plus, Star } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@workspace/replit-auth-web";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/* ── Deterministic colour per category key ──────── */
const COLOR_PALETTE = [
  "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/40",
  "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700/40",
  "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40",
  "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700/40",
  "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/40",
  "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-700/40",
  "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700/40",
  "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700/40",
  "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/40",
  "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
];

function keyToColor(key: string): string {
  const hash = Array.from(key).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

/* ── Types ──────────────────────────────────────── */
interface ServiceCatItem {
  id: number;
  key: string;
  labelAr: string;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
}

interface CatMeta {
  label: string;
  emoji: string;
  color: string;
}

interface ExternalService {
  id: number;
  nameAr: string;
  category: string;
  descriptionAr: string;
  whatsappNumber: string;
  price: string | null;
  priceNote: string | null;
  city: string | null;
  photos: string[];
  isActive: boolean;
}

interface ServiceProvider {
  id: number;
  businessName: string;
  category: string;
  city: string;
  descriptionAr: string | null;
  whatsappNumber: string;
  logoUrl: string | null;
  galleryPhotos: string[];
  isActive: boolean;
}

/* ── Service Card ───────────────────────────────── */
function ServiceCard({ service, meta }: { service: ExternalService; meta: CatMeta }) {
  const [, setLocation] = useLocation();
  const photo = service.photos[0];
  const waLink = `https://wa.me/${service.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أود الاستفسار عن خدمة: ${service.nameAr}`)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group cursor-pointer"
      onClick={() => setLocation(`/services/${service.id}`)}
    >
      <div className="relative h-48 bg-muted overflow-hidden">
        {photo ? (
          <img src={photo} alt={service.nameAr} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">{meta.emoji}</div>
        )}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors leading-snug">{service.nameAr}</h3>
        {service.city && (
          <div className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
            <MapPin className="w-3.5 h-3.5" /><span>{service.city}</span>
          </div>
        )}
        <p className="text-muted-foreground text-sm line-clamp-2 mb-4 leading-relaxed">{service.descriptionAr}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#25D366] bg-[#25D366]/10 px-2.5 py-1 rounded-full">الأسعار عند التواصل</span>
          <a href={waLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors">
            <Phone className="w-3.5 h-3.5" />واتساب
          </a>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Provider Card ──────────────────────────────── */
function ProviderCard({ provider, meta }: { provider: ServiceProvider; meta: CatMeta }) {
  const [, setLocation] = useLocation();
  const mainPhoto = provider.galleryPhotos[0] ?? provider.logoUrl;
  const waLink = `https://wa.me/${provider.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أود الاستفسار عن: ${provider.businessName}`)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 group cursor-pointer"
      onClick={() => setLocation(`/providers/${provider.id}`)}
    >
      <div className="relative h-48 bg-muted overflow-hidden">
        {mainPhoto ? (
          <img src={mainPhoto} alt={provider.businessName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">{meta.emoji}</div>
        )}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500 text-white shadow-sm">
            ✓ موثق
          </span>
        </div>
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
            {meta.emoji} {meta.label}
          </span>
        </div>
        {provider.logoUrl && (
          <div className="absolute bottom-3 right-3 w-10 h-10 rounded-xl bg-white border border-white/80 shadow overflow-hidden">
            <img src={provider.logoUrl} alt="شعار" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors leading-snug">{provider.businessName}</h3>
        {provider.city && (
          <div className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
            <MapPin className="w-3.5 h-3.5" /><span>{provider.city}</span>
          </div>
        )}
        {provider.descriptionAr && (
          <p className="text-muted-foreground text-sm line-clamp-2 mb-4 leading-relaxed">{provider.descriptionAr}</p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#25D366] bg-[#25D366]/10 px-2.5 py-1 rounded-full">الأسعار عند التواصل</span>
          <a href={waLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors">
            <Phone className="w-3.5 h-3.5" />واتساب
          </a>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Page ──────────────────────────────────── */
export default function Services() {
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const initCategory = urlParams.get("category") ?? "all";
  const initCity     = urlParams.get("city")     ?? "all";
  const initDate     = urlParams.get("date")     ?? "";

  const [activeCategory, setActiveCategory] = useState<string>(initCategory);
  const [cityFilter, setCityFilter]         = useState<string>(initCity);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  /* Sync state if URL changes (e.g. user navigates back) */
  useEffect(() => {
    const p = new URLSearchParams(search);
    setActiveCategory(p.get("category") ?? "all");
    setCityFilter(p.get("city") ?? "all");
  }, [search]);

  /* ── Service categories (active only, sorted by admin) ── */
  const { data: apiCategories = [], isLoading: catsLoading } = useQuery<ServiceCatItem[]>({
    queryKey: ["catalog", "service-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/service-categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  /* ── Build category lookup map keyed by category.key ── */
  const catMeta = useMemo<Record<string, CatMeta>>(() => {
    const map: Record<string, CatMeta> = {};
    for (const c of apiCategories) {
      map[c.key] = { label: c.labelAr, emoji: c.emoji, color: keyToColor(c.key) };
    }
    return map;
  }, [apiCategories]);

  const defaultMeta: CatMeta = { label: "خدمات", emoji: "✨", color: COLOR_PALETTE[9] };
  const getMeta = (key: string): CatMeta => catMeta[key] ?? defaultMeta;

  /* ── Tabs: "All" + one tab per active category ── */
  const tabs = useMemo(() => [
    { id: "all", label: "جميع الخدمات", emoji: "✨" },
    ...apiCategories.map((c) => ({ id: c.key, label: c.labelAr, emoji: c.emoji })),
  ], [apiCategories]);

  /* ── Admin-managed services (filtered by category) ── */
  const { data: services = [], isLoading: servicesLoading } = useQuery<ExternalService[]>({
    queryKey: ["services", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "all"
        ? `${BASE}/api/services`
        : `${BASE}/api/services?category=${activeCategory}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل الخدمات");
      return r.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  /* ── Approved owner providers (filtered by category) ── */
  const { data: providers = [], isLoading: providersLoading } = useQuery<ServiceProvider[]>({
    queryKey: ["providers", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "all"
        ? `${BASE}/api/providers`
        : `${BASE}/api/providers?category=${activeCategory}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  /* ── Client-side city filter ── */
  const filteredServices = useMemo(() =>
    cityFilter && cityFilter !== "all"
      ? services.filter((s) => s.city === cityFilter)
      : services,
    [services, cityFilter]);

  const filteredProviders = useMemo(() =>
    cityFilter && cityFilter !== "all"
      ? providers.filter((p) => p.city === cityFilter)
      : providers,
    [providers, cityFilter]);

  const isLoading = servicesLoading || providersLoading || catsLoading;
  const isEmpty = filteredServices.length === 0 && filteredProviders.length === 0;

  /* Search context chips — shown when URL params were passed */
  const hasSearchCtx = initCategory !== "all" || initCity !== "all" || !!initDate;

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-bl from-amber-50 via-background to-background dark:from-amber-950/20 pt-28 pb-14 px-4">
          <div className="container mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="text-primary font-semibold mb-3 tracking-wide">خدمات المناسبات</p>
              <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight">
                أجمل الخدمات لمناسباتك
              </h1>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
                {catsLoading
                  ? "..."
                  : apiCategories.slice(0, 3).map((c) => `${c.emoji} ${c.labelAr}`).join("، ") || "خدمات متنوعة لمناسبتك"
                } — كل ما تحتاجه لمناسبة لا تُنسى
              </p>
              <button
                onClick={() => setLocation("/add-service-provider")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-semibold border border-amber-200 dark:border-amber-700/40 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                سجّل خدمتك معنا
              </button>
            </motion.div>
          </div>
        </section>

        {/* ── Search context banner (shown when navigated from home search) ── */}
        {hasSearchCtx && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700/40 px-4 py-3">
            <div className="container mx-auto flex flex-wrap items-center gap-2 text-sm">
              <span className="text-amber-700 dark:text-amber-300 font-semibold">🔍 نتائج البحث:</span>
              {initCategory !== "all" && (
                <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40 px-3 py-1 rounded-full font-medium">
                  {catMeta[initCategory]?.emoji} {catMeta[initCategory]?.label ?? initCategory}
                </span>
              )}
              {initCity !== "all" && (
                <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40 px-3 py-1 rounded-full font-medium flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{initCity}
                </span>
              )}
              {initDate && (
                <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40 px-3 py-1 rounded-full font-medium">
                  📅 {initDate}
                </span>
              )}
              <button onClick={() => setLocation("/services")} className="text-xs text-amber-600 dark:text-amber-400 underline hover:no-underline mr-auto">
                مسح الفلاتر
              </button>
            </div>
          </div>
        )}

        {/* ── Category Tabs (dynamic from DB) ─────────────── */}
        <section className="sticky top-16 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
          <div className="container mx-auto">
            {catsLoading ? (
              <div className="flex items-center gap-2 h-9">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 rounded-full bg-muted animate-pulse" style={{ width: `${60 + i * 15}px` }} />
                ))}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {tabs.map(({ id, label, emoji }) => (
                  <button
                    key={id}
                    onClick={() => setActiveCategory(id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                      activeCategory === id
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <span>{emoji}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Content ──────────────────────────────────── */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-primary w-8 h-8" />
          </div>
        ) : isEmpty ? (
          <div className="text-center py-20 px-4">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-bold text-foreground mb-2">لا توجد خدمات متاحة حالياً</h3>
            <p className="text-muted-foreground mb-6">
              {activeCategory !== "all"
                ? `لا توجد خدمات في فئة "${tabs.find((t) => t.id === activeCategory)?.label ?? activeCategory}" حالياً`
                : "سيتم إضافة خدمات قريباً"}
            </p>
            <button
              onClick={() => setLocation("/add-service-provider")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              سجّل أول خدمة
            </button>
          </div>
        ) : (
          <>
            {/* ── Admin-managed services ── */}
            {filteredServices.length > 0 && (
              <section className="py-10 px-4">
                <div className="container mx-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {filteredServices.map((svc) => (
                      <ServiceCard key={svc.id} service={svc} meta={getMeta(svc.category)} />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Owner-submitted service providers ── */}
            {filteredProviders.length > 0 && (
              <section className={`py-10 px-4 border-t border-border/40 ${filteredServices.length > 0 ? "bg-amber-50/40 dark:bg-amber-900/5" : ""}`}>
                <div className="container mx-auto">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-amber-500 rounded-full" />
                    <h2 className="text-xl font-bold text-foreground">مزودو الخدمات الموثقون</h2>
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/40 px-2 py-0.5 rounded-full font-semibold">
                      {filteredProviders.length} مزود
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {filteredProviders.map((p) => (
                      <ProviderCard key={p.id} provider={p} meta={getMeta(p.category)} />
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* CTA: join as provider */}
        <section className="py-12 px-4 border-t border-border">
          <div className="container mx-auto max-w-xl text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl mb-4">
              <Star className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-extrabold text-foreground mb-2">هل لديك خدمة مناسبات؟</h3>
            <p className="text-muted-foreground text-sm mb-5 leading-relaxed">
              سجّل خدمتك مجاناً وابدأ الوصول لآلاف العملاء في منطقة القصيم
            </p>
            <Button size="lg" onClick={() => setLocation("/add-service-provider")} className="px-8 font-bold">
              <Plus className="w-4 h-4 me-2" />
              سجّل خدمتك الآن
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
