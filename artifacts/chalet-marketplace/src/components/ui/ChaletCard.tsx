import { Link } from "wouter";
import { MapPin, Users, Bed, Star } from "lucide-react";
import { Chalet } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChaletCardProps {
  chalet: Chalet;
}

export function ChaletCard({ chalet }: ChaletCardProps) {
  // Use first photo, or fallback to generated placeholder, or unsplash if generation failed
  const mainPhoto = chalet.photos && chalet.photos.length > 0 
    ? chalet.photos[0] 
    : `${import.meta.env.BASE_URL}images/chalet-placeholder-${(chalet.id % 3) + 1}.png`;

  return (
    <Card className="group overflow-hidden rounded-2xl border-border/50 bg-card hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
      <Link href={`/chalets/${chalet.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
          <img 
            src={mainPhoto} 
            alt={chalet.nameAr} 
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              // Fallback to stock if the generated image isn't available
              (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1510798831971-661eb04b3739?w=800&q=80&fit=crop`;
            }}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <Badge variant="secondary" className="bg-background/90 backdrop-blur-sm text-foreground hover:bg-background border-none shadow-sm">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500 me-1" />
              <span>جديد</span>
            </Badge>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center text-white text-sm">
              <MapPin className="w-4 h-4 me-1 opacity-80" />
              <span>{chalet.location}</span>
            </div>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {chalet.nameAr}
            </h3>
            <div className="text-left whitespace-nowrap">
              <span className="text-xs font-semibold text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded-full">
                الأسعار عند التواصل
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
              <Users className="w-4 h-4 text-primary" />
              <span>حتى {chalet.maxGuests} ضيوف</span>
            </div>
            <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
              <Bed className="w-4 h-4 text-primary" />
              <span>{chalet.bedrooms} غرف</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap gap-2">
            {chalet.amenities.slice(0, 3).map((amenity: string, idx: number) => (
              <span key={idx} className="text-xs text-muted-foreground bg-background border px-2 py-1 rounded-full">
                {amenity}
              </span>
            ))}
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
