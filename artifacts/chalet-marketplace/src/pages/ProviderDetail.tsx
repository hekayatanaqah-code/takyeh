import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, MapPin, ArrowRight, Loader2, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  createdAt: string;
}

interface ServiceCatItem {
  key: string;
  labelAr: string;
  emoji: string;
}

export default function ProviderDetail() {
  const [, params] = useRoute("/providers/:id");
  const [, setLocation] = useLocation();
  const [photoIdx, setPhotoIdx] = useState(0);

  const { data: provider, isLoading, isError } = useQuery<ServiceProvider>({
    queryKey: ["provider", params?.id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/providers/${params?.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("مزود الخدمة غير موجود");
      return r.json();
    },
  });

  const { data: apiCategories = [] } = useQuery<ServiceCatItem[]>({
    queryKey: ["catalog", "service-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/service-categories`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30 * 1000,
  });

  const categoryLabels = useMemo(() => {
    const map: Record<string, { label: string; emoji: string }> = {};
    for (const c of apiCategories) {
      map[c.key] = { label: c.labelAr, emoji: c.emoji };
    }
    return map;
  }, [apiCategories]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError || !provider) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">😕</div>
            <h2 className="text-2xl font-bold mb-2">مزود الخدمة غير موجود</h2>
            <Button onClick={() => setLocation("/services")} className="mt-4">العودة للخدمات</Button>
          </div>
        </div>
      </div>
    );
  }

  const cat = categoryLabels[provider.category] ?? { label: provider.category, emoji: "✨" };
  const photos = provider.galleryPhotos ?? [];
  const allPhotos = provider.logoUrl ? [provider.logoUrl, ...photos] : photos;
  const currentPhoto = allPhotos[photoIdx] ?? null;

  const waLink = `https://wa.me/${provider.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أود الاستفسار عن خدمة: ${provider.businessName}`)}`;

  const prev = () => setPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length);
  const next = () => setPhotoIdx((i) => (i + 1) % allPhotos.length);

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 pb-24 lg:pb-12">
        {/* Back */}
        <div className="container mx-auto px-4 pt-5 pb-2">
          <button
            onClick={() => setLocation("/services")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            العودة لخدمات المناسبات
          </button>
        </div>

        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
            {/* ── Content (RTL: appears right) ────────────── */}
            <div className="flex-1 order-2 lg:order-1 space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40">
                    {cat.emoji} {cat.label}
                  </span>
                  {provider.city && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5" />
                      {provider.city}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-2">
                  {provider.logoUrl && (
                    <img
                      src={provider.logoUrl}
                      alt={provider.businessName}
                      className="w-14 h-14 rounded-2xl object-cover border border-border shadow-sm"
                    />
                  )}
                  <h1 className="text-3xl font-extrabold text-foreground leading-tight">
                    {provider.businessName}
                  </h1>
                </div>
              </div>

              {/* Description */}
              {provider.descriptionAr && (
                <div className="bg-card rounded-2xl border border-border p-5">
                  <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    عن الخدمة
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-[15px]">{provider.descriptionAr}</p>
                </div>
              )}

              {/* Contact */}
              <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
                <h3 className="text-base font-bold text-foreground">التواصل والحجز</h3>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                    💡 الأسعار والتفاصيل تُحدَّد عند التواصل المباشر مع مزود الخدمة
                  </p>
                </div>
                <a href={waLink} target="_blank" rel="noreferrer" className="block">
                  <Button size="lg" className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-base py-5 rounded-xl shadow-lg shadow-green-500/20">
                    <Phone className="w-5 h-5 me-2" />
                    تواصل عبر واتساب
                  </Button>
                </a>
              </div>
            </div>

            {/* ── Photo Gallery (RTL: appears left) ───────── */}
            <div className="w-full lg:w-[440px] order-1 lg:order-2 space-y-3">
              {/* Main photo slider */}
              {allPhotos.length > 0 ? (
                <div className="relative rounded-2xl overflow-hidden aspect-video bg-muted shadow-xl">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={photoIdx}
                      src={currentPhoto!}
                      alt={`صورة ${photoIdx + 1}`}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    />
                  </AnimatePresence>

                  {allPhotos.length > 1 && (
                    <>
                      <button
                        onClick={prev}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <button
                        onClick={next}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {allPhotos.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPhotoIdx(i)}
                            className={`h-1.5 rounded-full transition-all ${i === photoIdx ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl aspect-video bg-muted flex items-center justify-center text-7xl">
                  {cat.emoji}
                </div>
              )}

              {/* Thumbnail strip */}
              {allPhotos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {allPhotos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        i === photoIdx ? "border-primary shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile WhatsApp sticky */}
              <div className="fixed bottom-0 right-0 left-0 lg:hidden z-40 p-4 bg-background/80 backdrop-blur border-t border-border">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <Button size="lg" className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-base py-5 rounded-xl">
                    <Phone className="w-5 h-5 me-2" />
                    تواصل عبر واتساب
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
