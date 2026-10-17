import { saudiMoneyMessage, SAUDI_RIYAL_SIGN } from "./saudiCurrency";

export const DEFAULT_DETAILED_RECEIPT_TEMPLATE = `إيصال حجز — {اسم_العقار}

رقم الحجز: {رقم_الحجز}
العميل: {اسم_العميل}
التاريخ: {التاريخ} | {التاريخ_م}
المدة: {المدة}
الفترة: {الفترة}

تفاصيل المبالغ:
• قيمة الإيجار الأساسية: {الإيجار} ${SAUDI_RIYAL_SIGN}

الخدمات الإضافية:
{تفاصيل_الخدمات}
• إجمالي الخدمات: {إجمالي_الخدمات} ${SAUDI_RIYAL_SIGN}
• الإجمالي الكلي: {الإجمالي_الكلي} ${SAUDI_RIYAL_SIGN}
• المدفوع: {المدفوع} ${SAUDI_RIYAL_SIGN}
• المتبقي: {المتبقي} ${SAUDI_RIYAL_SIGN}
• التأمين: {التأمين} ${SAUDI_RIYAL_SIGN}
{حالة_التأمين}
{صور_التوثيق}

الشروط والأحكام:
{الشروط_والأحكام}

شكراً لاختياركم {اسم_العقار}
{اسم_المنصة}`;

export const DETAILED_RECEIPT_VARIABLES = [
  "{اسم_العقار}", "{اسم_المنصة}", "{اسم_العميل}", "{رقم_الحجز}",
  "{الشروط_والأحكام}", "{التاريخ}", "{التاريخ_م}", "{المدة}", "{الفترة}",
  "{الإيجار}", "{تفاصيل_الخدمات}", "{إجمالي_الخدمات}", "{الإجمالي_الكلي}",
  "{المدفوع}", "{المتبقي}", "{التأمين}", "{حالة_التأمين}", "{صور_التوثيق}",
] as const;

export interface ReceiptBooking {
  id: number;
  clientName: string;
  durationDays: number;
  period?: string | null;
  totalPrice?: string | number | null;
  depositPaid?: string | number | null;
  insuranceFee?: string | number | null;
  balanceCollected?: boolean;
  insuranceRefunded?: boolean;
  insuranceDeducted?: string | number | null;
  insuranceDeductReason?: string | null;
  insuranceProofImages?: string | null;
  bookedAddons?: Array<{ name: string; price: string | number; unit: string }> | null;
}

const digits = (value: string | number) => String(value).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const amount = (value: number) => value.toLocaleString("ar-SA", { maximumFractionDigits: 2 });

export function detailedReceiptValues(
  booking: ReceiptBooking,
  context: { propertyName: string; platformName?: string; terms?: string | null; hijri: string; gregorian: string; assetBaseUrl: string },
): Record<string, string> {
  const addons = booking.bookedAddons ?? [];
  const addonTotal = addons.reduce((sum, addon) => sum + (addon.unit === "خدمة مجانية" ? 0 : Number(addon.price) || 0), 0);
  const total = Number(booking.totalPrice ?? 0);
  const paid = booking.balanceCollected ? total : Number(booking.depositPaid ?? 0);
  const insurance = Number(booking.insuranceFee ?? 0);
  const deducted = Number(booking.insuranceDeducted ?? 0);
  let insuranceStatus = insurance > 0 ? "التأمين محتجز" : "لا يوجد تأمين";
  if (insurance > 0 && booking.insuranceRefunded) {
    insuranceStatus = deducted > 0
      ? `تم خصم ${amount(deducted)} ${SAUDI_RIYAL_SIGN} من التأمين\nالسبب: ${booking.insuranceDeductReason || "—"}\nالمبلغ المُرجَع: ${amount(Math.max(0, insurance - deducted))} ${SAUDI_RIYAL_SIGN}`
      : "تم إرجاع التأمين بالكامل";
  }
  let proofUrls: string[] = [];
  try {
    const parsed: unknown = JSON.parse(booking.insuranceProofImages || "[]");
    if (Array.isArray(parsed)) proofUrls = parsed.filter((url): url is string => typeof url === "string").flatMap(url => {
      try {
        const resolved = new URL(url.replace(/^\//, ""), `${context.assetBaseUrl.replace(/\/$/, "")}/`);
        return /^https?:$/.test(resolved.protocol) ? [resolved.href] : [];
      } catch { return []; }
    });
  } catch { /* Historical rows can contain no valid proof list. */ }
  return {
    "{اسم_العقار}": context.propertyName,
    "{اسم_المنصة}": context.platformName?.trim() || "",
    "{اسم_العميل}": booking.clientName,
    "{رقم_الحجز}": digits(booking.id),
    "{التاريخ}": context.hijri,
    "{التاريخ_م}": context.gregorian,
    "{المدة}": `${digits(booking.durationDays)} ${booking.durationDays === 1 ? "يوم" : "أيام"}`,
    "{الفترة}": ({ morning: "صباحية", evening: "مسائية", full_day: "يوم كامل" } as Record<string, string>)[booking.period ?? ""] || "—",
    "{الإيجار}": amount(total - addonTotal),
    "{تفاصيل_الخدمات}": addons.map(addon => `${addon.name}: ${addon.unit === "خدمة مجانية" || Number(addon.price) === 0 ? "مجاني" : `${amount(Number(addon.price))} ${SAUDI_RIYAL_SIGN}`}`).join("\n") || "لا توجد خدمات إضافية",
    "{إجمالي_الخدمات}": amount(addonTotal),
    "{الإجمالي_الكلي}": amount(total),
    "{المدفوع}": amount(paid),
    "{المتبقي}": amount(Math.max(0, total - paid)),
    "{التأمين}": amount(insurance),
    "{حالة_التأمين}": insuranceStatus,
    "{صور_التوثيق}": insurance > 0 && booking.insuranceRefunded && deducted > 0 && proofUrls.length ? `صور التوثيق:\n${proofUrls.join("\n")}` : "",
    "{الشروط_والأحكام}": context.terms?.trim() || "لا توجد شروط وأحكام مضافة للعقار.",
  };
}

/** One pass: customer data containing braces or $& must stay literal. */
export function renderDetailedReceipt(template: string, values: Record<string, string>): string {
  return saudiMoneyMessage(template.replace(/\{[^{}\n]+\}/g, token => values[token] ?? "—"));
}
