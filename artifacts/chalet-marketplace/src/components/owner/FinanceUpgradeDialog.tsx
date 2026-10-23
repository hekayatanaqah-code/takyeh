import { CheckCircle2, LockKeyhole, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function FinanceUpgradeDialog({ open, onOpenChange, onViewPlans }: {
  open: boolean; onOpenChange: (open: boolean) => void; onViewPlans: () => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="max-w-lg rounded-2xl text-right" data-testid="finance-upgrade-dialog">
      <DialogHeader className="text-right sm:text-right">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-6 w-6" /></div>
        <DialogTitle className="text-xl">فعّل الشؤون المالية والإدارية</DialogTitle>
        <DialogDescription className="leading-7">
          إدارة عقاراتك وخدماتك متاحة وفق باقتك الحالية. للوصول إلى الأدوات المالية والإدارية، اختر باقة تشمل هذه المزايا.
        </DialogDescription>
      </DialogHeader>
      <ul className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
        {["متابعة الإيرادات والمصروفات والدفتر البنكي", "إدارة الموظفين والتقارير المالية", "عرض مالي موحّد لجميع عقاراتك وخدماتك"].map(label =>
          <li key={label} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{label}</li>)}
      </ul>
      <Button className="h-11 w-full gap-2 rounded-xl" onClick={onViewPlans}><TrendingUp className="h-4 w-4" />عرض باقات الترقية</Button>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>متابعة إدارة أنشطتي</Button>
      <p className="text-center text-xs text-muted-foreground">يمكنك مراجعة الأسعار والمزايا قبل اختيار الباقة. لن يتم الخصم بمجرد فتح هذه النافذة.</p>
    </DialogContent>
  </Dialog>;
}
