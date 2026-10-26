import { useMemo, useState, type ReactNode } from "react";
import { formatDateWithHijri } from "@/lib/hijri";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProviderCatalogItems, useCreateProviderCatalogItem, useUpdateProviderCatalogItem, useDeleteProviderCatalogItem,
  useGetProviderOffers, useCreateProviderOffer, useUpdateProviderOffer, useDeleteProviderOffer,
  useGetPublicProviderCatalog,
  getGetProviderCatalogItemsQueryKey, getGetProviderOffersQueryKey, getGetPublicProviderCatalogQueryKey,
  type ProviderCatalogItem, type ProviderCatalogItemInput, type ProviderOffer, type ProviderOfferInput,
} from "@workspace/api-client-react";
import { Package, Sparkles, Plus, Pencil, Trash2, RefreshCw, Tag, AlertTriangle, Info, CalendarRange, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { useToast } from "@/hooks/use-toast";
import { cn, toAr, fromAr } from "@/lib/utils";
import { CatalogMediaEditor, CatalogItemDetailsDialog, ItemThumb, readMedia, type CatalogMedia } from "./CatalogItemMedia";

type PanelProps = { providerId: number; readOnly?: boolean };

const STALE = 30_000;
const KIND_LABEL = { service: "خدمة", product: "منتج" } as const;
const UNIT_LABEL = { per_request: "للطلب", per_hour: "للساعة", per_day: "لليوم", per_piece: "للقطعة" } as const;

function errText(e: unknown): string {
  const any = e as { data?: { error?: unknown; message?: unknown }; message?: unknown } | null;
  const d = any?.data;
  if (d && typeof d.error === "string" && d.error) return d.error;
  if (d && typeof d.message === "string" && d.message) return d.message;
  if (any && typeof any.message === "string" && any.message) return any.message;
  return "تعذر إتمام العملية، حاول مرة أخرى";
}

function money(n: number) {
  return toAr(n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
}

function Price({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>
      {money(value)}<RiyalIcon className="w-3.5 h-3.5" />
    </span>
  );
}

function parseNum(s: string): number {
  const v = fromAr(s).replace(/[٬,\s]/g, "").replace("٫", ".");
  return v === "" ? NaN : Number(v);
}

function useInvalidate(providerId: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getGetProviderCatalogItemsQueryKey(providerId) });
    qc.invalidateQueries({ queryKey: getGetProviderOffersQueryKey(providerId) });
    qc.invalidateQueries({ queryKey: getGetPublicProviderCatalogQueryKey(providerId) });
  };
}

/* ── Shared shells ─────────────────────────────────────────── */

function PanelShell({ icon, title, subtitle, action, children, testId }: {
  icon: ReactNode; title: string; subtitle: string; action?: ReactNode; children: ReactNode; testId: string;
}) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-card-border bg-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 justify-between px-4 sm:px-5 py-4 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
          <div className="min-w-0">
            <h3 className="font-bold text-base">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" data-testid="status-loading">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

function ErrorBox({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center gap-3" data-testid="status-error">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
      <p className="text-sm flex-1 min-w-[12rem]">{errText(error)}</p>
      <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying} data-testid="button-retry">
        <RefreshCw className={cn("w-4 h-4 ml-1", retrying && "animate-spin")} />إعادة المحاولة
      </Button>
    </div>
  );
}

function EmptyBox({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/30 py-10 px-4 text-center flex flex-col items-center gap-2" data-testid="status-empty">
      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function ReadOnlyNote() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="status-readonly">
      <Lock className="w-3.5 h-3.5" />وضع الاطلاع فقط — التعديل غير متاح
    </div>
  );
}

