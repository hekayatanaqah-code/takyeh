import { saudiMoneyMessage, SAUDI_RIYAL_SIGN } from "./saudiCurrency";

/** Verified published primary URL; do not derive customer links from the preview origin. */
export const PLATFORM_PUBLIC_ORIGIN = "https://takyah.replit.app";

export function publicContractUrl(id: number, kind: "property" | "service" = "property", basePath = "") {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("رقم العقد غير صالح");
  const prefix = `/${basePath}`.replace(/\/+/g, "/").replace(/\/$/, "");
  return `${PLATFORM_PUBLIC_ORIGIN}${prefix}/${kind === "service" ? "service-contract" : "contract"}/${id}`;
}

export function contractMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("ar-SA", {
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${SAUDI_RIYAL_SIGN}`;
}

export const EMPTY_CONTRACT_TERMS = "لا توجد شروط وأحكام مضافة لهذا العقار.";
export function contractTermsText(terms: string | null | undefined) {
  return terms?.trim() ? saudiMoneyMessage(terms) : EMPTY_CONTRACT_TERMS;
}

export function propertyContractClauses(terms: string | null | undefined) {
  return terms?.trim() ? [{ id: "property-terms", text: terms, enabled: true, isCustom: true }] : [];
}

export const CONTRACT_STATUS_STYLES = {
  signed: "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  pending: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  cancelled: "border-red-300 bg-red-50 text-red-950 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
} as const;

export function contractInvitationText(input: {
  clientName?: string; propertyName: string; day: string; hijri: string; gregorian: string; period: string; link: string;
}) {
  return [
    `مرحباً ${input.clientName?.trim() || "بكم"}،`,
    `بخصوص حجزكم في ${input.propertyName}:`,
    `اليوم: ${input.day}\nالتاريخ: ${input.hijri} | ${input.gregorian}\nالفترة: ${input.period}`,
    "يرجى مراجعة بيانات العقد والشروط والأحكام، ثم تعبئة البيانات والتوقيع إلكترونياً عبر الرابط التالي:",
    input.link,
    `شكراً لاختياركم ${input.propertyName}.`,
  ].join("\n\n");
}
