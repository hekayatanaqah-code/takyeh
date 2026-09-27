import { db } from "@workspace/db";
import { ownerSubscriptionsTable, subscriptionPlansTable } from "@workspace/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { logger } from "./logger";

/** Expire subscriptions; public inventory and write access use the actual expiry
 * timestamp, so they stop immediately even between scheduler runs. Do not change
 * listing isActive flags: a paid renewal should restore visibility without
 * accidentally overriding a listing that its owner deliberately paused. */
export async function runSubscriptionExpiryJob() {
  try {
    const [trialPlan] = await db.select({ trialDays: subscriptionPlansTable.trialDays })
      .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, "trial")).limit(1);
    const trialDays = trialPlan?.trialDays ?? 30;
    // Existing published inventory predates subscription rows. Give these owners
    // one recorded trial rather than silently removing their live listings.
    await db.execute(sql`
      INSERT INTO owner_subscriptions (owner_id, plan, status, payment_status, expires_at)
      SELECT owners.owner_id, 'trial', ${trialDays > 0 ? "active" : "expired"}, 'free',
        now() + (${trialDays} * interval '1 day')
      FROM (
        SELECT owner_id FROM chalets WHERE owner_id IS NOT NULL
        UNION
        SELECT owner_id FROM service_providers WHERE owner_id IS NOT NULL
      ) owners
      LEFT JOIN owner_account_links links
        ON links.user_id = owners.owner_id
        OR 'owner_' || links.owner_application_id::text = owners.owner_id
      WHERE NOT EXISTS (
        SELECT 1 FROM owner_subscriptions s
        WHERE s.owner_id = owners.owner_id
          OR s.owner_id = links.user_id
          OR s.owner_id = 'owner_' || links.owner_application_id::text
      )
      ON CONFLICT (owner_id) DO NOTHING
    `);
    const expired = await db.update(ownerSubscriptionsTable)
      .set({ status: "expired" })
      .where(and(
        eq(ownerSubscriptionsTable.status, "active"),
        lte(ownerSubscriptionsTable.expiresAt, new Date()),
      ))
      .returning({ ownerId: ownerSubscriptionsTable.ownerId });
    if (expired.length) logger.info({ count: expired.length }, "Owner subscriptions expired");
  } catch (error) {
    logger.error({ err: error }, "Subscription expiry job failed");
  }
}