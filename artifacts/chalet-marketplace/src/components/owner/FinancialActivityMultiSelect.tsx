import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { activityKey } from "@/lib/dashboardActivity";
import type { FinancialSelection } from "@/lib/financialSelection";

export function FinancialActivityMultiSelect({ activities, value, onChange, disabled }: {
  activities: NonNullable<FinancialSelection>;
  value: FinancialSelection;
  onChange: (value: FinancialSelection) => void;
  disabled?: boolean;
}) {
  const label = value === null ? "جميع الأنشطة" : value.map(activity => activity.name).join("، ");
  return <div dir="rtl" className="space-y-2 rounded-xl border border-border bg-card p-4">
    <span id="financial-selection-label" className="block text-sm font-bold">النشاط المالي</span>
    {activities.length === 1 ? <div className="rounded-lg border bg-muted/30 px-3 py-3 font-semibold">{activities[0].name}</div>
      : <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild><Button variant="outline" disabled={disabled || !activities.length}
          aria-labelledby="financial-selection-label" data-testid="financial-activity-multiselect"
          className="h-auto min-h-11 w-full justify-between gap-3 text-right sm:max-w-xl">
          <span className="min-w-0 whitespace-normal">{label || "اختر الأنشطة"}</span><ChevronDown className="h-4 w-4 shrink-0" />
        </Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-[min(90vw,32rem)] overflow-y-auto">
          <DropdownMenuLabel>يمكنك اختيار أكثر من نشاط معاً</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={value === null} onCheckedChange={() => onChange(null)}
            onSelect={event => event.preventDefault()}>جميع الأنشطة</DropdownMenuCheckboxItem>
          {(["chalet", "service"] as const).map(type => <div key={type}>
            {activities.some(activity => activity.type === type) && <>
              <DropdownMenuSeparator /><DropdownMenuLabel>{type === "chalet" ? "العقارات" : "الخدمات"}</DropdownMenuLabel>
              {activities.filter(activity => activity.type === type).map(activity => {
                const checked = value !== null && value.some(item => activityKey(item) === activityKey(activity));
                return <DropdownMenuCheckboxItem key={activityKey(activity)} checked={checked}
                  onSelect={event => event.preventDefault()} onCheckedChange={() => {
                    if (!checked) onChange([...(value ?? []), activity]);
                    else if (value && value.length > 1) onChange(value.filter(item => activityKey(item) !== activityKey(activity)));
                  }}>{activity.name}</DropdownMenuCheckboxItem>;
              })}
            </>}
          </div>)}
        </DropdownMenuContent>
      </DropdownMenu>}
    <p className="text-sm leading-7 text-foreground/80">اختر نشاطاً واحداً أو عدة أنشطة لجمع بياناتها المالية. لا يغيّر هذا الاختيار النشاط التشغيلي في أعلى اللوحة.</p>
  </div>;
}
