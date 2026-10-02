import React, { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDown, RotateCcw, Search, X } from "lucide-react";
import { normalizeCityName } from "@/lib/city-name";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export interface FilterOption {
  value: string;
  label: string;
}

export interface InventoryFilterState {
  search: string;
  regions: string[];
  cities: string[];
  categories: string[];
  statuses: string[];
  pricing: string[];
  sort: string;
}

export interface InventoryFiltersProps {
  value: InventoryFilterState;
  onChange: (next: InventoryFilterState) => void;
  options: {
    regions: FilterOption[];
    cities: FilterOption[];
    categories: FilterOption[];
    statuses: FilterOption[];
    pricing: FilterOption[];
  };
  resultCount: number;
  totalCount: number;
  scope?: string;
  pricingEnabled?: boolean;
}

const SORTS: FilterOption[] = [
  { value: "newest", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "name", label: "الاسم" },
  { value: "status", label: "الحالة" },
  { value: "pricing", label: "التسعير" },
];

const toAr = (n: number) => n.toLocaleString("ar-SA");

type ArrayKey = "regions" | "cities" | "categories" | "statuses" | "pricing";

interface MultiSelectProps {
  id: string;
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function MultiSelect({ id, label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalizeCityName(query);
    return q ? options.filter((o) => normalizeCityName(o.label).includes(q)) : options;
  }, [options, query]);

