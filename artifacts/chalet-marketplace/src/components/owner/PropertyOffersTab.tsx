import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgePercent, Building2, CalendarRange, Info, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { PropertyOffer, PropertyOfferInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { useToast } from "@/hooks/use-toast";
import { formatDualDate } from "@/lib/hijri";
import { cn } from "@/lib/utils";
import saudiRiyalSymbol from "@/assets/saudi-riyal.svg";

type DiscountType = PropertyOfferInput["discountType"];

export interface PropertyOffersTabProps {
  ownerChalets: Array<{ id: number; nameAr: string }>;
  apiFetch: (path: string, opts?: RequestInit) => Promise<Response>;
}

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DISCOUNT_TYPES: { value: DiscountType; label: string; hint: string }[] = [
  { value: "percent", label: "نسبة مئوية", hint: "خصم بنسبة من سعر اليوم الفعلي" },
  { value: "fixed", label: "مبلغ ثابت", hint: "يُخصم مبلغ محدد من سعر كل يوم" },
  { value: "night_price", label: "سعر ليلة خاص", hint: "سعر نهائي لليوم بدل السعر الفعلي" },
];
const MAX_VALUE = 99999999.99;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toEastern = (s: string) => s.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]).replace(/\./g, "٫");
const toLatin = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,،]/g, ".");
const numFmt = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", maximumFractionDigits: 2 });

function saudiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function throwIfBad(res: Response): Promise<Response> {
  if (res.ok) return res;
  let msg = `تعذر إكمال الطلب (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) msg = String(body.error);
    else if (body?.message) msg = String(body.message);
  } catch { /* non-json */ }
  throw new Error(msg);
}

function Riyal({ className }: { className?: string }) {
  return <img src={saudiRiyalSymbol} alt="ريال سعودي" className={cn("inline-block h-[0.9em] w-[0.9em] shrink-0 object-contain align-middle", className)} />;
}

type Status = "active" | "upcoming" | "expired" | "disabled";
const STATUS_META: Record<Status, { label: string; tone: string }> = {
  active: { label: "ساري الآن", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  upcoming: { label: "قادم", tone: "border-sky-300 bg-sky-50 text-sky-900" },
  expired: { label: "منتهي", tone: "border-slate-300 bg-slate-100 text-slate-800" },
  disabled: { label: "موقوف", tone: "border-amber-300 bg-amber-50 text-amber-900" },
};
function offerStatus(o: PropertyOffer, today: string): Status {
  if (!o.enabled) return "disabled";
  const s = o.startDate.slice(0, 10), e = o.endDate.slice(0, 10);
  if (e < today) return "expired";
  if (s > today) return "upcoming";
  return "active";
}

function DiscountLabel({ o }: { o: Pick<PropertyOffer, "discountType" | "value"> }) {
  const v = numFmt.format(Number(o.value) || 0);
  if (o.discountType === "percent") return <span>خصم {v}٪</span>;
  if (o.discountType === "fixed") return <span className="inline-flex items-center gap-1">خصم {v} <Riyal /> لكل يوم</span>;
  return <span className="inline-flex items-center gap-1">سعر اليوم {v} <Riyal /></span>;
}

function weekdaysLabel(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "كل أيام الأسبوع";
  return sorted.map((d) => WEEKDAYS[d]).join("، ");
}

function DualDate({ d }: { d: string }) {
  const f = formatDualDate(d.slice(0, 10));
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="font-semibold text-foreground">{f.hijri}</span>
      <span className="text-xs text-muted-foreground">{f.gregorian}</span>
    </span>
  );
}

interface FormState {
  nameAr: string;
  startDate: string;
  endDate: string;
  weekdays: number[];
  discountType: DiscountType;
  value: string; // latin digits
  enabled: boolean;
}
const emptyForm = (): FormState => ({ nameAr: "", startDate: saudiToday(), endDate: "", weekdays: [0, 1, 2, 3, 4, 5, 6], discountType: "percent", value: "", enabled: true });
const fromOffer = (o: PropertyOffer): FormState => ({
  nameAr: o.nameAr, startDate: o.startDate.slice(0, 10), endDate: o.endDate.slice(0, 10),
  weekdays: [...o.weekdays].sort((a, b) => a - b), discountType: o.discountType, value: String(o.value), enabled: o.enabled,
});

export function PropertyOffersTab({ ownerChalets, apiFetch }: PropertyOffersTabProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(ownerChalets[0]?.id ?? null);

  useEffect(() => {
    if (!ownerChalets.length) { setSelectedId(null); return; }
    if (selectedId == null || !ownerChalets.some((c) => c.id === selectedId)) setSelectedId(ownerChalets[0].id);
  }, [ownerChalets, selectedId]);

  const queryKey = ["owner", "property-offers", selectedId] as const;
  const list = useQuery<PropertyOffer[]>({
    queryKey,
    enabled: selectedId != null,
    refetchInterval: 60000,
    queryFn: async () => {
      const res = await throwIfBad(await apiFetch(`/owner/offers?submissionId=${selectedId}`));
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("استجابة غير متوقعة من الخادم");
      return data as PropertyOffer[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["owner", "property-offers", selectedId] });
    qc.invalidateQueries({ predicate: (q) => q.queryKey.some(part => typeof part === "string" && part.includes("price-quote")) });
  };

  // ---- dialog form ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyOffer | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setErrors({}); setServerError(null); setOpen(true); };
  const openEdit = (o: PropertyOffer) => { setEditing(o); setForm(fromOffer(o)); setErrors({}); setServerError(null); setOpen(true); };

  const save = useMutation({
    mutationFn: async (payload: { id: number | null; body: Record<string, unknown> }) => {
      const res = await throwIfBad(await apiFetch(payload.id ? `/owner/offers/${payload.id}` : "/owner/offers", {
        method: payload.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body),
      }));
      return (await res.json()) as PropertyOffer;
    },
    onSuccess: (_d, vars) => {
      setOpen(false); invalidate();
      toast({ title: vars.id ? "تم تحديث العرض" : "تم إنشاء العرض", description: "تُطبَّق الأسعار الجديدة على عروض الأسعار للعملاء." });
    },
    onError: (e: Error) => { setServerError(e.message); toast({ title: "لم يُحفظ العرض", description: e.message, variant: "destructive" }); },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await throwIfBad(await apiFetch(`/owner/offers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) }));
      return (await res.json()) as PropertyOffer;
    },
    onSuccess: (o) => { invalidate(); toast({ title: o.enabled ? "تم تفعيل العرض" : "تم إيقاف العرض" }); },
    onError: (e: Error) => toast({ title: "تعذر تغيير حالة العرض", description: e.message, variant: "destructive" }),
  });

  const [deleting, setDeleting] = useState<PropertyOffer | null>(null);
  const remove = useMutation({
    mutationFn: async (id: number) => { await throwIfBad(await apiFetch(`/owner/offers/${id}`, { method: "DELETE" })); },
    onSuccess: () => { setDeleting(null); invalidate(); toast({ title: "تم حذف العرض" }); },
    onError: (e: Error) => toast({ title: "تعذر حذف العرض", description: e.message, variant: "destructive" }),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    const name = form.nameAr.trim();
    if (!name) errs.nameAr = "اسم العرض مطلوب";
    else if (name.length > 120) errs.nameAr = "الاسم أطول من ١٢٠ حرفًا";
    if (!DATE_RE.test(form.startDate)) errs.startDate = "اختر تاريخ البداية";
    if (!DATE_RE.test(form.endDate)) errs.endDate = "اختر تاريخ النهاية";
    else if (form.startDate && form.endDate < form.startDate) errs.endDate = "تاريخ النهاية يجب ألا يسبق البداية";
    if (!form.weekdays.length) errs.weekdays = "اختر يومًا واحدًا على الأقل";
    const raw = form.value.trim();
    const n = Number(raw);
    if (!raw) errs.value = "القيمة مطلوبة";
    else if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(n)) errs.value = "أدخل رقمًا صحيحًا بحد أقصى منزلتين عشريتين";
    else if (form.discountType === "percent" && (n <= 0 || n > 100)) errs.value = "النسبة يجب أن تكون أكبر من صفر وحتى ١٠٠";
    else if (n <= 0) errs.value = "المبلغ يجب أن يكون أكبر من صفر";
    else if (n > MAX_VALUE) errs.value = "القيمة تتجاوز الحد الأعلى";
    setErrors(errs);
    if (Object.keys(errs).length || selectedId == null) return;
    setServerError(null);
    const body: Record<string, unknown> = {
      nameAr: name, startDate: form.startDate, endDate: form.endDate,
      weekdays: [...form.weekdays].sort((a, b) => a - b), discountType: form.discountType, value: n, enabled: form.enabled,
    };
    if (!editing) body.submissionId = selectedId;
    save.mutate({ id: editing?.id ?? null, body });
  };

  const today = saudiToday();
  const sorted = useMemo(() => {
    const order: Record<Status, number> = { active: 0, upcoming: 1, disabled: 2, expired: 3 };
    return [...(list.data ?? [])].sort((a, b) => order[offerStatus(a, today)] - order[offerStatus(b, today)] || a.startDate.localeCompare(b.startDate) || a.id - b.id);
  }, [list.data, today]);

  const selectedName = ownerChalets.find((c) => c.id === selectedId)?.nameAr ?? "";
  const pending = save.isPending;

  return (
    <section dir="rtl" className="min-w-0 space-y-5 text-right" data-testid="tab-property-offers">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-foreground">العروض والخصومات</h2>
          <p className="mt-1 text-sm font-medium text-slate-700">خصومات مؤقتة على أيام محددة لكل عقار.</p>
        </div>
        {ownerChalets.length > 0 && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="تحديث القائمة" onClick={() => list.refetch()} disabled={list.isFetching || selectedId == null} data-testid="button-refresh-offers">
              <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
            </Button>
            <Button type="button" onClick={openCreate} disabled={selectedId == null} data-testid="button-create-offer">
              <Plus className="ml-1 h-4 w-4" /> إنشاء عرض جديد
            </Button>
          </div>
        )}
      </header>

      <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm font-semibold leading-7 text-slate-900" data-testid="text-offers-rules">
        <Info className="mt-1 h-4 w-4 shrink-0 text-sky-700" />
        <p>يُطبَّق الخصم على السعر الفعلي لليوم أو للموسم. عند تداخل أكثر من عرض يُطبَّق أفضل عرض فقط ولا تتراكم الخصومات. يشمل فترات الحجز المتاحة للعقار، ولا يشمل الخدمات الإضافية أو مبلغ التأمين.</p>
      </div>

      {ownerChalets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center" data-testid="status-offers-no-properties">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-bold">لا توجد عقارات بعد</p>
          <p className="mt-1 text-sm text-slate-700">أضف عقارًا أولًا، ثم أنشئ له العروض والخصومات من هنا.</p>
        </div>
      ) : (
        <>
          {ownerChalets.length > 1 && (
            <div className="max-w-sm">
              <Label htmlFor="offers-property" className="mb-1.5 block text-sm font-bold">العقار</Label>
              <Select value={selectedId != null ? String(selectedId) : undefined} onValueChange={(v) => setSelectedId(Number(v))}>
                <SelectTrigger id="offers-property" className="h-11" data-testid="select-offers-property"><SelectValue placeholder="اختر العقار" /></SelectTrigger>
                <SelectContent>
                  {ownerChalets.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {list.isLoading ? (
            <div className="space-y-3" data-testid="status-offers-loading">
              {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : list.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4" data-testid="status-offers-error">
              <p className="flex items-center gap-1.5 font-bold text-destructive"><AlertTriangle className="h-4 w-4" /> تعذر تحميل العروض</p>
              <p className="mt-1 text-sm text-slate-700">{(list.error as Error).message}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => list.refetch()} data-testid="button-retry-offers">إعادة المحاولة</Button>
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center" data-testid="status-offers-empty">
              <BadgePercent className="mx-auto h-9 w-9 text-primary" />
              <p className="mt-3 font-bold">لا توجد عروض لـ {selectedName}</p>
              <p className="mt-1 text-sm text-slate-700">أنشئ عرضًا لأيام منتصف الأسبوع أو لفترة هادئة لجذب حجوزات أكثر.</p>
              <Button className="mt-4" onClick={openCreate} data-testid="button-create-offer-empty"><Plus className="ml-1 h-4 w-4" /> إنشاء عرض جديد</Button>
            </div>
          ) : (
            <ul className="space-y-3" data-testid="list-offers">
              {sorted.map((o) => {
                const st = offerStatus(o, today);
                const meta = STATUS_META[st];
                const toggling = toggle.isPending && toggle.variables?.id === o.id;
                return (
                  <li key={o.id} className={cn("rounded-xl border bg-card p-4 shadow-sm", (st === "expired" || st === "disabled") && "bg-muted/40")} data-testid={`card-offer-${o.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-base font-bold" data-testid={`text-offer-name-${o.id}`}>{o.nameAr}</h3>
                          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", meta.tone)} data-testid={`status-offer-${o.id}`}>{meta.label}</span>
                        </div>
                        <p className="mt-1 text-lg font-extrabold text-primary" data-testid={`text-offer-discount-${o.id}`}><DiscountLabel o={o} /></p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`offer-enabled-${o.id}`}
                          checked={toggling ? !!toggle.variables?.enabled : o.enabled}
                          disabled={toggling}
                          onCheckedChange={(v) => toggle.mutate({ id: o.id, enabled: v })}
                          aria-label={`تفعيل العرض ${o.nameAr}`}
                          data-testid={`switch-offer-enabled-${o.id}`}
                        />
                        <Label htmlFor={`offer-enabled-${o.id}`} className="text-sm font-semibold">{o.enabled ? "مفعّل" : "موقوف"}</Label>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <CalendarRange className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid={`text-offer-dates-${o.id}`}>
                          <span className="text-slate-700">من</span><DualDate d={o.startDate} />
                          <span className="text-slate-700">إلى</span><DualDate d={o.endDate} />
                        </div>
                      </div>
                      <p className="font-medium text-slate-800" data-testid={`text-offer-weekdays-${o.id}`}><span className="text-slate-600">الأيام: </span>{weekdaysLabel(o.weekdays)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => openEdit(o)} data-testid={`button-edit-offer-${o.id}`}><Pencil className="ml-1 h-4 w-4" /> تعديل</Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleting(o)} data-testid={`button-delete-offer-${o.id}`}><Trash2 className="ml-1 h-4 w-4" /> حذف</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!pending) setOpen(v); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] overflow-y-auto text-right sm:max-w-lg">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>{editing ? "تعديل العرض" : "إنشاء عرض جديد"}</DialogTitle>
            <DialogDescription className="text-slate-700">{selectedName ? `العقار: ${selectedName}` : "حدد تفاصيل الخصم والفترة والأيام."}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="form-offer">
            <div>
              <Label htmlFor="offer-name" className="mb-1.5 block font-bold">اسم العرض</Label>
              <Input id="offer-name" maxLength={120} value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} placeholder="مثال: خصم منتصف الأسبوع" aria-invalid={!!errors.nameAr} data-testid="input-offer-name" />
              {errors.nameAr && <p className="mt-1 text-sm font-semibold text-destructive">{errors.nameAr}</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-sm font-bold">تاريخ البداية</div>
                <div data-testid="input-offer-start">
                  <DualCalendarPicker value={form.startDate} onChange={(v) => set("startDate", v)} placeholder="تاريخ البداية" className="min-h-11 w-full" />
                </div>
                {errors.startDate && <p className="mt-1 text-sm font-semibold text-destructive">{errors.startDate}</p>}
              </div>
              <div>
                <div className="mb-1.5 text-sm font-bold">تاريخ النهاية</div>
                <div data-testid="input-offer-end">
                  <DualCalendarPicker value={form.endDate} onChange={(v) => set("endDate", v)} minDate={form.startDate || undefined} initialDate={form.startDate || undefined} placeholder="تاريخ النهاية" className="min-h-11 w-full" />
                </div>
                {errors.endDate && <p className="mt-1 text-sm font-semibold text-destructive">{errors.endDate}</p>}
              </div>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold">أيام الأسبوع المشمولة</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEEKDAYS.map((name, i) => {
                  const checked = form.weekdays.includes(i);
                  return (
                    <label key={i} htmlFor={`offer-day-${i}`} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold", checked ? "border-primary bg-primary/5" : "bg-background")}>
                      <Checkbox id={`offer-day-${i}`} checked={checked} onCheckedChange={(v) => set("weekdays", v ? [...form.weekdays, i] : form.weekdays.filter((d) => d !== i))} data-testid={`checkbox-offer-day-${i}`} />
                      {name}
                    </label>
                  );
                })}
              </div>
              {errors.weekdays && <p className="mt-1 text-sm font-semibold text-destructive">{errors.weekdays}</p>}
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-sm font-bold">نوع الخصم</legend>
              <RadioGroup value={form.discountType} onValueChange={(v) => set("discountType", v as DiscountType)} className="grid gap-2" dir="rtl">
                {DISCOUNT_TYPES.map((t) => (
                  <label key={t.value} htmlFor={`offer-type-${t.value}`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", form.discountType === t.value ? "border-primary bg-primary/5" : "bg-background")}>
                    <RadioGroupItem id={`offer-type-${t.value}`} value={t.value} className="mt-1" data-testid={`radio-offer-type-${t.value}`} />
                    <span><span className="block text-sm font-bold">{t.label}</span><span className="block text-sm text-slate-700">{t.hint}</span></span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            <div>
              <Label htmlFor="offer-value" className="mb-1.5 block font-bold">{form.discountType === "percent" ? "النسبة" : form.discountType === "fixed" ? "مبلغ الخصم لكل يوم" : "سعر اليوم الخاص"}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="offer-value" inputMode="decimal" dir="ltr" className="h-11 max-w-[12rem] text-right text-lg tabular-nums"
                  value={toEastern(form.value)}
                  onChange={(e) => set("value", toLatin(e.target.value).replace(/[^\d.]/g, ""))}
                  placeholder="٠" aria-invalid={!!errors.value} data-testid="input-offer-value"
                />
                <span className="text-lg font-bold text-slate-800" aria-hidden={form.discountType !== "percent"}>
                  {form.discountType === "percent" ? "٪" : <Riyal className="h-5 w-5" />}
                </span>
              </div>
              {errors.value && <p className="mt-1 text-sm font-semibold text-destructive">{errors.value}</p>}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="offer-enabled" className="font-bold">تفعيل العرض بعد الحفظ</Label>
              <Switch id="offer-enabled" checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} data-testid="switch-offer-form-enabled" />
            </div>
            {serverError && (
              <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive" data-testid="error-offer-save">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {serverError}
              </p>
            )}
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-start">
              <Button type="submit" disabled={pending} data-testid="button-submit-offer">
                {pending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} {editing ? "حفظ التعديلات" : "إنشاء العرض"}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)} data-testid="button-cancel-offer">إلغاء</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v && !remove.isPending) setDeleting(null); }}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right sm:text-right">
            <AlertDialogTitle>حذف العرض نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700">
              سيُحذف العرض «{deleting?.nameAr}» ولن يُطبَّق على الحجوزات الجديدة. لإيقافه مؤقتًا استخدم مفتاح التفعيل بدل الحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}
              data-testid="button-confirm-delete-offer"
            >
              {remove.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} حذف
            </AlertDialogAction>
            <AlertDialogCancel disabled={remove.isPending} data-testid="button-cancel-delete-offer">إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default PropertyOffersTab;