function FieldErr({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs text-destructive mt-1">{msg}</p> : null;
}

function ConfirmDelete({ open, onOpenChange, title, onConfirm, pending }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; onConfirm: () => void; pending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader className="text-right">
          <AlertDialogTitle>حذف «{title}»؟</AlertDialogTitle>
          <AlertDialogDescription>لا يمكن التراجع عن الحذف. إن أردت إخفاءه مؤقتًا فاستخدم مفتاح التفعيل بدلًا من ذلك.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending} data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={e => { e.preventDefault(); onConfirm(); }}
            data-testid="button-confirm-delete"
          >{pending ? "جارٍ الحذف..." : "حذف نهائي"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── Catalog ───────────────────────────────────────────────── */

type ItemForm = { name: string; kind: "service" | "product"; description: string; price: string; pricingUnit: keyof typeof UNIT_LABEL; isActive: boolean };
const emptyItem: ItemForm = { name: "", kind: "service", description: "", price: "", pricingUnit: "per_request", isActive: true };

type MediaInput = { thumbnailUrl: string | null; galleryPhotos: string[] };

function withMedia(base: ProviderCatalogItemInput, m: MediaInput): ProviderCatalogItemInput {
  const full: ProviderCatalogItemInput & MediaInput = { ...base, thumbnailUrl: m.thumbnailUrl, galleryPhotos: m.galleryPhotos };
  return full;
}

function itemToInput(i: ProviderCatalogItem): ProviderCatalogItemInput {
  return withMedia({ name: i.name, kind: i.kind, description: i.description ?? "", price: i.price, pricingUnit: i.pricingUnit, isActive: i.isActive }, readMedia(i));
}

function validateItem(f: ItemForm): { errors: Partial<Record<keyof ItemForm, string>>; input?: ProviderCatalogItemInput } {
  const errors: Partial<Record<keyof ItemForm, string>> = {};
  const name = f.name.trim();
  if (name.length < 2) errors.name = "الاسم حرفان على الأقل";
  else if (name.length > 150) errors.name = "الاسم بحد أقصى ١٥٠ حرفًا";
  if (f.description.length > 2000) errors.description = "الوصف بحد أقصى ٢٠٠٠ حرف";
  const price = parseNum(f.price);
  if (!Number.isFinite(price) || price <= 0) errors.price = "أدخل سعرًا أكبر من صفر";
  else if (price > 1_000_000) errors.price = "السعر بحد أقصى مليون ريال";
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { name, kind: f.kind, description: f.description.trim(), price, pricingUnit: f.pricingUnit, isActive: f.isActive } };
}

export function ServiceCatalogPanel({ providerId, readOnly = false }: PanelProps) {
  const { toast } = useToast();
  const invalidate = useInvalidate(providerId);
  const q = useGetProviderCatalogItems(providerId, {
    query: { queryKey: getGetProviderCatalogItemsQueryKey(providerId), enabled: providerId > 0, staleTime: STALE, refetchOnMount: true },
  });
  const create = useCreateProviderCatalogItem();
  const update = useUpdateProviderCatalogItem();
  const del = useDeleteProviderCatalogItem();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyItem);
  const [errors, setErrors] = useState<Partial<Record<keyof ItemForm, string>>>({});
  const [toDelete, setToDelete] = useState<ProviderCatalogItem | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [media, setMedia] = useState<MediaInput>({ thumbnailUrl: null, galleryPhotos: [] });
  const [uploading, setUploading] = useState(false);

  const items = q.data ?? [];
  const fail = (e: unknown) => toast({ title: "لم يتم الحفظ", description: errText(e), variant: "destructive" });

  // Form state is snapshotted only on open; background refetches never touch it.
  const openNew = () => { if (readOnly) return; setEditId(null); setForm(emptyItem); setMedia({ thumbnailUrl: null, galleryPhotos: [] }); setErrors({}); setOpen(true); };
  const openEdit = (i: ProviderCatalogItem) => {
    if (readOnly) return;
    setEditId(i.id);
    setForm({ name: i.name, kind: i.kind, description: i.description ?? "", price: toAr(i.price), pricingUnit: i.pricingUnit, isActive: i.isActive });
    setMedia(readMedia(i));
    setErrors({}); setOpen(true);
  };

  const submit = () => {
    if (readOnly || uploading) return;
    const { errors: errs, input: base } = validateItem(form);
    setErrors(errs);
    if (!base) return;
    const input = withMedia(base, media);
    const done = { onSuccess: () => { invalidate(); setOpen(false); toast({ title: editId ? "تم تحديث العنصر" : "تمت إضافة العنصر" }); }, onError: fail };
    if (editId) update.mutate({ providerId, itemId: editId, data: input }, done);
    else create.mutate({ providerId, data: input }, done);
  };

  const toggle = (i: ProviderCatalogItem, v: boolean) => {
    if (readOnly) return;
    setTogglingId(i.id);
    update.mutate({ providerId, itemId: i.id, data: { ...itemToInput(i), isActive: v } }, {
      onSuccess: () => { invalidate(); toast({ title: v ? "تم تفعيل العنصر" : "تم إيقاف العنصر" }); },
      onError: fail, onSettled: () => setTogglingId(null),
    });
  };

  const confirmDelete = () => {
    if (!toDelete || readOnly) return;
    del.mutate({ providerId, itemId: toDelete.id }, {
      onSuccess: () => { invalidate(); setToDelete(null); toast({ title: "تم حذف العنصر" }); },
      onError: fail,
    });
  };

  const saving = create.isPending || update.isPending;
  const locked = saving || uploading;
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm(f => ({ ...f, [k]: v }));

  return (
    <PanelShell
      testId="panel-service-catalog"
      icon={<Package className="w-5 h-5" />}
      title="قائمة الخدمات والمنتجات"
      subtitle={q.data ? `${toAr(items.length)} عنصر · ${toAr(items.filter(i => i.isActive).length)} مفعّل` : "ما يقدمه هذا المزود وأسعاره"}
      action={!readOnly && <Button size="sm" onClick={openNew} data-testid="button-add-catalog-item"><Plus className="w-4 h-4 ml-1" />إضافة عنصر</Button>}
    >
      {readOnly && <ReadOnlyNote />}
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} /> :
        items.length === 0 ? (
          <EmptyBox icon={<Package className="w-6 h-6" />} title="لا توجد عناصر بعد"
            text="أضف خدماتك أو منتجاتك بأسعارها ليطّلع عليها العملاء في صفحتك العامة."
            action={!readOnly && <Button size="sm" variant="outline" onClick={openNew} data-testid="button-add-first-item"><Plus className="w-4 h-4 ml-1" />أضف أول عنصر</Button>} />
        ) : (
          <ul className="space-y-2.5">
            {items.map(i => (
              <li key={i.id} data-testid={`card-catalog-item-${i.id}`}
                className={cn("rounded-xl border border-border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-opacity", !i.isActive && "opacity-60 bg-muted/40")}>
                <ItemThumb url={readMedia(i).thumbnailUrl} alt={i.name} className="w-14 h-14 hidden sm:flex" />
                <div className="flex-1 min-w-0 flex gap-3">
                  <ItemThumb url={readMedia(i).thumbnailUrl} alt={i.name} className="w-12 h-12 sm:hidden" />
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold truncate" data-testid={`text-item-name-${i.id}`}>{i.name}</span>
                    <span className={i.kind === "service" ? "chip-primary" : "chip"}>{KIND_LABEL[i.kind]}</span>
                    {!i.isActive && <span className="chip">موقوف</span>}
                  </div>
                  {i.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 justify-between sm:justify-end">
                  <div className="text-left">
                    <Price value={i.price} className="font-bold text-primary" />
                    <div className="text-[11px] text-muted-foreground">{UNIT_LABEL[i.pricingUnit]}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={i.isActive} disabled={readOnly || togglingId === i.id} onCheckedChange={v => toggle(i, v)}
                      aria-label="تفعيل العنصر" data-testid={`switch-item-active-${i.id}`} />
                    <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => openEdit(i)} aria-label="تعديل" data-testid={`button-edit-item-${i.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => setToDelete(i)} aria-label="حذف" className="text-destructive" data-testid={`button-delete-item-${i.id}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

      <Dialog open={open} onOpenChange={o => { if (!locked) setOpen(o); }}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90dvh] overflow-y-auto"
          onEscapeKeyDown={e => { if (locked) e.preventDefault(); }} onInteractOutside={e => { if (locked) e.preventDefault(); }}>
          <DialogHeader className="text-right">
            <DialogTitle>{editId ? "تعديل عنصر" : "عنصر جديد"}</DialogTitle>
            <DialogDescription>السعر الأساسي قبل أي عرض أو خصم.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
            <div>
              <Label htmlFor="ci-name">الاسم</Label>
              <Input id="ci-name" value={form.name} maxLength={150} onChange={e => set("name", e.target.value)} data-testid="input-item-name" />
              <FieldErr msg={errors.name} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>النوع</Label>
                <Select value={form.kind} onValueChange={v => set("kind", v as ItemForm["kind"])}>
                  <SelectTrigger data-testid="select-item-kind"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="service">خدمة</SelectItem><SelectItem value="product">منتج</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>وحدة التسعير</Label>
                <Select value={form.pricingUnit} onValueChange={v => set("pricingUnit", v as ItemForm["pricingUnit"])}>
                  <SelectTrigger data-testid="select-item-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(UNIT_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="ci-price">السعر</Label>
              <div className="relative">
                <Input id="ci-price" inputMode="decimal" value={form.price} onChange={e => set("price", e.target.value)} className="pl-9" data-testid="input-item-price" />
                <RiyalIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <FieldErr msg={errors.price} />
            </div>
            <div>
              <Label htmlFor="ci-desc">الوصف <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Textarea id="ci-desc" rows={3} value={form.description} onChange={e => set("description", e.target.value)} data-testid="input-item-description" />
              <div className="flex justify-between"><FieldErr msg={errors.description} /><span className="text-[11px] text-muted-foreground mr-auto">{toAr(form.description.length)} / ٢٠٠٠</span></div>
            </div>
            <CatalogMediaEditor providerId={providerId} thumbnailUrl={media.thumbnailUrl} galleryPhotos={media.galleryPhotos}
              onChange={setMedia} onBusyChange={setUploading} disabled={saving || readOnly} />
            <label className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5 cursor-pointer">
              <span className="text-sm font-medium">ظاهر للعملاء</span>
              <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} data-testid="switch-item-form-active" />
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={locked} onClick={() => setOpen(false)} data-testid="button-cancel-item">إلغاء</Button>
              <Button type="submit" disabled={locked || readOnly} data-testid="button-save-item">{saving ? "جارٍ الحفظ..." : uploading ? "جارٍ رفع الصورة..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!toDelete} onOpenChange={o => { if (!o && !del.isPending) setToDelete(null); }}
        title={toDelete?.name ?? ""} onConfirm={confirmDelete} pending={del.isPending} />
    </PanelShell>
  );
}

/* ── Offers ────────────────────────────────────────────────── */

type OfferForm = { name: string; itemId: string; discountType: "percentage" | "fixed"; value: string; startDate: string; endDate: string; isActive: boolean };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => ISO.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

function offerToInput(o: ProviderOffer): ProviderOfferInput {
  return { name: o.name, itemId: o.itemId ?? null, discountType: o.discountType, value: o.value, startDate: o.startDate.slice(0, 10), endDate: o.endDate.slice(0, 10), isActive: o.isActive };
}

function validateOffer(f: OfferForm): { errors: Partial<Record<keyof OfferForm, string>>; input?: ProviderOfferInput } {
  const errors: Partial<Record<keyof OfferForm, string>> = {};
  const name = f.name.trim();
  if (name.length < 2) errors.name = "اسم العرض حرفان على الأقل";
  else if (name.length > 150) errors.name = "الاسم بحد أقصى ١٥٠ حرفًا";
  const value = parseNum(f.value);
  if (!Number.isFinite(value) || value <= 0) errors.value = "أدخل قيمة أكبر من صفر";
  else if (f.discountType === "percentage" && value > 100) errors.value = "النسبة لا تتجاوز ١٠٠٪";
  else if (value > 1_000_000) errors.value = "القيمة بحد أقصى مليون";
  if (!validDate(f.startDate)) errors.startDate = "اختر تاريخ البداية";
  if (!validDate(f.endDate)) errors.endDate = "اختر تاريخ النهاية";
  else if (validDate(f.startDate) && f.startDate > f.endDate) errors.endDate = "النهاية يجب أن تكون بعد البداية أو مساوية لها";
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { name, itemId: f.itemId === "all" ? null : Number(f.itemId), discountType: f.discountType, value, startDate: f.startDate, endDate: f.endDate, isActive: f.isActive } };
}

function offerStatus(o: ProviderOffer, today: string) {
  if (!o.isActive) return { label: "موقوف", cls: "chip" };
  if (o.endDate.slice(0, 10) < today) return { label: "منتهٍ", cls: "chip" };
  if (o.startDate.slice(0, 10) > today) return { label: "مجدول", cls: "chip" };
  return { label: "ساري الآن", cls: "chip-primary" };
}

const fmtDate = (s: string) => {
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? s : formatDateWithHijri(d);
};

export function ServiceOffersPanel({ providerId, readOnly = false }: PanelProps) {
  const { toast } = useToast();
  const invalidate = useInvalidate(providerId);
  const offersQ = useGetProviderOffers(providerId, {
    query: { queryKey: getGetProviderOffersQueryKey(providerId), enabled: providerId > 0, staleTime: STALE, refetchOnMount: true },
  });
  const itemsQ = useGetProviderCatalogItems(providerId, {
    query: { queryKey: getGetProviderCatalogItemsQueryKey(providerId), enabled: providerId > 0, staleTime: STALE, refetchOnMount: true },
  });
  const create = useCreateProviderOffer();
  const update = useUpdateProviderOffer();
  const del = useDeleteProviderOffer();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<OfferForm>({ name: "", itemId: "all", discountType: "percentage", value: "", startDate: "", endDate: "", isActive: true });
  const [errors, setErrors] = useState<Partial<Record<keyof OfferForm, string>>>({});
  const [toDelete, setToDelete] = useState<ProviderOffer | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const today = todayStr();
  const offers = offersQ.data ?? [];
  const itemsById = useMemo(() => new Map((itemsQ.data ?? []).map(i => [i.id, i])), [itemsQ.data]);
  const fail = (e: unknown) => toast({ title: "لم يتم الحفظ", description: errText(e), variant: "destructive" });

  const openNew = () => {
    if (readOnly) return;
    setEditId(null);
    setForm({ name: "", itemId: "all", discountType: "percentage", value: "", startDate: today, endDate: today, isActive: true });
    setErrors({}); setOpen(true);
  };
  const openEdit = (o: ProviderOffer) => {
    if (readOnly) return;
    setEditId(o.id);
    setForm({ name: o.name, itemId: o.itemId == null ? "all" : String(o.itemId), discountType: o.discountType, value: toAr(o.value), startDate: o.startDate.slice(0, 10), endDate: o.endDate.slice(0, 10), isActive: o.isActive });
    setErrors({}); setOpen(true);
  };

  const submit = () => {
    if (readOnly) return;
    const { errors: errs, input } = validateOffer(form);
    setErrors(errs);
    if (!input) return;
    const done = { onSuccess: () => { invalidate(); setOpen(false); toast({ title: editId ? "تم تحديث العرض" : "تم إنشاء العرض" }); }, onError: fail };
    if (editId) update.mutate({ providerId, offerId: editId, data: input }, done);
    else create.mutate({ providerId, data: input }, done);
  };

  const toggle = (o: ProviderOffer, v: boolean) => {
    if (readOnly) return;
    setTogglingId(o.id);
    update.mutate({ providerId, offerId: o.id, data: { ...offerToInput(o), isActive: v } }, {
      onSuccess: () => { invalidate(); toast({ title: v ? "تم تفعيل العرض" : "تم إيقاف العرض" }); },
      onError: fail, onSettled: () => setTogglingId(null),
    });
  };

  const confirmDelete = () => {
    if (!toDelete || readOnly) return;
    del.mutate({ providerId, offerId: toDelete.id }, {
      onSuccess: () => { invalidate(); setToDelete(null); toast({ title: "تم حذف العرض" }); },
      onError: fail,
    });
  };

  const saving = create.isPending || update.isPending;
  const set = <K extends keyof OfferForm>(k: K, v: OfferForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const formItemMissing = form.itemId !== "all" && !itemsById.has(Number(form.itemId));

  return (
    <PanelShell
      testId="panel-service-offers"
      icon={<Sparkles className="w-5 h-5" />}
      title="العروض والخصومات"
      subtitle={offersQ.data ? `${toAr(offers.filter(o => offerStatus(o, today).label === "ساري الآن").length)} ساري من ${toAr(offers.length)}` : "خصومات بفترة زمنية محددة"}
      action={!readOnly && <Button size="sm" onClick={openNew} data-testid="button-add-offer"><Plus className="w-4 h-4 ml-1" />عرض جديد</Button>}
    >
      {readOnly && <ReadOnlyNote />}
      <div className="mb-4 flex gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground/80" data-testid="text-offers-scope">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>يُطبَّق أفضل خصم واحد ساري في تاريخ اليوم على العناصر المفعّلة في قائمتك فقط، ويظهر في صفحتك العامة. لا يشمل التأمين، ولا يغيّر الحجوزات السابقة أو اليدوية.</p>
      </div>
      {offersQ.isLoading ? <ListSkeleton /> : offersQ.isError ? <ErrorBox error={offersQ.error} onRetry={() => offersQ.refetch()} retrying={offersQ.isFetching} /> :
        offers.length === 0 ? (
          <EmptyBox icon={<Tag className="w-6 h-6" />} title="لا توجد عروض"
            text="أنشئ خصمًا بنسبة أو مبلغ ثابت لفترة محددة، على عنصر واحد أو على القائمة كاملة."
            action={!readOnly && <Button size="sm" variant="outline" onClick={openNew} data-testid="button-add-first-offer"><Plus className="w-4 h-4 ml-1" />أنشئ أول عرض</Button>} />
        ) : (
          <ul className="space-y-2.5">
            {offers.map(o => {
              const st = offerStatus(o, today);
              const target = o.itemId == null ? "كل عناصر القائمة" : itemsById.get(o.itemId)?.name ?? "عنصر محذوف";
              return (
                <li key={o.id} data-testid={`card-offer-${o.id}`}
                  className={cn("rounded-xl border border-border p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3", st.label !== "ساري الآن" && "bg-muted/30")}>
                  <div className="w-16 h-16 shrink-0 rounded-xl bg-primary text-primary-foreground hidden sm:flex flex-col items-center justify-center">
                    {o.discountType === "percentage"
                      ? <span className="text-lg font-extrabold">{toAr(o.value)}٪</span>
                      : <Price value={o.value} className="text-sm font-extrabold" />}
                    <span className="text-[10px] opacity-80">خصم</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{o.name}</span>
                      <span className={st.cls} data-testid={`status-offer-${o.id}`}>{st.label}</span>
                      <span className="sm:hidden chip">
                        {o.discountType === "percentage" ? `${toAr(o.value)}٪` : <Price value={o.value} />}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />{target}</span>
                      <span className="inline-flex items-center gap-1"><CalendarRange className="w-3 h-3" />{fmtDate(o.startDate)} — {fmtDate(o.endDate)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <Switch checked={o.isActive} disabled={readOnly || togglingId === o.id} onCheckedChange={v => toggle(o, v)} aria-label="تفعيل العرض" data-testid={`switch-offer-active-${o.id}`} />
                    <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => openEdit(o)} aria-label="تعديل" data-testid={`button-edit-offer-${o.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={readOnly} onClick={() => setToDelete(o)} aria-label="حذف" className="text-destructive" data-testid={`button-delete-offer-${o.id}`}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      <Dialog open={open} onOpenChange={o => { if (!saving) setOpen(o); }}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader className="text-right">
            <DialogTitle>{editId ? "تعديل عرض" : "عرض جديد"}</DialogTitle>
            <DialogDescription>حدد الخصم وفترته والعنصر المشمول.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
            <div>
              <Label htmlFor="of-name">اسم العرض</Label>
              <Input id="of-name" value={form.name} maxLength={150} onChange={e => set("name", e.target.value)} placeholder="مثال: عرض موسم الأعراس" data-testid="input-offer-name" />
              <FieldErr msg={errors.name} />
            </div>
            <div>
              <Label>يشمل</Label>
              <Select value={form.itemId} onValueChange={v => set("itemId", v)}>
                <SelectTrigger data-testid="select-offer-item"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل عناصر القائمة</SelectItem>
                  {formItemMissing && <SelectItem value={form.itemId}>عنصر غير متاح</SelectItem>}
                  {(itemsQ.data ?? []).map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name}{i.isActive ? "" : " (موقوف)"}</SelectItem>)}
                </SelectContent>
              </Select>
              {itemsQ.isError && <p className="text-xs text-destructive mt-1">تعذر تحميل العناصر: {errText(itemsQ.error)}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>نوع الخصم</Label>
                <Select value={form.discountType} onValueChange={v => set("discountType", v as OfferForm["discountType"])}>
                  <SelectTrigger data-testid="select-offer-type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percentage">نسبة مئوية</SelectItem><SelectItem value="fixed">مبلغ ثابت</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="of-value">القيمة</Label>
                <div className="relative">
                  <Input id="of-value" inputMode="decimal" value={form.value} onChange={e => set("value", e.target.value)} className="pl-9" data-testid="input-offer-value" />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {form.discountType === "percentage" ? "٪" : <RiyalIcon className="w-4 h-4" />}
                  </span>
                </div>
                <FieldErr msg={errors.value} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>من</Label>
                <DualCalendarPicker value={form.startDate} onChange={v => set("startDate", v.slice(0, 10))} placeholder="تاريخ البداية" />
                <FieldErr msg={errors.startDate} />
              </div>
              <div>
                <Label>إلى</Label>
                <DualCalendarPicker value={form.endDate} onChange={v => set("endDate", v.slice(0, 10))} minDate={form.startDate || undefined} placeholder="تاريخ النهاية" />
                <FieldErr msg={errors.endDate} />
              </div>
            </div>
            <label className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5 cursor-pointer">
              <span className="text-sm font-medium">العرض مفعّل</span>
              <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} data-testid="switch-offer-form-active" />
            </label>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)} data-testid="button-cancel-offer">إلغاء</Button>
              <Button type="submit" disabled={saving || readOnly} data-testid="button-save-offer">{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!toDelete} onOpenChange={o => { if (!o && !del.isPending) setToDelete(null); }}
        title={toDelete?.name ?? ""} onConfirm={confirmDelete} pending={del.isPending} />
    </PanelShell>
  );
}

/* ── Public ────────────────────────────────────────────────── */

export function PublicServiceCatalog({ providerId }: { providerId: number }) {
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const q = useGetPublicProviderCatalog(providerId, {
    query: { queryKey: getGetPublicProviderCatalogQueryKey(providerId), enabled: providerId > 0, staleTime: STALE, refetchOnMount: true },
  });

  if (q.isLoading) {
    return (
      <section className="space-y-3" data-testid="section-public-catalog-loading">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[0, 1].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      </section>
    );
  }
  if (q.isError) {
    return (
      <section data-testid="section-public-catalog-error">
        <h2 className="text-lg font-bold mb-3">الخدمات والأسعار</h2>
        <ErrorBox error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
      </section>
    );
  }
  const items = q.data ?? [];
  if (items.length === 0) return null;
  const detailsItem = items.find(i => i.id === detailsId) ?? null;

  return (
    <section data-testid="section-public-catalog">
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-lg font-bold">الخدمات والأسعار</h2>
        <span className="text-xs text-muted-foreground">{toAr(items.length)} عنصر</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(i => {
          const discounted = i.finalPrice < i.price;
          const thumb = readMedia(i).thumbnailUrl;
          return (
            <article key={i.id} data-testid={`card-public-item-${i.id}`}
              className="relative rounded-xl border border-card-border bg-card p-4 flex flex-col gap-2 overflow-hidden">
              {discounted && i.offerName && (
                <span className="absolute top-0 left-0 rounded-br-xl bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-1 inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />{i.offerName}
                </span>
              )}
              <button type="button" className="flex gap-3 text-right rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setDetailsId(i.id)} aria-label={`صور وتفاصيل ${i.name}`} data-testid={`button-item-preview-${i.id}`}>
                <ItemThumb url={thumb} alt={i.name} className="w-16 h-16 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{i.name}</h3>
                    <span className="chip">{KIND_LABEL[i.kind]}</span>
                  </div>
                  {i.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{i.description}</p>}
                </div>
              </button>
              <div className="mt-auto pt-2 flex items-baseline gap-2 flex-wrap border-t border-border/60">
                <Price value={discounted ? i.finalPrice : i.price} className="text-lg font-extrabold text-primary" />
                {discounted && <Price value={i.price} className="text-sm text-muted-foreground line-through" />}
                <span className="text-xs text-muted-foreground">{UNIT_LABEL[i.pricingUnit]}</span>
                <Button type="button" size="sm" variant="ghost" className="mr-auto h-8 text-primary" onClick={() => setDetailsId(i.id)}
                  aria-label={`عرض تفاصيل ${i.name}`} data-testid={`button-item-details-${i.id}`}>التفاصيل</Button>
              </div>
            </article>
          );
        })}
      </div>
      <CatalogItemDetailsDialog
        item={detailsItem as (typeof detailsItem & CatalogMedia) | null}
        onOpenChange={o => { if (!o) setDetailsId(null); }}
        kindLabel={detailsItem ? KIND_LABEL[detailsItem.kind] : undefined}
        unitLabel={detailsItem ? UNIT_LABEL[detailsItem.pricingUnit] : undefined} />
    </section>
  );
}
