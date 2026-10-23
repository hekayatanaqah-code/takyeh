import { saudiMoneyMessage } from "./saudiCurrency";

const TYPE_LABELS: Record<string, string> = {
  new_booking: "حجز جديد",
  booking_reminder: "تذكير بموعد الحجز",
  subscription_expiry_reminder: "تذكير بانتهاء الاشتراك",
  cancellation: "إلغاء حجز",
  new_review: "تقييم جديد",
  report_dismissed: "تحديث بلاغ",
  photography_delivery: "تسليم ملفات التصوير",
};

/** Presentation only: stored deduplication markers and WhatsApp links stay intact. */
export function ownerNotificationPresentation(message: string, type: string) {
  const waMatch = message.match(/\|\s*(wa\.me\/\S+)\s*$/);
  let text = waMatch ? message.slice(0, waMatch.index).trim() : message;
  text = text
    .replace(/[\[\u2063]?\bsubscription-expiry:\d+:\d+[\]\u2063]?/g, "")
    .replace(/\[[\w:-]+\]/g, "")
    .replace(/\u2063/g, "")
    // Only full Gregorian numeric dates; do not remove amounts, times or IDs.
    .replace(/(?:بتاريخ|التاريخ\s*:|تاريخ)\s*(?=[0-9٠-٩]{1,4}[-/])/g, "")
    .replace(/(?<![0-9٠-٩])(?:[12١٢][0-9٠-٩]{3}[-/][0-9٠-٩]{1,2}[-/][0-9٠-٩]{1,2}|[0-9٠-٩]{1,2}[-/][0-9٠-٩]{1,2}[-/][12١٢][0-9٠-٩]{3})(?![0-9٠-٩])/g, "")
    .replace(/^[\s]*(?:[⏰🔔📅⭐🚩⏳🧪🚫]\uFE0F?\s*)+/u, "")
    .replace(/([—·|])\s*(?=[—·|])/g, "")
    .replace(/^[ \t]*[—·|]|[—·|][ \t]*$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  text = saudiMoneyMessage(text)
    // Service labels with an amount in brackets become "الخدمة: ٢٠٠ ﷼".
    .replace(/([\p{L}\p{N}])[:：]?\s*\(\s*([0-9٠-٩][0-9٠-٩.,٬٫]*\s*\u20c1)\s*\)/gu, "$1: $2");
  return { text: text || TYPE_LABELS[type] || "إشعار من المنصة", waHref: waMatch ? `https://${waMatch[1]}` : null };
}

export function ownerNotificationDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "تاريخ الإشعار غير متاح";
  const options = { timeZone: "Asia/Riyadh", numberingSystem: "arab", day: "numeric", month: "long", year: "numeric" } as const;
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", options).format(date).replace(/\s*هـ$/, "");
  const gregorian = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", options).format(date);
  const time = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", numberingSystem: "arab", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
  return { hijri: `${hijri} هـ`, gregorian: `${gregorian} م`, time };
}
