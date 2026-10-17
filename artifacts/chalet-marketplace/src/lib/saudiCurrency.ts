/** Official Saudi riyal sign, U+20C1. Never send HTML/SVG as a WhatsApp text. */
export const SAUDI_RIYAL_SIGN = "\u20c1";

/** Normalize legacy units, including saved message templates, without touching URLs. */
export function normalizeSaudiCurrencyText(text: string): string {
  return text.replace(/https?:\/\/[^\s]+|(?<![\p{L}\p{N}_])(?:ر\s*\.\s*س\.?|ريال(?:اً|ًا|ا)?)(?![\p{L}\p{N}_])/gu,
    (match, offset: number, source: string) => {
      if (/^https?:\/\//.test(match)) return match;
      // Do not rename properties/people whose names happen to contain "ريال".
      if (match.startsWith("ريال") &&
        source.trim() !== match &&
        !/[\p{N}{}()/:—-]\s*$/u.test(source.slice(0, offset))) return match;
      return SAUDI_RIYAL_SIGN;
    });
}

/** Only amounts preceding the currency sign are localized; links/phones/IDs stay intact. */
export function saudiMoneyMessage(text: string): string {
  return normalizeSaudiCurrencyText(text).replace(
    /https?:\/\/[^\s]+|[0-9][0-9.,٬٫]*(?=\)?\s*\u20c1)/g,
    match => /^https?:\/\//.test(match) ? match : match.replace(/[0-9]/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]),
  );
}
