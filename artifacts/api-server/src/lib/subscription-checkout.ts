import { randomUUID } from "node:crypto";
import { and, count, eq, gt, inArray, isNull, notLike, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerSubscriptionsTable,
  subscriptionCheckoutIntentsTable,
  subscriptionPaymentsTable,
  subscriptionPlansTable,
  subscriptionPromoCodesTable,
  type OwnerSubscription,
  type SubscriptionTerms,
} from "@workspace/db/schema";
import { getOrStartOwnerSubscription, subscriptionOwnerKeys } from "./subscription-access";
import { isArchivedSubscriptionPlan } from "./subscription-defaults";

const INTENT_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SubscriptionCheckoutError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "SubscriptionCheckoutError";
  }
}

interface ResolvedPlan {
  slug: string;
  price: number;
  days: number;
  label: string;
  terms: SubscriptionTerms;
}

interface SubscriptionInvoice {
  paymentId: string;
  plan: string;
  label: string;
  amount: number;
  currency: "SAR";
  paidAt: string;
  expiresAt: string;
  ownerName: string;
  discountHalala?: number;
}

interface CompletedCheckout {
  subscription: OwnerSubscription;
  invoice: SubscriptionInvoice;
}

async function resolveActivePlan(plan: string): Promise<ResolvedPlan> {
  if (typeof plan !== "string" || !/^[\p{L}\p{N}_-]{1,100}$/u.test(plan)) {
    throw new SubscriptionCheckoutError("اختر باقة صالحة");
  }
  const [configured] = await db.select({
    slug: subscriptionPlansTable.slug,
    price: subscriptionPlansTable.price,
    durationDays: subscriptionPlansTable.durationDays,
    nameAr: subscriptionPlansTable.nameAr,
    isActive: subscriptionPlansTable.isActive,
    features: subscriptionPlansTable.features,
    scope: subscriptionPlansTable.scope,
    chaletLimit: subscriptionPlansTable.chaletLimit,
    serviceLimit: subscriptionPlansTable.serviceLimit,
  }).from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, plan)).limit(1);

  if (!configured) throw new SubscriptionCheckoutError("الباقة المطلوبة غير موجودة");
  if (!configured.isActive || isArchivedSubscriptionPlan({ slug: configured.slug, nameAr: configured.nameAr })) {
    throw new SubscriptionCheckoutError("هذه الباقة غير متاحة حالياً");
  }
  const price = Number(configured.price);
  if (!Number.isFinite(price) || price < 0 || configured.durationDays < 1) {
    throw new SubscriptionCheckoutError("إعدادات سعر الباقة أو مدتها غير صالحة", 500);
  }
  return {
    slug: configured.slug, price, days: configured.durationDays, label: configured.nameAr,
    terms: {
      nameAr: configured.nameAr,
      features: configured.features,
      scope: configured.scope === "property" ? "property" : "full",
      chaletLimit: configured.chaletLimit,
      serviceLimit: configured.serviceLimit,
    },
  };
}

function planFromIntent(intent: {
  plan: string;
  listPriceHalala: number;
  durationDays: number;
  planLabel: string;
  termsSnapshot: SubscriptionTerms | null;
}): ResolvedPlan {
  return {
    slug: intent.plan,
    price: intent.listPriceHalala / 100,
    days: intent.durationDays,
    label: intent.planLabel,
    terms: intent.termsSnapshot ?? {
      nameAr: intent.planLabel, features: [], scope: "full",
      chaletLimit: 1, serviceLimit: 1,
    },
  };
}

function normalizePromoCode(code: string | undefined): string | null {
  if (code == null || code.trim() === "") return null;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,40}$/.test(normalized)) {
    throw new SubscriptionCheckoutError("صيغة رمز الخصم غير صحيحة");
  }
  return normalized;
}

