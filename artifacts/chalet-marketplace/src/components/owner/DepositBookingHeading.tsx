import { Clock, Lock } from "lucide-react";
import { reportDualDate } from "@/lib/bookingArchiveReport";
import { insuranceCheckoutTime } from "@/lib/insuranceReport";

export function DepositBookingHeading({ id, checkoutAt, ready, settled }: {
  id: number; checkoutAt?: string | null; ready: boolean; settled: boolean;
}) {
  const hasCheckout = !!checkoutAt && Number.isFinite(Date.parse(checkoutAt));
  return <header className="space-y-1.5 rounded-xl border border-border bg-background/80 p-3 text-sm" data-testid={`insurance-booking-${id}`}>
    <p className="font-bold text-foreground">رقم الحجز: <span dir="ltr">#{id.toLocaleString("ar-SA", { useGrouping: false })}</span></p>
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span><strong>موعد الخروج:</strong> {hasCheckout ? <>
        {reportDualDate(checkoutAt!, "hijri")} — الساعة <strong className="text-foreground">{insuranceCheckoutTime(checkoutAt)}</strong> (بتوقيت السعودية)
      </> : "غير متاح — اتخاذ القرار مقفل حتى التحقق من الموعد"}</span>
    </p>
    {!settled && <p className={`flex items-start gap-1.5 text-xs font-medium ${ready ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
      {!ready && <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {ready ? "حلّ موعد الخروج؛ يمكن اتخاذ قرار التأمين." : "إعادة التأمين أو الخصم مقفلان حتى اكتمال موعد الخروج."}
    </p>}
  </header>;
}
