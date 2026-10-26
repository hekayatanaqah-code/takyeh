import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MapPin, ArrowRight, Loader2, ChevronLeft, ChevronRight, Star,
  Globe, Sparkles, Clock, Shield,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { PublicServiceCatalog } from "@/components/owner/ServiceCatalogPanels";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ServiceProvider {
  id: number;
  ownerId: string | null;
  businessName: string;
  category: string;
  city: string;
  descriptionAr: string | null;
  whatsappNumber: string;
  logoUrl: string | null;
  galleryPhotos: string[];
  videoUrl: string | null;
  yearsOfExperience: number | null;
  coverageTags: string[];
  customFeatureTags: string[];
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
  const [captionVisible, setCaptionVisible] = useState(true);

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

  // Main image is always the first gallery photo (NOT the logo)
  // Logo is displayed as a separate small badge/avatar
  const photos = provider.galleryPhotos ?? [];
  const currentPhoto = photos[photoIdx] ?? null;

  const waLink = `https://wa.me/${provider.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أود الاستفسار عن خدمة: ${provider.businessName}`)}`;

  const prev = () => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setPhotoIdx((i) => (i + 1) % photos.length);

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />

      <main className="flex-1 pb-24 lg:pb-12">
        {/* Back */}
        <div className="container mx-auto px-4 pt-4 pb-1">
          <button
            onClick={() => setLocation("/services")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            العودة لخدمات المناسبات
          </button>
        </div>

        <div className="container mx-auto px-4 max-w-5xl">
          {/* ── Hero: Gallery left + Header right ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start mt-3">

            {/* Gallery — takes 3 cols on desktop */}
            <div className="lg:col-span-3 space-y-3">
              {/* Main photo slider */}
              {photos.length > 0 ? (
                <div
                  className="relative rounded-2xl overflow-hidden aspect-video bg-muted shadow-xl group cursor-pointer"
                  onClick={() => setCaptionVisible((v) => !v)}
                >
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={photoIdx}
                      src={currentPhoto!}
                      alt={`${provider.businessName} — صورة ${photoIdx + 1} من ${photos.length}`}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    />
                  </AnimatePresence>

                  {/* Caption overlay */}
                  <AnimatePresence>
                    {captionVisible && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-8 pb-3 pointer-events-none"
                      >
                        <p className="text-white text-sm font-medium">
                          {provider.businessName}
                        </p>
                        <p className="text-white/70 text-xs">
                          صورة {photoIdx + 1} من {photos.length}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {photos.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); prev(); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="السابق"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); next(); }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors opacity-0 group-hover:opacity-100"
                        aria-label="التالي"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full font-medium">
                        {photoIdx + 1} / {photos.length}
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
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIdx(i)}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        i === photoIdx ? "border-primary shadow-sm" : "border-transparent opacity-55 hover:opacity-90"
                      }`}
                      title={`صورة ${i + 1}`}
                    >
                      <img src={url} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Video player if present */}
              {provider.videoUrl && (
                <div className="rounded-2xl overflow-hidden border border-border bg-black aspect-video">
                  <video
                    src={provider.videoUrl}
                    controls
                    playsInline
                    className="w-full h-full"
                    poster={photos[0] ?? undefined}
                  />
                </div>
              )}
            </div>

            {/* Info sidebar — takes 2 cols on desktop */}
            <div className="lg:col-span-2 space-y-4">
              {/* Category badge + city */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/40">
                  {cat.emoji} {cat.label}
                </span>
                {provider.city && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {provider.city}
                  </span>
                )}
                {!provider.isActive && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 px-2 py-0.5 rounded-full">
                    غير نشط حالياً
                  </span>
                )}
              </div>

              {/* Business name + logo */}
              <div className="flex items-center gap-3">
                {provider.logoUrl && (
                  <img
                    src={provider.logoUrl}
                    alt={provider.businessName}
                    className="w-12 h-12 rounded-xl object-cover border border-border shadow-sm shrink-0"
                  />
                )}
                <h1 className="text-2xl font-extrabold text-foreground leading-tight">
                  {provider.businessName}
                </h1>
              </div>

              {/* Quick stats row */}
              {(provider.yearsOfExperience != null || provider.coverageTags?.length > 0) && (
                <div className="flex flex-wrap gap-3 text-sm">
                  {provider.yearsOfExperience != null && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-4 h-4 text-primary/70" />
                      <span><strong className="text-foreground">{provider.yearsOfExperience}</strong> سنوات خبرة</span>
                    </div>
                  )}
                  {provider.coverageTags?.length > 0 && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Globe className="w-4 h-4 text-primary/70" />
                      <span>يخدم {provider.coverageTags.length} مدن</span>
                    </div>
                  )}
                </div>
              )}

              {/* Description — immediately after header for compact feel */}
              {provider.descriptionAr && (
                <div className="rounded-xl bg-muted/50 border border-border p-4">
                  <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    عن الخدمة
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{provider.descriptionAr}</p>
                </div>
              )}

              {/* Coverage tags */}
              {provider.coverageTags?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    نطاق الخدمة
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.coverageTags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                        <MapPin className="w-3 h-3" />{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom feature tags */}
              {provider.customFeatureTags?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    المميزات
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.customFeatureTags.map((tag) => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/30">
                        ✨ {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact CTA */}
              <div className="space-y-3 pt-2">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0" />
                    الأسعار والتفاصيل تُحدَّد عند التواصل المباشر
                  </p>
                </div>
                <a href={waLink} target="_blank" rel="noreferrer" className="block">
                  <Button
                    size="lg"
                    className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-base py-5 rounded-xl shadow-lg shadow-green-500/20"
                  >
                    <Phone className="w-5 h-5 me-2" />
                    تواصل عبر واتساب
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile WhatsApp sticky */}
      <div className="fixed bottom-0 right-0 left-0 lg:hidden z-40 p-3 bg-background/90 backdrop-blur border-t border-border">
        <a href={waLink} target="_blank" rel="noreferrer">
          <Button size="lg" className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-base py-5 rounded-xl">
            <Phone className="w-5 h-5 me-2" />
            تواصل عبر واتساب
          </Button>
        </a>
      </div>

      <div className="container mx-auto max-w-6xl px-4 pb-10">
        <PublicServiceCatalog providerId={provider.id} />
      </div>
      <Footer />
    </div>
  );
}