function promoDiscountHalala(
  promo: { kind: "percent" | "fixed"; value: string },
  priceHalala: number,
): number {
  const value = Number(promo.value);
  if (!Number.isFinite(value) || value <= 0 || (promo.kind === "percent" && value > 100)) {
    throw new SubscriptionCheckoutError("إعدادات رمز الخصم غير صالحة", 500);
  }
  const discount = promo.kind === "percent"
    ? Math.round(priceHalala * value / 100)
    : Math.round(value * 100);
  return Math.min(priceHalala, Math.max(0, discount));
}

function buildInvoice(
  subscription: OwnerSubscription,
  plan: ResolvedPlan,
  paymentId: string,
  amountHalala: number,
  discountHalala: number,
  paidAt = new Date(),
): SubscriptionInvoice {
  return {
    paymentId,
    plan: plan.slug,
    label: plan.label,
    amount: amountHalala / 100,
    currency: "SAR",
    paidAt: paidAt.toISOString(),
    expiresAt: subscription.expiresAt?.toISOString() ?? "",
    ownerName: "صاحب الحساب",
    ...(discountHalala > 0 ? { discountHalala } : {}),
  };
}

async function readCompletedCheckout(
  ownerId: string,
  checkoutId: string,
  paymentId?: string,
): Promise<CompletedCheckout | null> {
  const [intent] = await db.select().from(subscriptionCheckoutIntentsTable)
    .where(eq(subscriptionCheckoutIntentsTable.id, checkoutId)).limit(1);
  if (!intent || intent.consumedAt == null) {
    return null;
  }
  const ownerKeys = await subscriptionOwnerKeys(ownerId);
  if (!ownerKeys.includes(intent.ownerId)) return null;
  const [payment] = await db.select().from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.intentId, checkoutId)).limit(1);
  if (!payment || (paymentId && payment.paymentId !== paymentId)) return null;
  const [subscription] = await db.select().from(ownerSubscriptionsTable)
    .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId)).limit(1);
  if (!subscription) return null;
  const plan = planFromIntent(intent);
  return {
    subscription,
    invoice: buildInvoice(
      subscription,
      plan,
      payment.paymentId,
      payment.amountHalala,
      Math.max(0, intent.listPriceHalala - payment.amountHalala),
      payment.createdAt,
    ),
  };
}

export async function createSubscriptionCheckout(input: {
  ownerId: string;
  plan: string;
  promoCode?: string;
}): Promise<{
  checkoutId: string;
  amountHalala: number;
  label: string;
  days: number;
  discountHalala: number;
  publishableKey: string;
}> {
  if (!input.ownerId) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  const plan = await resolveActivePlan(input.plan);
  const listPriceHalala = Math.round(plan.price * 100);
  if (!Number.isSafeInteger(listPriceHalala) || listPriceHalala < 0) {
    throw new SubscriptionCheckoutError("سعر الباقة غير صالح", 500);
  }

  const promoCode = normalizePromoCode(input.promoCode);
  const checkoutId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  const ownerSubscription = await getOrStartOwnerSubscription(input.ownerId);
  let discountHalala = 0;

  if (promoCode) {
    await db.transaction(async (tx) => {
      // Serialize discount validation and reservation checks for this code. Valid,
      // unexpired pending intents reserve the remaining uses without counting
      // abandoned checkouts permanently against the promotion.
      const [promo] = await tx.select().from(subscriptionPromoCodesTable)
        .where(eq(subscriptionPromoCodesTable.code, promoCode))
        .for("update")
        .limit(1);
      if (!promo || !promo.isActive || (promo.expiresAt && promo.expiresAt <= now)) {
        throw new SubscriptionCheckoutError("رمز الخصم غير صالح أو منتهي");
      }

      const [pending] = await tx.select({ value: count() }).from(subscriptionCheckoutIntentsTable)
        .where(and(
          eq(subscriptionCheckoutIntentsTable.discountCode, promoCode),
          isNull(subscriptionCheckoutIntentsTable.consumedAt),
          gt(subscriptionCheckoutIntentsTable.expiresAt, now),
        ));
      if (promo.usageLimit != null && promo.usedCount + Number(pending?.value ?? 0) >= promo.usageLimit) {
        throw new SubscriptionCheckoutError("اكتمل عدد مرات استخدام رمز الخصم");
      }

      discountHalala = promoDiscountHalala(promo, listPriceHalala);
      const amountHalala = Math.max(0, listPriceHalala - discountHalala);
      assertPaymentConfigured(amountHalala);
      await tx.insert(subscriptionCheckoutIntentsTable).values({
        id: checkoutId,
        ownerId: ownerSubscription.ownerId,
        plan: plan.slug,
        listPriceHalala,
        amountHalala: Math.max(0, listPriceHalala - discountHalala),
        durationDays: plan.days,
        planLabel: plan.label,
        termsSnapshot: plan.terms,
        discountCode: promoCode,
        expiresAt,
      });
    });
  } else {
    assertPaymentConfigured(listPriceHalala);
    await db.insert(subscriptionCheckoutIntentsTable).values({
      id: checkoutId,
      ownerId: ownerSubscription.ownerId,
      plan: plan.slug,
      listPriceHalala,
      amountHalala: listPriceHalala,
      durationDays: plan.days,
      planLabel: plan.label,
      termsSnapshot: plan.terms,
      expiresAt,
    });
  }

  const amountHalala = Math.max(0, listPriceHalala - discountHalala);
  const publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY ?? "";
  return {
    checkoutId,
    amountHalala,
    label: plan.label,
    days: plan.days,
    discountHalala,
    publishableKey,
  };
}

