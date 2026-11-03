import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, pool, ownerSubscriptionsTable } from "@workspace/db";
import { activateOwnerTrial, getOrStartOwnerSubscription, initialTrialSubscriptionState, ownerPlanAccess } from "./subscription-access";

const prefix = `__trial_verification_${randomUUID()}`;
const instant = new Date("2026-11-03T09:40:20.123Z");
const day = 86_400_000;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("rollback trial verification");
after(async () => { await pool.end(); });

async function isolated(run: (tx: Tx, ownerId: string) => Promise<void>) {
  const ownerId = `${prefix}_${randomUUID()}`;
  await assert.rejects(db.transaction(async (tx) => {
    await run(tx, ownerId);
    throw rollback;
  }), error => error === rollback);
  const remaining = await db.select().from(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  assert.equal(remaining.length, 0, "verification must leave no subscription records");
}

test("first approval starts exactly thirty days at approval, not account creation", async () => {
  await isolated(async (tx, ownerId) => {
    await tx.insert(ownerSubscriptionsTable).values({
      ownerId, plan: "trial", paymentStatus: "free",
      ...initialTrialSubscriptionState(false),
      createdAt: new Date("2020-01-01T00:00:00Z"),
    });
    const activated = await activateOwnerTrial(ownerId, tx, instant);
    assert.equal(activated.status, "active");
    assert.equal(activated.trialStartedAt?.toISOString(), instant.toISOString());
    assert.equal(activated.expiresAt?.getTime(), instant.getTime() + 30 * day);
    const again = await activateOwnerTrial(ownerId, tx, new Date(instant.getTime() + 5 * day));
    assert.equal(again.trialStartedAt?.getTime(), instant.getTime());
    assert.equal(again.expiresAt?.getTime(), activated.expiresAt?.getTime());
  });
});

test("expired used trials and paid subscriptions are never reset by another approval", async () => {
  for (const plan of ["trial", "monthly"]) {
    await isolated(async (tx, ownerId) => {
      const expiry = new Date("2025-01-31T00:00:00Z");
      await tx.insert(ownerSubscriptionsTable).values({
        ownerId, plan, status: "expired", expiresAt: expiry,
        paymentStatus: plan === "trial" ? "free" : "paid",
        trialStartedAt: plan === "trial" ? new Date("2025-01-01T00:00:00Z") : null,
      });
      const result = await activateOwnerTrial(ownerId, tx, instant);
      assert.equal(result.status, "expired");
      assert.equal(result.plan, plan);
      assert.equal(result.expiresAt?.getTime(), expiry.getTime());
    });
  }
});

test("an approval without a prior account read creates and starts one trial atomically", async () => {
  await isolated(async (tx, ownerId) => {
    const result = await activateOwnerTrial(ownerId, tx, instant);
    assert.equal(result.plan, "trial");
    assert.equal(result.status, "active");
    assert.equal(result.trialStartedAt?.getTime(), instant.getTime());
    assert.equal(result.expiresAt?.getTime(), instant.getTime() + 30 * day);
  });
});

test("simultaneous property/service approvals and repeated reads share one immutable activation", async () => {
  const ownerId = `${prefix}_concurrent`;
  try {
    const pending = await getOrStartOwnerSubscription(ownerId);
    assert.equal(pending.status, "pending_activation");
    assert.equal(pending.expiresAt, null);
    const [a, b] = await Promise.all([
      db.transaction(tx => activateOwnerTrial(ownerId, tx, instant)),
      db.transaction(tx => activateOwnerTrial(ownerId, tx, new Date(instant.getTime() + day))),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(a.trialStartedAt?.getTime(), b.trialStartedAt?.getTime());
    assert.equal(a.expiresAt?.getTime(), b.expiresAt?.getTime());
    const read = await getOrStartOwnerSubscription(ownerId);
    assert.equal(read.expiresAt?.getTime(), a.expiresAt?.getTime());
  } finally {
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  }
});

test("pending owners retain first-submission access while holding the registration lock", async () => {
  const ownerId = `${prefix}_registration_lock`;
  let read: ReturnType<typeof ownerPlanAccess> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await getOrStartOwnerSubscription(ownerId);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(731205, hashtext(${ownerId}))`);
      read = ownerPlanAccess(ownerId);
      const access = await Promise.race([
        read,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("registration entitlement read deadlocked")), 2000); }),
      ]);
      assert.equal(access.canSubmitActivities, true);
      assert.equal(access.active, false);
      assert.equal(access.subscription.expiresAt, null);
      assert.equal(access.subscription.trialStartedAt, null);
    });
  } finally {
    if (timer) clearTimeout(timer);
    await read?.catch(() => undefined);
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  }
});
