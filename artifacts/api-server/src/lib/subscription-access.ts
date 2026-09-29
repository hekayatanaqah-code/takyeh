import { db } from "@workspace/db";
import {
  ownerAccountLinksTable,
  ownerSubscriptionsTable,
  ownerFreeAccessGrantsTable,
  subscriptionPlansTable,
  subscriptionAddonPurchasesTable,
  chaletSubmissionsTable,
  serviceProviderSubmissionsTable,
} from "@workspace/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";

const DEFAULT_TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function initialTrialSubscriptionState(
  enabled: boolean,
  trialDays = DEFAULT_TRIAL_DAYS,
  now = new Date(),
) {
  return enabled
    ? { status: "active", expiresAt: new Date(now.getTime() + trialDays * DAY_MS) }
    : { status: "expired", expiresAt: now };
}

const LEGACY_LIMITS: Record<string, { chalets: number; services: number; scope: "property" | "full" }> = {
  trial: { chalets: 1, services: 1, scope: "full" },
  chalet_basic: { chalets: 1, services: 0, scope: "property" },
  chalet_pro: { chalets: 5, services: 0, scope: "full" },
  chalet_unlimited: { chalets: 999, services: 0, scope: "full" },
  service_basic: { chalets: 0, services: 1, scope: "property" },
  service_pro: { chalets: 999, services: 999, scope: "full" },
  bundle: { chalets: 999, services: 999, scope: "full" },
  monthly: { chalets: 1, services: 1, scope: "full" },
  yearly: { chalets: 3, services: 3, scope: "full" },
};

export async function subscriptionOwnerKeys(ownerId: string) {
  const keys = [ownerId];
  const legacyMatch = /^owner_(\d+)$/.exec(ownerId);
  if (legacyMatch) {
    const [link] = await db.select({ userId: ownerAccountLinksTable.userId })
      .from(ownerAccountLinksTable)
      .where(eq(ownerAccountLinksTable.ownerApplicationId, Number(legacyMatch[1]))).limit(1);
    if (link) keys.push(link.userId);
  } else {
    const [link] = await db.select({ applicationId: ownerAccountLinksTable.ownerApplicationId })
      .from(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, ownerId)).limit(1);
    if (link) keys.push(`owner_${link.applicationId}`);
  }
  return keys;
}

export type OwnerFreeAccess = {
  active: boolean;
  expiresAt: Date | null;
  reason: string;
  createdAt: Date;
};

export function latestOwnerFreeAccess<T extends {
  id: number;
  expiresAt: Date | null;
  createdAt: Date;
}>(grants: T[]): T | undefined {
  return [...grants].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0];
}

export function latestOwnerFreeAccessForKeys<T extends {
  ownerId: string;
  id: number;
  expiresAt: Date | null;
  createdAt: Date;
}>(grants: T[], ownerKeys: string[]): T | undefined {
  const keys = new Set(ownerKeys);
  return latestOwnerFreeAccess(grants.filter((grant) => keys.has(grant.ownerId)));
}

export function isOwnerFreeAccessGrantActive(
  grant: { expiresAt: Date | null } | undefined,
  now = new Date(),
) {
  return !!grant && (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime());
}

export async function getOwnerFreeAccess(ownerId: string, now = new Date()): Promise<OwnerFreeAccess | null> {
  const keys = await subscriptionOwnerKeys(ownerId);
  const grants = await db.select({
    id: ownerFreeAccessGrantsTable.id,
    expiresAt: ownerFreeAccessGrantsTable.expiresAt,
    createdAt: ownerFreeAccessGrantsTable.createdAt,
    reason: ownerFreeAccessGrantsTable.reason,
  }).from(ownerFreeAccessGrantsTable)
    .where(inArray(ownerFreeAccessGrantsTable.ownerId, keys));
  const latest = latestOwnerFreeAccess(grants);
  return latest ? {
    active: isOwnerFreeAccessGrantActive(latest, now),
    expiresAt: latest.expiresAt,
    reason: latest.reason,
    createdAt: latest.createdAt,
  } : null;
}

export async function activeOwnersWithFreeAccess(
  ownerKeysByOwner: Map<string, Set<string>>,
  now = new Date(),
) {
  const uniqueIds = [...new Set([...ownerKeysByOwner.values()].flatMap((keys) => [...keys]))];
  if (uniqueIds.length === 0) return new Set<string>();
  const grants = await db.select({
    id: ownerFreeAccessGrantsTable.id,
    ownerId: ownerFreeAccessGrantsTable.ownerId,
    expiresAt: ownerFreeAccessGrantsTable.expiresAt,
    createdAt: ownerFreeAccessGrantsTable.createdAt,
  }).from(ownerFreeAccessGrantsTable)
    .where(inArray(ownerFreeAccessGrantsTable.ownerId, uniqueIds));
  return new Set([...ownerKeysByOwner].flatMap(([ownerId, keys]) => {
    const latest = latestOwnerFreeAccessForKeys(grants, [...keys]);
    return isOwnerFreeAccessGrantActive(latest, now) ? [ownerId] : [];
  }));
}

