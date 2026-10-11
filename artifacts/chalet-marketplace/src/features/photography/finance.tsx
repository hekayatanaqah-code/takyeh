import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { call, sar, fmtDT, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice } from "./shared";

/* ---- Saudi IBAN ---- */
export const canonicalIban = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "").toUpperCase().slice(0, 24);

export function ibanError(raw: string): string | null {
  const v = canonicalIban(raw);
  if (!v) return "أدخل رقم الآيبان";
  if (!/^SA\d{2}\d{2}[0-9A-Z]{18}$/.test(v)) return "الآيبان السعودي يبدأ بـ SA ويتكون من ٢٤ خانة";
  const r = v.slice(4) + v.slice(0, 4);
  let m = 0;
  for (const ch of r) {
    const n = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of n) m = (m * 10 + Number(d)) % 97;
  }
  return m === 1 ? null : "رقم الآيبان غير صحيح، تحقق من الخانات";
}
export const formatIban = (v: string) => v.replace(/(.{4})/g, "$1 ").trim();

export const SAUDI_BANKS = ["الإنماء", "الراجحي", "الأهلي السعودي", "الرياض", "البلاد", "الجزيرة", "السعودي الأول", "العربي الوطني", "السعودي الفرنسي", "السعودي للاستثمار", "الخليج الدولي", "إس تي سي بنك", "دال ثلاثمائة وستون"];

export interface Bank { iban: string; bankName: string }
export function BankFields({ value, onChange, optional }: { value: Bank; onChange: (b: Bank) => void; optional?: boolean }) {
  const [touched, setTouched] = useState(false);
  const err = value.iban ? ibanError(value.iban) : null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">البيانات البنكية {optional && <span className="font-normal text-muted-foreground">(لتحويل مستحقاتك)</span>}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم البنك">
          <select className={inputCls} value={value.bankName} onChange={(e) => onChange({ ...value, bankName: e.target.value })} data-testid="select-bank">
            <option value="">اختر البنك</option>
            {(value.bankName && !SAUDI_BANKS.includes(value.bankName) ? [value.bankName, ...SAUDI_BANKS] : SAUDI_BANKS).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="رقم الآيبان (IBAN)" hint="٢٤ خانة تبدأ بـ SA">
          <input dir="ltr" className={`${inputCls} font-mono tracking-wide`} placeholder="SA00 0000 0000 0000 0000 0000" value={formatIban(value.iban)}
            onChange={(e) => onChange({ ...value, iban: canonicalIban(e.target.value) })} onBlur={() => setTouched(true)}
            aria-invalid={!!err} data-testid="input-iban" />
        </Field>
      </div>
      {touched && err && <p role="alert" className="text-xs font-semibold text-destructive" data-testid="text-iban-error">{err}</p>}
    </div>
  );
}
export const bankError = (b: Bank) => ibanError(b.iban) ?? (b.bankName ? null : "اختر البنك");

/* ---- Safe HTML ---- */
const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "H2", "H3", "UL", "OL", "LI", "DIV"]);
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (!ALLOWED.has(c.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(c.tagName)) c.remove();
        else { walk(c); c.replaceWith(...Array.from(c.childNodes)); }
        continue;
      }
      for (const a of Array.from(c.attributes)) c.removeAttribute(a.name);
      walk(c);
    }
  };
  const root = doc.body.firstElementChild as Element; walk(root);
  return root.innerHTML;
}
const proseCls = "space-y-2 text-sm leading-7 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6";
export const ContractHtml = ({ html }: { html: string }) => <div className={proseCls} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} data-testid="text-contract-html" />;

export interface Contract { id: number | null; html: string; createdAt: string | null }

