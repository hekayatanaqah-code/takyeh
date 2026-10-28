import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = (import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "");
const imageUrl = (path: string) => `${BASE}${path}`;

export function InsuranceProofGallery({ images }: { images?: string[] | null }) {
  if (!images?.length) return null;
  return <div className="flex flex-wrap gap-2" aria-label="صور توثيق الخصم">
    {images.map((path, index) => <a key={path} href={imageUrl(path)} target="_blank" rel="noopener noreferrer"
      className="block rounded-lg border border-border overflow-hidden" aria-label={`عرض صورة التوثيق ${index + 1}`}>
      <img src={imageUrl(path)} alt={`صورة توثيق الخصم ${index + 1}`} className="w-20 h-20 object-cover" loading="lazy" />
    </a>)}
  </div>;
}

export function InsuranceProofImages({ images, onChange, upload, onUploadingChange, disabled = false }: {
  images: string[];
  onChange: (images: string[]) => void;
  upload: (file: File) => Promise<string | null>;
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; onUploadingChange(false); };
  }, [onUploadingChange]);

  async function addImages(files: FileList | null) {
    if (!files?.length || busyRef.current || disabled) return;
    const selected = Array.from(files);
    if (selected.length + images.length > 10) {
      setError("يمكن إرفاق عشر صور كحد أقصى.");
      return;
    }
    if (selected.some(file => !file.type.startsWith("image/") || file.size > 2 * 1024 * 1024)) {
      setError("اختر صوراً فقط، بحجم لا يتجاوز ٢ ميغابايت لكل صورة.");
      return;
    }
    busyRef.current = true;
    setError("");
    setUploading(true);
    onUploadingChange(true);
    const uploaded: string[] = [];
    let failures = 0;
    try {
      for (const file of selected) {
        if (!active.current) break;
        try {
          const path = await upload(file);
          if (path) uploaded.push(path);
          else failures++;
        } catch { failures++; }
      }
      if (active.current) {
        if (uploaded.length) onChange([...images, ...uploaded]);
        if (failures) setError("تعذّر رفع بعض الصور. أعد اختيار الصور التي لم تظهر في المعاينة.");
      }
    } finally {
      busyRef.current = false;
      if (active.current) {
        setUploading(false);
        onUploadingChange(false);
      }
    }
  }

  return <div className="space-y-2">
    <p className="text-xs font-semibold text-muted-foreground">صور توثيق التلفيات أو الأضرار (اختياري)</p>
    <div className="flex flex-wrap gap-2">
      {images.map((path, index) => <div key={path} className="relative">
        <a href={imageUrl(path)} target="_blank" rel="noopener noreferrer">
          <img src={imageUrl(path)} alt={`صورة توثيق الخصم ${index + 1}`} className="w-20 h-20 object-cover rounded-lg border border-border" />
        </a>
        <button type="button" disabled={disabled || uploading} aria-label={`إزالة صورة التوثيق ${index + 1}`}
          onClick={() => onChange(images.filter(image => image !== path))}
          className="absolute -top-1 -left-1 rounded-full bg-destructive text-white p-1 disabled:opacity-50">
          <X className="w-3 h-3" />
        </button>
      </div>)}
    </div>
    <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="اختيار صور توثيق الخصم"
      disabled={disabled || uploading} onChange={event => {
        const files = event.target.files;
        void addImages(files);
        event.target.value = "";
      }} />
    <Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl border-dashed"
      disabled={disabled || uploading || images.length >= 10} onClick={() => input.current?.click()}>
      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      {uploading ? "جارٍ رفع الصور…" : "إرفاق صور التلفيات"}
    </Button>
    <p className="text-[11px] text-muted-foreground">حتى عشر صور، بحد أقصى ٢ ميغابايت للصورة. تُحفظ الصور مع تفاصيل خصم هذا الحجز.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
