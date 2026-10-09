import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OwnerEmptyState({
  onAdd,
  requestsOpen = false,
}: {
  onAdd: () => void;
  requestsOpen?: boolean;
}) {
  return (
    <section className="flex min-h-[55vh] items-center justify-center py-10" aria-labelledby="owner-empty-title" data-testid="owner-empty-state">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card px-5 py-10 text-center shadow-sm sm:px-10 sm:py-12">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/10 bg-primary/5 text-primary/60" aria-hidden="true">
          <Building2 className="h-9 w-9" strokeWidth={1.4} />
        </div>
        <h2 id="owner-empty-title" className="text-xl font-bold leading-relaxed text-foreground sm:text-2xl">
          لا توجد عقارات أو خدمات مضافة بعد
        </h2>
        {requestsOpen && <p role="status" className="mt-3 text-sm text-muted-foreground">لا توجد طلبات للمتابعة حالياً.</p>}
        <Button type="button" onClick={onAdd} data-testid="button-add-first-activity" className="mt-7 h-auto min-h-14 w-full whitespace-normal rounded-xl px-5 py-4 text-base font-bold leading-relaxed shadow-sm sm:text-lg">
          + أضف عقارك أو خدمتك الأولى الآن
        </Button>
      </div>
    </section>
  );
}
