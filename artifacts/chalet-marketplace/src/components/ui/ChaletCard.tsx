import { Link } from "wouter";
import { MapPin, Bed, Star, ShieldCheck } from "lucide-react";
import { Chalet } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveAmenity } from "@/lib/amenityUtils";

type Period = "morning" | "evening" | "full_day";

interface ChaletCardProps {
  chalet: Chalet;
  selectedPeriod?: Period;
  searchDate?: string;
}

const PERIOD_LABEL: Record<Period, string> = {
  morning: "صباحي",
  evening: "مسائي",
  full_day: "يوم كامل",
};

function fmt(v: string | number | null | undefined): string | null {
  return v && Number(v) > 0 ? Number(v).toLocaleString("ar-SA") : null;
}

export function ChaletCard({ chalet, selectedPeriod, searchDate }: ChaletCardProps) {
  const mainPhoto = chalet.photos && chalet.photos.length > 0
    ? chalet.photos[0]
    : `${import.meta.env.BASE_URL}images/chalet-placeholder-${(chalet.id % 3) + 1}.png`;

  const district = (chalet as any).district as string | null | undefined;
  const category = (chalet as any).category as string | null | undefined;
  const logoUrl = (chalet as any).logoUrl as string | null | undefined;
  const isVerified = Boolean((chalet as any).isVerified);
  const propertyType = (chalet as any).propertyType as string | null | undefined;
  const sections = (chalet as any).sections as string | null | undefined;
  const seasonalDisclaimer = Boolean((chalet as any).seasonalDisclaimer ?? true);
  const slotMorning = (chalet as any).slotMorning !== false;
  const slotEvening = (chalet as any).slotEvening !== false;
  const slotFullDay = (chalet as any).slotFullDay !== false;

  /* Weekday / Weekend prices */
  const weekdayPrice = fmt(chalet.priceWeekday);
  const weekendPrice = fmt(chalet.priceWeekend);
  const hasDayPrices = weekdayPrice || weekendPrice;

  /* Period-slot price (for filtered view) */
  let periodPrice: string | null = null;
  if (selectedPeriod) {
    const raw =
      selectedPeriod === "morning" ? chalet.priceMorning :
      selectedPeriod === "evening" ? chalet.priceEvening :
      chalet.priceFullDay;
    periodPrice = fmt(raw);
  }

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/50 bg-card hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
      <Link
        href={`/chalets/${chalet.id}${
          (() => {
            const p = new URLSearchParams();
            if (selectedPeriod) p.set("period", selectedPeriod);
            if (searchDate) p.set("date", searchDate);
            const q = p.toString();
            return q ? `?${q}` : "";
          })()
        }`}
        className="block"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
          <img
            src={mainPhoto}
            alt={chalet.nameAr}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&q=80&fit=crop`;
            }}
          />
          <div className="absolute top-4 right-4 flex gap-2 flex-wrap">
            {isVerified && (
              <Badge variant="secondary" className="bg-emerald-500/95 text-white border-none shadow-md backdrop-blur-sm">
                <ShieldCheck className="w-3 h-3 me-1" />
                موثق
              </Badge>
            )}
            {category && (
              <Badge variant="secondary" className="bg-primary/90 text-primary-foreground border-none shadow-sm">
                {category}
              </Badge>
            )}
            {!isVerified && (
              <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-foreground hover:bg-background border-none shadow-sm">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500 me-1" />
                <span>جديد</span>
              </Badge>
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center gap-2 text-white text-sm flex-wrap">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 me-1 opacity-80" />
                <span>{chalet.location}</span>
              </div>
              {district && (
                <span className="text-white/80 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                  {district}
                </span>
              )}
            </div>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            {logoUrl && (
              <div className="w-8 h-8 rounded-md border border-border bg-white flex items-center justify-center shrink-0 overflow-hidden">
                <img src={logoUrl} alt="شعار" className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <h3 className="font-bold text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors flex-1">
              {chalet.nameAr}
            </h3>
          </div>

          {/* ── Price Box ──────────────────────── */}
          {hasDayPrices ? (
            <div className="rounded-xl bg-primary/5 border border-primary/15 px-3.5 py-2.5 mb-3 space-y-1.5">
              {weekdayPrice && (
                <div className="flex items-center justify-between gap-3 text-sm min-w-0">
                  <span className="text-muted-foreground shrink-0">📅 وسط الأسبوع</span>
                  <span className="font-bold text-foreground whitespace-nowrap">
                    <span className="text-primary">{weekdayPrice}</span>
                    <span className="text-xs font-normal text-muted-foreground"> ر.س</span>
                  </span>
                </div>
              )}
              {weekendPrice && (
                <div className="flex items-center justify-between gap-3 text-sm min-w-0">
                  <span className="text-muted-foreground shrink-0">🎉 نهاية الأسبوع</span>
                  <span className="font-bold text-foreground whitespace-nowrap">
                    <span className="text-primary">{weekendPrice}</span>
                    <span className="text-xs font-normal text-muted-foreground"> ر.س</span>
                  </span>
                </div>
              )}
              {/* Period price if filtered */}
              {selectedPeriod && periodPrice && (
                <div className="flex items-center justify-between text-sm pt-1 border-t border-primary/10 mt-1">
                  <span className="text-muted-foreground">{PERIOD_LABEL[selectedPeriod]}</span>
                  <span className="font-bold text-primary">{periodPrice} ر.س</span>
                </div>
              )}
              {/* Seasonal disclaimer */}
              {seasonalDisclaimer && (
                <p className="text-xs text-amber-600 dark:text-amber-400 pt-1 border-t border-amber-200/50 dark:border-amber-700/30 mt-1">
                  ⚠️ تنبيه: الأسعار قد تختلف في المواسم والأعياد
                </p>
              )}
            </div>
          ) : (
            <div className="mb-3">
              <span className="text-xs font-semibold text-[#25D366] bg-[#25D366]/10 px-2 py-1 rounded-full">
                الأسعار عند التواصل
              </span>
            </div>
          )}

          {/* ── Available period badges (when no period filter active) ── */}
          {!selectedPeriod && (slotMorning || slotEvening || slotFullDay) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {slotMorning && (
                <span className="text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">🌅 صباحي</span>
              )}
              {slotEvening && (
                <span className="text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">🌙 مسائي</span>
              )}
              {slotFullDay && (
                <span className="text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">☀️ يوم كامل</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
              <Bed className="w-4 h-4 text-primary" />
              <span>{chalet.bedrooms} غرف</span>
            </div>
            {propertyType && (
              <span className="bg-primary/8 text-primary border border-primary/20 px-2 py-1 rounded-md text-xs font-medium">
                {propertyType}
              </span>
            )}
            {sections && (
              <span className="bg-secondary/80 text-muted-foreground border border-border/60 px-2 py-1 rounded-md text-xs">
                {sections}
              </span>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
            {chalet.amenities.slice(0, 3).map((amenity: string, idx: number) => {
              const { ar, icon } = resolveAmenity(amenity);
              return (
                <span key={idx} className="text-xs text-muted-foreground bg-background border px-2 py-1 rounded-full">
                  {icon} {ar}
                </span>
              );
            })}
            {chalet.amenities.length > 3 && (
              <span className="text-xs text-muted-foreground bg-background border px-2 py-1 rounded-full">
                +{chalet.amenities.length - 3}
              </span>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
