import { useParams, Link } from "wouter";
import { useGetChaletById } from "@workspace/api-client-react";
import { MapPin, Users, Bed, CheckCircle2, Share2, ChevronRight, Info } from "lucide-react";
import useEmblaCarousel from 'embla-carousel-react';
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function ChaletDetail() {
  const { id } = useParams<{ id: string }>();
  
  const numericId = Number(id);
  const { data: chalet, isLoading, isError } = useGetChaletById(numericId);

  const [emblaRef] = useEmblaCarousel({ direction: 'rtl', loop: true });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 space-y-6 flex-1">
          <Skeleton className="w-32 h-6" />
          <Skeleton className="w-full h-8 max-w-md" />
          <Skeleton className="w-full aspect-[21/9] rounded-3xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4"><Skeleton className="h-40 w-full" /></div>
            <div className="lg:col-span-1"><Skeleton className="h-60 w-full" /></div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !chalet) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-32 text-center flex-1">
          <h2 className="text-2xl font-bold text-destructive mb-4">حدث خطأ</h2>
          <p className="text-muted-foreground mb-8">لم نتمكن من العثور على الشاليه المطلوب.</p>
          <Link href="/chalets">
            <Button>العودة لقائمة الشاليهات</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Generate fallback images if photos array is empty or short
  const images = chalet.photos && chalet.photos.length > 0 
    ? chalet.photos 
    : [
        `${import.meta.env.BASE_URL}images/chalet-placeholder-1.png`,
        `${import.meta.env.BASE_URL}images/chalet-placeholder-2.png`,
        `${import.meta.env.BASE_URL}images/chalet-placeholder-3.png`
      ];

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: chalet.nameAr,
        text: `شاهد ${chalet.nameAr} في ${chalet.location}`,
        url: window.location.href,
      }).catch(console.error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 pb-24">
        {/* Header Title & Breadcrumb */}
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center text-sm text-muted-foreground mb-4">
            <Link href="/" className="hover:text-primary transition-colors">الرئيسية</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <Link href="/chalets" className="hover:text-primary transition-colors">الشاليهات</Link>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-foreground">{chalet.nameAr}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-3">{chalet.nameAr}</h1>
              <div className="flex items-center text-muted-foreground gap-4">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {chalet.location}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  تقييم عالٍ
                </span>
              </div>
            </div>
            
            <Button variant="outline" onClick={handleShare} className="shrink-0 hover-elevate self-start">
              <Share2 className="w-4 h-4 me-2" />
              مشاركة
            </Button>
          </div>
        </div>

        {/* Desktop Image Grid / Mobile Carousel */}
        <div className="container mx-auto px-4 mb-10">
          <div className="hidden md:grid grid-cols-4 gap-4 h-[50vh] min-h-[400px]">
            <div className="col-span-3 h-full rounded-2xl overflow-hidden">
              <img src={images[0]} alt={chalet.nameAr} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
            </div>
            <div className="col-span-1 grid grid-rows-2 gap-4 h-full">
              <div className="rounded-2xl overflow-hidden">
                <img src={images[1] || images[0]} alt="صورة إضافية" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="rounded-2xl overflow-hidden relative">
                <img src={images[2] || images[0]} alt="صورة إضافية" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                {images.length > 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white cursor-pointer hover:bg-black/40 transition-colors">
                    <span className="font-bold text-lg">+{images.length - 3} صور</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Carousel */}
          <div className="md:hidden overflow-hidden rounded-2xl" ref={emblaRef} dir="rtl">
            <div className="flex">
              {images.map((img: string, i: number) => (
                <div key={i} className="flex-[0_0_100%] min-w-0 relative aspect-[4/3]">
                  <img src={img} alt={`صورة ${i+1}`} className="w-full h-full object-cover" />
                  <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs backdrop-blur-md">
                    {i + 1} / {images.length}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-10">
              
              {/* Quick Info Bar */}
              <div className="flex flex-wrap gap-4 py-4 border-y border-border/60">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-secondary rounded-xl text-primary"><Users className="w-6 h-6" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">يتسع لـ</p>
                    <p className="font-bold">{chalet.maxGuests} ضيوف</p>
                  </div>
                </div>
                <div className="w-px h-10 bg-border/60 hidden sm:block mx-4"></div>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-secondary rounded-xl text-primary"><Bed className="w-6 h-6" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">غرف النوم</p>
                    <p className="font-bold">{chalet.bedrooms} غرف</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <section>
                <h2 className="text-2xl font-bold mb-4">عن الشاليه</h2>
                <div className="prose prose-p:text-muted-foreground prose-p:leading-loose text-foreground max-w-none">
                  <p>{chalet.descriptionAr}</p>
                </div>
              </section>

              {/* Amenities */}
              <section>
                <h2 className="text-2xl font-bold mb-6">المرافق والمميزات</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {chalet.amenities.map((amenity: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="text-foreground">{amenity}</span>
                    </div>
                  ))}
                </div>
              </section>
              
              {/* Location Note */}
              <section className="bg-secondary/50 p-6 rounded-2xl border border-border/50">
                <div className="flex gap-4">
                  <Info className="w-6 h-6 text-primary shrink-0" />
                  <div>
                    <h3 className="font-bold mb-1">معلومات الموقع</h3>
                    <p className="text-sm text-muted-foreground">
                      الموقع الدقيق سيتم مشاركته معك من قبل المالك بعد تأكيد الحجز. الشاليه يقع في منطقة هادئة ومناسبة للعائلات في مدينة {chalet.location}.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Sticky Sidebar Booking Card */}
            <div className="lg:col-span-1">
              <div className="bg-card border border-border/60 shadow-xl shadow-primary/5 rounded-3xl p-6 sticky top-24">
                <div className="mb-6 pb-6 border-b border-border/60">
                  <p className="text-xs text-muted-foreground mb-1">متوسط السعر</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-extrabold text-foreground">{chalet.pricePerNight}</span>
                    <span className="text-muted-foreground font-medium mb-1">ر.س / ليلة</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    السعر النهائي يعتمد على الموسم ويتم تأكيده عبر واتساب
                  </p>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">مبلغ التأمين</span>
                    <span className="font-bold">يحدد لاحقاً</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">أوقات الدخول والخروج</span>
                    <span className="font-bold">مرنة بالاتفاق</span>
                  </div>
                </div>

                <WhatsAppButton 
                  phoneNumber={chalet.whatsappNumber} 
                  message={`أهلاً، أود الاستفسار عن حجز شاليه ${chalet.nameAr} في ${chalet.location}.`}
                  fullWidth 
                  className="py-6 text-lg rounded-xl"
                />

                <p className="text-xs text-center text-muted-foreground mt-4">
                  تواصل مباشرة مع المالك عبر واتساب للحجز والاستفسار
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Mobile Sticky Booking Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-xl border-t border-border z-50 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div>
          <span className="font-bold text-lg block">{chalet.pricePerNight} ر.س</span>
          <span className="text-xs text-muted-foreground">لليلة الواحدة</span>
        </div>
        <WhatsAppButton 
          phoneNumber={chalet.whatsappNumber} 
          message={`أهلاً، أود الاستفسار عن حجز شاليه ${chalet.nameAr}.`}
        />
      </div>
    </div>
  );
}

// Small helper component
function Star({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
