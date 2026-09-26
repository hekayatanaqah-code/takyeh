import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, ShieldCheck, ShieldOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toAr } from "@/lib/utils";

export interface ChaletDetails {
  id: number;
  nameAr: string;
  location: string;
  isVerified: boolean;
  adminStatus?: "active" | "pending" | "paused" | "deleted";
  region?: string | null;
  district?: string | null;
  category?: string | null;
  propertyType?: string | null;
  descriptionAr?: string | null;
  amenities?: string[];
  photos?: string[];
  photoCaptions?: string[];
  logoUrl?: string | null;
  videoUrl?: string | null;
  mapsUrl?: string | null;
  pricePerNight?: string | null;
  maxGuests?: number | null;
  bedrooms?: number | null;
  whatsappNumber?: string | null;
}

const statusLabels = {
  active: "نشطة",
  pending: "قيد المراجعة",
  paused: "موقوفة مؤقتاً",
  deleted: "محذوفة",
};

export function ChaletDetailsModal({ chalet, onClose }: { chalet: ChaletDetails | null; onClose: () => void }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  if (!chalet) return null;

  const photos = chalet.photos?.length ? chalet.photos : chalet.logoUrl ? [chalet.logoUrl] : [];
  const image = photos[photoIndex];
  const mapsUrl = chalet.mapsUrl && /^https?:\/\//i.test(chalet.mapsUrl) ? chalet.mapsUrl : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-right text-xl font-bold pl-8">{chalet.nameAr}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {chalet.adminStatus && (
            <span className="rounded-full bg-slate-800 border border-slate-600 px-3 py-1 text-slate-200">
              {statusLabels[chalet.adminStatus]}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${chalet.isVerified ? "bg-emerald-900/30 border-emerald-700 text-emerald-300" : "bg-slate-800 border-slate-600 text-slate-300"}`}>
            {chalet.isVerified ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            {chalet.isVerified ? "موثق" : "غير موثق"}
          </span>
        </div>

        {photos.length > 0 ? (
          <div className="space-y-2">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-800">
              <img src={image} alt={`${chalet.nameAr} — صورة ${toAr(photoIndex + 1)}`} className="h-full w-full object-contain" />
              {photos.length > 1 && (
                <>
                  <button type="button" aria-label="الصورة السابقة" onClick={() => setPhotoIndex((i) => (i - 1 + photos.length) % photos.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button type="button" aria-label="الصورة التالية" onClick={() => setPhotoIndex((i) => (i + 1) % photos.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-1 text-xs">
                    {toAr(photoIndex + 1)} / {toAr(photos.length)}
                  </span>
                </>
              )}
            </div>
            {chalet.photoCaptions?.[photoIndex] && <p className="text-xs text-slate-400">{chalet.photoCaptions[photoIndex]}</p>}
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((url, index) => (
                  <button key={`${url}-${index}`} type="button" onClick={() => setPhotoIndex(index)}
                    aria-label={`عرض الصورة ${toAr(index + 1)}`}
                    aria-pressed={index === photoIndex}
                    className={`h-14 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${index === photoIndex ? "border-amber-400" : "border-transparent opacity-60 hover:opacity-100"}`}>
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : <p className="rounded-xl bg-slate-800 p-5 text-center text-sm text-slate-400">لا توجد صور لهذا الشاليه</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          {([
            ["الموقع", [chalet.region, chalet.location, chalet.district].filter(Boolean).join("، ")],
            ["الفئة", chalet.category || chalet.propertyType || "—"],
            ["نوع العقار", chalet.propertyType || "—"],
            ["السعر لليلة", chalet.pricePerNight ? `${Number(chalet.pricePerNight).toLocaleString("ar-SA")} ر.س` : "—"],
            ["الحد الأقصى للضيوف", chalet.maxGuests != null ? toAr(chalet.maxGuests) : "—"],
            ["غرف النوم", chalet.bedrooms != null ? toAr(chalet.bedrooms) : "—"],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-800 p-3">
              <p className="mb-1 text-xs text-slate-400">{label}</p>
              <p className="font-semibold text-white">{value || "—"}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-slate-800 p-3 text-sm">
          <p className="mb-2 text-xs text-slate-400">المرافق</p>
          {chalet.amenities?.length ? (
            <div className="flex flex-wrap gap-2">
              {chalet.amenities.map((amenity, index) => (
                <span key={`${amenity}-${index}`} className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">{amenity}</span>
              ))}
            </div>
          ) : <p className="text-slate-400">لم تُضف مرافق</p>}
        </div>

        {chalet.descriptionAr && (
          <div className="rounded-xl bg-slate-800 p-3 text-sm">
            <p className="mb-1 text-xs text-slate-400">وصف الشاليه</p>
            <p className="whitespace-pre-wrap leading-relaxed">{chalet.descriptionAr}</p>
          </div>
        )}
        {(mapsUrl || chalet.videoUrl || chalet.whatsappNumber) && (
          <div className="flex flex-wrap gap-4 text-sm">
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-amber-300 hover:underline"><MapPin className="w-4 h-4" /> عرض الموقع على الخريطة <ExternalLink className="w-3 h-3" /></a>}
            {chalet.videoUrl && /^https?:\/\//i.test(chalet.videoUrl) && <a href={chalet.videoUrl} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">عرض الفيديو</a>}
            {chalet.whatsappNumber && <span className="text-slate-300">واتساب: {toAr(chalet.whatsappNumber)}</span>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}