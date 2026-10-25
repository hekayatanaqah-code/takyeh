import { Building2, Layers, Star } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activityKey, type DashboardActivity } from "@/lib/dashboardActivity";

export function DashboardActivitySelector({ value, properties, services, onChange }: {
  value: DashboardActivity;
  properties: { id: number; submissionId?: number | null; nameAr?: string | null }[];
  services: { id: number; businessName?: string | null }[];
  onChange: (activity: DashboardActivity) => void;
}) {
  const activityCount = properties.length + services.length;
  const singleProperty = activityCount === 1 ? properties[0] : undefined;
  const singleService = activityCount === 1 ? services[0] : undefined;
  if (activityCount === 0) return null;

  function select(key: string) {
    if (key === "all") return onChange({ type: "all" });
    const property = properties.find(p => `chalet-${p.id}` === key);
    if (property) return onChange({ type: "chalet", id: property.id, submissionId: property.submissionId ?? undefined, name: property.nameAr || "عقار" });
    const service = services.find(s => `service-${s.id}` === key);
    if (service) onChange({ type: "service", id: service.id, name: service.businessName || "خدمة" });
  }
  return <div dir="rtl" className="mt-5 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
    <span id="dashboard-activity-label" className="flex items-center gap-2 text-sm font-bold">
      <Layers className="h-4 w-4 text-primary" />العقار/النشاط الحالي
    </span>
    {activityCount === 1 ? (
      <div
        aria-labelledby="dashboard-activity-label"
        role="group"
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm font-semibold sm:w-80"
        data-testid="dashboard-single-activity"
      >
        {singleProperty ? <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> : <Star aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
        <span className="min-w-0 break-words">{singleProperty ? singleProperty.nameAr || "عقار" : singleService?.businessName || "خدمة"}</span>
      </div>
    ) : <Select dir="rtl" value={activityKey(value)} onValueChange={select}>
      <SelectTrigger id="dashboard-activity" aria-labelledby="dashboard-activity-label" className="h-11 w-full rounded-xl text-right sm:w-80" data-testid="dashboard-activity-selector">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        dir="rtl"
        position="popper"
        sideOffset={6}
        collisionPadding={12}
        className="z-[100] rounded-xl shadow-[0_8px_24px_-6px_rgba(0,0,0,0.16)]"
      >
        <SelectItem value="all"><span className="flex items-center gap-2"><Layers className="h-4 w-4" />جميع الأنشطة</span></SelectItem>
        {properties.length > 0 && <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground">العقارات</SelectLabel>
            {properties.map(p => <SelectItem key={`chalet-${p.id}`} value={`chalet-${p.id}`}><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{p.nameAr || "عقار"}</span></SelectItem>)}
          </SelectGroup>
        </>}
        {services.length > 0 && <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground">الخدمات</SelectLabel>
            {services.map(s => <SelectItem key={`service-${s.id}`} value={`service-${s.id}`}><span className="flex items-center gap-2"><Star className="h-4 w-4" />{s.businessName || "خدمة"}</span></SelectItem>)}
          </SelectGroup>
        </>}
      </SelectContent>
    </Select>}
  </div>;
}
