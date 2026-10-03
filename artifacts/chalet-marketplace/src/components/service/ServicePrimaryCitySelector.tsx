import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { CoverageCity, CoverageRegion } from "./ServiceCoverageEditor";

interface Props {
  value: string;
  onChange: (city: string) => void;
  regions: CoverageRegion[];
  cities: CoverageCity[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

const normalize = (name: string) => name.trim().replace(/\s+/g, " ");
const selectClass = "h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-right shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function ServicePrimaryCitySelector({ value, onChange, regions, cities, loading, error, onRetry }: Props) {
  const [chosenRegion, setChosenRegion] = useState<string | null>(null);
  const [otherMode, setOtherMode] = useState<boolean | null>(null);
  const [customDraft, setCustomDraft] = useState<string | null>(null);
  const activeCities = cities.filter(city => regions.some(region => region.id === city.regionId));
  const savedCity = activeCities.find(city => normalize(city.name) === normalize(value));
  const regionId = chosenRegion ?? (savedCity ? String(savedCity.regionId) : "");
  const isOther = otherMode ?? (!!value.trim() && !savedCity && !loading && !error);
  const regionalCities = activeCities.filter(city => String(city.regionId) === regionId)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const preserveSavedOption = !!value && !regionalCities.some(city => city.name === value);

  return (
    <div className="space-y-2" dir="rtl" data-testid="service-primary-city-selector">
      <div className="space-y-1.5">
        <label htmlFor="service-primary-region" className="text-xs font-semibold text-muted-foreground">منطقة المدينة الرئيسية</label>
        <select id="service-primary-region" aria-label="منطقة المدينة الرئيسية" className={selectClass}
          value={regionId} disabled={loading || error}
          onChange={event => {
            if (isOther) setCustomDraft(value);
            setChosenRegion(event.target.value);
            setOtherMode(false);
            onChange("");
          }}>
          <option value="">اختر المنطقة أولًا</option>
          {[...regions].sort((a, b) => a.name.localeCompare(b.name, "ar")).map(region => (
            <option key={region.id} value={region.id}>{region.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="service-primary-city" className="text-sm font-semibold text-foreground">المدينة الرئيسية</label>
        <select id="service-primary-city" aria-label="المدينة الرئيسية" className={selectClass}
          value={isOther ? "__other__" : value}
          onChange={event => {
            if (event.target.value === "__other__") {
              setOtherMode(true);
              const draft = customDraft ?? (!savedCity ? value : "");
              setCustomDraft(draft);
              onChange(draft);
            } else {
              if (isOther) setCustomDraft(value);
              setOtherMode(false);
              onChange(event.target.value);
            }
          }}>
          <option value="" disabled>{regionId ? "اختر مدينة من المنطقة" : "اختر المنطقة أولًا أو اختر أخرى"}</option>
          {preserveSavedOption && !isOther && <option value={value}>{value} — المدينة المحفوظة</option>}
          {regionalCities.map(city => <option key={city.id} value={city.name}>{city.name}</option>)}
          <option value="__other__">أخرى</option>
        </select>
      </div>
      {isOther && (
        <div className="space-y-1.5">
          <label htmlFor="service-primary-custom-city" className="text-xs font-semibold text-muted-foreground">اسم المدينة الرئيسية الأخرى</label>
          <Input id="service-primary-custom-city" aria-label="اسم المدينة الرئيسية الأخرى" dir="rtl"
            value={value} placeholder="اكتب اسم مدينتك" className="rounded-xl text-right"
            onChange={event => { setOtherMode(true); setCustomDraft(event.target.value); onChange(event.target.value); }} />
          <p className="text-xs text-muted-foreground">يمكنك كتابة أي مدينة غير موجودة في القائمة، دون اشتراط اختيار منطقة.</p>
        </div>
      )}
      {loading && <p className="text-xs text-muted-foreground" role="status">جارٍ تحميل المناطق والمدن… المدينة المحفوظة لم تتغير.</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">تعذر تحميل المناطق والمدن. يمكنك استخدام «أخرى»، أو{" "}
          <button type="button" className="underline" onClick={onRetry}>إعادة المحاولة</button>
        </p>
      )}
      {!loading && !error && regionId && regionalCities.length === 0 && (
        <p className="text-xs text-muted-foreground">لا توجد مدن متاحة لهذه المنطقة. اختر «أخرى» لإدخال مدينتك.</p>
      )}
    </div>
  );
}