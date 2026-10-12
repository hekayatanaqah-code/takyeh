import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  db, pool, photographersTable, photographyPackagesTable, photographyBookingsTable,
  photographyTransfersTable, photographyRefundsTable, ownerWalletEntriesTable, photographyDeliveriesTable, siteSettingsTable,
  subscriptionPlansTable, subscriptionCheckoutIntentsTable, subscriptionPaymentsTable, ownerSubscriptionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { photographyBalances, photographyRemainingQuote, photographyStatement } from "./photography-finance";
import { requestPhotographyRefund, reconcilePhotographyRefund } from "./photography-refunds";
import { debitOwnerWallet, creditOwnerWallet, ownerWallet } from "./owner-wallet";
import { lockPhotographyAllocation } from "./photography-allocation";
import { confirmPhotographyWalletPayment } from "./photography-wallet";
import { createSubscriptionCheckout, payWalletSubscriptionCheckout } from "./subscription-checkout";

const ownerId = `photography-finance-test:${randomUUID()}`;
let photographerId: number, packageId: number, original: typeof photographyBookingsTable.$inferSelect;
const initialFlag = async () => (await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled")))[0]?.value;
async function booking(overrides: Partial<typeof photographyBookingsTable.$inferInsert> = {}) {
  const [b] = await db.insert(photographyBookingsTable).values({
    ownerId, photographerId, packageId, propertyId: 1, propertyName: "نشاط اختبار مالي مؤقت",
    photographerName: "مصور اختبار مالي مؤقت", packageName: "باقة اختبار مالي",
    ownerPhone: "0500000000", photographerPhone: "0500000000", startAt: new Date(Date.now() - 7200000),
    endAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() + 600000),
    status: "confirmed", priceHalalas: 10000, commissionHalalas: 2000,
    photographerEarningsHalalas: 8000, paymentId: randomUUID(), financialStatus: "paid", ...overrides,
  }).returning();
  return b;
}
before(async () => {
  assert.equal(await initialFlag(), "false", "Financial tests must not activate photography");
  const [p] = await db.insert(photographersTable).values({
    name: "مصور اختبار مالي مؤقت", whatsapp: `finance-test:${randomUUID()}`, status: "approved",
  }).returning();
  photographerId = p.id;
  const [pkg] = await db.insert(photographyPackagesTable).values({
    name: "باقة اختبار مالي مؤقتة", priceHalalas: 10000, platformPercent: "20", active: false,
  }).returning();
  packageId = pkg.id; original = await booking();
});
after(async () => {
  await db.delete(photographyTransfersTable).where(eq(photographyTransfersTable.photographerId, photographerId));
  await db.delete(photographyBookingsTable).where(eq(photographyBookingsTable.ownerId, ownerId));
  await db.delete(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.ownerId, ownerId));
  await db.delete(subscriptionPaymentsTable).where(eq(subscriptionPaymentsTable.ownerId, ownerId));
  await db.delete(subscriptionCheckoutIntentsTable).where(eq(subscriptionCheckoutIntentsTable.ownerId, ownerId));
  await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  assert.equal(await initialFlag(), "false");
  await pool.end();
});
test("photographer money stays pending until explicit delivery and paid transfers reduce only available funds", async () => {
  const pending = await photographyBalances(photographerId);
  assert.equal(pending.pendingHalalas, 8000); assert.equal(pending.availableHalalas, 0);
  await db.update(photographyBookingsTable).set({ status: "completed", deliveredAt: new Date() }).where(eq(photographyBookingsTable.id, original.id));
  assert.equal((await photographyBalances(photographerId)).availableHalalas, 8000);
  await db.insert(photographyTransfersTable).values({ photographerId, amountHalalas: 3000, reference: randomUUID(), transferredAt: new Date() });
  const balance = await photographyBalances(photographerId);
  assert.equal(balance.availableHalalas, 5000); assert.equal(balance.paidHalalas, 3000);
});
test("partial wallet refunds are atomic and duplicate clicks cannot mint money twice", async () => {
  const input = { requestKey: randomUUID(), amountHalalas: 2000, destination: "wallet" as const, reason: "اختبار استرداد جزئي" };
  const results = await Promise.all([requestPhotographyRefund(original.id, "test-admin", input), requestPhotographyRefund(original.id, "test-admin", input)]);
  assert.equal(results[0].refund.id, results[1].refund.id);
  assert.equal(results[0].refund.status, "succeeded");
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 2000);
  const balance = await photographyBalances(photographerId);
  assert.equal(balance.availableHalalas, 3400);
  assert.equal(photographyRemainingQuote(original, 2000).netHalalas, 6400);
  await assert.rejects(requestPhotographyRefund(original.id, "test-admin", { ...input, requestKey: randomUUID(), amountHalalas: 8001 }), /refund_amount/);
  const [row] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, original.id));
  const statement = photographyStatement([row], new Date(Date.now() + 10800000).toISOString().slice(0, 7));
  assert.equal(statement.totalHalalas - statement.refundedHalalas - statement.commissionHalalas, statement.netHalalas);
});
test("wallet insufficient and concurrent spend attempts cannot overdraw, and retry cannot charge twice", async () => {
  await assert.rejects(db.transaction(tx => debitOwnerWallet(tx, ownerId, 2500, randomUUID(), "اختبار رصيد غير كاف")), /wallet_insufficient/);
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 2000);
  const key = randomUUID();
  await Promise.all([db.transaction(tx => debitOwnerWallet(tx, ownerId, 1000, key, "اختبار دفع")), db.transaction(tx => debitOwnerWallet(tx, ownerId, 1000, key, "اختبار دفع"))]);
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 1000);
  const results = await Promise.allSettled([db.transaction(tx => debitOwnerWallet(tx, ownerId, 750, randomUUID(), "اختبار متزامن")), db.transaction(tx => debitOwnerWallet(tx, ownerId, 750, randomUUID(), "اختبار متزامن"))]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 250);
});
test("Moyasar partial refunds verify cumulative payment identity and issue just one provider POST", async () => {
  const b = await booking();
  let posted = 0, refunded = 0;
  const provider = async (_path: string, amount?: number) => {
    if (amount !== undefined) { posted++; refunded += amount; }
    return { id: b.paymentId!, amount: b.priceHalalas, currency: "SAR", status: "paid", refunded };
  };
  const input = { requestKey: randomUUID(), amountHalalas: 1000, destination: "card" as const, reason: "اختبار ميسر دون اتصال خارجي" };
  const results = await Promise.all([requestPhotographyRefund(b.id, "test-admin", input, provider), requestPhotographyRefund(b.id, "test-admin", input, provider)]);
  assert.equal(posted, 1);
  assert.ok(results.some(r => r.refund.status === "succeeded"));
  assert.equal((await requestPhotographyRefund(b.id, "test-admin", input, provider)).refund.status, "succeeded");
  assert.equal(posted, 1);
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 250);
  const [row] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, b.id));
  assert.equal(row.status, "cancelled"); assert.equal(row.refundedHalalas, 1000);
});
test("uncertain card refund response remains pending, then reconciliation confirms without resending", async () => {
  const b = await booking(); let posted = 0, refunded = 0;
  const provider = async (_path: string, amount?: number) => {
    if (amount !== undefined) { posted++; refunded = amount; throw new Error("simulated_timeout"); }
    return { id: b.paymentId!, amount: b.priceHalalas, currency: "SAR", status: "paid", refunded };
  };
  const first = await requestPhotographyRefund(b.id, "test-admin", { requestKey: randomUUID(), amountHalalas: 2000, destination: "card", reason: "اختبار مهلة" }, provider);
  assert.equal(first.refund.status, "pending");
  const verificationDenied = async () => {
    const error = new Error("verification_denied") as Error & { definitive?: boolean };
    error.definitive = true;
    throw error;
  };
  assert.equal((await reconcilePhotographyRefund(first.refund.id, verificationDenied)).refund.status, "pending");
  await assert.rejects(requestPhotographyRefund(b.id, "test-admin", {
    requestKey: randomUUID(), amountHalalas: 2000, destination: "wallet", reason: "لا يجوز تحرير استرداد غير مؤكد",
  }), /refund_pending/);
  assert.equal((await reconcilePhotographyRefund(first.refund.id, provider)).refund.status, "succeeded");
  await reconcilePhotographyRefund(first.refund.id, provider);
  assert.equal(posted, 1);
  const [row] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, b.id));
  assert.equal(row.refundedHalalas, 2000);
});
test("wallet confirms a photography reservation and queues notices atomically without opening the service", async () => {
  await db.transaction(tx => creditOwnerWallet(tx, ownerId, 1000, randomUUID(), "رصيد اختبار"));
  const b = await booking({ status: "awaiting_payment", paymentId: null, financialStatus: "unpaid", priceHalalas: 1000, commissionHalalas: 200, photographerEarningsHalalas: 800 });
  const pay = () => db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [current] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, b.id)).for("update");
    return confirmPhotographyWalletPayment(tx, current);
  });
  const result = await Promise.all([pay(), pay()]);
  assert.equal(result[0].status, "confirmed"); assert.equal(result[1].paymentMethod, "wallet");
  assert.equal((await ownerWallet(ownerId)).balanceHalalas, 250);
  const notices = await db.select().from(photographyDeliveriesTable).where(eq(photographyDeliveriesTable.bookingId, b.id));
  assert.equal(notices.length, 2);
  assert.equal(await initialFlag(), "false");
});
test("refunded settled earnings are recoverable, never a negative transfer or a new available balance", async () => {
  await requestPhotographyRefund(original.id, "test-admin", { requestKey: randomUUID(), amountHalalas: 8000, destination: "wallet", reason: "اختبار استرداد المتبقي بعد التسوية" });
  const balance = await photographyBalances(photographerId);
  assert.equal(balance.availableHalalas, 0); assert.equal(balance.recoverableHalalas, 3000);
  assert.equal(balance.pendingHalalas, 800);
});
test("subscription wallet checkout activates the real quoted plan once, without Moyasar or new card consent", async () => {
  const slug = `wallet-finance-test-${randomUUID()}`;
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => { throw new Error("wallet payment must not contact Moyasar"); }) as typeof fetch;
    await db.insert(subscriptionPlansTable).values({
      slug, nameAr: "اشتراك اختبار المحفظة", price: "5.00", durationDays: 30, trialDays: 0,
      features: [], scope: "property", chaletLimit: 1, serviceLimit: 0, isActive: true,
    });
    const beforeBalance = (await ownerWallet(ownerId)).balanceHalalas;
    const quote = await createSubscriptionCheckout({ ownerId, plan: slug, paymentMethod: "wallet", autoRenewConsent: true });
    const [intent] = await db.select().from(subscriptionCheckoutIntentsTable).where(eq(subscriptionCheckoutIntentsTable.id, quote.checkoutId));
    assert.equal(intent.autoRenewConsent, false);
    const result = await Promise.all([payWalletSubscriptionCheckout({ ownerId, checkoutId: quote.checkoutId }), payWalletSubscriptionCheckout({ ownerId, checkoutId: quote.checkoutId })]);
    assert.equal(result[0].invoice.amount, 5); assert.equal(result[1].subscription.status, "active");
    assert.equal((await ownerWallet(ownerId)).balanceHalalas, beforeBalance - 500);
    assert.equal(result[0].subscription.autoRenewEnabled, false);
    const other = await createSubscriptionCheckout({ ownerId, plan: slug, paymentMethod: "wallet" });
    await db.update(subscriptionCheckoutIntentsTable).set({ paymentMethod: "card" }).where(eq(subscriptionCheckoutIntentsTable.id, other.checkoutId));
    await assert.rejects(payWalletSubscriptionCheckout({ ownerId, checkoutId: other.checkoutId }), /مخصص للبطاقة/);
    assert.equal((await ownerWallet(ownerId)).balanceHalalas, beforeBalance - 500);
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, slug));
  }
});
