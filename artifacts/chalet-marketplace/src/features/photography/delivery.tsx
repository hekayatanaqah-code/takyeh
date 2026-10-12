import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Link2, FileText, FileArchive, FileVideo, FileImage, Download, Eye, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { call, API, fmtDT, Field, inputCls, btnCls, ghostCls, ErrorBox, Notice, type Booking, type DeliveryFile } from "./shared";

export const MAX_DELIVERY_FILES = 20;
export const MAX_DELIVERY_BYTES = 100 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP", "application/pdf": "PDF",
  "application/zip": "ZIP", "application/x-zip-compressed": "ZIP", "video/mp4": "MP4", "video/quicktime": "MOV",
};
const ACCEPT = Object.keys(TYPES).join(",") + ",.zip,.mov,.mp4";
const extType = (f: File) => {
  if (f.type && TYPES[f.type]) return f.type;
  const e = f.name.toLowerCase().split(".").pop();
  return e === "zip" ? "application/zip" : e === "mov" ? "video/quicktime" : e === "mp4" ? "video/mp4" : f.type;
};
const mb = (n: number) => (n / 1048576).toLocaleString("ar-SA", { maximumFractionDigits: 1 });

/** https only, no credentials, no localhost/private hosts. */
export function deliveryUrlError(u: string): string | null {
  const s = u.trim();
  if (!s) return null;
  try {
    const x = new URL(s);
    if (x.protocol !== "https:") return "رابط التسليم يجب أن يبدأ بـ https://";
    if (x.username || x.password) return "لا تضع بيانات دخول داخل الرابط";
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.)/.test(h) || h.includes(":") || !h.includes(".")) return "استخدم رابطا عاما (Google Drive أو Dropbox أو رابط تنزيل عام)";
    return null;
  } catch { return "رابط التسليم غير صالح"; }
}

export const fileHref = (bookingId: number, index: number, download = false) => `${API}/photography/bookings/${bookingId}/files/${index}${download ? "?download=1" : ""}`;
const previewable = (t: string) => t.startsWith("image/") || t === "application/pdf";
function FileIcon({ t }: { t: string }) {
  const C = t.startsWith("image/") ? FileImage : t.startsWith("video/") ? FileVideo : t === "application/pdf" ? FileText : FileArchive;
  return <C className="h-4 w-4 shrink-0 text-[#8C6246]" aria-hidden />;
}

