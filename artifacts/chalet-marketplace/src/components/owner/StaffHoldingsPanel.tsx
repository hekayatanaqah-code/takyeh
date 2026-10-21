import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { easternHoldingDigits, latinHoldingDigits } from "@/lib/staffHoldingNumbers";
import { cn } from "@/lib/utils";

type Kind = "custody" | "withheld" | "emergency" | "deposit";

export interface StaffHolding {
  id: number;
  staffId: number;
  kind: Kind;
  description: string;
  amount: string;
  recordedOn: string;
  notes: string;
  status: "open" | "settled";
  settledOn: string | null;
  settlementNotes: string | null;
  createdAt: string;
}

interface Props {
  staffId: number;
  staffName: string;
  readOnly: boolean;
  apiFetch: (path: string, opts?: RequestInit) => Promise<Response>;
}

const KINDS: { value: Kind; label: string; hint: string; tone: string }[] = [
  { value: "custody", label: "عهدة لدى الموظف", hint: "أصل أو مبلغ سُلّم للموظف ويُعاد للمنشأة", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  { value: "withheld", label: "مبلغ محتجز للموظف", hint: "مبلغ مستحق للموظف محفوظ لدى المنشأة", tone: "border-sky-300 bg-sky-50 text-sky-900" },
  { value: "emergency", label: "مبلغ طوارئ لدى الموظف", hint: "مبلغ طوارئ بحوزة الموظف ويُعاد للمنشأة", tone: "border-rose-300 bg-rose-50 text-rose-900" },
  { value: "deposit", label: "وديعة للموظف", hint: "وديعة مملوكة للموظف محفوظة لدى المنشأة", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" },
];
const kindMeta = (k: Kind) => KINDS.find((x) => x.value === k) ?? KINDS[0];

const MAX = 99999999.99;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function saudiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const numFmt = new Intl.NumberFormat("ar-SA", { numberingSystem: "arab", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAmount = (v: string | number) => numFmt.format(Number(v) || 0);
function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { numberingSystem: "arab", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, day)));
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

function Money({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)} dir="rtl">
      <span>{fmtAmount(value)}</span>
      <RiyalIcon className="h-[0.85em] w-[0.85em]" />
    </span>
  );
}

