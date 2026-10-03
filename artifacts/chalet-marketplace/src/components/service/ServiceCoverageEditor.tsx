import { useMemo, useState } from "react";
import { Check, Plus, RefreshCw, Search, X, Globe2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toAr } from "@/lib/utils";

export const NATIONAL_COVERAGE = "جميع مناطق المملكة";

export interface CoverageRegion { id: number; name: string }
export interface CoverageCity { id: number; name: string; regionId: number }

export interface ServiceCoverageEditorProps {
  regions: CoverageRegion[];
  cities: CoverageCity[];
  value: string[];
  onChange: (value: string[]) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function ServiceCoverageEditor({ regions, cities, value, onChange, loading, error, onRetry }: ServiceCoverageEditorProps) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [other, setOther] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);

  const national = value.includes(NATIONAL_COVERAGE);
  const selected = useMemo(() => new Set(value.map(norm)), [value]);
  const isSel = (name: string) => selected.has(norm(name));

  const byRegion = useMemo(() => {
    const m = new Map<number, CoverageCity[]>();
    cities.forEach(c => m.set(c.regionId, [...(m.get(c.regionId) ?? []), c]));
    return m;
  }, [cities]);
  const catalogNames = useMemo(() => new Set(cities.map(c => norm(c.name))), [cities]);

  const extras = value.filter(v => v !== NATIONAL_COVERAGE && !catalogNames.has(norm(v)));
  const cityCount = value.filter(v => v !== NATIONAL_COVERAGE).length;

  const withoutNational = () => value.filter(v => v !== NATIONAL_COVERAGE);
  const toggleNational = () => onChange(national ? [] : [NATIONAL_COVERAGE]);

  const regionNames = (id: number) => (byRegion.get(id) ?? []).map(c => c.name);
  const regionSelectedCount = (id: number) => regionNames(id).filter(isSel).length;

  const setRegionAll = (id: number, on: boolean) => {
    const names = regionNames(id);
    if (names.length === 0) return;
    const keys = new Set(names.map(norm));
    const rest = withoutNational().filter(v => !keys.has(norm(v)));
    onChange(on ? [...rest, ...names] : rest);
  };
  const toggleCity = (name: string) => {
    const base = withoutNational();
    onChange(isSel(name) ? base.filter(v => norm(v) !== norm(name)) : [...base, name]);
  };
  const removeValue = (name: string) => onChange(value.filter(v => v !== name));
  const addOther = () => {
    const t = other.trim().replace(/\s+/g, " ");
    if (!t) return;
    const catalogMatch = cities.find(c => norm(c.name) === norm(t));
    const name = catalogMatch ? catalogMatch.name : t;
    if (!isSel(name)) onChange([...withoutNational(), name]);
    setOther("");
  };

  const open = regions.find(r => r.id === openId) ?? null;
  const openCities = open ? byRegion.get(open.id) ?? [] : [];
  const q = norm(search);
  const shown = q ? openCities.filter(c => norm(c.name).includes(q)) : openCities;
  const openCount = open ? regionSelectedCount(open.id) : 0;
  const openAll = openCities.length > 0 && openCount === openCities.length;

  const regionSummary = regions
    .map(r => ({ r, n: regionSelectedCount(r.id), t: regionNames(r.id).length }))
    .filter(x => x.n > 0);

  return (
    <div className="space-y-3" dir="rtl" data-testid="service-coverage-editor">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold text-foreground">نطاق التغطية الجغرافية</span>
        <button type="button" onClick={() => onChange([])} disabled={value.length === 0}
          data-testid="button-coverage-clear"
          className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50">
          مسح كل الاختيارات
        </button>
      </div>

      <button type="button" role="checkbox" aria-checked={national} onClick={toggleNational}
        data-testid="checkbox-coverage-national"
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border text-right transition-colors ${national ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary"}`}>
        <Globe2 className="w-4 h-4 shrink-0" />
        <span className="flex-1">كافة مناطق المملكة</span>
        {national && <Check className="w-4 h-4" />}
      </button>

      {loading && (
        <div className="space-y-2" aria-live="polite" data-testid="status-coverage-loading">
          <p className="text-xs text-muted-foreground">جارٍ تحميل المناطق والمدن… اختياراتك المحفوظة محفوظة كما هي.</p>
          <div className="flex gap-2 flex-wrap">{[0, 1, 2, 3].map(i => <div key={i} className="h-8 w-24 rounded-full bg-muted animate-pulse" />)}</div>
        </div>
      )}
      {!loading && error && (
        <div role="alert" className="flex items-center justify-between gap-2 flex-wrap rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2" data-testid="status-coverage-error">
          <p className="text-xs text-destructive">تعذر تحميل المناطق والمدن. اختياراتك المحفوظة لم تتأثر.</p>
          <button type="button" onClick={onRetry} data-testid="button-coverage-retry"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <RefreshCw className="w-3.5 h-3.5" />إعادة المحاولة
          </button>
        </div>
      )}

      <div className={national ? "opacity-50" : ""} aria-disabled={national}>
        {!loading && !error && regions.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor="service-coverage-region">المنطقة الإدارية</label>
            <select id="service-coverage-region" aria-label="المنطقة الإدارية للتغطية" disabled={national}
              value={open?.id ?? ""} onChange={event => { setOpenId(event.target.value ? Number(event.target.value) : null); setSearch(""); }}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-right focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">اختر منطقة لتحديد جميع مدنها أو مدن محددة</option>
              {regions.map(region => {
                const count = regionSelectedCount(region.id);
                const total = regionNames(region.id).length;
                return <option key={region.id} value={region.id}>{region.name}{count > 0 ? ` — محدد ${toAr(count)} من ${toAr(total)}` : total === 0 ? " — لا مدن" : ""}</option>;
              })}
            </select>
            <p className="text-xs text-muted-foreground">يمكنك اختيار مدن من عدة مناطق؛ تغيير المنطقة هنا لا يلغي اختيارات المناطق الأخرى.</p>
          </div>
        )}

        {!loading && !error && open && (
          <div className="mt-3 rounded-xl border border-border bg-muted p-3 space-y-3" data-testid={`panel-region-${open.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-foreground">{open.name}</h4>
              <span className="text-xs text-muted-foreground">{toAr(openCount)} من {toAr(openCities.length)} مدينة</span>
            </div>
            {openCities.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا توجد مدن مسجلة لهذه المنطقة. يمكنك إضافة مدينة عبر خيار أخرى.</p>
            ) : (
              <>
                <button type="button" role="checkbox" aria-checked={openAll ? true : openCount > 0 ? "mixed" : false}
                  disabled={national} onClick={() => setRegionAll(open.id, !openAll)}
                  data-testid={`checkbox-region-all-${open.id}`}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs font-semibold text-right">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center ${openCount > 0 ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                    {openAll ? <Check className="w-3 h-3" /> : openCount > 0 ? <span className="w-2 h-0.5 bg-current" /> : null}
                  </span>
                  جميع مدن {open.name}
                </button>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} disabled={national}
                    placeholder={`ابحث في مدن ${open.name}`} aria-label={`البحث في مدن ${open.name}`}
                    data-testid="input-coverage-search" className="rounded-lg pr-9 bg-background" />
                </div>
                <div role="group" aria-label={`مدن ${open.name}`} className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                  {shown.map(c => {
                    const on = isSel(c.name);
                    return (
                      <button key={c.id} type="button" role="checkbox" aria-checked={on} disabled={national}
                        onClick={() => toggleCity(c.name)} data-testid={`checkbox-city-${c.id}`}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-right transition-colors ${on ? "bg-primary/10 border-primary text-foreground" : "bg-background border-border text-muted-foreground hover:border-primary"}`}>
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                          {on && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                  {shown.length === 0 && <p className="col-span-full text-xs text-muted-foreground">لا توجد مدن مطابقة.</p>}
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-3">
          <button type="button" aria-pressed={otherOpen} aria-expanded={otherOpen} disabled={national}
            onClick={() => setOtherOpen(o => !o)} data-testid="button-coverage-other"
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${otherOpen ? "border-primary ring-1 ring-primary" : "border-border"} bg-background text-muted-foreground`}>
            أخرى
          </button>
          {otherOpen && (
            <div className="mt-2 flex gap-2">
              <Input value={other} onChange={e => setOther(e.target.value)} disabled={national}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }}
                placeholder="اكتب اسم مدينة غير موجودة في القائمة" aria-label="إضافة مدينة أخرى"
                data-testid="input-coverage-other" className="rounded-xl" />
              <button type="button" onClick={addOther} disabled={national || !other.trim()}
                data-testid="button-coverage-other-add" aria-label="إضافة المدينة"
                className="flex items-center gap-1 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />إضافة
              </button>
              {other && (
                <button type="button" onClick={() => setOther("")} aria-label="مسح النص"
                  data-testid="button-coverage-other-clear" className="px-2 rounded-xl border border-border text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {extras.length > 0 && (
        <div className="space-y-1.5" data-testid="list-coverage-extras">
          <p className="text-xs font-semibold text-foreground">مدن مضافة أو غير موجودة في القائمة الحالية</p>
          <div className="flex flex-wrap gap-2">
            {extras.map(name => (
              <span key={name} className={`flex items-center gap-1 ps-3 pe-1.5 py-1 rounded-full text-xs font-semibold bg-primary/10 border border-primary/40 text-foreground ${national ? "opacity-50" : ""}`}>
                {name}
                <button type="button" onClick={() => removeValue(name)} aria-label={`إزالة ${name}`}
                  className="p-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground space-y-1" aria-live="polite" data-testid="text-coverage-summary">
        {national ? (
          <p className="font-semibold text-foreground">نطاق التغطية: كافة مناطق المملكة. اختيار المدن معطّل.</p>
        ) : cityCount === 0 ? (
          <p>لم تحدد أي نطاق بعد.</p>
        ) : (
          <>
            <p className="font-semibold text-foreground">المحدد: {toAr(cityCount)} مدينة</p>
            <p>
              {regionSummary.map(x => `${x.r.name}: ${x.n === x.t ? "الكل" : toAr(x.n)}`).join(" · ")}
              {extras.length > 0 && `${regionSummary.length ? " · " : ""}أخرى: ${toAr(extras.length)}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ServiceCoverageEditor;