/** Delivered materials (link + protected files) for owner and assigned photographer. */
export function DeliveryView({ b }: { b: Booking }) {
  const files: DeliveryFile[] = b.deliveryFiles ?? [];
  if (!b.deliveryUrl && files.length === 0) return null;
  return (
    <div className="space-y-2 rounded-xl border border-[#8C6246]/25 bg-[#8C6246]/[0.04] p-3" data-testid={`section-delivery-${b.id}`}>
      <p className="text-sm font-bold">مواد الجلسة المسلّمة{b.deliveredAt ? <span className="font-normal text-muted-foreground"> - {fmtDT(b.deliveredAt)}</span> : null}</p>
      {b.deliveryUrl && (
        <a href={b.deliveryUrl} target="_blank" rel="noopener noreferrer nofollow" className={`${ghostCls} w-full justify-start`} data-testid={`link-delivery-url-${b.id}`}>
          <Link2 className="h-4 w-4" aria-hidden /> <span className="truncate" dir="ltr">{b.deliveryUrl}</span>
        </a>
      )}
      {files.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
          {files.map((f, i) => (
            <li key={`${f.objectPath}-${i}`} className="flex flex-wrap items-center gap-2 p-2" data-testid={`row-delivery-file-${b.id}-${i}`}>
              <FileIcon t={f.contentType} />
              <span className="min-w-0 flex-1 truncate font-semibold" dir="ltr">{f.name}</span>
              <span className="text-xs text-muted-foreground">{mb(f.size)} م.ب</span>
              {previewable(f.contentType) && <a className={`${ghostCls} px-2.5 py-1.5`} href={fileHref(b.id, i)} target="_blank" rel="noopener noreferrer" data-testid={`link-preview-file-${b.id}-${i}`}><Eye className="h-4 w-4" aria-hidden /> معاينة</a>}
              <a className={`${ghostCls} px-2.5 py-1.5`} href={fileHref(b.id, i, true)} download data-testid={`link-download-file-${b.id}-${i}`}><Download className="h-4 w-4" aria-hidden /> تنزيل</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Uploaded { file: File; objectPath: string; uploadProof: string }

export function DeliverDialog({ b, open, onClose, onDone }: { b: Booking; open: boolean; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (ref.current) ref.current.value = "";
    if (!list) return;
    const next = [...files];
    for (const f of picked) {
      const t = extType(f);
      if (!TYPES[t]) return setErr(`نوع الملف ${f.name} غير مدعوم`);
      if (f.size > MAX_DELIVERY_BYTES) return setErr(`الملف ${f.name} يتجاوز ١٠٠ ميجابايت`);
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.length > MAX_DELIVERY_FILES) return setErr("الحد الأقصى ٢٠ ملفا");
    setErr(null); setFiles(next);
  };
  const m = useMutation({
    mutationFn: async () => {
      const done = uploaded.filter((u) => files.includes(u.file));
      for (const [i, f] of files.entries()) {
        if (done.some((u) => u.file === f)) continue;
        setProgress(`جار رفع ${(i + 1).toLocaleString("ar-SA")} من ${files.length.toLocaleString("ar-SA")}: ${f.name}`);
        const t = extType(f);
        const u = await call<{ uploadURL: string; objectPath: string; uploadProof: string }>(`/photography/portal/bookings/${b.id}/uploads/request`, "POST", { name: f.name, size: f.size, contentType: t });
        const r = await fetch(u.uploadURL, { method: "PUT", headers: { "Content-Type": t }, body: f });
        if (!r.ok) throw new Error(`تعذر رفع الملف ${f.name}، لم يتم تسجيل التسليم`);
        done.push({ file: f, objectPath: u.objectPath, uploadProof: u.uploadProof });
        setUploaded([...done]);
      }
      setProgress("جار تسجيل التسليم");
      const body = {
        ...(url.trim() ? { deliveryUrl: url.trim() } : {}),
        ...(done.length ? { files: done.map((u) => ({ objectPath: u.objectPath, uploadProof: u.uploadProof })) } : {}),
      };
      return call<{ booking: Booking }>(`/photography/portal/bookings/${b.id}/deliver`, "POST", body);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["ph-portal"] }); onDone(); },
    onSettled: () => setProgress(null),
  });
  const submit = () => {
    const e = deliveryUrlError(url) ?? (!url.trim() && files.length === 0 ? "أضف رابط تنزيل أو ارفع ملفا واحدا على الأقل" : null);
    setErr(e); if (!e) m.mutate();
  };
  const busy = m.isPending;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent dir="rtl" className="max-h-[92dvh] overflow-y-auto text-right">
        <DialogHeader><DialogTitle>رفع وتسليم الجلسة</DialogTitle>
          <DialogDescription>{b.propertyName} - {b.packageName} - {fmtDT(b.startAt)}</DialogDescription></DialogHeader>
        <fieldset disabled={busy} className="space-y-3">
          <Field label="رابط التنزيل (اختياري)" hint="رابط https عام من Google Drive أو Dropbox أو أي رابط تنزيل مباشر">
            <input dir="ltr" type="url" inputMode="url" placeholder="https://drive.google.com/..." className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} data-testid={`input-delivery-url-${b.id}`} />
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">ملفات الجلسة (اختياري)</p>
            <input ref={ref} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files)} data-testid={`input-delivery-files-${b.id}`} aria-label="اختر الملفات" />
            <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border p-3 text-start text-sm hover:border-[#8C6246]" data-testid={`button-pick-delivery-${b.id}`}>
              <Upload className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span><span className="block font-semibold">اختر الملفات</span><span className="text-xs text-muted-foreground">JPEG أو PNG أو WebP أو PDF أو ZIP أو MP4 أو MOV - حتى ٢٠ ملفا، ١٠٠ ميجابايت لكل ملف. تحفظ بشكل خاص.</span></span>
            </button>
            {files.length > 0 && (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 p-2">
                    <FileIcon t={extType(f)} />
                    <span className="min-w-0 flex-1 truncate" dir="ltr">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{mb(f.size)} م.ب{uploaded.some((u) => u.file === f) ? " - مرفوع" : ""}</span>
                    <button type="button" className="rounded-lg p-1 hover:bg-muted" aria-label={`إزالة ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} data-testid={`button-remove-delivery-${b.id}-${i}`}><X className="h-4 w-4" aria-hidden /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">لا يمكن التراجع عن التسليم. سيصل للمالك إشعار داخل المنصة ويتمكن من تنزيل المواد وتقييم الجلسة.</p>
        {progress && <Notice tone="warn">{progress}</Notice>}
        {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
        <DialogFooter className="gap-2 sm:justify-start">
          <button type="button" className={btnCls} disabled={busy || (!url.trim() && files.length === 0)} onClick={submit} data-testid={`button-confirm-deliver-${b.id}`}>{busy ? "جار التسليم" : "تأكيد التسليم"}</button>
          <button type="button" className={ghostCls} disabled={busy} onClick={onClose}>تراجع</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
