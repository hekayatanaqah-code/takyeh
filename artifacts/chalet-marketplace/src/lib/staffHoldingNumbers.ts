/** Localize editing text without grouping, rounding or changing the numeric value. */
export function easternHoldingDigits(value: string): string {
  return value.replace(/[0-9۰-۹]/g, digit => {
    const code = digit.charCodeAt(0);
    return "٠١٢٣٤٥٦٧٨٩"[code >= 0x06f0 ? code - 0x06f0 : code - 0x30];
  }).replace(/[.,]/g, "٫");
}

/** Keep localization at the UI boundary; API amounts remain numbers. */
export function latinHoldingDigits(value: string): string {
  return value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".");
}