function FieldError({ msg, id }: { msg?: string; id: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs font-medium text-destructive" data-testid={`error-${id}`}>{msg}</p>;
}

export function StaffHoldingsPanel({ staffId, staffName, readOnly, apiFetch }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["owner", "staff-holdings", staffId];
  const base = `/owner/staff/${staffId}/holdings`;

  const list = useQuery<StaffHolding[]>({
    queryKey,
    refetchInterval: 30000,
    queryFn: async () => {
      const res = await throwIfBad(await apiFetch(base));
      return res.json();
    },
  });

  // ---- add form ----
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<Kind>("custody");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recordedOn, setRecordedOn] = useState(saudiToday);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const requestIdRef = useRef<string>(crypto.randomUUID());

  const resetForm = () => {
    setKind("custody"); setDescription(""); setAmount(""); setRecordedOn(saudiToday()); setNotes(""); setErrors({});
  };

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await throwIfBad(await apiFetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      return (await res.json()) as StaffHolding;
    },
    onSuccess: () => {
      requestIdRef.current = crypto.randomUUID();
      resetForm(); setShowForm(false);
      qc.invalidateQueries({ queryKey });
      toast({ title: "تم توثيق القيد", description: `أُضيف إلى سجل ${staffName}` });
    },
    onError: (e: Error) => toast({ title: "لم يُحفظ القيد", description: e.message, variant: "destructive" }),
  });

  const submitCreate = () => {
    const errs: Record<string, string> = {};
    const amt = latinHoldingDigits(amount.trim());
    if (!description.trim()) errs.description = "الوصف مطلوب";
    else if (description.trim().length > 500) errs.description = "الوصف طويل جدًا";
    if (!amt) errs.amount = "المبلغ مطلوب";
    else if (!AMOUNT_RE.test(amt)) errs.amount = "أدخل رقمًا صحيحًا بحد أقصى منزلتين عشريتين";
    else {
      const n = Number(amt);
      if (n > MAX) errs.amount = "المبلغ يتجاوز الحد الأعلى";
      else if (n === 0 && kind !== "custody") errs.amount = "المبلغ يجب أن يكون أكبر من صفر";
    }
    if (!DATE_RE.test(recordedOn)) errs.recordedOn = "التاريخ غير صالح";
    if (notes.length > 2000) errs.notes = "الملاحظات طويلة جدًا";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate({ kind, description: description.trim(), amount: Number(amt), recordedOn, notes: notes.trim(), requestId: requestIdRef.current });
  };

  // ---- settlement ----
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [settledOn, setSettledOn] = useState(saudiToday);
  const [settlementNotes, setSettlementNotes] = useState("");
  const [settleErrors, setSettleErrors] = useState<Record<string, string>>({});

  const settle = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { settledOn: string; settlementNotes: string } }) => {
      const res = await throwIfBad(await apiFetch(`${base}/${id}/settle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      return (await res.json()) as StaffHolding;
    },
    onSuccess: () => {
      setSettlingId(null); setSettlementNotes(""); setSettleErrors({});
      qc.invalidateQueries({ queryKey });
      toast({ title: "تمت التسوية", description: "حُفظت تفاصيل التسوية في السجل" });
    },
    onError: (e: Error) => toast({ title: "تعذرت التسوية", description: e.message, variant: "destructive" }),
  });

  const openSettle = (h: StaffHolding) => {
    setSettlingId(h.id); setSettledOn(saudiToday()); setSettlementNotes(""); setSettleErrors({});
  };
  const submitSettle = (h: StaffHolding) => {
    const errs: Record<string, string> = {};
    if (!DATE_RE.test(settledOn)) errs.settledOn = "التاريخ غير صالح";
    else if (settledOn < h.recordedOn.slice(0, 10)) errs.settledOn = "تاريخ التسوية يجب ألا يسبق تاريخ التسجيل";
    if (!settlementNotes.trim()) errs.settlementNotes = "ملاحظات التسوية مطلوبة";
    else if (settlementNotes.length > 2000) errs.settlementNotes = "الملاحظات طويلة جدًا";
    setSettleErrors(errs);
    if (Object.keys(errs).length) return;
    settle.mutate({ id: h.id, body: { settledOn, settlementNotes: settlementNotes.trim() } });
  };

  const items = list.data ?? [];
  const totals = useMemo(() => {
    const t: Record<Kind, { open: number; count: number }> = {
      custody: { open: 0, count: 0 }, withheld: { open: 0, count: 0 }, emergency: { open: 0, count: 0 }, deposit: { open: 0, count: 0 },
    };
    for (const h of list.data ?? []) {
      if (h.status === "open" && t[h.kind]) { t[h.kind].open += Number(h.amount) || 0; t[h.kind].count += 1; }
    }
    return t;
  }, [list.data]);

  const sorted = useMemo(() => [...items].sort((a, b) => (a.status === b.status ? b.recordedOn.localeCompare(a.recordedOn) || b.id - a.id : a.status === "open" ? -1 : 1)), [items]);

  return (
    <section dir="rtl" className={cn("min-w-0 p-4 text-right", showForm ? "space-y-3 sm:p-5" : "space-y-4 sm:p-6")} data-testid="panel-staff-holdings">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">العهد والودائع</h3>
          <p className="text-sm text-muted-foreground" data-testid="text-holdings-staff-name">{staffName}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => list.refetch()} disabled={list.isFetching} data-testid="button-refresh-holdings">
            <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
          </Button>
          {!readOnly && !showForm && (
            <Button type="button" size="sm" onClick={() => setShowForm(true)} data-testid="button-add-holding">
              <Plus className="ml-1 h-4 w-4" /> توثيق قيد جديد
            </Button>
          )}
        </div>
      </header>

      <div className="flex gap-2 rounded-lg border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-holdings-disclaimer">
        <FileText className="mt-0.5 h-4 w-4 shrink-0" />
        <p>هذا السجل توثيقي فقط. لا يُنشئ خصمًا تلقائيًا من الراتب ولا تحويلًا بنكيًا ولا مصروفًا، ولا تنتقل أي أموال عند الحفظ أو التسوية. القيود لا تُعدّل ولا تُحذف بعد حفظها.</p>
      </div>

      {readOnly && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="text-holdings-readonly">عرض فقط — لا تملك صلاحية إضافة القيود أو تسويتها.</p>
      )}

      {/* totals per category, never combined */}
      {!showForm && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="grid-holdings-totals">
        {KINDS.map((k) => (
          <div key={k.value} className={cn("min-w-0 space-y-2 rounded-xl border p-4", k.tone)} data-testid={`total-${k.value}`}>
            <p className="text-xs font-semibold">{k.label}</p>
            {list.isLoading ? <div className="mt-2 h-6 w-24 animate-pulse rounded bg-current/10 opacity-20" /> : list.isError && !list.data ? (
              <p className="mt-2 text-xs">تعذّر تحميل الرصيد</p>
            ) : (
              <>
                <Money value={totals[k.value].open} className="max-w-full flex-wrap text-base font-extrabold sm:text-lg" />
                <p className="text-xs font-medium opacity-80">{easternHoldingDigits(String(totals[k.value].count))} قيد مفتوح</p>
                <p className="text-[11px] leading-relaxed opacity-80">{k.hint}</p>
              </>
            )}
          </div>
        ))}
      </div>}

      {showForm && !readOnly && (
        <form
          className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
          onSubmit={(e) => { e.preventDefault(); submitCreate(); }}
          data-testid="form-add-holding"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold">توثيق قيد جديد</h4>
            <Button type="button" variant="ghost" size="icon" onClick={() => { setShowForm(false); setErrors({}); }} data-testid="button-close-holding-form">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">النوع</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {KINDS.map((k) => (
                <button
                  type="button"
                  key={k.value}
                  onClick={() => setKind(k.value)}
                  aria-pressed={kind === k.value}
                  className={cn("rounded-lg border p-2.5 text-right text-sm transition", kind === k.value ? k.tone + " ring-2 ring-current/30 font-semibold" : "bg-background hover:bg-muted")}
                  data-testid={`button-kind-${k.value}`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{kindMeta(kind).hint}</p>
          </fieldset>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="holding-desc">الوصف</label>
            <Input id="holding-desc" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "custody" ? "مثال: مفتاح المستودع أو جهاز نقاط البيع" : "مثال: مبلغ نقدي محفوظ"} data-testid="input-holding-description" />
            <FieldError msg={errors.description} id="holding-description" />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm font-medium" htmlFor="holding-amount">المبلغ <RiyalIcon className="h-3.5 w-3.5" /></label>
              <Input id="holding-amount" inputMode="decimal" dir="ltr" className="h-11 text-right tabular-nums" value={easternHoldingDigits(amount)} onChange={(e) => setAmount(easternHoldingDigits(e.target.value))} placeholder="٠٫٠٠" data-testid="input-holding-amount" />
              <p className="mt-1 text-[11px] text-muted-foreground">{kind === "custody" ? "يمكن إدخال صفر للعهدة العينية غير النقدية." : "مبلغ موجب حتى منزلتين عشريتين."}</p>
              <FieldError msg={errors.amount} id="holding-amount" />
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">تاريخ التسجيل</div>
              <div data-testid="input-holding-date">
                <DualCalendarPicker value={recordedOn} onChange={setRecordedOn} placeholder="تاريخ التسجيل" className="min-h-11 w-full" />
              </div>
              <FieldError msg={errors.recordedOn} id="holding-date" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="holding-notes">ملاحظات (اختياري)</label>
            <Textarea id="holding-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-holding-notes" />
            <FieldError msg={errors.notes} id="holding-notes" />
          </div>
          {create.isError && (
            <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="error-create-holding">
              <AlertTriangle className="h-4 w-4" /> {(create.error as Error).message} — يمكنك إعادة المحاولة بأمان.
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { setShowForm(false); setErrors({}); }} data-testid="button-cancel-holding">إلغاء</Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-submit-holding">
              {create.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} حفظ القيد
            </Button>
          </div>
        </form>
      )}

      {!showForm && (list.isLoading ? (
        <div className="space-y-2" data-testid="status-holdings-loading">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : list.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" data-testid="status-holdings-error">
          <p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> تعذر تحميل السجل</p>
          <p className="mt-1 text-xs text-muted-foreground">{(list.error as Error).message}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => list.refetch()} data-testid="button-retry-holdings">إعادة المحاولة</Button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center" data-testid="status-holdings-empty">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-semibold">لا توجد قيود موثقة لـ {staffName}</p>
          <p className="text-xs text-muted-foreground">سجّل العهد والمبالغ المحفوظة هنا لتبقى مرجعًا واضحًا عند التسليم والاستلام.</p>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="list-holdings">
          {sorted.map((h) => {
            const meta = kindMeta(h.kind);
            const settled = h.status === "settled";
            return (
              <li key={h.id} className={cn("rounded-lg border bg-card p-3", settled && "opacity-80")} data-testid={`card-holding-${h.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold", meta.tone)}>{meta.label}</span>
                    <p className="mt-1 break-words font-semibold" data-testid={`text-holding-description-${h.id}`}>{h.description}</p>
                    <p className="text-xs text-muted-foreground">سُجّل في {fmtDate(h.recordedOn)}</p>
                  </div>
                  <div className="text-left">
                    <Money value={h.amount} className={cn("text-base font-bold", settled && "line-through decoration-1")} />
                    <p className={cn("text-[11px] font-semibold", settled ? "text-emerald-700" : "text-amber-700")} data-testid={`status-holding-${h.id}`}>{settled ? "مُسوّى" : "مفتوح"}</p>
                  </div>
                </div>
                {h.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{h.notes}</p>}
                {settled && (
                  <div className="mt-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-900" data-testid={`text-holding-settlement-${h.id}`}>
                    <p className="flex items-center gap-1 font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> سُوّي بالكامل في {fmtDate(h.settledOn)}</p>
                    {h.settlementNotes && <p className="mt-1 whitespace-pre-wrap break-words">{h.settlementNotes}</p>}
                  </div>
                )}
                {!settled && !readOnly && settlingId !== h.id && (
                  <Button size="sm" variant="outline" className="mt-2 w-full sm:w-auto" onClick={() => openSettle(h)} data-testid={`button-settle-holding-${h.id}`}>
                    تسوية كاملة
                  </Button>
                )}
                {!settled && !readOnly && settlingId === h.id && (
                  <form className="mt-3 space-y-2 rounded-md border bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); submitSettle(h); }} data-testid={`form-settle-holding-${h.id}`}>
                    <p className="text-xs font-semibold">تأكيد تسوية القيد بالكامل بمبلغه الأصلي <Money value={h.amount} />. لا يمكن التراجع عن التسوية ولا تتم أي حركة مالية فعلية.</p>
                    <div>
                      <div className="mb-1 text-xs font-medium">تاريخ التسوية</div>
                      <div data-testid={`input-settle-date-${h.id}`}>
                        <DualCalendarPicker value={settledOn} onChange={setSettledOn} minDate={h.recordedOn.slice(0, 10)} placeholder="تاريخ التسوية" className="min-h-11 w-full" />
                      </div>
                      <FieldError msg={settleErrors.settledOn} id={`settle-date-${h.id}`} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor={`settle-notes-${h.id}`}>ملاحظات التسوية</label>
                      <Textarea id={`settle-notes-${h.id}`} rows={2} maxLength={2000} value={settlementNotes} onChange={(e) => setSettlementNotes(e.target.value)} placeholder="مثال: استُلمت العهدة سليمة" data-testid={`input-settle-notes-${h.id}`} />
                      <FieldError msg={settleErrors.settlementNotes} id={`settle-notes-${h.id}`} />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setSettlingId(null)} data-testid={`button-cancel-settle-${h.id}`}>إلغاء</Button>
                      <Button type="submit" size="sm" disabled={settle.isPending} data-testid={`button-confirm-settle-${h.id}`}>
                        {settle.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />} تأكيد التسوية
                      </Button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </section>
  );
}

export default StaffHoldingsPanel;
