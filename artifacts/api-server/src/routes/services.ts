import { Router } from "express";
import { db } from "@workspace/db";
import { ownerAccountLinksTable, ownerSubscriptionsTable } from "@workspace/db/schema";
import { inArray, or, sql } from "drizzle-orm";
import { isSubscriptionActive } from "../lib/subscription-access";

const router = Router();

type ExternalService = {
  id: number;
  nameAr: string;
  category: string;
  descriptionAr: string;
  whatsappNumber: string;
  price: string;
  priceNote: string | null;
  city: string;
  photos: string[] | null;
  isActive: boolean;
  trialEndsAt: Date | null;
  createdAt: Date;
  ownerId: string | null;
};

let ownerIdColumnExists: boolean | undefined;

async function hasExternalServiceOwnerColumn() {
  if (ownerIdColumnExists !== undefined) return ownerIdColumnExists;
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'external_services'
        AND column_name = 'owner_id'
    ) AS available
  `);
  ownerIdColumnExists = Boolean((result as any).rows?.[0]?.available);
  return ownerIdColumnExists;
}

async function getExternalServices(hasOwnerColumn: boolean, id?: number): Promise<ExternalService[]> {
  const result = hasOwnerColumn
    ? await db.execute(sql`
        SELECT id, name_ar AS "nameAr", category::text AS category,
               description_ar AS "descriptionAr", whatsapp_number AS "whatsappNumber",
               price::text AS price, price_note AS "priceNote", city, photos,
               is_active AS "isActive", trial_ends_at AS "trialEndsAt",
               created_at AS "createdAt", owner_id AS "ownerId"
        FROM external_services
        ${id === undefined ? sql`` : sql`WHERE id = ${id}`}
        ORDER BY created_at
      `)
    : await db.execute(sql`
        SELECT id, name_ar AS "nameAr", category::text AS category,
               description_ar AS "descriptionAr", whatsapp_number AS "whatsappNumber",
               price::text AS price, price_note AS "priceNote", city, photos,
               is_active AS "isActive", trial_ends_at AS "trialEndsAt",
               created_at AS "createdAt", NULL::text AS "ownerId"
        FROM external_services
        ${id === undefined ? sql`` : sql`WHERE id = ${id}`}
        ORDER BY created_at
      `);
  return (result as any).rows as ExternalService[];
}

async function activeOwnerIds(ownerIds: string[]) {
  const owners = [...new Set(ownerIds)];
  if (owners.length === 0) return new Set<string>();
  const applicationIds = owners
    .map((ownerId) => /^owner_(\d+)$/.exec(ownerId)?.[1])
    .filter((id): id is string => !!id)
    .map(Number);
  const userIds = owners.filter((ownerId) => !/^owner_\d+$/.test(ownerId));
  const linkConditions = [];
  if (userIds.length > 0) linkConditions.push(inArray(ownerAccountLinksTable.userId, userIds));
  if (applicationIds.length > 0) linkConditions.push(inArray(ownerAccountLinksTable.ownerApplicationId, applicationIds));
  const links = linkConditions.length > 0
    ? await db.select({
        userId: ownerAccountLinksTable.userId,
        applicationId: ownerAccountLinksTable.ownerApplicationId,
      }).from(ownerAccountLinksTable).where(or(...linkConditions))
    : [];
  const keysByOwner = new Map(owners.map((ownerId) => [ownerId, new Set([ownerId])]));
  for (const link of links) {
    const legacyId = `owner_${link.applicationId}`;
    keysByOwner.get(link.userId)?.add(legacyId);
    keysByOwner.get(legacyId)?.add(link.userId);
  }
  const keys = [...new Set([...keysByOwner.values()].flatMap((ownerKeys) => [...ownerKeys]))];
  const subscriptions = await db.select({
    ownerId: ownerSubscriptionsTable.ownerId,
    status: ownerSubscriptionsTable.status,
    expiresAt: ownerSubscriptionsTable.expiresAt,
  }).from(ownerSubscriptionsTable).where(inArray(ownerSubscriptionsTable.ownerId, keys));
  const activeKeys = new Set(
    subscriptions.filter((subscription) => isSubscriptionActive(subscription)).map((subscription) => subscription.ownerId),
  );
  return new Set(owners.filter((ownerId) =>
    [...(keysByOwner.get(ownerId) ?? [])].some((key) => activeKeys.has(key)),
  ));
}

router.get("/", async (req, res) => {
  const hasOwnerColumn = await hasExternalServiceOwnerColumn();
  const rows = (await getExternalServices(hasOwnerColumn)).filter((service) => service.isActive);
  let active = rows;
  if (hasOwnerColumn) {
    const ownerIds = rows.map((service) => service.ownerId).filter((id): id is string => !!id);
    if (ownerIds.length > 0) {
      const activeOwners = await activeOwnerIds(ownerIds);
      active = rows.filter((service) => !service.ownerId || activeOwners.has(service.ownerId));
    }
  }
  const { category } = req.query;
  if (category && typeof category === "string") {
    return res.json(active.filter((service) => service.category === category));
  }
  return res.json(active);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "الخدمة غير موجودة" });

  const hasOwnerColumn = await hasExternalServiceOwnerColumn();
  const [service] = await getExternalServices(hasOwnerColumn, id);
  if (!service || !service.isActive) return res.status(404).json({ error: "الخدمة غير موجودة" });
  if (hasOwnerColumn && service.ownerId &&
    !(await activeOwnerIds([service.ownerId])).has(service.ownerId)) {
    return res.status(404).json({ error: "الخدمة غير موجودة" });
  }
  return res.json(service);
});

export default router;