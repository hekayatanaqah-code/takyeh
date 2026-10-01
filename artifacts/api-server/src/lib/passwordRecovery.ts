import { createHash } from "node:crypto";

export type RecoveryPortal = "public" | "admin";
export type RecoveryIdentifier = {
  kind: "email" | "phone" | "username";
  value: string;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const WESTERN_DIGITS = "0123456789";
const TRUSTED_RESET_ORIGIN = "https://takyah.replit.app";
const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 10;
const IDENTIFIER_LIMIT = 5;
const RATE_LIMIT_MAX_KEYS = 20_000;

function westernizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
}

export function normalizeSaudiMobile(value: string): string | null {
  const western = westernizeDigits(value).trim();
  if (!western || !/^\+?[\d\s().-]+$/.test(western) || (western.match(/\+/g) ?? []).length > 1) return null;
  let digits = western.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966")) {
    if (digits.length !== 12) return null;
    digits = `0${digits.slice(3)}`;
  } else if (digits.length === 9 && digits.startsWith("5")) {
    digits = `0${digits}`;
  }

  return /^05[03456789]\d{7}$/.test(digits) ? digits : null;
}

export function normalizeRecoveryEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || /\s/.test(email)) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !domain || domain.length > 253 || !domain.includes(".")) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/.test(domain)) return null;
  return email;
}

export function classifyPublicStaffUsername(input: string): RecoveryIdentifier | null {
  const identifier = input.trim();
  if (identifier.length > 64 || /[\s\u0000-\u001f\u007f]/.test(identifier)
    || !/^[a-zA-Z0-9_.@+-]+$/.test(identifier)) {
    return null;
  }
  return { kind: "username", value: identifier };
}

export function classifyRecoveryIdentifier(
  input: string,
  portal: RecoveryPortal,
): RecoveryIdentifier | null {
  const identifier = input.trim();
  if (identifier.includes("@")) {
    const email = normalizeRecoveryEmail(identifier);
    return email ? { kind: "email", value: email } : null;
  }

  const western = westernizeDigits(identifier);
  if (/^[+()\d\s.-]+$/.test(western)) {
    const phone = normalizeSaudiMobile(identifier);
    return phone ? { kind: "phone", value: phone } : null;
  }

  /* Usernames remain a separate path for existing staff accounts. */
  if (identifier.length <= 64 && !/[\s\u0000-\u001f\u007f]/.test(identifier)
    && (portal === "admin" || /^[a-zA-Z0-9_.@+-]+$/.test(identifier))) {
    return { kind: "username", value: identifier };
  }
  return null;
}

export function hashRecoveryToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidRecoveryPassword(password: string): boolean {
  /* bcrypt silently truncates after 72 UTF-8 bytes; enforce that effective maximum. */
  return password.length >= 6 && password.length <= 128 && Buffer.byteLength(password, "utf8") <= 72;
}

function configuredResetOrigin(): string {
  for (const configured of [process.env.PASSWORD_RESET_PUBLIC_URL, process.env.PUBLIC_URL]) {
    if (!configured) continue;
    try {
      const parsed = new URL(configured);
      const isLocalDevelopment = process.env.NODE_ENV === "development"
        && ["localhost", "127.0.0.1"].includes(parsed.hostname);
      if ((parsed.protocol === "https:" || (isLocalDevelopment && parsed.protocol === "http:"))
        && !parsed.username && !parsed.password) {
        return parsed.origin;
      }
    } catch {
      // Try the next trusted configuration source before using the confirmed URL.
    }
  }
  return TRUSTED_RESET_ORIGIN;
}

export function makePasswordResetUrl(token: string, portal: RecoveryPortal): string {
  const url = new URL("/reset-password", configuredResetOrigin());
  url.searchParams.set("token", token);
  url.searchParams.set("portalType", portal);
  return url.toString();
}

export type RecoveryRateLimiter = {
  allow(ip: string, identifierHash: string, now?: number): boolean;
};

export function createRecoveryRateLimiter(): RecoveryRateLimiter {
  const entries = new Map<string, { count: number; expiresAt: number }>();

  return {
    allow(ip, identifierHash, now = Date.now()) {
      for (const [key, entry] of entries) {
        if (entry.expiresAt <= now) entries.delete(key);
      }

      const keys = [`ip:${ip}`, `identifier:${identifierHash}`];
      const limits = [IP_LIMIT, IDENTIFIER_LIMIT];
      const blocked = keys.some((key, index) => {
        const entry = entries.get(key);
        return Boolean(entry && entry.expiresAt > now && entry.count >= limits[index]);
      });

      for (const [index, key] of keys.entries()) {
        const entry = entries.get(key);
        if (!entry || entry.expiresAt <= now) {
          entries.set(key, { count: 1, expiresAt: now + WINDOW_MS });
        } else if (!blocked) {
          entry.count += 1;
        }
      }

      while (entries.size > RATE_LIMIT_MAX_KEYS) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
      return !blocked;
    },
  };
}