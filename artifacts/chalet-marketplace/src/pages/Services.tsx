import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Phone, MapPin, ChevronLeft, Star, Loader2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ServiceCategory = "all" | "bounce_houses" | "ice_cream" | "productive_families";

const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  bounce_houses:       { label: "نطيطات",      emoji: "🎪", color: "bg-rose-100 text-rose-700 border-rose-200" },
  ice_cream:           { label: "آيس كريم",    emoji: "🍦", color: "bg-sky-100 text-sky-700 border-sky-200" },
  productive_families: { label: "أسر منتجة",  emoji: "🎀", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

const TABS: { id: ServiceCategory; label: string; emoji: string }[] = [
  { id: "all",                label: "جميع الخدمات", emoji: "✨" },
  { id: "bounce_houses",       label: "نطيطات",        emoji: "🎪" },
  { id: "ice_cream",           label: "آيس كريم",      emoji: "🍦" },
  { id: "productive_families", label: "أسر منتجة",    emoji: "🎀" },
];

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

function ServiceCard({ service }: { service: ExternalService }) {
  const [, setLocation] = useLocation();
  const meta = CATEGORY_META[service.category] ?? { label: service.category, emoji: "🎉", color: "bg-slate-100 text-slate-700" };
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
          <div className="w-full h-full flex items-center justify-center text-6xl">
            {meta.emoji}
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors leading-snug">
          {service.nameAr}
        </h3>
        {service.city && (
          <div className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
            <MapPin className="w-3.5 h-3.5" />
            <span>{service.city}</span>
          </div>
        )}
        <p className="text-muted-foreground text-sm line-clamp-2 mb-4 leading-relaxed">
          {service.descriptionAr}
        </p>

        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#25D366] bg-[#25D366]/10 px-2.5 py-1 rounded-full">
              الأسعار عند التواصل
            </span>
          </div>
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            واتساب
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function Services() {
  const [activeCategory, setActiveCategory] = useState<ServiceCategory>("all");

  const { data: services = [], isLoading } = useQuery<ExternalService[]>({
    queryKey: ["services", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "all"
        ? `${BASE}/api/services`
        : `${BASE}/api/services?category=${activeCategory}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل الخدمات");
      return r.json();
    },
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-to-bl from-amber-50 via-background to-background pt-28 pb-16 px-4">
          <div className="container mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <p className="text-primary font-semibold mb-3 tracking-wide">خدمات المناسبات</p>
              <h1 className="text-4xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight">
                أجمل الخدمات لمناسباتك
              </h1>
              <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                نطيطات، آيس كريم، وأسر منتجة — كل ما تحتاجه لمناسبة لا تُنسى
              </p>
            </motion.div>
          </div>
        </section>

        {/* Category Tabs */}
        <section className="sticky top-16 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-4 py-3">
          <div className="container mx-auto">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {TABS.map(({ id, label, emoji }) => (
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
          </div>
        </section>

        {/* Services Grid */}
        <section className="py-10 px-4">
          <div className="container mx-auto">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="animate-spin text-primary w-8 h-8" />
              </div>
            ) : services.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-xl font-bold text-foreground mb-2">لا توجد خدمات متاحة حالياً</h3>
                <p className="text-muted-foreground">سيتم إضافة خدمات قريباً</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {services.map((svc) => (
                  <ServiceCard key={svc.id} service={svc} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