  const summary = useMemo(() => {
    if (selected.length === 0) return "الكل";
    const first = options.find((o) => o.value === selected[0])?.label ?? selected[0];
    return selected.length === 1 ? first : `${first} +${toAr(selected.length - 1)}`;
  }, [selected, options]);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  const move = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
    if (next < 0) (document.getElementById(`${id}-search`) as HTMLElement | null)?.focus();
    else items[Math.min(next, items.length - 1)]?.focus();
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${id}-trigger`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:border-amber-500 ${
            selected.length
              ? "border-amber-500/60 bg-amber-500/10 text-amber-100"
              : "border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500"
          }`}
        >
          <span className="shrink-0 text-xs text-slate-400">{label}</span>
          <span className="min-w-0 flex-1 truncate text-start font-semibold">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] border-slate-600 bg-slate-900 p-2 text-slate-200"
        onKeyDown={move}
      >
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            id={`${id}-search`}
            data-testid={`${id}-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`ابحث في ${label}`}
            aria-label={`ابحث في ${label}`}
            className="w-full rounded-md border border-slate-600 bg-slate-800 py-1.5 pe-3 ps-8 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div className="mb-1 flex items-center justify-between px-1 text-xs text-slate-400">
          <span>{selected.length ? `${toAr(selected.length)} محدد` : "لا يوجد تحديد"}</span>
          <button
            type="button"
            data-testid={`${id}-clear`}
            disabled={selected.length === 0}
            onClick={() => onChange([])}
            className="rounded px-1.5 py-0.5 hover:text-amber-400 disabled:opacity-40 disabled:hover:text-slate-400"
          >
            مسح
          </button>
        </div>
        <div
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          className="max-h-64 overflow-y-auto"
        >
          {options.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">لا توجد خيارات متاحة</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">لا توجد نتائج مطابقة للبحث</p>
          ) : (
            filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  tabIndex={0}
                  data-testid={`${id}-option-${o.value}`}
                  onClick={() => toggle(o.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(o.value);
                    }
                  }}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm focus:outline-none focus-visible:bg-slate-700 ${
                    on ? "bg-amber-500/10 text-amber-100" : "hover:bg-slate-800"
                  }`}
                >
                  <Checkbox checked={on} tabIndex={-1} aria-hidden className="pointer-events-none border-slate-500 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:text-slate-900" />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function InventoryFilters({ value, onChange, options, resultCount, totalCount, scope = "inventory", pricingEnabled = true }: InventoryFiltersProps) {
  const set = (patch: Partial<InventoryFilterState>) => onChange({ ...value, ...patch });
  const setList = (key: ArrayKey) => (next: string[]) => set({ [key]: next } as Partial<InventoryFilterState>);
  const displayedSort = !pricingEnabled && value.sort === "pricing" ? "newest" : value.sort;

  const dirty =
    value.search !== "" ||
    displayedSort !== "newest" ||
    value.regions.length + value.cities.length + value.categories.length + value.statuses.length + (pricingEnabled ? value.pricing.length : 0) > 0;

  const reset = () =>
    onChange({ search: "", regions: [], cities: [], categories: [], statuses: [], pricing: [], sort: "newest" });

  const chips = useMemo(() => {
    const groups: Array<{ key: ArrayKey; opts: FilterOption[] }> = [
      { key: "regions", opts: options.regions },
      { key: "cities", opts: options.cities },
      { key: "categories", opts: options.categories },
      { key: "statuses", opts: options.statuses },
      { key: "pricing", opts: options.pricing },
    ];
    return groups.filter(g => pricingEnabled || g.key !== "pricing").flatMap((g) =>
      value[g.key].map((v) => ({ key: g.key, v, label: g.opts.find((o) => o.value === v)?.label ?? v })),
    );
  }, [value, options, pricingEnabled]);

  const removeChip = (key: ArrayKey, v: string) => set({ [key]: value[key].filter((x) => x !== v) } as Partial<InventoryFilterState>);

  return (
    <div dir="rtl" data-testid={`${scope}-filters`} className="w-full min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            data-testid={`${scope}-filter-search`}
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="ابحث بالاسم أو اسم المالك"
            aria-label="بحث"
            className="w-full rounded-lg border border-slate-600 bg-slate-800 py-2 pe-3 ps-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus-within:border-amber-500">
          <span className="shrink-0 text-xs text-slate-400">الترتيب</span>
          <select
            data-testid={`${scope}-filter-sort`}
            value={displayedSort}
            onChange={(e) => set({ sort: e.target.value })}
            className="min-w-0 flex-1 bg-transparent font-semibold focus:outline-none"
          >
            {SORTS.filter(s => pricingEnabled || s.value !== "pricing").map((s) => (
              <option key={s.value} value={s.value} className="bg-slate-800">{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${pricingEnabled ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <MultiSelect id={`${scope}-region`} label="المنطقة" options={options.regions} selected={value.regions} onChange={setList("regions")} />
        <MultiSelect id={`${scope}-city`} label="المدينة" options={options.cities} selected={value.cities} onChange={setList("cities")} />
        <MultiSelect id={`${scope}-category`} label="الفئة" options={options.categories} selected={value.categories} onChange={setList("categories")} />
        <MultiSelect id={`${scope}-status`} label="الحالة" options={options.statuses} selected={value.statuses} onChange={setList("statuses")} />
        {pricingEnabled && <MultiSelect id={`${scope}-pricing`} label="التسعير" options={options.pricing} selected={value.pricing} onChange={setList("pricing")} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span data-testid={`${scope}-filter-count`} aria-live="polite" className="text-xs text-slate-400">
          {toAr(resultCount)} من {toAr(totalCount)} نتيجة
        </span>
        {chips.map((c) => (
          <button
            key={`${c.key}-${c.v}`}
            type="button"
            data-testid={`${scope}-chip-${c.key}-${c.v}`}
            onClick={() => removeChip(c.key, c.v)}
            aria-label={`إزالة ${c.label}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-500/20"
          >
            <span className="truncate">{c.label}</span>
            <X className="h-3 w-3 shrink-0" />
          </button>
        ))}
        <button
          type="button"
          data-testid={`${scope}-filter-reset`}
          disabled={!dirty}
          onClick={reset}
          className="me-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-40 disabled:hover:border-slate-600 disabled:hover:text-slate-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          إعادة ضبط الكل
        </button>
      </div>

      {resultCount === 0 && (
        <p data-testid={`${scope}-filter-empty`} className="rounded-lg border border-dashed border-slate-600 px-3 py-4 text-center text-sm text-slate-400">
          لا توجد نتائج مطابقة. عدّل الفلاتر أو أعد ضبطها.
        </p>
      )}
    </div>
  );
}

export default InventoryFilters;