function assertPaymentConfigured(amountHalala: number) {
  if (amountHalala > 0 && (!process.env.MOYASAR_SECRET_KEY || !process.env.MOYASAR_PUBLISHABLE_KEY)) {
    throw new SubscriptionCheckoutError("بوابة الدفع غير مُهيأة لإتمام الدفع", 503);
  }
}

async function finalizeCheckout(input: {
  ownerId: string;
  checkoutId: string;
  paymentId: string;
  paidAmountHalala: number;
  paidAt: Date;
  allowExpiredIntent: boolean;
}): Promise<CompletedCheckout> {
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!ownerKeys.length) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  const [previewIntent] = await db.select().from(subscriptionCheckoutIntentsTable)
    .where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  if (!previewIntent || !ownerKeys.includes(previewIntent.ownerId)) {
    throw new SubscriptionCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }

  try {
    return await db.transaction(async (tx) => {
      const [intent] = await tx.select().from(subscriptionCheckoutIntentsTable)
        .where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId))
        .for("update")
        .limit(1);
      if (!intent || !ownerKeys.includes(intent.ownerId)) {
        throw new SubscriptionCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
      }
      const quote = planFromIntent(intent);

      const [existingPayment] = await tx.select().from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.intentId, input.checkoutId)).limit(1);
      if (existingPayment) {
        if (existingPayment.ownerId !== intent.ownerId || existingPayment.paymentId !== input.paymentId) {
          throw new SubscriptionCheckoutError("سبق استخدام طلب الدفع هذا", 409);
        }
        const [existingSubscription] = await tx.select().from(ownerSubscriptionsTable)
          .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId)).limit(1);
        if (!existingSubscription) throw new SubscriptionCheckoutError("تعذّر العثور على الاشتراك", 500);
        return {
          subscription: existingSubscription,
          invoice: buildInvoice(
            existingSubscription,
            quote,
            existingPayment.paymentId,
            existingPayment.amountHalala,
            Math.max(0, intent.listPriceHalala - existingPayment.amountHalala),
            existingPayment.createdAt,
          ),
        };
      }

      if (intent.amountHalala === 0) {
        // Lock every linked identity in a deterministic order so distinct free
        // checkout intents for the same account cannot both pass the lifetime check.
        for (const ownerKey of [...new Set(ownerKeys)].sort()) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(731204, hashtext(${ownerKey}))`);
        }
        const [priorFreeRedemption] = await tx.select({ value: count() })
          .from(subscriptionPaymentsTable)
          .where(and(
            inArray(subscriptionPaymentsTable.ownerId, ownerKeys),
            eq(subscriptionPaymentsTable.amountHalala, 0),
            notLike(subscriptionPaymentsTable.plan, "addon:%"),
          ));
        if (Number(priorFreeRedemption?.value ?? 0) > 0) {
          throw new SubscriptionCheckoutError("يمكن استرداد اشتراك مجاني مرة واحدة فقط لكل حساب", 409);
        }
      }

      const [samePayment] = await tx.select().from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.paymentId, input.paymentId)).limit(1);
      if (samePayment) throw new SubscriptionCheckoutError("سبق استخدام عملية الدفع هذه", 409);
      if (intent.amountHalala !== input.paidAmountHalala) {
        throw new SubscriptionCheckoutError("المبلغ المدفوع لا يتطابق مع طلب الدفع", 400);
      }
      if (intent.expiresAt <= new Date() &&
          (!input.allowExpiredIntent || input.paidAt > intent.expiresAt)) {
        throw new SubscriptionCheckoutError("انتهت صلاحية طلب الدفع؛ ابدأ عملية دفع جديدة", 410);
      }

      if (intent.discountCode) {
        // Usage is committed only once, in the same transaction as activation.
        // The issued intent reserved a use until expiry, so later deactivation of
        // the code or plan's usage-limit edits do not strand an already-paid buyer.
        const [promo] = await tx.select().from(subscriptionPromoCodesTable)
          .where(eq(subscriptionPromoCodesTable.code, intent.discountCode))
          .for("update")
          .limit(1);
        if (!promo) throw new SubscriptionCheckoutError("تعذّر العثور على رمز الخصم المحجوز", 409);
        await tx.update(subscriptionPromoCodesTable)
          .set({ usedCount: sql`${subscriptionPromoCodesTable.usedCount} + 1` })
          .where(eq(subscriptionPromoCodesTable.id, promo.id));
      }

      const now = new Date();
      const [existingSubscription] = await tx.select().from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId))
        .for("update")
        .limit(1);
      const baseDate = existingSubscription?.expiresAt && existingSubscription.expiresAt > now
        ? existingSubscription.expiresAt
        : now;
      const expiresAt = new Date(baseDate.getTime() + intent.durationDays * DAY_MS);
      const [subscription] = existingSubscription
        ? await tx.update(ownerSubscriptionsTable)
          .set({
            plan: intent.plan,
            status: "active",
            expiresAt,
            paymentStatus: "paid",
            termsSnapshot: intent.termsSnapshot,
          })
          .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId))
          .returning()
        : await tx.insert(ownerSubscriptionsTable).values({
            ownerId: intent.ownerId,
            plan: intent.plan,
            status: "active",
            expiresAt,
            paymentStatus: "paid",
            termsSnapshot: intent.termsSnapshot,
          }).returning();

      await tx.insert(subscriptionPaymentsTable).values({
        paymentId: input.paymentId,
        ownerId: intent.ownerId,
        intentId: intent.id,
        plan: intent.plan,
        amountHalala: intent.amountHalala,
      });
      await tx.update(subscriptionCheckoutIntentsTable)
        .set({ consumedAt: now })
        .where(eq(subscriptionCheckoutIntentsTable.id, intent.id));

      if (!subscription) throw new SubscriptionCheckoutError("تعذّر تفعيل الاشتراك", 500);
      const discountHalala = Math.max(0, intent.listPriceHalala - intent.amountHalala);
      return {
        subscription,
        invoice: buildInvoice(subscription, quote, input.paymentId, intent.amountHalala, discountHalala, input.paidAt),
      };
    });
  } catch (error) {
    // A competing retry may have committed between the preflight and transaction.
    const [committedPayment] = await db.select().from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.paymentId, input.paymentId)).limit(1);
    if (committedPayment?.intentId === input.checkoutId &&
        ownerKeys.includes(committedPayment.ownerId)) {
      const result = await readCompletedCheckout(input.ownerId, input.checkoutId, input.paymentId);
      if (result) return result;
    }
    throw error;
  }
}

export async function confirmSubscriptionCheckout(input: {
  ownerId: string;
  checkoutId: string;
  paymentId: string;
}): Promise<CompletedCheckout> {
  if (!input.ownerId) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.checkoutId) ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(input.paymentId)) {
    throw new SubscriptionCheckoutError("بيانات الدفع غير صالحة");
  }

  const [priorPayment] = await db.select().from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.paymentId, input.paymentId)).limit(1);
  if (priorPayment) {
    if (priorPayment.intentId !== input.checkoutId) {
      throw new SubscriptionCheckoutError("سبق استخدام عملية الدفع هذه", 409);
    }
    const result = await readCompletedCheckout(input.ownerId, input.checkoutId, input.paymentId);
    if (result) return result;
    throw new SubscriptionCheckoutError("عملية الدفع لا تخص هذا الحساب", 403);
  }

  const [intent] = await db.select().from(subscriptionCheckoutIntentsTable)
    .where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!intent || !ownerKeys.includes(intent.ownerId)) {
    throw new SubscriptionCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }
  if (intent.amountHalala <= 0) {
    throw new SubscriptionCheckoutError("استخدم تأكيد الخصم الكامل لإتمام هذا الطلب");
  }

  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) throw new SubscriptionCheckoutError("بوابة الدفع غير مُهيأة", 503);

  let payment: {
    id?: string;
    status?: string;
    amount?: number;
    description?: string;
    created_at?: string;
  };
  try {
    const response = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(input.paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
    });
    if (!response.ok) throw new SubscriptionCheckoutError("تعذّر التحقق من الدفع لدى بوابة الدفع", 400);
    payment = await response.json() as typeof payment;
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) throw error;
    throw new SubscriptionCheckoutError("تعذّر الاتصال ببوابة الدفع. أعد المحاولة.", 502);
  }

  if (payment.id !== input.paymentId || payment.status !== "paid") {
    throw new SubscriptionCheckoutError("لم تؤكد بوابة الدفع إتمام العملية");
  }
  if (payment.amount !== intent.amountHalala) {
    throw new SubscriptionCheckoutError("المبلغ المدفوع لا يتطابق مع طلب الدفع");
  }
  if (typeof payment.description !== "string" || !payment.description.includes(input.checkoutId)) {
    throw new SubscriptionCheckoutError("عملية الدفع غير مرتبطة بطلب الاشتراك هذا", 403);
  }
  const paidAt = payment.created_at ? new Date(payment.created_at) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new SubscriptionCheckoutError("تاريخ الدفع غير صالح");

  return finalizeCheckout({
    ownerId: input.ownerId,
    checkoutId: input.checkoutId,
    paymentId: input.paymentId,
    paidAmountHalala: payment.amount,
    paidAt,
    allowExpiredIntent: true,
  });
}

export async function redeemFreeSubscriptionCheckout(input: {
  ownerId: string;
  checkoutId: string;
}): Promise<CompletedCheckout> {
  if (!input.ownerId) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.checkoutId)) {
    throw new SubscriptionCheckoutError("طلب الدفع غير صالح");
  }
  const [intent] = await db.select().from(subscriptionCheckoutIntentsTable)
    .where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!intent || !ownerKeys.includes(intent.ownerId)) {
    throw new SubscriptionCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }
  if (intent.amountHalala !== 0) {
    throw new SubscriptionCheckoutError("هذا الطلب ليس مشمولاً بخصم كامل");
  }
  return finalizeCheckout({
    ownerId: input.ownerId,
    checkoutId: input.checkoutId,
    paymentId: `free:${input.checkoutId}`,
    paidAmountHalala: 0,
    paidAt: new Date(),
    allowExpiredIntent: false,
  });
}