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
import { and, eq, inArray, ne, sql } from "drizzle-orm";

const DEFAULT_TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function initialTrialSubscriptionState(
  _enabled: boolean,
  _trialDays = DEFAULT_TRIAL_DAYS,
  _now = new Date(),
) {
  return { status: "pending_activation", expiresAt: null as Date | null };
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
  startDate?: string | null;
  endDate?: string | null;
  reason: string;
  createdAt: Date;
};

function saudiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function latestOwnerFreeAccess<T extends {
  id: number;
  expiresAt: Date | null;
  createdAt: Date;
  startDate?: string | null;
}>(grants: T[], now = new Date()): T | undefined {
  const today = saudiToday(now);
  return grants.filter((grant) => !grant.startDate || grant.startDate <= today).sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
  )[0];
}

export function latestOwnerFreeAccessForKeys<T extends {
  ownerId: string;
  id: number;
  expiresAt: Date | null;
  createdAt: Date;
  startDate?: string | null;
}>(grants: T[], ownerKeys: string[], now = new Date()): T | undefined {
  const keys = new Set(ownerKeys);
  return latestOwnerFreeAccess(grants.filter((grant) => keys.has(grant.ownerId)), now);
}

export function isOwnerFreeAccessGrantActive(
  grant: { expiresAt: Date | null; startDate?: string | null; endDate?: string | null } | undefined,
  now = new Date(),
) {
  if (!grant) return false;
  const today = saudiToday(now);
  if (grant.startDate && grant.startDate > today) return false;
  if (grant.endDate) return grant.endDate >= today;
  return grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime();
}

export async function getOwnerFreeAccess(ownerId: string, now = new Date()): Promise<OwnerFreeAccess | null> {
  const keys = await subscriptionOwnerKeys(ownerId);
  const grants = await db.select({
    id: ownerFreeAccessGrantsTable.id,
    expiresAt: ownerFreeAccessGrantsTable.expiresAt,
    startDate: ownerFreeAccessGrantsTable.startDate,
    endDate: ownerFreeAccessGrantsTable.endDate,
    createdAt: ownerFreeAccessGrantsTable.createdAt,
    reason: ownerFreeAccessGrantsTable.reason,
  }).from(ownerFreeAccessGrantsTable)
    .where(inArray(ownerFreeAccessGrantsTable.ownerId, keys));
  const latest = latestOwnerFreeAccess(grants, now);
  return latest ? {
    active: isOwnerFreeAccessGrantActive(latest, now),
    expiresAt: latest.expiresAt,
    startDate: latest.startDate,
    endDate: latest.endDate,
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
    startDate: ownerFreeAccessGrantsTable.startDate,
    endDate: ownerFreeAccessGrantsTable.endDate,
    createdAt: ownerFreeAccessGrantsTable.createdAt,
  }).from(ownerFreeAccessGrantsTable)
    .where(inArray(ownerFreeAccessGrantsTable.ownerId, uniqueIds));
  return new Set([...ownerKeysByOwner].flatMap(([ownerId, keys]) => {
    const latest = latestOwnerFreeAccessForKeys(grants, [...keys], now);
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

type SubscriptionWriter = Pick<typeof db, "select" | "insert" | "update" | "execute">;

async function pendingOwnerSubscription(tx: SubscriptionWriter, keys: string[]) {
  const existing = await tx.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, keys));
  // Paid/manual history must take precedence over a trial on another alias,
  // including when the paid subscription has expired.
  const sub = preferredOwnerSubscription(existing);
  if (sub) return sub;

  const trialState = initialTrialSubscriptionState(true);
  const [created] = await tx.insert(ownerSubscriptionsTable).values({
    ownerId: [...keys].sort()[0],
    plan: "trial",
    status: trialState.status,
    paymentStatus: "free",
    expiresAt: trialState.expiresAt,
    billingCycleDays: DEFAULT_TRIAL_DAYS,
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [concurrent] = await tx.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, keys)).limit(1);
  if (!concurrent) throw new Error("Failed to initialize owner subscription");
  return concurrent;
}

/** Reading/registering an account never starts its free-trial clock. */
export async function getOrStartOwnerSubscription(ownerId: string) {
  const keys = await subscriptionOwnerKeys(ownerId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(731205, hashtext(${[...keys].sort()[0]}))`);
    return pendingOwnerSubscription(tx, keys);
  });
}

/** Called in the same transaction that approves and publishes the first activity. */
export async function activateOwnerTrial(ownerId: string, tx: SubscriptionWriter, now?: Date) {
  const keys = await subscriptionOwnerKeys(ownerId);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(731205, hashtext(${[...keys].sort()[0]}))`);
  const sub = await pendingOwnerSubscription(tx, keys);
  if (sub.plan !== "trial" || sub.status !== "pending_activation" || sub.trialStartedAt) return sub;
  const activatedAt = now ?? new Date();
  const [activated] = await tx.update(ownerSubscriptionsTable).set({
    status: "active",
    trialStartedAt: activatedAt,
    expiresAt: new Date(activatedAt.getTime() + DEFAULT_TRIAL_DAYS * DAY_MS),
    billingCycleDays: DEFAULT_TRIAL_DAYS,
  }).where(and(eq(ownerSubscriptionsTable.id, sub.id), eq(ownerSubscriptionsTable.status, "pending_activation"))).returning();
  return activated ?? sub;
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
      .where(and(inArray(chaletSubmissionsTable.ownerId, keys), inArray(chaletSubmissionsTable.status, ["pending", "approved", "needs_revision"]))),
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
    canSubmitActivities: !!freeAccess?.active || isSubscriptionActive(sub) || sub.status === "pending_activation",
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