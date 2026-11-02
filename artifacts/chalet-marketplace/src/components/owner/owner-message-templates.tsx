import { type OwnerWhatsAppSettingsInput } from "@workspace/api-client-react";
import { saudiMoneyMessage } from "@/lib/saudiCurrency";
import { publicContractUrl } from "@/lib/digitalContracts";
import { DEFAULT_DETAILED_RECEIPT_TEMPLATE } from "@/lib/detailedWhatsAppReceipt";


export interface OwnerMessageSettings extends Required<Omit<OwnerWhatsAppSettingsInput, "detailedReceiptTemplate">> {
  detailedReceiptTemplate: string;
}

export const MESSAGE_VARIABLES = ["{اسم_العميل}", "{اسم_العقار}", "{اسم_الخدمة}", "{رقم_الحجز}", "{اسم_اليوم_من}", "{التاريخ}", "{التاريخ_م}", "{تاريخ_الخدمة}", "{من_التاريخ}", "{من_التاريخ_م}", "{إلى_التاريخ}", "{إلى_التاريخ_م}", "{اسم_اليوم_إلى}", "{المدة}", "{الفترة}", "{الفترة_الجديدة}", "{الفترة_القديمة}", "{طريقة_تقديم_الخدمة}", "{عنوان_الخدمة}", "{تفاصيل_الخدمة}", "{رابط_العقد_الرقمي}", "{سبب_الإلغاء}", "{المبلغ_المسترد}", "{سبب_التعديل}", "{الإيجار}", "{إجمالي_الخدمات}", "{تفاصيل_الخدمات}", "{الإجمالي_الكلي}", "{التأمين}", "{المدفوع}", "{المتبقي}"];

export const SERVICE_MESSAGE_VARIABLES = MESSAGE_VARIABLES.filter(variable => variable !== "{اسم_العقار}");

export function serviceMessageName(template: string): string {
  return template.replace(/\{اسم_العقار\}/g, "{اسم_الخدمة}");
}

/** Settings are owner-wide: project names for service editors, retain the legacy storage token for properties. */
export function bookingMessageActivityNames(settings: OwnerMessageSettings, activity: "service" | "shared"): OwnerMessageSettings {
  const result = { ...settings };
  for (const key of ["bookingConfirmationTemplate", "cancellationTemplate", "modificationTemplate"] as const) {
    result[key] = activity === "service" ? serviceMessageName(settings[key])
      : settings[key].replace(/\{اسم_الخدمة\}/g, "{اسم_العقار}");
  }
  return result;
}

