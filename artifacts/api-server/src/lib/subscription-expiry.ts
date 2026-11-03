import { db } from "@workspace/db";
import { ownerSubscriptionsTable } from "@workspace/db/schema";
import { and, eq, lte } from "drizzle-orm";
import { logger } from "./logger";

/** Expire subscriptions; public inventory and write access use the actual expiry
 * timestamp, so they stop immediately even between scheduler runs. Do not change
 * listing isActive flags: a paid renewal should restore visibility without
 * accidentally overriding a listing that its owner deliberately paused. */
export async function runSubscriptionExpiryJob() {
  try {
    // Approval owns activation. A scheduler/read must never grant a fresh trial.
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