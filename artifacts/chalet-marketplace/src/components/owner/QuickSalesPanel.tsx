import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuickSales, useCreateQuickSale, useCancelQuickSale, useGetQuickSalesSettings, useGetProviderCatalogItems,
  getListQuickSalesQueryKey, getGetQuickSalesSettingsQueryKey, getGetProviderCatalogItemsQueryKey,
  type QuickSale, type CreateQuickSale,
} from "@workspace/api-client-react";
import { Zap, Plus, Trash2, RefreshCw, AlertTriangle, Receipt, Ban, Banknote, Landmark, Lock, Package, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { useToast } from "@/hooks/use-toast";
import { cn, toAr, fromAr } from "@/lib/utils";
import { formatDualDate } from "@/lib/hijri";
import { isInRevenuePeriod, revenueMonthKey, revenueSalesTitle, type RevenuePeriod } from "@/lib/revenuePeriod";
import { quickSalesHistoryMonths, reconcileQuickSalesHistoryPeriod, switchQuickSalesHistoryCalendar } from "@/lib/quickSalesHistoryPeriod";
import { QuickSalesHistoryFilters, QuickSalesHistoryStatusFilters, type QuickSalesHistoryStatus } from "./QuickSalesHistoryFilters";
import { qsErrText } from "./QuickSalesSettingsPanel";
import { quickSaleNumericInput, quickSalePhone, quickSalePhoneInput } from "@/lib/quickSaleNumbers";

const MAX_TOTAL = 9_999_999_999.99;
const PAY_LABEL = { cash: "نقدًا", bank: "تحويل بنكي" } as const;

const money = (n: number) => toAr(n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const parseNum = (s: string) => { const v = fromAr(s).replace(/[٬,\s]/g, "").replace("٫", "."); return v === "" ? NaN : Number(v); };
const r2 = (n: number) => Math.round(n * 100) / 100;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); });

