import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { inputCls, ghostCls, StatusPill, Empty, type Photographer } from "./shared";

type Tab = "all" | "pending" | "approved" | "invited";
const TABS: [Tab, string][] = [["all", "الكل"], ["pending", "قيد المراجعة"], ["approved", "نشط"], ["invited", "بانتظار التسجيل"]];
const SIZES = [10, 20, 50];

export const normDigits = (s: string) => (s ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
const phoneForms = (w: string) => { const d = normDigits(w).replace(/\D/g, ""); return d.startsWith("966") ? [d, "0" + d.slice(3)] : [d]; };
const localPhone = (w: string) => { const f = phoneForms(w); return (f[1] ?? f[0] ?? w).replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[Number(c)]); };

export function PhotographersTable({ rows, renderPanel }: { rows: Photographer[]; renderPanel: (p: Photographer, close: () => void) => ReactNode }) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const counts = useMemo(() => ({ all: rows.length, pending: rows.filter((r) => r.status === "pending").length, approved: rows.filter((r) => r.status === "approved").length, invited: rows.filter((r) => r.status === "invited").length }), [rows]);
  const filtered = useMemo(() => {
    const q = normDigits(query).trim().toLowerCase(); const qd = q.replace(/\D/g, "");
    return rows.filter((r) => (tab === "all" || r.status === tab) && (!q
      || normDigits(r.name).toLowerCase().includes(q) || (r.cityName ?? "").toLowerCase().includes(q)
      || (qd.length > 0 && qd.length === q.replace(/[\s+-]/g, "").length && phoneForms(r.whatsapp).some((f) => f.includes(qd)))));
  }, [rows, tab, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  useEffect(() => { setPage(1); }, [tab, query, size]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * size, cur * size);
  const ar = (n: number) => n.toLocaleString("ar-SA");
  return (
    <div className="space-y-3" data-testid="table-photographers">
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted p-1">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-photographers-${k}`}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === k ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {l}<span className="rounded-full bg-background px-2 text-xs" data-testid={`count-photographers-${k}`}>{ar(counts[k])}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className={`${inputCls} min-w-0 flex-1 sm:max-w-sm`} placeholder="بحث بالاسم أو الجوال أو المدينة" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-search-photographers" />
        <label className="flex items-center gap-2 text-sm">عدد الصفوف
          <select className={`${inputCls} w-auto`} value={size} onChange={(e) => setSize(Number(e.target.value))} data-testid="select-page-size">
            {SIZES.map((s) => <option key={s} value={s}>{ar(s)}</option>)}
          </select>
        </label>
      </div>
      {filtered.length === 0 ? (
        rows.length === 0 ? <Empty title="لا يوجد مصورون بعد" text="أرسل دعوة لأول مصور من نموذج الدعوة أعلاه." />
          : <Empty title="لا توجد نتائج مطابقة" text={query ? `لا يوجد مصور يطابق "${query}" في هذا التبويب.` : "لا يوجد مصورون في هذه الحالة."} />
      ) : (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted"><tr>{["الاسم", "الجوال", "المدينة", "الحالة", "الإجراء"].map((h) => <th key={h} className="p-3 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {slice.map((p) => {
                const open = openId === p.id; const invited = p.status === "invited";
                return (
                  <Fragment key={p.id}>
                    <tr className={`border-t border-border ${open ? "bg-muted/50" : ""}`} data-testid={`row-photographer-${p.id}`}>
                      <td className="p-3 font-bold">{p.name}</td>
                      <td className="p-3"><span dir="ltr" className="font-mono text-xs">{localPhone(p.whatsapp)}</span></td>
                      <td className="p-3">{p.cityName || <span className="text-muted-foreground">غير محددة</span>}</td>
                      <td className="p-3"><StatusPill s={p.status} /></td>
                      <td className="p-3">{invited ? <span className="text-xs text-muted-foreground" data-testid={`text-invited-${p.id}`}>بانتظار اكتمال التسجيل</span>
                        : <button className={`${ghostCls} px-3 py-1.5`} aria-expanded={open} onClick={() => setOpenId(open ? null : p.id)} data-testid={`button-review-${p.id}`}>{open ? "إغلاق" : "مراجعة"}</button>}</td>
                    </tr>
                    {open && !invited && <tr className="border-t border-border"><td colSpan={5} className="p-3 sm:p-4">{renderPanel(p, () => setOpenId(null))}</td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground" data-testid="text-page-range">{ar((cur - 1) * size + 1)} - {ar(Math.min(cur * size, filtered.length))} من {ar(filtered.length)}</p>
          <div className="flex items-center gap-2">
            <button className={`${ghostCls} px-3 py-1.5`} disabled={cur <= 1} onClick={() => setPage(cur - 1)} data-testid="button-page-prev">السابق</button>
            <span data-testid="text-page">صفحة {ar(cur)} من {ar(pages)}</span>
            <button className={`${ghostCls} px-3 py-1.5`} disabled={cur >= pages} onClick={() => setPage(cur + 1)} data-testid="button-page-next">التالي</button>
          </div>
        </div>
      )}
    </div>
  );
}
