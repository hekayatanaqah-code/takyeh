import { z } from "zod";

export type BroadcastChannel = "inApp" | "inbox" | "email" | "whatsapp";
export type BroadcastPreferences = Record<BroadcastChannel, boolean>;

export function defaultBroadcastPreferences(): BroadcastPreferences {
  return { inApp: true, inbox: false, email: false, whatsapp: false };
}

export function mergeBroadcastPreferences(
  defaults: BroadcastPreferences,
  stored?: Partial<BroadcastPreferences> | null,
): BroadcastPreferences {
  return stored ? { ...defaults, ...stored } : { ...defaults };
}

export function recipientKeyForAlias(alias: string, aliases: Map<string, { key: string }>): string {
  return aliases.get(alias)?.key ?? `user:${alias}`;
}

export function ownerIdentityAliases(primary: string, linkedAlias?: string | null): string[] {
  return [...new Set([primary, linkedAlias].filter((value): value is string => !!value))];
}

export function selectAudienceOwnerIds(
  audience: "all" | "active" | "providers",
  sources: {
    chaletOwners: string[];
    providers: string[];
    activeSubscribers: string[];
  },
): string[] {
  const selected = audience === "all"
    ? [...sources.chaletOwners, ...sources.providers, ...sources.activeSubscribers]
    : audience === "active"
      ? sources.activeSubscribers
      : sources.providers;
  return [...new Set(selected.filter(ownerId => typeof ownerId === "string" && ownerId.trim()).map(ownerId => ownerId.trim()))];
}

export function deduplicateRecipients<T extends { key: string }>(recipients: T[]): T[] {
  return [...new Map(recipients.map(recipient => [recipient.key, recipient])).values()];
}

export function idempotencyPayloadMatches(
  existing: { title: string; body: string; audience: string; channels: string[] },
  requested: { title: string; body: string; audience: string; channels: string[] },
): boolean {
  return existing.title === requested.title &&
    existing.body === requested.body &&
    existing.audience === requested.audience &&
    JSON.stringify(existing.channels) === JSON.stringify(requested.channels);
}

export function normalizeE164Phone(phone: string | null | undefined): string | null {
  const normalized = phone?.trim() ?? "";
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function emailDeliveryBlockReason(email: string | null | undefined, marketingConsent: boolean): string | null {
  if (!marketingConsent) return "marketing_opted_out";
  const normalized = email?.trim() ?? "";
  return z.string().email().safeParse(normalized).success ? null : "email_missing_or_invalid";
}