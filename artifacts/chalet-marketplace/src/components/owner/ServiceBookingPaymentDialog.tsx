import { useEffect, useState } from "react";
import { Loader2, Banknote, Landmark, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { serviceReceiptMoney, servicePaymentMethodLabel } from "@/lib/serviceReceipt";

/** Converts Eastern Arabic / Persian digits and Arabic decimal separator to a plain decimal string. */
export function normalizePaymentAmountInput(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٫,]/g, ".");
}

/** Returns an error message, or null when amount is a positive decimal (max 2dp) within remaining. */
export function validateAdditionalPayment(amount: string, remaining: number): string | null {
  if (!amount) return "أدخل المبلغ المستلم";
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return "المبلغ يقبل منزلتين عشريتين كحد أقصى";
  const value = Number(amount);
  if (!(value > 0)) return "المبلغ يجب أن يكون أكبر من صفر";
  if (Math.round(value * 100) > Math.round(remaining * 100)) return "المبلغ أكبر من المتبقي على الحجز";
  return null;
}

const toArDigits = (v: string) => v.replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

export function ServiceBookingPaymentDialog({
  appointment,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  appointment: any | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (amount: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { setAmount(""); setTouched(false); }, [appointment?.id]);
  if (!appointment) return null;

  const total = Number(appointment.amount ?? 0);
  const paid = Number(appointment.deposit ?? 0);
  const remaining = Math.max(0, total - paid);
  const method = appointment.paymentMethod || "cash";
  const isCash = method === "cash";
  const deposited = !!appointment.cashDeposited;
  const validation = validateAdditionalPayment(amount, remaining);
  const after = validation ? null : paid + Number(amount);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent dir="rtl" className="w-[94vw] max-w-md rounded-2xl">
        <DialogHeader className="text-right">
          <DialogTitle>إضافة دفعة — {appointment.clientName}</DialogTitle>
          <DialogDescription className="text-right">
            يُضاف المبلغ إلى المدفوع سابقاً على نفس طريقة الدفع المسجلة للحجز. هذا تسجيل فقط ولا يتم أي تحويل فعلي للأموال.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-2.5 text-center text-xs">
          <div><p className="text-[10px] text-muted-foreground">الإجمالي</p><p className="font-bold">{serviceReceiptMoney(total)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">المدفوع</p><p className="font-bold text-green-600">{serviceReceiptMoney(paid)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">المتبقي</p><p className="font-bold text-amber-600">{serviceReceiptMoney(remaining)}</p></div>
        </div>

        <div className={`rounded-lg border px-3 py-2.5 text-xs space-y-1 ${isCash ? (deposited ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300" : "border-orange-200 bg-orange-50 text-orange-800 dark:bg-orange-950/20 dark:border-orange-900 dark:text-orange-300") : "border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-300"}`} data-testid="text-payment-method-lock">
          <p className="font-bold flex items-center gap-1.5">
            {isCash ? <Banknote className="w-3.5 h-3.5" /> : <Landmark className="w-3.5 h-3.5" />}
            طريقة الدفع: {servicePaymentMethodLabel(method)}
            {isCash && <span className="font-semibold">— {deposited ? "مودع في البنك" : "نقد غير مودع"}</span>}
          </p>
          <p>تُطبَّق نفس الطريقة وحالة الإيداع على المبلغ الإضافي. لا يدعم الحجز تقسيم الدفعات على طرق مختلفة.</p>
          {isCash && deposited && (
            <p className="font-bold flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />سجّل فقط مبلغاً نقدياً تم إيداعه فعلاً في البنك، لأن الحجز مسجل كمودع بالكامل.</p>
          )}
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold">المبلغ المستلم الآن</span>
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={toArDigits(amount)}
            disabled={submitting}
            onChange={(e) => { setAmount(normalizePaymentAmountInput(e.target.value)); setTouched(true); }}
            placeholder={`حتى ${toArDigits(String(remaining))}`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-center text-sm font-bold"
            data-testid="input-service-payment-amount"
          />
          {touched && validation && <span className="block text-[11px] text-destructive">{validation}</span>}
          {after !== null && <span className="block text-[11px] text-muted-foreground">المدفوع بعد الإضافة: {serviceReceiptMoney(after)} — المتبقي: {serviceReceiptMoney(Math.max(0, total - after))}</span>}
        </label>

        {error && <p className="rounded-lg bg-destructive/10 text-destructive text-xs px-3 py-2" role="alert" data-testid="text-service-payment-error">{error}</p>}

        <DialogFooter className="flex-row gap-2 sm:justify-start">
          <Button
            className="flex-1"
            disabled={submitting || !!validation}
            onClick={() => { if (!submitting && !validation) onSubmit(amount); }}
            data-testid="button-submit-service-payment"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}تسجيل الدفعة
          </Button>
          <Button variant="outline" className="flex-1" disabled={submitting} onClick={onClose}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
