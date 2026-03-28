import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Phone, MapPin, ArrowRight, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  bounce_houses:       { label: "نطيطات",      emoji: "🎪" },
  ice_cream:           { label: "آيس كريم",    emoji: "🍦" },
  productive_families: { label: "أسر منتجة",  emoji: "🎀" },
};

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

export default function ServiceDetail() {
  const [, params] = useRoute("/services/:id");
  const [, setLocation] = useLocation();
  const [photoIdx, setPhotoIdx] = useState(0);

  const { data: service, isLoading, isError } = useQuery<ExternalService>({
    queryKey: ["service", params?.id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/services/${params?.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("الخدمة غير موجودة");
      return r.json();
    },
    enabled: !!params?.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary w-10 h-10" />
        </div>
      </div>
    );
  }

  if (isError || !service) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">الخدمة غير موجودة</h1>
          <button onClick={() => setLocation("/services")} className="mt-4 text-primary hover:underline">
            العودة للخدمات
          </button>
        </div>
      </div>
    );
  }

  const meta = CATEGORY_META[service.category] ?? { label: service.category, emoji: "🎉" };
  const photos = service.photos;
  const waLink = `https://wa.me/${service.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً، أود الاستفسار عن خدمة: ${service.nameAr}`)}`;

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1 pb-16">
        {/* Breadcrumb */}
        <div className="container mx-auto px-4 pt-24 pb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <button onClick={() => setLocation("/services")} className="hover:text-primary transition-colors flex items-center gap-1">
              <ArrowRight className="w-4 h-4" />
              خدمات المناسبات
            </button>
            <span>/</span>
            <span className="text-foreground font-medium">{service.nameAr}</span>
          </div>
        </div>

        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Photos */}
            <div className="lg:col-span-3">
              {photos.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[4/3]">
                    <motion.img
                      key={photoIdx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={photos[photoIdx]}
                      alt={service.nameAr}
                      className="w-full h-full object-cover"
                    />
                    {photos.length > 1 && (
                      <>
                        <button
                          onClick={() => setPhotoIdx((i) => (i > 0 ? i - 1 : photos.length - 1))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setPhotoIdx((i) => (i < photos.length - 1 ? i + 1 : 0))}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {photos.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setPhotoIdx(i)}
                              className={`w-2 h-2 rounded-full transition-all ${i === photoIdx ? "bg-white scale-125" : "bg-white/50"}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {photos.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoIdx(i)}
                          className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${i === photoIdx ? "border-primary" : "border-transparent"}`}
                        >
                          <img src={p} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-muted aspect-[4/3] flex items-center justify-center text-8xl">
                  {meta.emoji}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 space-y-6">
                {/* Category badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  {meta.emoji} {meta.label}
                </span>

                <h1 className="text-3xl font-extrabold text-foreground leading-tight">{service.nameAr}</h1>

                {service.city && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{service.city}</span>
                  </div>
                )}

                {/* Price */}
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="mb-1">
                    <p className="text-lg font-bold text-[#25D366]">الأسعار عند التواصل مع المالك</p>
                    <p className="text-muted-foreground text-sm mt-1">تواصل مع مزود الخدمة مباشرةً للاستفسار عن السعر</p>
                  </div>

                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 w-full flex items-center justify-center gap-2 py-4 bg-green-500 hover:bg-green-600 text-white font-bold text-lg rounded-xl transition-colors shadow-lg shadow-green-500/20"
                  >
                    <Phone className="w-5 h-5" />
                    تواصل عبر واتساب
                  </a>
                </div>

                {/* Description */}
                <div>
                  <h2 className="text-lg font-bold text-foreground mb-3">تفاصيل الخدمة</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{service.descriptionAr}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
