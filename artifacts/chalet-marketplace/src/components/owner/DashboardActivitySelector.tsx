import { Building2, Layers, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activityKey, type DashboardActivity } from "@/lib/dashboardActivity";

export function DashboardActivitySelector({ value, properties, services, onChange }: {
  value: DashboardActivity;
  properties: { id: number; submissionId?: number | null; nameAr?: string | null }[];
  services: { id: number; businessName?: string | null }[];
  onChange: (activity: DashboardActivity) => void;
}) {
  function select(key: string) {
    if (key === "all") return onChange({ type: "all" });
    const property = properties.find(p => `chalet-${p.id}` === key);
    if (property) return onChange({ type: "chalet", id: property.id, submissionId: property.submissionId ?? undefined, name: property.nameAr || "عقار" });
    const service = services.find(s => `service-${s.id}` === key);
    if (service) onChange({ type: "service", id: service.id, name: service.businessName || "خدمة" });
  }
  return <div dir="rtl" className="mt-5 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
    <label htmlFor="dashboard-activity" className="flex items-center gap-2 text-sm font-bold">
      <Layers className="h-4 w-4 text-primary" />العقار/النشاط الحالي
    </label>
    <Select dir="rtl" value={activityKey(value)} onValueChange={select}>
      <SelectTrigger id="dashboard-activity" className="h-11 w-full rounded-xl text-right sm:w-80" data-testid="dashboard-activity-selector">
        <SelectValue />
      </SelectTrigger>
      <SelectContent dir="rtl">
        <SelectItem value="all"><span className="flex items-center gap-2"><Layers className="h-4 w-4" />جميع الأنشطة</span></SelectItem>
        {properties.map(p => <SelectItem key={`chalet-${p.id}`} value={`chalet-${p.id}`}><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{p.nameAr || "عقار"}</span></SelectItem>)}
        {services.map(s => <SelectItem key={`service-${s.id}`} value={`service-${s.id}`}><span className="flex items-center gap-2"><Star className="h-4 w-4" />{s.businessName || "خدمة"}</span></SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
