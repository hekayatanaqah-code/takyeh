import { useEffect, useId, useRef, useState } from "react";
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
  const helpId = useId();
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

  return <div dir="rtl" className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 text-start sm:p-4">
    <p className="text-sm font-bold leading-6 text-foreground">
      صور توثيق التلفيات أو الأضرار <span className="text-xs font-medium text-muted-foreground">(اختياري)</span>
    </p>
    {images.length > 0 && <div className="flex flex-wrap gap-3">
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
    </div>}
    <input ref={input} type="file" accept="image/*" multiple className="hidden" aria-label="اختيار صور توثيق الخصم"
      disabled={disabled || uploading} onChange={event => {
        const files = event.target.files;
        void addImages(files);
        event.target.value = "";
      }} />
    <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
      <Button type="button" variant="outline" aria-describedby={helpId}
        className="min-h-11 shrink-0 gap-2 rounded-xl border-dashed bg-background px-4 text-sm font-semibold"
        disabled={disabled || uploading || images.length >= 10} onClick={() => input.current?.click()}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        {uploading ? "جارٍ رفع الصور…" : "إرفاق صور التلفيات"}
      </Button>
      <div id={helpId} className="min-w-0 space-y-1 text-sm leading-6">
        <p className="font-semibold text-foreground">حتى ١٠ صور، بحد أقصى ٢ ميغابايت لكل صورة.</p>
        <p className="font-medium text-foreground/80">تُحفظ الصور مع تفاصيل خصم هذا الحجز.</p>
      </div>
    </div>
    {error && <p role="alert" className="text-sm font-medium leading-6 text-destructive">{error}</p>}
  </div>;
}
