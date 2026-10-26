import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, ImageIcon, X, RefreshCw, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { cn, toAr } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const MAX_EXTRA_PHOTOS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export type CatalogMedia = { thumbnailUrl?: string | null; galleryPhotos?: string[] | null };

export function readMedia(i: unknown): { thumbnailUrl: string | null; galleryPhotos: string[] } {
  const m = (i ?? {}) as CatalogMedia;
  const thumb = typeof m.thumbnailUrl === "string" && m.thumbnailUrl ? m.thumbnailUrl : null;
  const gal = Array.isArray(m.galleryPhotos) ? m.galleryPhotos.filter(u => typeof u === "string" && u).slice(0, MAX_EXTRA_PHOTOS) : [];
  return { thumbnailUrl: thumb, galleryPhotos: gal };
}

function checkFile(f: File): string | null {
  if (!ACCEPT.includes(f.type)) return "الصيغ المسموحة: JPEG أو PNG أو WebP";
  if (f.size > MAX_BYTES) return "حجم الصورة يتجاوز ٢ ميجابايت";
  return null;
}

async function uploadImage(providerId: number, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/providers/my/approved/${providerId}/catalog-media`, { method: "POST", body: fd, credentials: "include" });
  } catch {
    throw new Error("تعذر الاتصال بالخادم أثناء رفع الصورة");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof body?.error === "string" && body.error ? body.error : res.status === 413 ? "حجم الصورة يتجاوز ٢ ميجابايت" : "فشل رفع الصورة، حاول مرة أخرى");
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  const url = data.url;
  if (!url) throw new Error("لم يُرجع الخادم رابط الصورة");
  return url;
}

/* ── Thumbnail ─────────────────────────────────────────────── */

export function ItemThumb({ url, alt, className }: { url: string | null; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-lg bg-secondary text-muted-foreground flex items-center justify-center", className)}>
      {url && !broken
        ? <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} className="w-full h-full object-cover" />
        : <ImageIcon className="w-5 h-5 opacity-60" aria-hidden />}
    </div>
  );
}

/* ── Editor ────────────────────────────────────────────────── */

type Slot = "thumb" | number | "new";

export function CatalogMediaEditor({ providerId, thumbnailUrl, galleryPhotos, onChange, onBusyChange, disabled }: {
  providerId: number;
  thumbnailUrl: string | null;
  galleryPhotos: string[];
  onChange: (next: { thumbnailUrl: string | null; galleryPhotos: string[] }) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const target = useRef<Slot>("thumb");
  const [busySlot, setBusySlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  const latest = useRef({ thumbnailUrl, galleryPhotos });
  latest.current = { thumbnailUrl, galleryPhotos };

  const busy = busySlot !== null;
  const pick = (slot: Slot) => {
    if (busy || disabled) return;
    target.current = slot;
    setError(null);
    inputRef.current?.click();
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bad = checkFile(file);
    if (bad) { setError(bad); return; }
    const slot = target.current;
    setBusySlot(slot); busyRef.current(true);
    try {
      const url = await uploadImage(providerId, file);
      const cur = latest.current;
      if (slot === "thumb") onChange({ ...cur, thumbnailUrl: url });
      else if (slot === "new") {
        if (cur.galleryPhotos.length < MAX_EXTRA_PHOTOS) onChange({ ...cur, galleryPhotos: [...cur.galleryPhotos, url] });
      } else onChange({ ...cur, galleryPhotos: cur.galleryPhotos.map((u, i) => (i === slot ? url : u)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل رفع الصورة");
    } finally {
      setBusySlot(null); busyRef.current(false);
    }
  };

  const removeExtra = (idx: number) => onChange({ thumbnailUrl, galleryPhotos: galleryPhotos.filter((_, i) => i !== idx) });
  const lock = busy || disabled;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3" data-testid="editor-item-media">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={onFile} data-testid="input-item-photo-file" />
      <div>
        <p className="text-sm font-medium">صور العنصر <span className="text-muted-foreground text-xs">(اختياري)</span></p>
        <p className="text-[11px] text-muted-foreground">صورة مصغرة وحتى {toAr(MAX_EXTRA_PHOTOS)} صور إضافية. JPEG أو PNG أو WebP بحد ٢ ميجابايت. مستقلة عن شعار ومعرض المزود.</p>
      </div>

      <div className="flex items-start gap-3">
        <div className="relative w-24 h-24">
          {thumbnailUrl ? (
            <>
              <img src={thumbnailUrl} alt="الصورة المصغرة" className="w-24 h-24 rounded-lg object-cover border border-border" data-testid="img-item-thumb-preview" />
              <button type="button" disabled={lock} onClick={() => onChange({ thumbnailUrl: null, galleryPhotos })} aria-label="إزالة الصورة المصغرة"
                className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-card border border-border shadow flex items-center justify-center text-destructive disabled:opacity-50" data-testid="button-remove-thumb">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button type="button" disabled={lock} onClick={() => pick("thumb")}
              className="w-24 h-24 rounded-lg border-2 border-dashed border-primary/30 bg-card text-primary flex flex-col items-center justify-center gap-1 text-[11px] hover:bg-primary/5 disabled:opacity-50" data-testid="button-add-thumb">
              {busySlot === "thumb" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              {busySlot === "thumb" ? "جارٍ الرفع" : "صورة مصغرة"}
            </button>
          )}
          {thumbnailUrl && busySlot === "thumb" && <div className="absolute inset-0 rounded-lg bg-card/70 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
        </div>
        {thumbnailUrl && (
          <Button type="button" size="sm" variant="outline" disabled={lock} onClick={() => pick("thumb")} data-testid="button-replace-thumb">
            <RefreshCw className="w-3.5 h-3.5 ml-1" />استبدال المصغرة
          </Button>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground mb-2">صور إضافية · {toAr(galleryPhotos.length)} / {toAr(MAX_EXTRA_PHOTOS)}</p>
        <div className="grid grid-cols-3 gap-2">
          {galleryPhotos.map((u, idx) => (
            <div key={`${u}-${idx}`} className="relative aspect-square">
              <img src={u} alt={`صورة إضافية ${toAr(idx + 1)}`} className="w-full h-full rounded-lg object-cover border border-border" data-testid={`img-item-extra-${idx}`} />
              {busySlot === idx && <div className="absolute inset-0 rounded-lg bg-card/70 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
              <div className="absolute bottom-1 inset-x-1 flex justify-between">
                <button type="button" disabled={lock} onClick={() => pick(idx)} aria-label={`استبدال الصورة ${toAr(idx + 1)}`}
                  className="w-7 h-7 rounded-full bg-card/90 border border-border flex items-center justify-center disabled:opacity-50" data-testid={`button-replace-extra-${idx}`}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button type="button" disabled={lock} onClick={() => removeExtra(idx)} aria-label={`إزالة الصورة ${toAr(idx + 1)}`}
                  className="w-7 h-7 rounded-full bg-card/90 border border-border flex items-center justify-center text-destructive disabled:opacity-50" data-testid={`button-remove-extra-${idx}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {galleryPhotos.length < MAX_EXTRA_PHOTOS && (
            <button type="button" disabled={lock} onClick={() => pick("new")}
              className="aspect-square rounded-lg border-2 border-dashed border-border bg-card text-muted-foreground flex flex-col items-center justify-center gap-1 text-[11px] hover:border-primary/40 hover:text-primary disabled:opacity-50" data-testid="button-add-extra">
              {busySlot === "new" ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
              {busySlot === "new" ? "جارٍ الرفع" : "إضافة صورة"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive" data-testid="status-photo-error">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

/* ── Public details modal ──────────────────────────────────── */

export function CatalogItemDetailsDialog({ item, onOpenChange, kindLabel, unitLabel }: {
  item: { id: number; name: string; description?: string | null; price: number; finalPrice: number; offerName: string | null } & CatalogMedia | null;
  onOpenChange: (o: boolean) => void;
  kindLabel?: string;
  unitLabel?: string;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [item?.id]);
  const media = readMedia(item);
  const photos = [media.thumbnailUrl, ...media.galleryPhotos].filter((u): u is string => !!u);
  const current = photos[Math.min(active, photos.length - 1)];
  const discounted = !!item && item.finalPrice < item.price;
  const fmt = (n: number) => toAr(n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90dvh] overflow-y-auto" data-testid="dialog-item-details">
        {item && (
          <>
            <DialogHeader className="text-right">
              <DialogTitle data-testid="text-details-name">{item.name}</DialogTitle>
              <DialogDescription>{kindLabel ? `${kindLabel} · ` : ""}{unitLabel ?? ""}</DialogDescription>
            </DialogHeader>
            {photos.length > 0 && (
              <div className="space-y-2">
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-secondary">
                  <img src={current} alt={`${item.name} - صورة ${toAr(active + 1)}`} className="w-full h-full object-contain" data-testid="img-details-main" />
                </div>
                {photos.length > 1 && (
                  <div className="flex gap-2" role="group" aria-label="صور العنصر">
                    {photos.map((u, idx) => (
                      <button key={`${u}-${idx}`} type="button" onClick={() => setActive(idx)} aria-label={`عرض الصورة ${toAr(idx + 1)}`} aria-pressed={idx === active}
                        className={cn("w-16 h-16 rounded-lg overflow-hidden border-2 transition-opacity", idx === active ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}
                        data-testid={`button-details-photo-${idx}`}>
                        <img src={u} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {item.description && <p className="text-sm text-muted-foreground whitespace-pre-line" data-testid="text-details-description">{item.description}</p>}
            <div className="rounded-xl bg-secondary/50 p-3 flex items-baseline gap-2 flex-wrap" data-testid="text-details-price">
              <span className="inline-flex items-center gap-1 text-xl font-extrabold text-primary tabular-nums">{fmt(discounted ? item.finalPrice : item.price)}<RiyalIcon className="w-4 h-4" /></span>
              {discounted && <span className="inline-flex items-center gap-1 text-sm text-muted-foreground line-through tabular-nums">{fmt(item.price)}<RiyalIcon className="w-3 h-3" /></span>}
              {discounted && item.offerName && <span className="chip-primary mr-auto"><Sparkles className="w-3 h-3" />{item.offerName}</span>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
