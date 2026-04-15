import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * toAr — converts every Western digit (0-9) in a string to its
 * Arabic-Indic equivalent (٠-٩). Accepts a string or number.
 * Safe to call on already-converted strings.
 */
export function toAr(v: string | number | null | undefined): string {
  if (v == null) return "";
  const digits = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
  return String(v).replace(/[0-9]/g, d => digits[+d]);
}

/**
 * fromAr — converts Arabic-Indic digits (٠-٩) back to Western digits (0-9).
 * Safe to call on strings that already contain Western digits.
 * Use this in onChange handlers paired with toAr() on the value prop.
 */
export function fromAr(v: string): string {
  return v
    .replace(/٠/g, "0").replace(/١/g, "1").replace(/٢/g, "2")
    .replace(/٣/g, "3").replace(/٤/g, "4").replace(/٥/g, "5")
    .replace(/٦/g, "6").replace(/٧/g, "7").replace(/٨/g, "8")
    .replace(/٩/g, "9");
}