export function preferredOwnerSubscription<T extends {
  status: string;
  paymentStatus: string;
  expiresAt: Date | null;
}>(subscriptions: T[]): T | undefined {
  return [...subscriptions].sort((a, b) => {
    const rank = (row: T) =>
      (row.paymentStatus === "paid" ? 100 : row.paymentStatus === "manual" ? 90 : 0) +
      (isSubscriptionActive(row) ? 10 : 0);
    return rank(b) - rank(a);
  })[0];
}

export async function getOrStartOwnerSubscription(ownerId: string) {
  const keys = await subscriptionOwnerKeys(ownerId);
  const existing = await db.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, keys));
  // Paid/manual history must take precedence over a trial on another alias,
  // including when the paid subscription has expired.
  const sub = preferredOwnerSubscription(existing);
  if (sub) return sub;

  // Older owner accounts without a subscription receive one persisted trial, not a new
  // 30-day trial on each page load. New accounts begin on their first authenticated visit.
  const [trialPlan] = await db.select({
    trialDays: subscriptionPlansTable.trialDays,
    isActive: subscriptionPlansTable.isActive,
  })
    .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, "trial")).limit(1);
  const trialDays = trialPlan?.trialDays ?? DEFAULT_TRIAL_DAYS;
  const trialState = initialTrialSubscriptionState(trialPlan?.isActive ?? false, trialDays);
  const [created] = await db.insert(ownerSubscriptionsTable).values({
    ownerId: keys.at(-1)!,
    plan: "trial",
    status: trialState.status,
    paymentStatus: "free",
    expiresAt: trialState.expiresAt,
    billingCycleDays: trialDays,
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await db.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, keys)).limit(1);
  if (!concurrent) throw new Error("Failed to initialize owner subscription");
  return concurrent;
}

export function isSubscriptionActive(sub: { status: string; expiresAt: Date | null }, now = new Date()) {
  return sub.status === "active" && !!sub.expiresAt && sub.expiresAt.getTime() > now.getTime();
}

export async function ownerPlanAccess(ownerId: string) {
  const sub = await getOrStartOwnerSubscription(ownerId);
  const freeAccess = await getOwnerFreeAccess(ownerId);
  const legacy = LEGACY_LIMITS[sub.plan] ?? { chalets: 1, services: 1, scope: "full" as const };
  const [configured] = await db.select().from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, sub.plan)).limit(1);
  const terms = sub.termsSnapshot ?? configured;
  const keys = await subscriptionOwnerKeys(ownerId);
  const [chalets, services, addonPurchases] = await Promise.all([
    db.select({ id: chaletSubmissionsTable.id }).from(chaletSubmissionsTable)
      .where(and(inArray(chaletSubmissionsTable.ownerId, keys), ne(chaletSubmissionsTable.status, "rejected"))),
    db.select({ id: serviceProviderSubmissionsTable.id }).from(serviceProviderSubmissionsTable)
      .where(and(inArray(serviceProviderSubmissionsTable.ownerId, keys), ne(serviceProviderSubmissionsTable.status, "rejected"))),
    db.select().from(subscriptionAddonPurchasesTable)
      .where(inArray(subscriptionAddonPurchasesTable.ownerId, keys)),
  ]);
  const baseChaletLimit = freeAccess?.active ? 999 : terms ? (terms.chaletLimit ?? 999) : legacy.chalets;
  const baseServiceLimit = freeAccess?.active ? 999 : terms ? (terms.serviceLimit ?? 999) : legacy.services;
  const now = new Date();
  // Historical one-time purchases are grandfathered for their lifetime. New
  // recurring rows contribute capacity only while their paid period is live.
  const livePurchases = addonPurchases.filter((purchase) =>
    !purchase.recurring || (!!purchase.paidThroughAt && purchase.paidThroughAt > now),
  );
  const purchasedChaletSlots = livePurchases
    .filter((purchase) => purchase.addonType === "chalet")
    .reduce((sum, purchase) => sum + purchase.quantity, 0);
  const purchasedServiceSlots = livePurchases
    .filter((purchase) => purchase.addonType === "service")
    .reduce((sum, purchase) => sum + purchase.quantity, 0);
  return {
    subscription: sub,
    active: !!freeAccess?.active || isSubscriptionActive(sub),
    freeAccess,
    scope: freeAccess?.active ? "full" as const : sub.plan === "trial" ? "full" as const : (terms?.scope ?? legacy.scope),
    chaletLimit: baseChaletLimit + purchasedChaletSlots,
    serviceLimit: baseServiceLimit + purchasedServiceSlots,
    baseChaletLimit,
    baseServiceLimit,
    purchasedChaletSlots,
    purchasedServiceSlots,
    chaletCount: chalets.length,
    serviceCount: services.length,
    extraChaletPrice: configured?.extraChaletPrice ?? null,
    extraServicePrice: configured?.extraServicePrice ?? null,
  };
}