import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activityKey, type DashboardActivity } from "@/lib/dashboardActivity";
import { loneFinancialReportActivity } from "@/lib/financialReportActivity";

export type ReportProperty = { id: number; submissionId?: number | null; nameAr?: string | null };
export type ReportService = { id: number; businessName?: string | null };

export function FinancialReportActivitySelect({ value, properties, services, onChange, loading, error }: {
  value: DashboardActivity;
  properties: ReportProperty[];
  services: ReportService[];
  onChange: (activity: DashboardActivity) => void;
  loading?: boolean;
  error?: boolean;
}) {
  const loneActivity = loneFinancialReportActivity(properties, services);
  if (loneActivity && loneActivity.type !== "all" && !error) {
    return <div className="flex flex-col gap-2">
      <span id="financial-report-activity-label" className="text-sm font-semibold">النشاط المالي</span>
      <div aria-labelledby="financial-report-activity-label" data-testid="financial-report-activity-fixed"
        className="flex min-h-10 w-full items-center rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium sm:w-80">
        {loneActivity.name}
      </div>
    </div>;
  }
  return <div className="flex flex-col gap-2">
    <label htmlFor="financial-report-activity" className="text-sm font-semibold">النشاط المالي</label>
    <Select dir="rtl" value={activityKey(value)} disabled={loading || error} onValueChange={key => {
      if (key === "all") return onChange({ type: "all" });
      const property = properties.find(item => `chalet-${item.id}` === key);
      if (property?.submissionId != null) return onChange({ type: "chalet", id: property.id, submissionId: property.submissionId, name: property.nameAr || "عقار" });
      const service = services.find(item => `service-${item.id}` === key);
      if (service) onChange({ type: "service", id: service.id, name: service.businessName || "خدمة" });
    }}>
      <SelectTrigger id="financial-report-activity" data-testid="financial-report-activity" className="h-10 w-full sm:w-80 text-right">
        <SelectValue placeholder={loading ? "جارٍ تحميل الأنشطة…" : "جميع الأنشطة"} />
      </SelectTrigger>
      <SelectContent dir="rtl">
        <SelectItem value="all">جميع الأنشطة</SelectItem>
        {properties.some(item => item.submissionId != null) && <SelectGroup>
          <SelectLabel>الشاليهات والعقارات</SelectLabel>
          {properties.filter(item => item.submissionId != null).map(item => <SelectItem key={`chalet-${item.id}`} value={`chalet-${item.id}`}>{item.nameAr || `عقار ${item.id}`}</SelectItem>)}
        </SelectGroup>}
        {!!services.length && <SelectGroup>
          <SelectLabel>الخدمات</SelectLabel>
          {services.map(item => <SelectItem key={`service-${item.id}`} value={`service-${item.id}`}>{item.businessName || `خدمة ${item.id}`}</SelectItem>)}
        </SelectGroup>}
      </SelectContent>
    </Select>
    {error && <p role="alert" className="text-xs text-destructive">تعذّر تحميل الأنشطة. أعد تحميل الصفحة للمحاولة مجددًا.</p>}
  </div>;
}
