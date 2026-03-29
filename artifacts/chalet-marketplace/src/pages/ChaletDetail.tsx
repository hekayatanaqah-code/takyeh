import { useParams, Link } from "wouter";
import { useGetChaletById } from "@workspace/api-client-react";
import { MapPin, Users, Bed, CheckCircle2, Share2, ChevronRight, Info, Phone } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  const numericId = Number(id);
  const { data: chalet, isLoading, isError } = useGetChaletById(numericId);
  const [emblaRef] = useEmblaCarousel({ direction: "rtl", loop: true });

  /* ── Loading skeleton ─────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-8">
          <Skeleton className="w-48 h-5 mb-6" />
          <div className="flex flex-col lg:flex-row gap-8 lg:items-start">
            <div className="w-full lg:w-[60%] space-y-3">
              <Skeleton className="w-full aspect-[4/3] rounded-2xl" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
                <Skeleton className="w-full aspect-[4/3] rounded-xl" />
              </div>
            </div>
            <div className="w-full lg:w-[40%] space-y-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-48 w-full rounded-2xl" />
              <Skeleton className="h-28 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ──────────────────────────────────────── */
  if (isError || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-32 text-center">
          <h2 className="text-2xl font-bold text-destructive mb-4">حدث خطأ</h2>
          <p className="text-muted-foreground mb-8">لم نتمكن من العثور على الشاليه المطلوب.</p>
          <Link href="/chalets"><Button>العودة لقائمة الشاليهات</Button></Link>
        </div>
        <Footer />
      </div>
    );
  }

  const images =
    chalet.photos && chalet.photos.length > 0
      ? chalet.photos
      : [
          `${import.meta.env.BASE_URL}images/chalet-placeholder-1.png`,
          `${import.meta.env.BASE_URL}images/chalet-placeholder-2.png`,
          `${import.meta.env.BASE_URL}images/chalet-placeholder-3.png`,
        ];

  const district = (chalet as any).district as string | undefined;
  const locationLabel = district ? `حي ${district}، ${chalet.location}` : chalet.location;
  const whatsappMsg = `أهلاً، أود الاستفسار عن حجز شاليه ${chalet.nameAr} في ${chalet.location}.`;

  /* ── Coordinate extraction from mapsUrl ──────────────── */
  const mapsUrl: string | null | undefined = (chalet as any).mapsUrl;

  function parseLatLng(url: string): { lat: number; lng: number } | null {
    // Format 1: ?q=lat,lng  (e.g. https://maps.google.com/maps?q=26.329,43.975)
    const qMatch = url.match(/[?&]q=([-\d.]+),([-\d.]+)/);
    if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
    // Format 2: @lat,lng,zoom  (e.g. https://www.google.com/maps/@26.329,43.975,15z)
    const atMatch = url.match(/@([-\d.]+),([-\d.]+)/);
    if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
    return null;
  }

  const coords = mapsUrl ? parseLatLng(mapsUrl) : null;

  // Embed URL: exact pin when coords available, text search as fallback
  const mapEmbedUrl = coords
    ? `https://maps.google.com/maps?q=${coords.lat},${coords.lng}&output=embed&hl=ar&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(
        [district, chalet.location, "القصيم، المملكة العربية السعودية"].filter(Boolean).join("، ")
      )}&output=embed&hl=ar`;

  // Direct open link: exact coordinates or search query
  const mapsOpenUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : (mapsUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(
        [chalet.location, "القصيم", "المملكة العربية السعودية"].filter(Boolean).join("، ")
      )}`);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: chalet.nameAr, text: whatsappMsg, url: window.location.href }).catch(() => null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pb-24 lg:pb-12">

        {/* ── Breadcrumb ─────────────────────────────────────── */}
        <div className="container mx-auto px-4 pt-5 pb-4">
          <div className="flex items-center text-sm text-muted-foreground gap-1">
            <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <Link href="/chalets" className="hover:text-primary transition-colors">الشاليهات</Link>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            <span className="text-foreground font-medium truncate">{chalet.nameAr}</span>
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────── */}
        {/*
          DOM order: content col first, images col second.
          RTL flex-row: first item → RIGHT side, second item → LEFT side.
          So content goes RIGHT (40%) and images go LEFT (60%) on desktop — correct.
          Mobile flex-col:
            content gets order-2 (below images)
            images get order-1 (above content)
        */}
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row lg:gap-10 lg:items-start">

            {/* ═══ RIGHT COLUMN: Title + Booking Card + Description ═══ */}
            {/* Mobile: order-2 (appears after images) */}
            {/* Desktop: order-first → RTL start = right side (40%) */}
            <div className="order-2 lg:order-first lg:w-[40%] space-y-6 pt-4 lg:pt-0 lg:sticky lg:top-[80px]">

              {/* Title + meta */}
              <div>
                <h1 className="text-2xl lg:text-3xl font-extrabold text-foreground leading-tight mb-2">
                  {chalet.nameAr}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 shrink-0" />
                    {locationLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    تقييم عالٍ
                  </span>
                </div>
                {/* Quick stats chips */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5 text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    {chalet.maxGuests} ضيوف
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-secondary rounded-lg px-3 py-1.5 text-xs font-medium">
                    <Bed className="w-3.5 h-3.5 text-primary" />
                    {chalet.bedrooms} غرف نوم
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="h-auto px-3 py-1.5 text-xs"
                  >
                    <Share2 className="w-3.5 h-3.5 me-1.5" />
                    مشاركة
                  </Button>
                </div>
              </div>

              {/* ── WhatsApp Contact Card ───────────────────────── */}
              <div className="bg-card border border-border/60 shadow-lg shadow-primary/5 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-[#25D366]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Phone className="w-5 h-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">تواصل مع المالك</p>
                    <p className="text-xs text-muted-foreground mt-0.5">الأسعار والتفاصيل عند التواصل المباشر</p>
                  </div>
                </div>

                <div className="space-y-2.5 mb-4 py-3 border-y border-border/40">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">مبلغ التأمين</span>
                    <span className="font-semibold">يُحدَّد مع المالك</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">أوقات الدخول والخروج</span>
                    <span className="font-semibold">مرنة بالاتفاق</span>
                  </div>
                </div>

                <WhatsAppButton
                  phoneNumber={chalet.whatsappNumber}
                  message={whatsappMsg}
                  fullWidth
                  className="py-3 text-base rounded-xl font-bold"
                />
                <p className="text-xs text-center text-muted-foreground mt-3">
                  تواصل مباشرةً مع المالك عبر واتساب للحجز والاستفسار
                </p>
              </div>

              {/* ── Description ────────────────────────────────── */}
              <section>
                <h2 className="text-lg font-bold mb-2">عن الشاليه</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{chalet.descriptionAr}</p>
              </section>

              {/* ── Amenities ──────────────────────────────────── */}
              {chalet.amenities.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold mb-3">المرافق والمميزات</h2>
                  <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                    {chalet.amenities.map((amenity: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground">{amenity}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Location ───────────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    الموقع
                  </h2>
                  <a
                    href={mapsOpenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-lg"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    فتح في خرائط قوقل
                  </a>
                </div>
                <p className="text-sm font-medium text-foreground mb-3">{locationLabel}</p>
                <div className="w-full rounded-xl overflow-hidden border border-border/50 mb-3" style={{ height: "220px" }}>
                  <iframe
                    key={mapEmbedUrl}
                    title="موقع الشاليه"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={mapEmbedUrl}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                {coords ? (
                  <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 px-3 py-2.5 rounded-xl">
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      الموقع الدقيق للشاليه — اضغط "فتح في خرائط قوقل" للتوجيه المباشر.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 bg-secondary/60 px-3 py-2.5 rounded-xl">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      الخريطة تُظهر المنطقة التقريبية. سيتم مشاركة العنوان الدقيق عبر واتساب بعد التواصل مع المالك.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* ═══ LEFT COLUMN: Image Gallery ═══ */}
            {/* Mobile: order-1 (appears first, above content) */}
            {/* Desktop: order-last → RTL end = left side (60%) */}
            <div className="order-1 lg:order-last lg:w-[60%]">

              {/* Desktop gallery: main image + thumbnail strip */}
              <div className="hidden lg:block space-y-3">
                {/* Primary image */}
                <div className="w-full rounded-2xl overflow-hidden bg-muted" style={{ aspectRatio: "16/10" }}>
                  <img
                    src={images[0]}
                    alt={chalet.nameAr}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                  />
                </div>

                {/* Secondary images grid */}
                {images.length > 1 && (
                  <div className={`grid gap-3 ${images.length >= 4 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {images.slice(1, images.length >= 4 ? 4 : 3).map((img: string, i: number) => (
                      <div key={i} className="rounded-xl overflow-hidden bg-muted relative" style={{ aspectRatio: "4/3" }}>
                        <img
                          src={img}
                          alt={`صورة ${i + 2}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                        />
                        {i === (images.length >= 4 ? 2 : 1) && images.length > (images.length >= 4 ? 4 : 3) && (
                          <div className="absolute inset-0 bg-black/55 flex items-center justify-center cursor-pointer hover:bg-black/45 transition-colors">
                            <span className="text-white font-bold text-lg">+{images.length - (images.length >= 4 ? 4 : 3)} صور</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile / Tablet: Embla carousel */}
              <div className="lg:hidden overflow-hidden rounded-2xl bg-muted" ref={emblaRef} dir="rtl">
                <div className="flex">
                  {images.map((img: string, i: number) => (
                    <div key={i} className="flex-[0_0_100%] min-w-0 relative" style={{ aspectRatio: "4/3" }}>
                      <img src={img} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 left-3 bg-black/65 text-white px-2.5 py-1 rounded-full text-xs backdrop-blur-sm font-medium">
                        {i + 1} / {images.length}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />

      {/* ── Mobile Floating WhatsApp bar ─────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 p-3 bg-background/95 backdrop-blur-xl border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.06)] flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-foreground truncate">{chalet.nameAr}</p>
          <p className="text-xs text-[#25D366] font-semibold">الأسعار عند التواصل</p>
        </div>
        <WhatsAppButton
          phoneNumber={chalet.whatsappNumber}
          message={whatsappMsg}
          className="shrink-0 px-5 py-2.5 text-sm font-bold rounded-xl"
        />
      </div>
    </div>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
