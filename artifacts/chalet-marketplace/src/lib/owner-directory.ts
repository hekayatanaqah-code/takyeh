import { normalizeIdentifier } from "./authLabels";

export type OwnerDirectoryTab = "all" | "property" | "service" | "both" | "none";

type OwnerActivity = {
  ownerKind: "property" | "service" | "both" | "none";
  isRegistered: boolean;
  hasActivity: boolean;
};

export function matchesOwnerDirectoryTab(owner: OwnerActivity, tab: OwnerDirectoryTab): boolean {
  if (tab === "all") return true;
  if (tab === "none") return owner.isRegistered && !owner.hasActivity;
  return owner.ownerKind === tab;
}

export function ownerWhatsAppUrl(phone: string): string | null {
  const normalized = normalizeIdentifier(phone);
  if (normalized.kind !== "phone") return null;
  return `https://wa.me/966${normalized.value.slice(1)}`;
}