function Price({ value, className }: { value: number; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 tabular-nums", className)}>{money(value)}<RiyalIcon className="w-3.5 h-3.5" /></span>;
}

function DualDate({ s }: { s: string }) {
  const d = formatDualDate(s.slice(0, 10));
  return <span className="text-xs text-muted-foreground">{d.hijri} <span className="opacity-60">·</span> {d.gregorian} م</span>;
}

type Line = { key: string; catalogItemId?: number; name: string; qty: string; price: string };
const newLine = (): Line => ({ key: uuid(), name: "", qty: "١", price: "" });

/* ── Revenue summary (optional reuse) ─────────────────────────── */

export function QuickSalesRevenueDetails({ sales }: { sales: QuickSale[] }) {
  const done = sales.filter(s => s.status === "completed");
  const sum = (m?: "cash" | "bank") => r2(done.filter(s => !m || s.paymentMethod === m).reduce((a, s) => a + s.total, 0));
  const cells = [
    { label: "إجمالي البيع السريع", v: sum(), main: true },
    { label: "نقدًا", v: sum("cash") },
    { label: "تحويل بنكي", v: sum("bank") },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="quick-sales-revenue">
      {cells.map(c => (
        <div key={c.label} className={cn("rounded-xl border p-3", c.main ? "border-primary/30 bg-primary/5 col-span-2 sm:col-span-1" : "border-border")}>
          <p className="text-[11px] text-muted-foreground">{c.label}</p>
          <Price value={c.v} className={cn("font-bold", c.main && "text-primary text-lg")} />
        </div>
      ))}
      <div className="rounded-xl border border-border p-3">
        <p className="text-[11px] text-muted-foreground">عدد العمليات</p>
        <p className="font-bold tabular-nums">{toAr(done.length)}{sales.length > done.length && <span className="text-[11px] font-normal text-muted-foreground"> · {toAr(sales.length - done.length)} ملغاة</span>}</p>
      </div>
    </div>
  );
}

/* ── Main panel ───────────────────────────────────────────────── */

export function QuickSalesPanel({ providerId, readOnly = false }: { providerId: number; readOnly?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const params = { providerId };
  const salesQ = useListQuickSales(params, { query: { queryKey: getListQuickSalesQueryKey(params), enabled: providerId > 0, staleTime: 15_000, refetchInterval: 30_000 } });
  const settingsQ = useGetQuickSalesSettings({ query: { queryKey: getGetQuickSalesSettingsQueryKey(), staleTime: 30_000, refetchInterval: 30_000 } });
  const catalogQ = useGetProviderCatalogItems(providerId, { query: { queryKey: getGetProviderCatalogItemsQueryKey(providerId), enabled: providerId > 0, staleTime: 30_000 } });
  const create = useCreateQuickSale();
  const cancel = useCancelQuickSale();

  const enabled = settingsQ.data?.enabled === true;
  const canCreate = !readOnly && enabled;
  const activeCatalog = useMemo(() => (catalogQ.data ?? []).filter(i => i.isActive), [catalogQ.data]);

  /* form — local only, never reset by refetches */
  const [dateStr, setDateStr] = useState(today());
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [customerLookup, setCustomerLookup] = useState<"idle" | "loading" | "found" | "new" | "error">("idle");
  const customerRequest = useRef(0);
  const normalizedPhone = quickSalePhone(clientPhone);
  useEffect(() => {
    const request = ++customerRequest.current;
    if (!/^05\d{8}$/.test(normalizedPhone)) { setCustomerLookup("idle"); return; }
    const controller = new AbortController();
    setCustomerLookup("loading");
    const timer = setTimeout(async () => {
      try {
        const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
        const response = await fetch(`${base}/api/owner/customers/lookup?phone=${encodeURIComponent(normalizedPhone)}`, {
          credentials: "include", signal: controller.signal,
        });
        if (!response.ok) throw new Error("lookup");
        const customer = await response.json();
        if (request !== customerRequest.current) return;
        if (customer?.clientName) { setClientName(customer.clientName); setCustomerLookup("found"); }
        else setCustomerLookup("new");
      } catch {
        if (!controller.signal.aborted && request === customerRequest.current) setCustomerLookup("error");
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [normalizedPhone, clientPhone]);
  const [pay, setPay] = useState<"cash" | "bank">("cash");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const idem = useRef<{ sig: string; key: string } | null>(null);

  const setLine = (k: string, patch: Partial<Line>) => setLines(ls => ls.map(l => l.key === k ? { ...l, ...patch } : l));

  const parsed = lines.map(l => ({ l, q: parseNum(l.qty), p: parseNum(l.price) }));
  const total = r2(parsed.reduce((a, x) => a + (Number.isFinite(x.q) && Number.isFinite(x.p) ? x.q * x.p : 0), 0));

  const submit = () => {
    if (!canCreate || create.isPending) return;
    setFormErr(null);
    if (clientPhone && !/^05\d{8}$/.test(normalizedPhone)) return setFormErr("أدخل رقم جوال سعودي صحيحًا");
    if (normalizedPhone && customerLookup === "loading") return setFormErr("انتظر اكتمال البحث عن العميل");
    if (normalizedPhone && !clientName.trim()) return setFormErr("اكتب اسم العميل الجديد");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return setFormErr("اختر تاريخ البيع");
    for (const { l, q, p } of parsed) {
      if (l.name.trim().length < 1) return setFormErr("اكتب اسم كل بند");
      if (!Number.isInteger(q) || q < 1 || q > 10000) return setFormErr(`الكمية في «${l.name}» عدد صحيح بين ١ و١٠٬٠٠٠`);
      if (!Number.isFinite(p) || p <= 0) return setFormErr(`أدخل سعرًا صحيحًا لـ «${l.name}»`);
      if (r2(p) !== p) return setFormErr(`السعر في «${l.name}» بحد أقصى منزلتين عشريتين`);
    }
    if (total <= 0 || total > MAX_TOTAL) return setFormErr("الإجمالي خارج الحد المسموح");
    if (!confirmed) return setFormErr("أكّد أن المبلغ مستلم بالكامل");
    const body: Omit<CreateQuickSale, "idempotencyKey"> = {
      providerId, dateStr, paymentMethod: pay,
      items: parsed.map(({ l, q, p }) => ({ ...(l.catalogItemId ? { catalogItemId: l.catalogItemId } : {}), name: l.name.trim(), quantity: q, unitPrice: r2(p) })),
      ...(clientName.trim() ? { clientName: clientName.trim() } : {}),
      ...(normalizedPhone ? { clientPhone: normalizedPhone } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    const sig = JSON.stringify(body);
    if (!idem.current || idem.current.sig !== sig) idem.current = { sig, key: uuid() };
    create.mutate({ data: { ...body, idempotencyKey: idem.current.key } }, {
      onSuccess: (sale) => {
        idem.current = null;
        ++customerRequest.current;
        setLines([newLine()]); setClientName(""); setClientPhone(""); setCustomerLookup("idle"); setNotes(""); setConfirmed(false);
        qc.invalidateQueries({ queryKey: getListQuickSalesQueryKey() });
        qc.invalidateQueries({ queryKey: ["owner", "report-years"] });
        qc.invalidateQueries({ queryKey: ["owner", "crm-customers"] });
        qc.invalidateQueries({ queryKey: ["owner", "crm-history"] });
        toast({ title: "تم تسجيل البيعة", description: `${money(sale.total)} ريال · ${PAY_LABEL[sale.paymentMethod]}` });
      },
      onError: (e) => { setFormErr(qsErrText(e)); toast({ title: "لم تُسجَّل البيعة", description: "بياناتك محفوظة، يمكنك إعادة المحاولة بأمان.", variant: "destructive" }); },
    });
  };

  /* history filter */
  const [historyStatus, setHistoryStatus] = useState<QuickSalesHistoryStatus>("all");
  useEffect(() => { setHistoryStatus("all"); }, [providerId]);
  const [period, setPeriod] = useState<RevenuePeriod>(() => {
    const month = revenueMonthKey(today(), "hijri");
    return { calendar: "hijri", year: month.slice(0, 4), month };
  });
  const sales = useMemo(() => [...(salesQ.data ?? [])].sort((a, b) => b.dateStr.localeCompare(a.dateStr) || b.id - a.id), [salesQ.data]);
  const historyDates = useMemo(() => sales.map(sale => sale.dateStr), [sales]);
  const historyMonths = useMemo(() => quickSalesHistoryMonths(historyDates, period.calendar), [historyDates, period.calendar]);
  useEffect(() => {
    if (salesQ.isLoading || salesQ.isError) return;
    setPeriod(previous => {
      const next = reconcileQuickSalesHistoryPeriod(previous, historyMonths);
      return next.year === previous.year && next.month === previous.month ? previous : next;
    });
  }, [historyMonths, salesQ.isLoading, salesQ.isError]);
  const filtered = sales.filter(s => isInRevenuePeriod(s.dateStr, period)
    && (historyStatus === "all" || s.status === historyStatus));

  const [toCancel, setToCancel] = useState<QuickSale | null>(null);
  const [reason, setReason] = useState("");
  const doCancel = () => {
    if (!toCancel || readOnly || cancel.isPending) return;
    if (reason.trim().length < 3) return;
    cancel.mutate({ saleId: toCancel.id, data: { reason: reason.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListQuickSalesQueryKey() });
        qc.invalidateQueries({ queryKey: ["owner", "report-years"] });
        qc.invalidateQueries({ queryKey: ["owner", "crm-customers"] });
        qc.invalidateQueries({ queryKey: ["owner", "crm-history"] });
        setToCancel(null); setReason("");
        toast({ title: "تم إلغاء البيعة محاسبيًا", description: "استُبعدت من الإيرادات وبقيت في السجل." });
      },
      onError: (e) => toast({ title: "تعذر الإلغاء", description: qsErrText(e), variant: "destructive" }),
    });
  };


  return (
    <section data-testid="panel-quick-sales" className="rounded-2xl border border-card-border bg-card overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 justify-between px-4 sm:px-5 py-4 border-b border-border bg-secondary/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Zap className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h3 className="font-bold text-base">البيع السريع</h3>
            <p className="text-xs text-muted-foreground">مبيعات مباشرة مستلمة بالكامل — منفصلة عن الحجوزات</p>
          </div>
        </div>
        {settingsQ.data && <span className={enabled ? "chip-primary" : "chip"} data-testid="status-quick-sales-enabled">{enabled ? "التسجيل مفعّل" : "التسجيل موقوف"}</span>}
      </header>

      <div className="p-4 sm:p-5 space-y-6">
        {readOnly && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="status-readonly">
            <Lock className="w-3.5 h-3.5" />وضع الاطلاع فقط — التسجيل والإلغاء غير متاحين
          </div>
        )}

        {/* ── New sale ── */}
        {!readOnly && (settingsQ.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : settingsQ.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex flex-wrap items-center gap-3 text-sm" data-testid="status-settings-error">
            <AlertTriangle className="w-4 h-4 text-destructive" /><span className="flex-1">تعذر التحقق من إعداد البيع السريع.</span>
            <Button size="sm" variant="outline" onClick={() => settingsQ.refetch()} disabled={settingsQ.isFetching}><RefreshCw className={cn("w-4 h-4 ml-1", settingsQ.isFetching && "animate-spin")} />إعادة المحاولة</Button>
          </div>
        ) : !enabled ? (
          <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground flex gap-2" data-testid="status-quick-sales-disabled">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />تسجيل مبيعات جديدة موقوف. فعّل «البيع السريع» من «بيانات النشاط»، والسجل أدناه يبقى متاحًا.
          </div>
        ) : (
          <form dir="rtl" className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 space-y-4 text-right min-w-0" onSubmit={e => { e.preventDefault(); submit(); }} data-testid="form-quick-sale">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="qs-phone" className="block">جوال العميل <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                <Input id="qs-phone" type="tel" inputMode="numeric" dir="rtl" className="h-10 text-right" value={clientPhone} maxLength={10}
                  placeholder="٠٥xxxxxxxx" onChange={e => {
                    const next = quickSalePhoneInput(e.target.value);
                    // Browsers may emit another change after controlled digit conversion.
                    // An unchanged phone must not invalidate its in-flight lookup.
                    if (next === clientPhone) return;
                    ++customerRequest.current;
                    setClientPhone(next); setClientName(""); setCustomerLookup("idle");
                  }} data-testid="input-quick-sale-phone" aria-describedby="qs-customer-status" />
                <Label htmlFor="qs-client" className="block text-xs">اسم العميل</Label>
                <Input id="qs-client" className="h-10" value={clientName} maxLength={150} readOnly={customerLookup === "found" || customerLookup === "loading"}
                  onChange={e => setClientName(e.target.value)} data-testid="input-quick-sale-client" />
                <p id="qs-customer-status" role="status" className="text-[11px] text-muted-foreground">
                  {customerLookup === "loading" ? "جارٍ البحث عن العميل…" : customerLookup === "found" ? "عميل مسجّل — ستُضاف البيعة إلى ملفه الموحد" :
                    customerLookup === "new" ? "عميل جديد — أدخل اسمه، وسيُحفظ عند تسجيل البيعة" :
                    customerLookup === "error" ? "تعذر البحث؛ أعد إدخال الجوال للمحاولة. سيتحقق النظام من الهوية عند الحفظ." :
                    "أدخل الجوال لاستدعاء العميل وربط البيعة بملفه"}
                </p>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label id="qs-pay-label" className="block">طريقة الاستلام</Label>
                <div role="radiogroup" aria-labelledby="qs-pay-label" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 h-10">
                  {(["cash", "bank"] as const).map(m => (
                    <button type="button" role="radio" aria-checked={pay === m} key={m} onClick={() => setPay(m)} data-testid={`button-pay-${m}`}
                      className={cn("flex items-center justify-center gap-1.5 rounded-md text-sm transition-colors whitespace-nowrap", pay === m ? "bg-card shadow-sm font-semibold text-primary" : "text-muted-foreground")}>
                      {m === "cash" ? <Banknote className="w-4 h-4" /> : <Landmark className="w-4 h-4" />}{PAY_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="block">تاريخ البيع</Label>
                <DualCalendarPicker value={dateStr} onChange={setDateStr} label="تاريخ البيع" compact className="h-10 rounded-md border border-input bg-background px-3 py-2" />
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <Label className="block">البنود</Label>
              <div className="w-full max-w-full overflow-x-auto overscroll-x-contain px-1 pb-1" tabIndex={0} role="region" aria-label="بنود البيع — مرّر أفقيًا على الجوال">
                <div className="min-w-[42rem] space-y-2">
                  <div className="grid grid-cols-[12rem_minmax(8rem,1fr)_4.5rem_7rem_5.5rem] gap-2 text-[11px] text-muted-foreground px-0.5" aria-hidden="true">
                    <span>من القائمة</span><span>اسم البند</span><span className="text-center">الكمية</span><span>سعر الوحدة</span><span className="text-center">إضافة / حذف</span>
                  </div>
                  {lines.map((l, idx) => {
                    const q = parseNum(l.qty), p = parseNum(l.price);
                    const sub = Number.isFinite(q) && Number.isFinite(p) ? r2(q * p) : 0;
                    return (
                      <div key={l.key} className="grid grid-cols-[12rem_minmax(8rem,1fr)_4.5rem_7rem_5.5rem] gap-2 items-center" data-testid={`row-line-${idx}`}>
                        <Select dir="rtl" value={l.catalogItemId ? String(l.catalogItemId) : ""} disabled={activeCatalog.length === 0}
                          onValueChange={v => { const it = activeCatalog.find(i => String(i.id) === v); if (it) setLine(l.key, { catalogItemId: it.id, name: it.name, price: quickSaleNumericInput(String(it.price), true) }); }}>
                          <SelectTrigger className="h-10 min-w-0 text-xs [&>span]:min-w-0 [&>span]:truncate" aria-label={`اختيار من القائمة للبند ${idx + 1}`} data-testid={idx === 0 ? "select-catalog-item" : `select-line-catalog-${idx}`}>
                            <Package className="w-3.5 h-3.5 ml-1 shrink-0" /><SelectValue placeholder={activeCatalog.length ? "اختر من قائمتك" : "لا توجد قائمة"} />
                          </SelectTrigger>
                          <SelectContent dir="rtl" align="start">{activeCatalog.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} — {money(i.price)} ر.س</SelectItem>)}</SelectContent>
                        </Select>
                        <Input className="h-10 min-w-0" aria-label={`اسم البند ${idx + 1}`} placeholder="اسم البند" value={l.name} maxLength={150} onChange={e => setLine(l.key, { name: e.target.value, catalogItemId: undefined })} data-testid={`input-line-name-${idx}`} />
                        <Input inputMode="numeric" aria-label={`الكمية للبند ${idx + 1}`} value={l.qty} onChange={e => setLine(l.key, { qty: quickSaleNumericInput(e.target.value) })} className="h-10 text-center tabular-nums" data-testid={`input-line-qty-${idx}`} />
                        <div className="relative">
                          <Input inputMode="decimal" aria-label={`سعر الوحدة للبند ${idx + 1}`} placeholder="٠" value={l.price} onChange={e => setLine(l.key, { price: quickSaleNumericInput(e.target.value, true) })} className="h-10 pl-7 tabular-nums" data-testid={`input-line-price-${idx}`} />
                          <RiyalIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0" onClick={() => setLines(ls => [...ls, newLine()])} aria-label="إضافة بند" title="إضافة بند" data-testid={idx === 0 ? "button-add-line" : `button-add-line-${idx}`}><Plus className="w-4 h-4" /></Button>
                          <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive" disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} aria-label={`حذف البند ${idx + 1}`} title="حذف البند" data-testid={`button-remove-line-${idx}`}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                        {sub > 0 && <p className="col-start-2 col-span-3 -mt-1 text-[11px] text-muted-foreground">{l.catalogItemId ? "من القائمة · " : ""}المجموع <Price value={sub} /></p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">اختر من قائمتك أو اكتب بندًا يدويًا. استخدم زر + لإضافة بند. على الجوال يمكنك تمرير صف البنود أفقيًا.</p>
            </div>

            <div>
              <Label htmlFor="qs-notes">ملاحظات <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Textarea id="qs-notes" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-quick-sale-notes" />
            </div>

            <label className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} data-testid="checkbox-fully-collected" />
              <span>استلمتُ المبلغ كاملًا ({PAY_LABEL[pay]}). هذا تسجيل محاسبي فقط — المنصة لا تحصّل ولا تنقل أي أموال، ولا يُنشأ عقد أو تأمين أو حجز في التقويم.</span>
            </label>

            {formErr && <p className="text-sm text-destructive flex items-center gap-1.5" data-testid="text-quick-sale-error"><AlertTriangle className="w-4 h-4" />{formErr}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div>
                <p className="text-[11px] text-muted-foreground">الإجمالي المستلم</p>
                <Price value={total} className="text-2xl font-extrabold text-primary" />
              </div>
              <Button type="submit" size="lg" disabled={create.isPending} data-testid="button-submit-quick-sale">
                <Receipt className="w-4 h-4 ml-1" />{create.isPending ? "جارٍ التسجيل..." : "تسجيل البيعة"}
              </Button>
            </div>
          </form>
        ))}

        {/* ── History ── */}
        <div className="space-y-3">
          <div className="space-y-3">
            <h4 className="font-bold text-sm">سجل البيع السريع <span className="text-muted-foreground font-normal">· {revenueSalesTitle(period).replace("المبيعات", "").replace("مبيعات", "").trim() || "الكل"}</span></h4>
            <QuickSalesHistoryStatusFilters value={historyStatus} onChange={setHistoryStatus}
              disabled={salesQ.isLoading || salesQ.isError} />
            <QuickSalesHistoryFilters period={period} months={historyMonths} loading={salesQ.isLoading || salesQ.isError}
              onChange={setPeriod}
              onCalendarChange={calendar => setPeriod(previous => switchQuickSalesHistoryCalendar(previous, calendar, historyDates))} />
          </div>

          {salesQ.isLoading ? (
            <div className="space-y-2" data-testid="status-loading">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          ) : salesQ.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center gap-3" data-testid="status-error">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm flex-1 min-w-[12rem]">{qsErrText(salesQ.error)}</p>
              <Button size="sm" variant="outline" onClick={() => salesQ.refetch()} disabled={salesQ.isFetching} data-testid="button-retry">
                <RefreshCw className={cn("w-4 h-4 ml-1", salesQ.isFetching && "animate-spin")} />إعادة المحاولة
              </Button>
            </div>
          ) : (
            <>
              <QuickSalesRevenueDetails sales={filtered} />
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/30 py-10 px-4 text-center flex flex-col items-center gap-2" data-testid="status-empty">
                  <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Receipt className="w-6 h-6" /></div>
                  <p className="font-semibold">{sales.length ? "لا توجد مبيعات مطابقة للفلاتر المحددة" : "لا مبيعات سريعة بعد"}</p>
                  <p className="text-sm text-muted-foreground max-w-sm">{sales.length
                    ? "جرّب حالة أخرى أو عدّل فترة السجل."
                    : "كل بيعة تسجّلها هنا تظهر في هذا السجل مع تاريخها الهجري والميلادي، منفصلة عن الحجوزات."}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map(s => {
                    const off = s.status === "cancelled";
                    return (
                      <li key={s.id} data-testid={`card-quick-sale-${s.id}`} className={cn("rounded-xl border border-border p-3 sm:p-4", off && "bg-muted/40")}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold tabular-nums text-xs text-muted-foreground">#{toAr(s.id)}</span>
                              <span className="font-semibold truncate">{s.clientName || "عميل مباشر"}</span>
                               {s.clientPhone && <span dir="ltr" className="text-xs text-muted-foreground">{toAr(s.clientPhone)}</span>}
                              <span className="chip">{PAY_LABEL[s.paymentMethod]}</span>
                              {off && <span className="chip text-destructive" data-testid={`status-sale-cancelled-${s.id}`}>ملغاة محاسبيًا</span>}
                            </div>
                            <DualDate s={s.dateStr} />
                            <p className="text-xs mt-1.5 text-foreground/80">{s.items.map(i => `${i.name} × ${toAr(i.quantity)}`).join("، ")}</p>
                            {s.notes && <p className="text-xs text-muted-foreground mt-1">{s.notes}</p>}
                            {off && s.cancellationReason && <p className="text-xs text-destructive/80 mt-1">سبب الإلغاء: {s.cancellationReason}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Price value={s.total} className={cn("font-bold", off ? "line-through text-muted-foreground" : "text-primary")} />
                            {!readOnly && !off && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setReason(""); setToCancel(s); }} data-testid={`button-cancel-sale-${s.id}`}><Ban className="w-4 h-4 ml-1" />إلغاء</Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={!!toCancel} onOpenChange={o => { if (!o && !cancel.isPending) setToCancel(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>إلغاء البيعة #{toAr(toCancel?.id ?? 0)}؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-foreground/90">
                  <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  هذا تصحيح محاسبي فقط: تُستبعد البيعة من الإيرادات وتبقى في السجل. لن يُرسل أي استرداد للعميل — إن لزم إرجاع المبلغ فرتّبه بنفسك خارج المنصة.
                </p>
                <p>المبلغ: {money(toCancel?.total ?? 0)} ريال · {toCancel ? PAY_LABEL[toCancel.paymentMethod] : ""}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="qs-reason">سبب الإلغاء</Label>
            <Textarea id="qs-reason" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} data-testid="input-cancel-reason" />
            {reason.trim().length > 0 && reason.trim().length < 3 && <p className="text-xs text-destructive mt-1">ثلاثة أحرف على الأقل</p>}
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={cancel.isPending} data-testid="button-keep-sale">تراجع</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancel.isPending || reason.trim().length < 3}
              onClick={e => { e.preventDefault(); doCancel(); }} data-testid="button-confirm-cancel-sale">
              {cancel.isPending ? "جارٍ الإلغاء..." : "إلغاء محاسبي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
