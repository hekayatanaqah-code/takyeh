export function isArabicServiceCategoryName(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  return letters.length > 0 && letters.every(letter => /\p{Script=Arabic}/u.test(letter));
}

export function arabicServiceCategoryLabel(value: unknown, fallback = "فئة غير محددة"): string {
  const label = typeof value === "string" ? value.trim() : "";
  return isArabicServiceCategoryName(label) ? label : fallback;
}