/* ---- Contract dialog (photographer) ---- */
export function ContractConsent({ contract, loading, error, accepted, setAccepted, onRetry }: { contract?: Contract; loading: boolean; error: unknown; accepted: boolean; setAccepted: (b: boolean) => void; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const available = !!contract?.id && !!contract.html.trim();
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">عقد المصورين</p>
      {loading ? <Skel n={1} /> : error ? <ErrorBox error={error} onRetry={onRetry} /> : !available ? (
        <Notice tone="warn">العقد غير متاح حاليا. لا يمكن إرسال الطلب حتى تنشر الإدارة العقد.</Notice>
      ) : (
        <>
          <button type="button" className={ghostCls} onClick={() => setOpen(true)} data-testid="button-open-contract">قراءة العقد (الإصدار {contract!.id!.toLocaleString("ar-SA")})</button>
          <label className="flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="check-contract" />
            أوافق على شروط وأحكام الانضمام وعقد الخدمة لمنصة تكية
          </label>
        </>
      )}
      {available && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent dir="rtl" aria-describedby={undefined} className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0">
            <div className="border-b border-border p-4"><DialogTitle className="font-bold">عقد المصورين</DialogTitle>{contract!.createdAt && <p className="text-xs text-muted-foreground">نشر في {fmtDT(contract!.createdAt)}</p>}</div>
            <div className="overflow-y-auto p-4"><ContractHtml html={contract!.html} /></div>
            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              <button type="button" className={btnCls} onClick={() => { setAccepted(true); setOpen(false); }} data-testid="button-accept-contract">أوافق على العقد</button>
              <button type="button" className={ghostCls} onClick={() => setOpen(false)}>إغلاق</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ---- Rich text editor + admin contract ---- */
function RichTextEditor({ initial, onChange }: { initial: string; onChange: (h: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onChange); cb.current = onChange;
  useEffect(() => { if (ref.current) ref.current.innerHTML = sanitizeHtml(initial); }, [initial]);
  const exec = (cmd: string, arg?: string) => { ref.current?.focus(); document.execCommand(cmd, false, arg); cb.current(ref.current?.innerHTML ?? ""); };
  const tools: [string, string, string?][] = [["عريض", "bold"], ["مائل", "italic"], ["تسطير", "underline"], ["عنوان رئيسي", "formatBlock", "H2"], ["عنوان فرعي", "formatBlock", "H3"], ["فقرة", "formatBlock", "P"], ["قائمة مرقمة", "insertOrderedList"], ["قائمة نقطية", "insertUnorderedList"]];
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap gap-1 border-b border-border bg-muted p-2" role="toolbar" aria-label="أدوات التنسيق">
        {tools.map(([l, c, a]) => <button key={l} type="button" className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-background" onMouseDown={(e) => e.preventDefault()} onClick={() => exec(c, a)} data-testid={`button-format-${c}-${a ?? ""}`}>{l}</button>)}
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning dir="rtl" className={`min-h-[18rem] bg-background p-4 focus:outline-none ${proseCls}`}
        onInput={(e) => cb.current(e.currentTarget.innerHTML)}
        onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
        data-testid="editor-contract" />
    </div>
  );
}

export function ContractAdmin() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ph-admin-contract"], queryFn: () => call<Contract>("/admin/photography/contract") });
  const [html, setHtml] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  useEffect(() => { if (q.data && seed === null) { setSeed(q.data.html); setHtml(q.data.html); } }, [q.data, seed]);
  const m = useMutation({
    mutationFn: () => call<Contract>("/admin/photography/contract", "POST", { html: sanitizeHtml(html) }),
    onSuccess: (c) => { qc.setQueryData(["ph-admin-contract"], c); qc.invalidateQueries({ queryKey: ["ph-contract"] }); setSeed(c.html); setHtml(c.html); },
  });
  if (q.isLoading) return <Skel />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const empty = !html.replace(/<[^>]*>/g, "").trim();
  return (
    <section className={`${cardCls} space-y-4`} data-testid="section-contract-admin">
      <div>
        <h3 className="text-lg font-bold">إدارة عقد المصورين</h3>
        <p className="text-sm text-muted-foreground">{q.data.id ? `الإصدار الحالي ${q.data.id.toLocaleString("ar-SA")}${q.data.createdAt ? ` - ${fmtDT(q.data.createdAt)}` : ""}` : "لا يوجد عقد منشور. لن يتمكن المصورون من التسجيل حتى تحفظ العقد."}</p>
      </div>
      <Notice tone="warn">كل حفظ ينشئ إصدارا جديدا ثابتا لا يمكن تعديله. المصورون الذين وافقوا سابقا يبقون مرتبطين بإصدارهم.</Notice>
      <RichTextEditor initial={seed ?? ""} onChange={setHtml} />
      {m.isError && <ErrorBox error={m.error} />}
      {m.isSuccess && <Notice tone="ok">تم نشر إصدار جديد من العقد</Notice>}
      <button className={btnCls} disabled={empty || m.isPending} onClick={() => m.mutate()} data-testid="button-save-contract">{m.isPending ? "جار النشر" : "حفظ ونشر إصدار جديد"}</button>
    </section>
  );
}

/* ---- Transfers (admin) ---- */
interface Transfers { transfers: { id: number; amountHalalas: number; reference: string; transferredAt: string }[]; netDueHalalas: number; transferredHalalas: number }
export function TransfersPanel({ id }: { id: number }) {
  const qc = useQueryClient();
  const key = ["ph-transfers", id];
  const q = useQuery({ queryKey: key, queryFn: () => call<Transfers>(`/admin/photography/photographers/${id}/transfers`) });
  const [amount, setAmount] = useState(""); const [ref, setRef] = useState(""); const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => call(`/admin/photography/photographers/${id}/transfers`, "POST", { amountHalalas: Math.round(Number(amount) * 100), reference: ref.trim(), transferredAt: new Date(date).toISOString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setAmount(""); setRef(""); setDate(""); },
  });
  if (q.isLoading) return <Skel n={1} />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const submit = () => {
    const h = Math.round(Number(amount) * 100);
    const e = !(h > 0) ? "أدخل مبلغا صحيحا" : h > d.netDueHalalas ? `المبلغ أكبر من المستحق (${sar(d.netDueHalalas)})` : !ref.trim() ? "أدخل مرجع التحويل" : !date || Number.isNaN(new Date(date).getTime()) ? "أدخل تاريخ التحويل" : new Date(date).getTime() > Date.now() ? "تاريخ التحويل لا يمكن أن يكون في المستقبل" : d.transfers.some((t) => t.reference.trim().toLowerCase() === ref.trim().toLowerCase()) ? "مرجع التحويل مستخدم مسبقا" : null;
    setErr(e); if (!e) m.mutate();
  };
  return (
    <div className="space-y-3 rounded-xl border border-border p-3" data-testid={`panel-transfers-${id}`}>
      <p className="font-bold">سجل التحويلات</p>
      <p className="text-xs text-muted-foreground">تسجيل تحويل تم خارج المنصة فقط، لا يتم تنفيذ أي تحويل بنكي من هنا.</p>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">صافي المستحقات</p><p className="font-bold" data-testid={`text-due-${id}`}>{sar(d.netDueHalalas)}</p></div>
        <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">المبالغ المحولة</p><p className="font-bold" data-testid={`text-transferred-${id}`}>{sar(d.transferredHalalas)}</p></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="المبلغ (ر.س)"><input type="number" min="0.01" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-transfer-amount" /></Field>
        <Field label="مرجع التحويل"><input dir="ltr" className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} data-testid="input-transfer-reference" /></Field>
        <Field label="تاريخ التحويل"><input type="datetime-local" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-transfer-date" /></Field>
      </div>
      {(err || m.isError) && <ErrorBox error={err ? new Error(err) : m.error} />}
      <button type="button" className={btnCls} disabled={m.isPending || d.netDueHalalas <= 0} onClick={submit} data-testid="button-record-transfer">{m.isPending ? "جار التسجيل" : "تسجيل تحويل خارجي"}</button>
      {d.transfers.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد تحويلات مسجلة.</p> : (
        <ul className="divide-y divide-border text-sm">
          {d.transfers.map((t) => <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2" data-testid={`row-transfer-${t.id}`}><span className="font-bold">{sar(t.amountHalalas)}</span><span dir="ltr" className="font-mono text-xs">{t.reference}</span><span className="text-xs text-muted-foreground">{fmtDT(t.transferredAt)}</span></li>)}
        </ul>
      )}
    </div>
  );
}

/* ---- Support center (photographer) ---- */
interface SupportReq { id: number; subject: string; message: string; status: string; admin_reply: string | null; admin_reply_at: string | null; admin_attachment_urls?: string[] | null; is_read_by_owner: boolean; created_at: string }
const SUP_STATUS: Record<string, string> = { open: "مفتوح", pending: "قيد المعالجة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلق", replied: "تم الرد" };
export function SupportCenter({ photographerId }: { photographerId: number }) {
  const qc = useQueryClient();
  const key = ["ph-support", photographerId];
  const q = useQuery({ queryKey: key, refetchInterval: 20000, queryFn: () => call<SupportReq[]>("/photography/support-requests") });
  const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  const create = useMutation({
    mutationFn: () => call("/photography/support-requests", "POST", { subject: subject.trim(), message: message.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setSubject(""); setMessage(""); },
  });
  const read = useMutation({ mutationFn: (id: number) => call(`/photography/support-requests/${id}/mark-read`, "POST"), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });
  const unread = (q.data ?? []).filter((r) => r.admin_reply && !r.is_read_by_owner).length;
  return (
    <section className="space-y-3" data-testid="section-support">
      <h3 className="font-bold">الدعم {unread > 0 && <span className="ms-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground" data-testid="badge-support-unread">{unread.toLocaleString("ar-SA")} رد جديد</span>}</h3>
      <form className={`${cardCls} space-y-3`} onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label="الموضوع"><input className={inputCls} maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-support-subject" /></Field>
        <Field label="الرسالة"><textarea rows={4} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="استفسار مالي أو قانوني أو فني" data-testid="input-support-message" /></Field>
        {create.isError && <ErrorBox error={create.error} />}
        {create.isSuccess && <Notice tone="ok">تم إرسال طلبك إلى فريق تكية</Notice>}
        <button className={btnCls} disabled={!subject.trim() || !message.trim() || create.isPending} data-testid="button-send-support">{create.isPending ? "جار الإرسال" : "إرسال الطلب"}</button>
      </form>
      {q.isLoading ? <Skel n={2} /> : q.isError ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? <Empty title="لا توجد طلبات دعم" text="أرسل أول طلب وسيصلك رد الفريق هنا." /> : (q.data ?? []).map((r) => {
        const isNew = !!r.admin_reply && !r.is_read_by_owner;
        const urls = r.admin_attachment_urls ?? [];
        return (
          <article key={r.id} className={`${cardCls} space-y-2 ${isNew ? "border-primary" : ""}`} data-testid={`card-support-${r.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{r.subject}</p><span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">{SUP_STATUS[r.status] ?? r.status}</span></div>
            <p className="whitespace-pre-wrap text-sm">{r.message}</p>
            <p className="text-xs text-muted-foreground">{fmtDT(r.created_at)}</p>
            {r.admin_reply && (
              <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
                <p className="text-xs font-bold">رد فريق تكية{r.admin_reply_at ? ` - ${fmtDT(r.admin_reply_at)}` : ""}</p>
                <p className="whitespace-pre-wrap text-sm">{r.admin_reply}</p>
                {urls.length > 0 && <div className="flex flex-wrap gap-2">{urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary underline" data-testid={`link-attachment-${r.id}-${i}`}>مرفق {(i + 1).toLocaleString("ar-SA")}</a>)}</div>}
                {isNew && <button type="button" className={ghostCls} disabled={read.isPending} onClick={() => read.mutate(r.id)} data-testid={`button-mark-read-${r.id}`}>تمت القراءة</button>}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
