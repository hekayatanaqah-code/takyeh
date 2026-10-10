import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus, RotateCcw, ToggleRight, ToggleLeft, Clock } from "lucide-react";
import { call, Field, inputCls, btnCls, ghostCls, cardCls, Skel, ErrorBox, Empty, Notice } from "../photography/shared";
import PhotographyAdmin from "../photography/PhotographyAdmin";
import { ICONS, ICON_AR, STATE_AR, isSafeUrl, type OwnerService, type ServiceIcon, type ServiceState } from "./types";
import { cn } from "@/lib/utils";

interface AdminList { services: OwnerService[]; readiness: { payment: boolean; whatsapp: boolean } }
const KEY = ["admin-owner-services"];
const STATES: ServiceState[] = ["available", "coming_soon", "hidden"];
const STATE_ICONS = { available: ToggleRight, coming_soon: Clock, hidden: ToggleLeft };
const serviceInputCls = cn(inputCls, "bg-white text-slate-900 placeholder:text-slate-500");
const iconButtonCls = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
function refreshServices(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [KEY, ["owner-services"], ["ph-admin"], ["ph-owner-catalog"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

function ServiceForm({ svc, onDone }: { svc?: OwnerService; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(svc?.title ?? "");
  const [description, setDesc] = useState(svc?.description ?? "");
  const [icon, setIcon] = useState<ServiceIcon>(svc?.icon ?? "briefcase");
  const [state, setState] = useState<ServiceState>(svc?.state ?? "coming_soon");
  const [url, setUrl] = useState(svc?.actionUrl ?? "");
  const isLink = (svc?.kind ?? "link") === "link";
  const m = useMutation({
    mutationFn: () => {
      const actionUrl = isLink && url.trim() ? url.trim() : null;
      const body = { title: title.trim(), description: description.trim(), icon, state, actionUrl };
      return svc ? call<OwnerService>(`/admin/owner-services/${svc.id}`, "PATCH", body)
        : call<OwnerService>("/admin/owner-services", "POST", { ...body, kind: "link" });
    },
    onSuccess: () => { refreshServices(qc); onDone(); },
  });
  const urlErr = isLink && url.trim() && !isSafeUrl(url) ? "استخدم رابط https أو مسارا داخليا يبدأ بـ /" :
    isLink && state === "available" && !url.trim() ? "يلزم رابط طلب لإتاحة الخدمة" : null;
  const bad = !title.trim() || !!urlErr;
  return (
    <form className={`${cardCls} space-y-3`} onSubmit={(e) => { e.preventDefault(); if (!bad) m.mutate(); }} data-testid="form-service">
      <h3 className="font-bold">{svc ? "تعديل البطاقة" : "بطاقة خدمة جديدة"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="العنوان"><input className={serviceInputCls} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-service-title" /></Field>
        <Field label="الأيقونة">
          <select className={serviceInputCls} value={icon} onChange={(e) => setIcon(e.target.value as ServiceIcon)} data-testid="select-service-icon">
            {(Object.keys(ICONS) as ServiceIcon[]).map((k) => <option key={k} value={k}>{ICON_AR[k]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="الوصف"><textarea className={serviceInputCls} rows={2} value={description} onChange={(e) => setDesc(e.target.value)} data-testid="input-service-description" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الحالة">
          <select className={serviceInputCls} value={state} onChange={(e) => setState(e.target.value as ServiceState)} data-testid="select-service-state">
            {STATES.map((s) => <option key={s} value={s}>{STATE_AR[s]}</option>)}
          </select>
        </Field>
        {isLink && <Field label="رابط الطلب" hint="https://... أو /مسار داخل المنصة"><input dir="ltr" className={serviceInputCls} value={url} onChange={(e) => setUrl(e.target.value)} data-testid="input-service-url" /></Field>}
      </div>
      {urlErr && <p className="text-sm font-semibold text-destructive" role="alert">{urlErr}</p>}
      {m.isError && <ErrorBox error={m.error} />}
      <div className="flex gap-2">
        <button className={btnCls} disabled={bad || m.isPending} data-testid="button-save-service">{m.isPending ? "جار الحفظ" : "حفظ"}</button>
        <button type="button" className={ghostCls} onClick={onDone}>إلغاء</button>
      </div>
    </form>
  );
}

function Row({ s, i, n, onMove, moving, onEdit }: { s: OwnerService; i: number; n: number; onMove: (i: number, d: -1 | 1) => void; moving: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const Icon = ICONS[s.icon] ?? ICONS.briefcase;
  const st = useMutation({
    mutationFn: (state: ServiceState) => call<OwnerService>(`/admin/owner-services/${s.id}`, "PATCH", { state }),
    onSettled: () => refreshServices(qc),
  });
  const del = useMutation({
    mutationFn: () => call<{ ok: true }>(`/admin/owner-services/${s.id}`, "DELETE"),
    onSuccess: () => { setConfirm(false); refreshServices(qc); },
  });
  return (
    <li className={cardCls} data-testid={`row-service-${s.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <button className="rounded-lg border border-border p-1 disabled:opacity-40" disabled={i === 0 || moving} onClick={() => onMove(i, -1)} aria-label={`نقل ${s.title} للأعلى`} data-testid={`button-up-${s.id}`}><ArrowUp className="h-4 w-4" /></button>
          <button className="rounded-lg border border-border p-1 disabled:opacity-40" disabled={i === n - 1 || moving} onClick={() => onMove(i, 1)} aria-label={`نقل ${s.title} للأسفل`} data-testid={`button-down-${s.id}`}><ArrowDown className="h-4 w-4" /></button>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{s.title} <span className="text-xs font-normal text-muted-foreground">({s.kind === "photography" ? "التصوير" : "رابط"})</span></p>
          {s.description && <p className="truncate text-sm text-muted-foreground">{s.description}</p>}
        </div>
        <div role="radiogroup" aria-label={`حالة ${s.title}`} className="inline-flex overflow-hidden rounded-xl border border-border">
          {STATES.map((x) => {
            const StateIcon = STATE_ICONS[x];
            return (
            <button key={x} role="radio" aria-checked={s.state === x} disabled={st.isPending}
              onClick={() => s.state !== x && st.mutate(x)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${s.state === x ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
              data-testid={`button-state-${x}-${s.id}`}><StateIcon className="h-5 w-5 shrink-0" aria-hidden="true" />{STATE_AR[x]}</button>
            );
          })}
        </div>
        <button type="button" className={`${iconButtonCls} text-foreground`} onClick={onEdit} title="تعديل البطاقة" aria-label={`تعديل ${s.title}`} data-testid={`button-edit-${s.id}`}><Pencil className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden="true" /></button>
        <button type="button" className={`${iconButtonCls} text-red-600`} onClick={() => setConfirm(true)} title="حذف البطاقة" aria-label={`حذف ${s.title}`} data-testid={`button-delete-${s.id}`}><Trash2 className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden="true" /></button>
      </div>
      {st.isError && <div className="mt-3"><ErrorBox error={st.error} /></div>}
      {confirm && (
        <div className="mt-3 space-y-2">
          <Notice tone="warn">سيتم إزالة البطاقة من قائمة الخدمات.{s.kind === "photography" ? " تبقى حجوزات التصوير وسجلها محفوظة ويمكن استعادة البطاقة لاحقا." : ""}</Notice>
          {del.isError && <ErrorBox error={del.error} />}
          <div className="flex gap-2">
            <button className={btnCls} disabled={del.isPending} onClick={() => del.mutate()} data-testid={`button-confirm-delete-${s.id}`}>{del.isPending ? "جار الحذف" : "تأكيد الحذف"}</button>
            <button className={ghostCls} onClick={() => setConfirm(false)}>إلغاء</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function OwnerServicesAdmin() {
  const qc = useQueryClient();
  const [section, setSection] = useState<"cards" | "photography">("cards");
  const [editing, setEditing] = useState<OwnerService | "new" | null>(null);
  const q = useQuery({ queryKey: KEY, queryFn: () => call<AdminList>("/admin/owner-services"), refetchInterval: 30000 });
  const order = useMutation({
    mutationFn: (ids: number[]) => call<{ services: OwnerService[] }>("/admin/owner-services/order", "PUT", { ids }),
    onSuccess: (r) => qc.setQueryData<AdminList>(KEY, (o) => (o ? { ...o, services: r.services } : o)),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const restore = useMutation({
    mutationFn: () => call<OwnerService>("/admin/owner-services", "POST", { title: "التصوير والتوثيق الاحترافي", description: "جلسات تصوير احترافية لعقارك أو خدمتك ونشاطك مع مصورين معتمدين.", icon: "camera", kind: "photography", state: "coming_soon", actionUrl: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const tabs = (
    <div role="tablist" className="inline-flex rounded-xl border border-border bg-card p-1">
      {([["cards", "بطاقات الخدمات"], ["photography", "إدارة التصوير"]] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={section === k} onClick={() => setSection(k)}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${section === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} data-testid={`tab-services-${k}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5 text-foreground" dir="rtl" data-testid="owner-services-admin">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">خدمات الملاك</h2><p className="text-sm text-muted-foreground">خدمات إضافية لملاك العقارات والخدمات والأنشطة، منفصلة عن التشغيل اليومي.</p></div>
        {tabs}
      </header>
      {section === "photography" ? <PhotographyAdmin /> : q.isLoading ? <Skel /> : q.isError || !q.data ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (() => {
        const list = [...q.data.services].sort((a, b) => a.sortOrder - b.sortOrder);
        const hasPhoto = list.some((s) => s.kind === "photography");
        const move = (i: number, d: -1 | 1) => {
          const ids = list.map((s) => s.id); const j = i + d;
          [ids[i], ids[j]] = [ids[j], ids[i]]; order.mutate(ids);
        };
        return (
          <>
            <p className="text-xs">الدفع: {q.data.readiness.payment ? "جاهز" : "غير جاهز"} - واتساب: {q.data.readiness.whatsapp ? "جاهز" : "غير جاهز"}
              {(!q.data.readiness.payment || !q.data.readiness.whatsapp) && <span className="text-muted-foreground"> (لا يمكن إتاحة التصوير قبل الجاهزية)</span>}</p>
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} onClick={() => setEditing("new")} data-testid="button-new-service"><Plus className="h-4 w-4" aria-hidden /> بطاقة جديدة</button>
              {!hasPhoto && <button className={ghostCls} disabled={restore.isPending} onClick={() => restore.mutate()} data-testid="button-restore-photography"><RotateCcw className="h-4 w-4" aria-hidden /> استعادة بطاقة التصوير</button>}
            </div>
            {restore.isError && <ErrorBox error={restore.error} />}
            {order.isError && <ErrorBox error={order.error} />}
            {editing && <ServiceForm key={editing === "new" ? "n" : editing.id} svc={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
            {list.length === 0 ? <Empty title="لا توجد بطاقات خدمات" text="أنشئ بطاقة لتظهر للملاك." /> : (
              <ul className="space-y-3">
                {list.map((s, i) => <Row key={s.id} s={s} i={i} n={list.length} onMove={move} moving={order.isPending} onEdit={() => setEditing(s)} />)}
              </ul>
            )}
          </>
        );
      })()}
    </div>
  );
}
