import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { call, btnCls, ghostCls, inputCls, ErrorBox, Notice, Skel, type Pkg, type Photographer } from "./shared";

export interface PhOptions { propertyTypes: { value: string; label: string }[]; packages: Pkg[] }
export const OPTIONS_KEY = ["ph-admin-options"] as const;
export function usePhOptions() {
  return useQuery({ queryKey: OPTIONS_KEY, queryFn: () => call<PhOptions>("/admin/photography/options"), staleTime: 60000 });
}

/** Chip-style tag input for free-form specialties. */
export function TagInput({ value, onChange, suggestions = [], testId }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; testId: string }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => { const x = t.trim(); if (x && !value.includes(x) && x.length <= 60 && value.length < 30) onChange([...value, x]); setDraft(""); };
  const rest = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <button key={t} type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="rounded-full border border-[#8C6246] bg-[#8C6246]/10 px-3 py-1 text-xs font-semibold" aria-label={`إزالة ${t}`} data-testid={`chip-${testId}-${t}`}>{t} ×</button>
        ))}
        {value.length === 0 && <span className="text-xs text-muted-foreground">لا توجد تخصصات بعد</span>}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={draft} placeholder="اكتب تخصصا ثم اضغط إضافة" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }} data-testid={`input-${testId}`} />
        <button type="button" className={ghostCls} onClick={() => add(draft)} disabled={!draft.trim()} data-testid={`button-add-${testId}`}>إضافة</button>
      </div>
      {rest.length > 0 && <div className="flex flex-wrap gap-1.5">{rest.map((s) => <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-border px-3 py-1 text-xs hover:bg-muted">+ {s}</button>)}</div>}
    </div>
  );
}

export function Chips({ items, empty, testId }: { items: string[]; empty: string; testId: string }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground" data-testid={testId}>{empty}</span>;
  return <span className="flex flex-wrap gap-1.5" data-testid={testId}>{items.map((t) => <span key={t} className="rounded-full bg-[#8C6246]/10 px-2.5 py-0.5 text-xs font-semibold text-[#6d4a33]">{t}</span>)}</span>;
}

/** Read-only current approvals, deliberately separate from signed legal terms. */
export function ApprovalsSummary({ packages, specialties, id }: { packages: string[]; specialties: string[]; id: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-emerald-600/25 bg-emerald-500/[0.05] p-3 text-sm" data-testid={`section-approvals-${id}`}>
      <p className="flex items-center gap-1.5 font-bold"><BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden /> اعتمادات الإدارة الحالية</p>
      <p className="text-xs text-muted-foreground">تحددها الإدارة تشغيليا ويمكن تحديثها، وهي منفصلة عن نص العقد الموقّع وسجل الموافقة.</p>
      <div className="space-y-1"><p className="text-xs font-semibold">الباقات المعتمدة</p><Chips items={packages} empty="لا توجد باقات معتمدة بعد" testId={`text-approved-packages-${id}`} /></div>
      <div className="space-y-1"><p className="text-xs font-semibold">التخصصات المعتمدة</p><Chips items={specialties} empty="لا توجد تخصصات معتمدة بعد" testId={`text-approved-specialties-${id}`} /></div>
    </div>
  );
}

/** Admin-only editor for approvedPackageIds / approvedSpecialties. */
export function ApprovalsEditor({ p }: { p: Photographer }) {
  const qc = useQueryClient();
  const opts = usePhOptions();
  const [edit, setEdit] = useState(false);
  const [ids, setIds] = useState<number[]>(p.approvedPackageIds ?? []);
  const [specs, setSpecs] = useState<string[]>(p.approvedSpecialties ?? []);
  const m = useMutation({
    mutationFn: () => call(`/admin/photography/photographers/${p.id}/profile`, "PATCH", { name: p.name, bio: p.bio ?? "", sessionMinutes: p.sessionMinutes, availability: p.availability ?? [], approvedPackageIds: ids, approvedSpecialties: specs }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ph-admin"] }); qc.invalidateQueries({ queryKey: ["ph-owner-catalog"] }); setEdit(false); },
  });
  const pkgs = opts.data?.packages ?? [];
  const nameOf = (id: number) => pkgs.find((x) => x.id === id)?.name ?? `باقة #${id.toLocaleString("ar-SA")}`;
  const suggestions = [...new Set(pkgs.flatMap((x) => x.specialties ?? []))];
  if (!edit) return (
    <div className="space-y-2">
      <ApprovalsSummary id={String(p.id)} packages={(p.approvedPackageIds ?? []).map(nameOf)} specialties={p.approvedSpecialties ?? []} />
      <button type="button" className={ghostCls} onClick={() => { setIds(p.approvedPackageIds ?? []); setSpecs(p.approvedSpecialties ?? []); m.reset(); setEdit(true); }} data-testid={`button-edit-approvals-${p.id}`}>تعديل الاعتمادات</button>
    </div>
  );
  return (
    <div className="space-y-3 rounded-xl border border-border p-3" data-testid={`form-approvals-${p.id}`}>
      <p className="font-bold">تعديل اعتمادات المصور</p>
      {opts.isLoading ? <Skel n={1} /> : opts.isError ? <ErrorBox error={opts.error} onRetry={() => opts.refetch()} /> : (
        <fieldset className="space-y-1.5"><legend className="text-sm font-semibold">الباقات المعتمدة</legend>
          {pkgs.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد باقات بعد.</p> : (
            <div className="grid gap-1.5 sm:grid-cols-2">{pkgs.map((x) => (
              <label key={x.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <input type="checkbox" checked={ids.includes(x.id)} onChange={(e) => setIds(e.target.checked ? [...ids, x.id] : ids.filter((i) => i !== x.id))} data-testid={`check-approve-package-${p.id}-${x.id}`} />
                <span className="flex-1">{x.name}</span>{!x.active && <span className="text-[11px] text-muted-foreground">غير مفعلة</span>}
              </label>
            ))}</div>
          )}
        </fieldset>
      )}
      <div className="space-y-1.5"><p className="text-sm font-semibold">التخصصات المعتمدة</p><TagInput value={specs} onChange={setSpecs} suggestions={suggestions} testId={`approved-specialty-${p.id}`} /></div>
      <Notice tone="warn">لا يظهر المصور للملاك في باقة ما إلا إذا كانت معتمدة له. لا يغير ذلك العقد الموقّع.</Notice>
      {m.isError && <ErrorBox error={m.error} />}
      <div className="flex gap-2">
        <button type="button" className={btnCls} disabled={m.isPending} onClick={() => m.mutate()} data-testid={`button-save-approvals-${p.id}`}>{m.isPending ? "جار الحفظ" : "حفظ الاعتمادات"}</button>
        <button type="button" className={ghostCls} disabled={m.isPending} onClick={() => setEdit(false)}>إلغاء</button>
      </div>
    </div>
  );
}
