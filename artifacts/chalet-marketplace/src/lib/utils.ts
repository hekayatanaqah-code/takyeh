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