export function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, "")
    .replace(/[ \t]+(\r?\n)/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

export function encodeWhatsAppText(text: string): string {
  const utf8SafeText = saudiMoneyMessage(stripEmoji(text))
    .normalize("NFC")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
  return encodeURIComponent(utf8SafeText);
}

export function prepareServiceMessageTemplate(template: string): string {
  let durationLineAdded = template.includes("{المدة}");
  return serviceMessageName(template)
    .split(/\r?\n/)
    .flatMap((line) => {
      if (!/\{(?:الفترة|الفترة_الجديدة|الفترة_القديمة)\}/.test(line)) return [line];
      if (durationLineAdded) return [];
      durationLineAdded = true;
      return ["المدة: {المدة}"];
    })
    .join("\n")
    .replace(/(?:أمنياتنا|نتمنى) لكم بإقامة (?:ممتعة|مانعة)\.?/g, "سعداء بخدمتكم")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const PREVIEW_SAMPLE_DATA: Record<string, string> = {
  "{اسم_العميل}": "محمد بن أحمد",
  "{رقم_الحجز}": "١٢٤٥",
  "{التاريخ}": "٦ صفر ١٤٤٧",
  "{التاريخ_م}": "١ أغسطس ٢٠٢٥",
  "{من_التاريخ}": "٦ صفر ١٤٤٧",
  "{من_التاريخ_م}": "١ أغسطس ٢٠٢٥",
  "{إلى_التاريخ}": "٨ صفر ١٤٤٧",
  "{إلى_التاريخ_م}": "٣ أغسطس ٢٠٢٥",
  "{الفترة}": "مسائية",
  "{المدة}": "٤ ساعات",
  "{تاريخ_الخدمة}": "١ أغسطس ٢٠٢٥",
  "{اسم_اليوم_من}": "الجمعة",
  "{اسم_اليوم_إلى}": "الأحد",
  "{الفترة_القديمة}": "مسائية",
  "{الفترة_الجديدة}": "كاملة",
  "{سبب_الإلغاء}": "ظروف طارئة",
  "{المبلغ_المسترد}": "٥٠٠",
  "{سبب_التعديل}": "طلب العميل",
  "{طريقة_تقديم_الخدمة}": "توصيل وتركيب بموقع العميل",
  "{عنوان_الخدمة}": "حي الملقا، شارع الأمير محمد",
  "{تفاصيل_الخدمة}": "تجهيز وتركيب كامل قبل موعد المناسبة",
  "{رابط_العقد_الرقمي}": publicContractUrl(1245, "service"),
  "{الإيجار}": "٨٠٠",
  "{قيمة_الإيجار}": "٨٠٠",
  "{إجمالي_الخدمات}": "١٥٠",
  "{تفاصيل_الخدمات}": "شيشة: ٥٠ ر.س\nمسبح: ١٠٠ ر.س",
  "{الإجمالي_الكلي}": "٩٥٠",
  "{التأمين}": "٢٠٠",
  "{المدفوع}": "٣٠٠",
  "{المتبقي}": "٨٥٠",
  "{استرداد_العربون}": "٣٠٠",
  "{استرداد_التأمين}": "٢٠٠",
  "{إجمالي_المسترد}": "٥٠٠",
};

/* ── Canonical default template bodies (shared by settings defaults + RescheduleDialog fallback) ── */
const DEFAULT_CONFIRMATION_TEMPLATE_BODY = "مرحباً {اسم_العميل}\n\nتم تأكيد حجزك في {اسم_العقار}\nفي يوم {اسم_اليوم_من} بتاريخ {التاريخ} هـ الموافق {التاريخ_م} م.\nالمدة: {المدة}\n\n• الإيجار: {الإيجار} ريال\n• الإضافات: {إجمالي_الخدمات} ريال\n• الإجمالي: {الإجمالي_الكلي} ريال\n• التأمين: {التأمين} ريال\n• المدفوع: {المدفوع} ريال\n• المتبقي: {المتبقي} ريال\n\nشكراً لاختياركم.\nأمنياتنا لكم بإقامة ممتعة.";
export const DEFAULT_MODIFICATION_TEMPLATE_BODY = "مرحباً {اسم_العميل}،\nتم تعديل حجزك في {اسم_العقار}\nبناءً على ({سبب_التعديل}).\n\nالحجز السابق: يوم {اسم_اليوم_من} ({من_التاريخ}) | ({من_التاريخ_م}) - فترة {الفترة_القديمة}.\n\nالحجز الجديد: يوم {اسم_اليوم_إلى} ({إلى_التاريخ}) | ({إلى_التاريخ_م}) - فترة {الفترة_الجديدة}.\n\nالإيجار: {الإيجار} ريال.\nالتأمين: {التأمين} ريال.\nالمدفوع: {المدفوع} ريال.\nالمتبقي: {المتبقي} ريال.";

export const DEFAULT_OWNER_MESSAGE_SETTINGS: OwnerMessageSettings = {
  waEnabled: false,
  waPhone: "",
  bookingConfirmationEnabled: true,
  bookingConfirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE_BODY,
  changeNoticeEnabled: true,
  cancellationTemplate: "مرحباً {اسم_العميل}\nنود إشعارك بأنه تم إلغاء حجزك في {اسم_العقار} بتاريخ {التاريخ} هـ الموافق {التاريخ_م} م.\n\nالسبب : {سبب_الإلغاء}\n\nالمبلغ المُسترد : {المبلغ_المسترد} ريال\n\nنعتذر عن الإزعاج، ونتمنى أن نراكم في أيام قادمة",
  modificationTemplate: DEFAULT_MODIFICATION_TEMPLATE_BODY,
  detailedReceiptTemplate: DEFAULT_DETAILED_RECEIPT_TEMPLATE,
  customTemplates: [],
  attachmentNote: "إذا احتجت إرسال صورة أو ملف، افتح واتساب من الزر ثم أرفق الصورة يدوياً قبل الإرسال.",
};
