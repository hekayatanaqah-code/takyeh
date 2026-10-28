import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuickSalesSettings, useUpdateQuickSalesSettings, getGetQuickSalesSettingsQueryKey,
} from "@workspace/api-client-react";
import { Zap, AlertTriangle, RefreshCw, Lock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function qsErrText(e: unknown): string {
  const any = e as { data?: { error?: unknown; message?: unknown }; message?: unknown } | null;
  const d = any?.data;
  if (d && typeof d.error === "string" && d.error) return d.error;
  if (d && typeof d.message === "string" && d.message) return d.message;
  if (any && typeof any.message === "string" && any.message) return any.message;
  return "تعذر إتمام العملية، حاول مرة أخرى";
}

export function QuickSalesSettingsPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGetQuickSalesSettings({ query: { queryKey: getGetQuickSalesSettingsQueryKey(), staleTime: 30_000 } });
  const upd = useUpdateQuickSalesSettings();
  const enabled = q.data?.enabled ?? false;

  const toggle = (v: boolean) => {
    if (readOnly || upd.isPending) return;
    upd.mutate({ data: { enabled: v } }, {
      onSuccess: (s) => {
        qc.setQueryData(getGetQuickSalesSettingsQueryKey(), s);
        qc.invalidateQueries({ queryKey: getGetQuickSalesSettingsQueryKey() });
        toast({ title: s.enabled ? "تم تفعيل البيع السريع" : "تم إيقاف البيع السريع", description: s.enabled ? "ظهر تبويب «المبيعات المفردة» في إدارة الخدمة." : "أُخفي التبويب، والسجل السابق محفوظ والإيرادات السابقة تبقى محتسبة." });
      },
      onError: (e) => toast({ title: "لم يتم الحفظ", description: qsErrText(e), variant: "destructive" }),
    });
  };

  return (
    <section data-testid="panel-quick-sales-settings" className="rounded-2xl border border-card-border bg-card overflow-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-border bg-secondary/40">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Zap className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base">البيع السريع (المبيعات المفردة)</h3>
          <p className="text-xs text-muted-foreground">تسجيل مبيعات الكاونتر المباشرة بعيدًا عن الحجوزات والمناسبات</p>
        </div>
      </header>
      <div className="p-4 sm:p-5 space-y-4">
        {readOnly && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="status-readonly">
            <Lock className="w-3.5 h-3.5" />وضع الاطلاع فقط — التعديل غير متاح
          </div>
        )}
        {q.isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" data-testid="status-loading" />
        ) : q.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center gap-3" data-testid="status-error">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm flex-1 min-w-[12rem]">{qsErrText(q.error)}</p>
            <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching} data-testid="button-retry-settings">
              <RefreshCw className={cn("w-4 h-4 ml-1", q.isFetching && "animate-spin")} />إعادة المحاولة
            </Button>
          </div>
        ) : (
          <label className={cn("flex items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition-colors",
            enabled ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30", !readOnly && "cursor-pointer")}>
            <div>
              <p className="font-semibold text-sm">تفعيل البيع السريع</p>
              <p className="text-xs font-medium mt-1" data-testid="text-quick-sales-status">{upd.isPending ? "جارٍ حفظ الإعداد…" : enabled ? "مفعّل — التبويب ظاهر" : "موقوف — التبويب مخفي"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">يُحفظ تلقائيًا ويشمل كل أنشطة الخدمات المعتمدة في حسابك.</p>
            </div>
            <Switch checked={enabled} disabled={readOnly || upd.isPending} onCheckedChange={toggle}
              aria-label="تفعيل البيع السريع" data-testid="switch-quick-sales-enabled" />
          </label>
        )}
        <div className="flex gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground/80">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <ul className="space-y-1 list-disc pr-4">
            <li>تسجّل أنت البيعة بعد استلام المبلغ كاملًا نقدًا أو تحويلًا — لا يوجد دفع إلكتروني للعميل.</li>
            <li>التصنيف (نقد/تحويل) للحسابات فقط، ولا تنقل المنصة أي أموال.</li>
            <li>لا عقد ولا تأمين ولا حجز في التقويم.</li>
            <li>عند الإيقاف يُخفى تبويب المبيعات المفردة ويتوقف تسجيل مبيعات جديدة. السجل السابق محفوظ والإيرادات السابقة تبقى محتسبة؛ أعد التفعيل لعرض السجل.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
