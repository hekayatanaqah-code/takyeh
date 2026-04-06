import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MessageCircle, ChevronLeft, Calendar } from "lucide-react";
import { ChaletDiamondContent, DiamondData } from "@/components/chalet/ChaletDiamondContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ChaletMasterView() {
  const { id } = useParams<{ id: string }>();

  const { data: chalet, isLoading, error } = useQuery<DiamondData>({
    queryKey: ["chalet-master", id],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/chalets/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
  });

  /* ── LOADING ── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-10 space-y-4 max-w-5xl">
          {[280, 160, 200].map((h, i) => (
            <div key={i} style={{ height: h }} className="rounded-2xl bg-stone-800/60 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  /* ── ERROR ── */
  if (error || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-stone-950">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-5xl">🏕️</p>
            <p className="text-xl font-bold text-stone-100">الشاليه غير موجود</p>
            <p className="text-stone-400">تأكد من الرابط أو عد للقائمة</p>
          </div>
        </div>
      </div>
    );
  }

  const terms = (chalet.termsAndConditions ?? "").split("\n").map(t => t.trim()).filter(Boolean);
  const phone = (chalet.whatsappNumber ?? "").replace(/\D/g, "");

  return (
    <div className="min-h-screen flex flex-col bg-stone-950" dir="rtl">
      <Navbar />

      {/* Breadcrumb */}
      <div className="container mx-auto px-4 pt-4 pb-1 max-w-5xl">
        <nav className="text-xs text-stone-500 flex items-center gap-1.5 flex-wrap">
          <a href={`${BASE}/`} className="hover:text-amber-400 transition-colors">الرئيسية</a>
          <ChevronLeft className="w-3 h-3" />
          <a href={`${BASE}/chalets`} className="hover:text-amber-400 transition-colors">الشاليهات</a>
          <ChevronLeft className="w-3 h-3" />
          <span className="text-stone-300 font-medium truncate max-w-[160px]">{chalet.nameAr}</span>
        </nav>
      </div>

      <main className="flex-1 container mx-auto px-4 pb-28 md:pb-12 max-w-5xl">
        <ChaletDiamondContent data={chalet} mode="page" />
      </main>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-stone-950/95 backdrop-blur border-t border-stone-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-stone-100 truncate">{chalet.nameAr}</p>
            {chalet.priceWeekday && (
              <p className="text-xs text-amber-400">
                يبدأ من {Number(chalet.priceWeekday).toLocaleString("ar-SA")} ر.س
              </p>
            )}
          </div>
          <a
            href={`${BASE}/chalets/${id}/book`}
            className="shrink-0 h-11 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-900 font-bold text-sm flex items-center gap-2 transition-colors"
          >
            <Calendar className="w-4 h-4" /> احجز الآن
          </a>
        </div>
      </div>

      <Footer />
    </div>
  );
}
