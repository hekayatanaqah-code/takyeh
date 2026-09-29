import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerSubscriptionsTable,
  subscriptionAddonCheckoutIntentsTable,
  subscriptionAddonPurchasesTable,
  subscriptionPaymentsTable,
  subscriptionPlansTable,
  ownerBillingProfilesTable,
} from "@workspace/db/schema";
import { isSubscriptionActive, ownerPlanAccess, subscriptionOwnerKeys } from "./subscription-access";
import {
  decryptMoyasarToken,
  encryptMoyasarToken,
  isMoyasarTokenVaultAvailable,
} from "./subscription-token-vault";
import {
  addonPurchaseBillingTerms,
  quoteAddonCheckout,
} from "./subscription-billing-math";

const INTENT_TTL_MS = 30 * 60 * 1000;
const MAX_HALALA_AMOUNT = 2_147_483_647;

export class SubscriptionAddonCheckoutError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "SubscriptionAddonCheckoutError";
  }
}

export type SubscriptionAddonType = "chalet" | "service";

interface AddonInvoice {
  paymentId: string;
  addonType: SubscriptionAddonType;
  label: string;
  amount: number;
  currency: "SAR";
  paidAt: string;
  recurring: boolean;
  monthlyUnitPriceHalala: number;
  paidThroughAt: string | null;
}

interface CompletedAddonCheckout {
  purchase: typeof subscriptionAddonPurchasesTable.$inferSelect;
  invoice: AddonInvoice;
}

function validateAddonType(addonType: unknown): asserts addonType is SubscriptionAddonType {
  if (addonType !== "chalet" && addonType !== "service") {
    throw new SubscriptionAddonCheckoutError("نوع الإضافة غير صالح");
  }
}

function validateQuantity(quantity: unknown): asserts quantity is number {
  if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 50) {
    throw new SubscriptionAddonCheckoutError("كمية الإضافة يجب أن تكون عدداً صحيحاً من 1 إلى 50");
  }
}

function validateCheckoutId(checkoutId: unknown): asserts checkoutId is string {
  if (typeof checkoutId !== "string" || !/^[0-9a-f-]{36}$/i.test(checkoutId)) {
    throw new SubscriptionAddonCheckoutError("طلب الدفع غير صالح");
  }
}

function validatePaymentId(paymentId: unknown): asserts paymentId is string {
  if (typeof paymentId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(paymentId)) {
    throw new SubscriptionAddonCheckoutError("معرّف عملية الدفع غير صالح");
  }
}

function addonLabel(addonType: SubscriptionAddonType) {
  return addonType === "chalet" ? "عقار إضافي" : "خدمة إضافية";
}

function hasUnusedCapacity(
  access: Awaited<ReturnType<typeof ownerPlanAccess>>,
  addonType: SubscriptionAddonType,
) {
  return addonType === "chalet"
    ? access.chaletCount < access.chaletLimit
    : access.serviceCount < access.serviceLimit;
}

function assertNoUnusedCapacity(
  access: Awaited<ReturnType<typeof ownerPlanAccess>>,
  addonType: SubscriptionAddonType,
) {
  if (hasUnusedCapacity(access, addonType)) {
    throw new SubscriptionAddonCheckoutError(
      `لديك سعة متاحة بالفعل؛ استخدمها قبل تفعيل ${addonLabel(addonType)} المجانية`,
      409,
    );
  }
}

function buildInvoice(
  purchase: typeof subscriptionAddonPurchasesTable.$inferSelect,
  paymentId = purchase.paymentId,
): AddonInvoice {
  return {
    paymentId,
    addonType: purchase.addonType,
    label: addonLabel(purchase.addonType),
    amount: purchase.amountHalala / 100,
    currency: "SAR",
    paidAt: purchase.createdAt.toISOString(),
    recurring: purchase.recurring,
    monthlyUnitPriceHalala: purchase.monthlyUnitPriceHalala,
    paidThroughAt: purchase.paidThroughAt?.toISOString() ?? null,
  };
}

async function readCompletedAddonCheckout(
  ownerId: string,
  checkoutId: string,
  paymentId?: string,
): Promise<CompletedAddonCheckout | null> {
  const [intent] = await db.select().from(subscriptionAddonCheckoutIntentsTable)
    .where(eq(subscriptionAddonCheckoutIntentsTable.id, checkoutId)).limit(1);
  if (!intent?.consumedAt) return null;
  const ownerKeys = await subscriptionOwnerKeys(ownerId);
  if (!ownerKeys.includes(intent.ownerId)) return null;
  const [purchase] = await db.select().from(subscriptionAddonPurchasesTable)
    .where(eq(subscriptionAddonPurchasesTable.intentId, checkoutId)).limit(1);
  if (!purchase || (paymentId && purchase.paymentId !== paymentId)) return null;
  return { purchase, invoice: buildInvoice(purchase) };
}

type AddonQuoteContext = {
  access: Awaited<ReturnType<typeof ownerPlanAccess>>;
  unitPriceHalala: number;
  cycleDays: number;
  recurringAddons: Array<typeof subscriptionAddonPurchasesTable.$inferSelect>;
};

async function readAddonQuoteContext(input: {
  ownerId: string;
  addonType: SubscriptionAddonType;
}): Promise<AddonQuoteContext> {
  const access = await ownerPlanAccess(input.ownerId);
  const configuredPrice = input.addonType === "chalet"
    ? access.extraChaletPrice
    : access.extraServicePrice;
  if (configuredPrice == null) {
    throw new SubscriptionAddonCheckoutError("لم تُحدّد الإدارة سعر هذه الإضافة بعد", 409);
  }
  const configuredPriceNumber = Number(configuredPrice);
  const unitPriceHalala = Math.round(configuredPriceNumber * 100);
  if (!Number.isFinite(configuredPriceNumber) || configuredPriceNumber < 0 ||
      !Number.isSafeInteger(unitPriceHalala)) {
    throw new SubscriptionAddonCheckoutError("سعر الإضافة غير صالح", 500);
  }
  if (!isSubscriptionActive(access.subscription)) {
    throw new SubscriptionAddonCheckoutError("انتهى اشتراكك. جدّده قبل شراء الإضافات.", 403);
  }
  if (!access.subscription.expiresAt) {
    throw new SubscriptionAddonCheckoutError("لا يمكن تحديد نهاية فترة الاشتراك الحالية", 409);
  }
  const [basePlan] = await db.select({ durationDays: subscriptionPlansTable.durationDays })
    .from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, access.subscription.plan)).limit(1);
  const cycleDays = access.subscription.billingCycleDays ?? basePlan?.durationDays ?? 30;
  if (!Number.isSafeInteger(cycleDays) || cycleDays < 1) {
    throw new SubscriptionAddonCheckoutError("مدة دورة الاشتراك غير صالحة", 409);
  }
  const ownerIds = await subscriptionOwnerKeys(input.ownerId);
  const recurringAddons = await db.select().from(subscriptionAddonPurchasesTable)
    .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerIds));
  return { access, unitPriceHalala, cycleDays, recurringAddons };
}

function buildAddonQuote(input: {
  context: AddonQuoteContext;
  addonType: SubscriptionAddonType;
  quantity: number;
  quoteTime: Date;
}) {
  const { access, unitPriceHalala, cycleDays, recurringAddons } = input.context;
  const periodEndAt = access.subscription.expiresAt!;
  const math = quoteAddonCheckout({
    addonType: input.addonType,
    quantity: input.quantity,
    monthlyUnitPriceHalala: unitPriceHalala,
    cycleDays,
    periodStartAt: input.quoteTime,
    periodEndAt,
    baseLabel: access.subscription.termsSnapshot?.nameAr ?? access.subscription.plan,
    baseAmountHalala: access.subscription.renewalPriceHalala ?? 0,
    recurringAddons,
  });
  return {
    amountHalala: math.amountHalala,
    unitPriceHalala,
    monthlyUnitPriceHalala: unitPriceHalala,
    remainingDays: math.remainingDays,
    cycleDays,
    billingDays: cycleDays,
    periodStartAt: input.quoteTime,
    periodEndAt,
    nextBillingAt: periodEndAt,
    nextChargeHalala: math.nextChargeHalala,
    baseMonthlyHalala: math.baseMonthlyHalala,
  };
}

export async function previewAddonCheckout(input: {
  ownerId: string;
  addonType: SubscriptionAddonType;
  quantity?: number;
}) {
  if (typeof input.ownerId !== "string" || !input.ownerId) {
    throw new SubscriptionAddonCheckoutError("سجّل الدخول أولاً", 401);
  }
  validateAddonType(input.addonType);
  const quantity = input.quantity ?? 1;
  validateQuantity(quantity);
  const context = await readAddonQuoteContext(input);
  if (context.unitPriceHalala === 0) assertNoUnusedCapacity(context.access, input.addonType);
  const quote = buildAddonQuote({
    context,
    addonType: input.addonType,
    quantity,
    quoteTime: new Date(),
  });
  const recurringConfigured = canSavePaymentMethod();
  return {
    addonType: input.addonType,
    quantity,
    amountHalala: quote.amountHalala,
    monthlyUnitPriceHalala: quote.monthlyUnitPriceHalala,
    remainingDays: quote.remainingDays,
    cycleDays: quote.cycleDays,
    billingDays: quote.billingDays,
    periodStartAt: quote.periodStartAt.toISOString(),
    periodEndAt: quote.periodEndAt.toISOString(),
    nextBillingAt: quote.nextBillingAt.toISOString(),
    nextChargeHalala: quote.nextChargeHalala,
    baseMonthlyHalala: quote.baseMonthlyHalala,
    recurringConfigured,
    canSavePaymentMethod: recurringConfigured,
    autoRenewAvailable: recurringConfigured,
    savedPaymentMethodAvailable: await hasSavedPaymentMethod(context.access.subscription.ownerId),
    nextChargeRequiresExplicitConsent: true,
  };
}

export async function createAddonCheckout(input: {
  ownerId: string;
  addonType: SubscriptionAddonType;
  quantity?: number;
  autoRenewConsent?: boolean;
}): Promise<{
  checkoutId: string;
  amountHalala: number;
  publishableKey: string;
  addonType: SubscriptionAddonType;
  quantity: number;
  unitPriceHalala: number;
  monthlyUnitPriceHalala: number;
  cycleDays: number;
  periodStartAt: string;
  periodEndAt: string;
  autoRenewConsent: boolean;
  nextChargeHalala: number;
  nextBillingAt: string | null;
  recurring: boolean;
  canSavePaymentMethod: boolean;
  recurringConfigured: boolean;
  savedPaymentMethodAvailable: boolean;
  remainingDays: number;
  billingDays: number;
  baseMonthlyHalala: number;
}> {
  if (typeof input.ownerId !== "string" || !input.ownerId) {
    throw new SubscriptionAddonCheckoutError("سجّل الدخول أولاً", 401);
  }
  validateAddonType(input.addonType);
  const quantity = input.quantity ?? 1;
  validateQuantity(quantity);
  const consent = input.autoRenewConsent === true;
  if (consent && !canSavePaymentMethod()) {
    throw new SubscriptionAddonCheckoutError("حفظ وسيلة الدفع مشفرًا غير مهيأ حالياً", 503);
  }
  const context = await readAddonQuoteContext(input);
  if (!consent && context.unitPriceHalala > 0) {
    throw new SubscriptionAddonCheckoutError("تأكيد التجديد التلقائي مطلوب لإتمام شراء إضافة دورية", 400);
  }
  // An active subscription may buy ahead of current usage. Keep quotes grouped
  // by requested quantity so changing quantity cannot silently reuse a quote.
  const intent = await db.transaction(async (tx) => {
    const [lockedSubscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, context.access.subscription.ownerId))
      .for("update").limit(1);
    if (!lockedSubscription || !isSubscriptionActive(lockedSubscription) || !lockedSubscription.expiresAt) {
      throw new SubscriptionAddonCheckoutError("انتهى اشتراكك. جدّده قبل شراء الإضافات.", 403);
    }
    const freshAccess = await ownerPlanAccess(input.ownerId);
    const access = { ...freshAccess, subscription: lockedSubscription };
    const linkedOwnerIds = await subscriptionOwnerKeys(input.ownerId);
    const existingRecurringAddons = await tx.select().from(subscriptionAddonPurchasesTable)
      .where(inArray(subscriptionAddonPurchasesTable.ownerId, linkedOwnerIds));
    const cycleDays = lockedSubscription.billingCycleDays ?? context.cycleDays;
    if (!Number.isSafeInteger(cycleDays) || cycleDays < 1) {
      throw new SubscriptionAddonCheckoutError("مدة دورة الاشتراك غير صالحة", 409);
    }
    const quoteContext: AddonQuoteContext = {
      ...context,
      access,
      cycleDays,
      recurringAddons: existingRecurringAddons,
    };
    const configuredPrice = input.addonType === "chalet" ? access.extraChaletPrice : access.extraServicePrice;
    const currentUnitPriceHalala = configuredPrice == null ? null : Math.round(Number(configuredPrice) * 100);
    if (currentUnitPriceHalala == null || !Number.isSafeInteger(currentUnitPriceHalala) || currentUnitPriceHalala < 0) {
      throw new SubscriptionAddonCheckoutError("سعر الإضافة غير صالح", 500);
    }
    if (!consent && currentUnitPriceHalala > 0) {
      throw new SubscriptionAddonCheckoutError("تأكيد التجديد التلقائي مطلوب لإتمام شراء إضافة دورية", 400);
    }
    quoteContext.unitPriceHalala = currentUnitPriceHalala;
    const [pending] = await tx.select().from(subscriptionAddonCheckoutIntentsTable)
      .where(and(
        eq(subscriptionAddonCheckoutIntentsTable.ownerId, lockedSubscription.ownerId),
        eq(subscriptionAddonCheckoutIntentsTable.addonType, input.addonType),
        eq(subscriptionAddonCheckoutIntentsTable.quantity, quantity),
        eq(subscriptionAddonCheckoutIntentsTable.quoteVersion, 2),
        eq(subscriptionAddonCheckoutIntentsTable.autoRenewConsent, consent),
        isNull(subscriptionAddonCheckoutIntentsTable.consumedAt),
        gt(subscriptionAddonCheckoutIntentsTable.expiresAt, new Date()),
      )).limit(1);
    if (pending) {
      if (pending.quotedBaseExpiresAt?.getTime() !== lockedSubscription.expiresAt.getTime()) {
        await tx.update(subscriptionAddonCheckoutIntentsTable)
          .set({ consumedAt: new Date() })
          .where(eq(subscriptionAddonCheckoutIntentsTable.id, pending.id));
      } else {
        if (pending.amountHalala === 0) assertNoUnusedCapacity(access, input.addonType);
        return pending;
      }
    }
    const unitPriceHalala = quoteContext.unitPriceHalala;
    if (unitPriceHalala === 0) assertNoUnusedCapacity(access, input.addonType);
    const quoteTime = new Date();
    const quote = buildAddonQuote({
      context: quoteContext,
      addonType: input.addonType,
      quantity,
      quoteTime,
    });
    const [created] = await tx.insert(subscriptionAddonCheckoutIntentsTable).values({
      id: randomUUID(),
      ownerId: lockedSubscription.ownerId,
      addonType: input.addonType,
      quantity,
      amountHalala: quote.amountHalala,
      monthlyUnitPriceHalala: unitPriceHalala,
      nextChargeHalala: quote.nextChargeHalala,
      baseMonthlyHalala: quote.baseMonthlyHalala,
      remainingDays: quote.remainingDays,
      nextBillingAt: quote.nextBillingAt,
      cycleDays,
      quotedBaseExpiresAt: quote.periodEndAt,
      periodStartAt: quote.periodStartAt,
      periodEndAt: quote.periodEndAt,
      quoteVersion: 2,
      autoRenewConsent: consent,
      expiresAt: new Date(Date.now() + INTENT_TTL_MS),
    }).returning();
    return created;
  });
  if (!intent) throw new SubscriptionAddonCheckoutError("تعذّر إنشاء طلب الإضافة", 500);
  if (intent.amountHalala > 0 &&
      (!process.env.MOYASAR_SECRET_KEY || !process.env.MOYASAR_PUBLISHABLE_KEY)) {
    throw new SubscriptionAddonCheckoutError("بوابة الدفع غير مهيأة لإتمام الدفع", 503);
  }

  return {
    checkoutId: intent.id,
    amountHalala: intent.amountHalala,
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
    addonType: input.addonType,
    quantity: intent.quantity,
    unitPriceHalala: intent.monthlyUnitPriceHalala,
    monthlyUnitPriceHalala: intent.monthlyUnitPriceHalala,
    cycleDays: intent.cycleDays,
    periodStartAt: intent.periodStartAt?.toISOString() ?? "",
    periodEndAt: intent.periodEndAt?.toISOString() ?? "",
    autoRenewConsent: intent.quoteVersion >= 2 && intent.autoRenewConsent,
    nextChargeHalala: intent.quoteVersion >= 2 && intent.autoRenewConsent ? intent.nextChargeHalala : 0,
    nextBillingAt: intent.quoteVersion >= 2 && intent.autoRenewConsent ? intent.nextBillingAt?.toISOString() ?? null : null,
    recurring: intent.quoteVersion >= 2 && intent.autoRenewConsent,
    canSavePaymentMethod: canSavePaymentMethod(),
    recurringConfigured: canSavePaymentMethod(),
    savedPaymentMethodAvailable: await hasSavedPaymentMethod(intent.ownerId),
    remainingDays: intent.remainingDays,
    billingDays: intent.cycleDays,
    baseMonthlyHalala: intent.baseMonthlyHalala,
  };
}

export async function readAddonCheckoutQuote(input: {
  ownerId: string;
  checkoutId: string;
}): Promise<{
  checkoutId: string;
  addonType: SubscriptionAddonType;
  quantity: number;
  amountHalala: number;
  unitPriceHalala: number;
  monthlyUnitPriceHalala: number;
  cycleDays: number;
  periodStartAt: string;
  periodEndAt: string;
  autoRenewConsent: boolean;
  nextChargeHalala: number;
  nextBillingAt: string | null;
  recurring: boolean;
  canSavePaymentMethod: boolean;
  recurringConfigured: boolean;
  savedPaymentMethodAvailable: boolean;
  remainingDays: number;
  billingDays: number;
  baseMonthlyHalala: number;
  publishableKey: string;
}> {
  if (typeof input.ownerId !== "string" || !input.ownerId) {
    throw new SubscriptionAddonCheckoutError("سجّل الدخول أولاً", 401);
  }
  validateCheckoutId(input.checkoutId);

  const [intent] = await db.select().from(subscriptionAddonCheckoutIntentsTable)
    .where(eq(subscriptionAddonCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!intent || !ownerKeys.includes(intent.ownerId)) {
    throw new SubscriptionAddonCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }
  const [subscription] = await db.select({ expiresAt: ownerSubscriptionsTable.expiresAt })
    .from(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId)).limit(1);
  if (subscription?.expiresAt?.getTime() !== intent.quotedBaseExpiresAt?.getTime()) {
    throw new SubscriptionAddonCheckoutError("تغيّرت نهاية الاشتراك؛ ابدأ طلباً جديداً", 409);
  }
  if (intent.consumedAt) {
    throw new SubscriptionAddonCheckoutError("سبق استخدام طلب الدفع هذا", 409);
  }
  if (intent.expiresAt <= new Date()) {
    throw new SubscriptionAddonCheckoutError("انتهت صلاحية طلب الدفع؛ ابدأ عملية دفع جديدة", 410);
  }
  if (intent.amountHalala <= 0) {
    throw new SubscriptionAddonCheckoutError("استخدم التفعيل المباشر لإتمام هذه الإضافة المجانية");
  }
  validateAddonType(intent.addonType);
  validateQuantity(intent.quantity);

  const publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new SubscriptionAddonCheckoutError("بوابة الدفع غير مهيأة لإتمام الدفع", 503);
  }

  return {
    checkoutId: intent.id,
    addonType: intent.addonType,
    quantity: intent.quantity,
    amountHalala: intent.amountHalala,
    unitPriceHalala: intent.monthlyUnitPriceHalala,
    monthlyUnitPriceHalala: intent.monthlyUnitPriceHalala,
    cycleDays: intent.cycleDays,
    periodStartAt: intent.periodStartAt?.toISOString() ?? "",
    periodEndAt: intent.periodEndAt?.toISOString() ?? "",
    autoRenewConsent: intent.quoteVersion >= 2 && intent.autoRenewConsent,
    nextChargeHalala: intent.quoteVersion >= 2 && intent.autoRenewConsent ? intent.nextChargeHalala : 0,
    nextBillingAt: intent.quoteVersion >= 2 && intent.autoRenewConsent ? intent.nextBillingAt?.toISOString() ?? null : null,
    recurring: intent.quoteVersion >= 2 && intent.autoRenewConsent,
    canSavePaymentMethod: canSavePaymentMethod(),
    recurringConfigured: canSavePaymentMethod(),
    savedPaymentMethodAvailable: await hasSavedPaymentMethod(intent.ownerId),
    remainingDays: intent.remainingDays,
    billingDays: intent.cycleDays,
    baseMonthlyHalala: intent.baseMonthlyHalala,
    publishableKey,
  };
}

async function hasSavedPaymentMethod(ownerId: string): Promise<boolean> {
  const [profile] = await db.select({ encryptedPaymentToken: ownerBillingProfilesTable.encryptedPaymentToken })
    .from(ownerBillingProfilesTable).where(eq(ownerBillingProfilesTable.ownerId, ownerId)).limit(1);
  return !!profile?.encryptedPaymentToken && !!decryptMoyasarToken(profile.encryptedPaymentToken);
}

function canSavePaymentMethod() {
  return isMoyasarTokenVaultAvailable() &&
    !!process.env.MOYASAR_PUBLISHABLE_KEY &&
    !!process.env.MOYASAR_SECRET_KEY;
}

async function finalizeAddonCheckout(input: {
  ownerId: string;
  checkoutId: string;
  paymentId: string;
  paidAmountHalala: number;
  paidAt: Date;
  allowPaidBeforeExpiry: boolean;
  paymentToken?: string;
}): Promise<CompletedAddonCheckout> {
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  const [previewIntent] = await db.select().from(subscriptionAddonCheckoutIntentsTable)
    .where(eq(subscriptionAddonCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  if (!previewIntent || !ownerKeys.includes(previewIntent.ownerId)) {
    throw new SubscriptionAddonCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }

  try {
    return await db.transaction(async (tx) => {
      const [intent] = await tx.select().from(subscriptionAddonCheckoutIntentsTable)
        .where(eq(subscriptionAddonCheckoutIntentsTable.id, input.checkoutId))
        .for("update")
        .limit(1);
      if (!intent || !ownerKeys.includes(intent.ownerId)) {
        throw new SubscriptionAddonCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
      }
      validateQuantity(intent.quantity);

      const [existingPurchase] = await tx.select().from(subscriptionAddonPurchasesTable)
        .where(eq(subscriptionAddonPurchasesTable.intentId, intent.id)).limit(1);
      if (existingPurchase) {
        if (existingPurchase.ownerId !== intent.ownerId || existingPurchase.paymentId !== input.paymentId) {
          throw new SubscriptionAddonCheckoutError("سبق استخدام طلب الدفع هذا", 409);
        }
        return { purchase: existingPurchase, invoice: buildInvoice(existingPurchase) };
      }

      const [paymentUse] = await tx.select().from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.paymentId, input.paymentId)).limit(1);
      if (paymentUse) throw new SubscriptionAddonCheckoutError("سبق استخدام عملية الدفع هذه", 409);

      if (intent.amountHalala !== input.paidAmountHalala) {
        throw new SubscriptionAddonCheckoutError("المبلغ المدفوع لا يتطابق مع طلب الإضافة");
      }
      if (intent.expiresAt <= new Date() &&
          (!input.allowPaidBeforeExpiry || input.paidAt > intent.expiresAt)) {
        throw new SubscriptionAddonCheckoutError("انتهت صلاحية طلب الدفع؛ ابدأ عملية دفع جديدة", 410);
      }

      const [subscription] = await tx.select().from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId))
        .for("update")
        .limit(1);
      if (!subscription || (input.paidAmountHalala === 0 && !isSubscriptionActive(subscription))) {
        throw new SubscriptionAddonCheckoutError("انتهى اشتراكك؛ جدّده قبل تفعيل الإضافة المجانية.", 403);
      }
      if (subscription.expiresAt?.getTime() !== intent.quotedBaseExpiresAt?.getTime()) {
        throw new SubscriptionAddonCheckoutError("تغيّرت نهاية الاشتراك؛ لم يتم تفعيل الإضافة. ابدأ طلباً جديداً.", 409);
      }
      if (input.paidAmountHalala === 0) {
        // The subscription-row lock serializes free grants. Resolve the intent's
        // owner aliases so another account's capacity cannot affect this check.
        const access = await ownerPlanAccess(intent.ownerId);
        assertNoUnusedCapacity(access, intent.addonType);
      }

      const now = new Date();
      const billingTerms = addonPurchaseBillingTerms({
        explicitConsent: intent.quoteVersion >= 2 && intent.autoRenewConsent === true,
        monthlyUnitPriceHalala: intent.monthlyUnitPriceHalala,
        paidThroughAt: intent.periodEndAt,
      });
      const [purchase] = await tx.insert(subscriptionAddonPurchasesTable).values({
        ownerId: intent.ownerId,
        addonType: intent.addonType,
        paymentId: input.paymentId,
        intentId: intent.id,
        quantity: intent.quantity,
        amountHalala: intent.amountHalala,
        recurring: billingTerms.recurring,
        monthlyUnitPriceHalala: billingTerms.monthlyUnitPriceHalala,
        periodStartAt: intent.periodStartAt,
        paidThroughAt: billingTerms.paidThroughAt,
      }).returning();

      await tx.insert(subscriptionPaymentsTable).values({
        paymentId: input.paymentId,
        ownerId: intent.ownerId,
        intentId: intent.id,
        plan: `addon:${intent.addonType}`,
        amountHalala: intent.amountHalala,
      });
      if (intent.quoteVersion >= 2 && intent.autoRenewConsent && input.paymentToken) {
        const encryptedPaymentToken = encryptMoyasarToken(input.paymentToken);
        if (encryptedPaymentToken) {
          await tx.insert(ownerBillingProfilesTable).values({
            ownerId: intent.ownerId,
            encryptedPaymentToken,
            tokenPaymentId: input.paymentId,
            autoRenewEnabled: false,
          }).onConflictDoUpdate({
            target: ownerBillingProfilesTable.ownerId,
            set: {
              encryptedPaymentToken,
              tokenPaymentId: input.paymentId,
              updatedAt: now,
            },
          });
        }
      }
      await tx.update(subscriptionAddonCheckoutIntentsTable)
        .set({ consumedAt: now })
        .where(and(
          eq(subscriptionAddonCheckoutIntentsTable.id, intent.id),
          isNull(subscriptionAddonCheckoutIntentsTable.consumedAt),
        ));

      if (!purchase) throw new SubscriptionAddonCheckoutError("تعذّر حفظ شراء الإضافة", 500);
      return { purchase, invoice: buildInvoice(purchase) };
    });
  } catch (error) {
    const completed = await readCompletedAddonCheckout(input.ownerId, input.checkoutId, input.paymentId);
    if (completed) return completed;
    throw error;
  }
}

export async function confirmAddonCheckout(input: {
  ownerId: string;
  checkoutId: string;
  paymentId: string;
}): Promise<CompletedAddonCheckout> {
  if (typeof input.ownerId !== "string" || !input.ownerId) {
    throw new SubscriptionAddonCheckoutError("سجّل الدخول أولاً", 401);
  }
  validateCheckoutId(input.checkoutId);
  validatePaymentId(input.paymentId);

  const [priorPayment] = await db.select().from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.paymentId, input.paymentId)).limit(1);
  if (priorPayment) {
    if (priorPayment.intentId !== input.checkoutId || !priorPayment.plan.startsWith("addon:")) {
      throw new SubscriptionAddonCheckoutError("سبق استخدام عملية الدفع هذه", 409);
    }
    const result = await readCompletedAddonCheckout(input.ownerId, input.checkoutId, input.paymentId);
    if (result) return result;
    throw new SubscriptionAddonCheckoutError("عملية الدفع لا تخص هذا الحساب", 403);
  }

  const [intent] = await db.select().from(subscriptionAddonCheckoutIntentsTable)
    .where(eq(subscriptionAddonCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!intent || !ownerKeys.includes(intent.ownerId)) {
    throw new SubscriptionAddonCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }
  if (intent.amountHalala <= 0) {
    throw new SubscriptionAddonCheckoutError("استخدم التفعيل المباشر لإتمام هذه الإضافة المجانية");
  }

  const secretKey = process.env.MOYASAR_SECRET_KEY;
  if (!secretKey) throw new SubscriptionAddonCheckoutError("بوابة الدفع غير مهيأة", 503);

  interface MoyasarPayment {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    description?: string;
    created_at?: string;
    source?: { token?: string | null };
  }
  let payment: MoyasarPayment;
  try {
    const response = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(input.paymentId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}` },
    });
    if (!response.ok) {
      throw new SubscriptionAddonCheckoutError("تعذّر التحقق من الدفع لدى بوابة الدفع", 400);
    }
    payment = await response.json() as MoyasarPayment;
  } catch (error) {
    if (error instanceof SubscriptionAddonCheckoutError) throw error;
    throw new SubscriptionAddonCheckoutError("تعذّر الاتصال ببوابة الدفع. أعد المحاولة.", 502);
  }

  if (payment.id !== input.paymentId || payment.status !== "paid") {
    throw new SubscriptionAddonCheckoutError("لم تؤكد بوابة الدفع إتمام العملية");
  }
  if (payment.amount !== intent.amountHalala || payment.currency !== "SAR") {
    throw new SubscriptionAddonCheckoutError("المبلغ أو العملة المدفوعة لا تتطابق مع طلب الإضافة");
  }
  if (typeof payment.description !== "string" || !payment.description.includes(input.checkoutId)) {
    throw new SubscriptionAddonCheckoutError("عملية الدفع غير مرتبطة بطلب الإضافة هذا", 403);
  }

  const paidAt = payment.created_at ? new Date(payment.created_at) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new SubscriptionAddonCheckoutError("تاريخ الدفع غير صالح");
  return finalizeAddonCheckout({
    ownerId: input.ownerId,
    checkoutId: input.checkoutId,
    paymentId: input.paymentId,
    paidAmountHalala: payment.amount,
    paidAt,
    allowPaidBeforeExpiry: true,
    paymentToken: typeof payment.source?.token === "string" ? payment.source.token : undefined,
  });
}

export async function redeemFreeAddonCheckout(input: {
  ownerId: string;
  checkoutId: string;
}): Promise<CompletedAddonCheckout> {
  if (typeof input.ownerId !== "string" || !input.ownerId) {
    throw new SubscriptionAddonCheckoutError("سجّل الدخول أولاً", 401);
  }
  validateCheckoutId(input.checkoutId);
  const [intent] = await db.select().from(subscriptionAddonCheckoutIntentsTable)
    .where(eq(subscriptionAddonCheckoutIntentsTable.id, input.checkoutId)).limit(1);
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  if (!intent || !ownerKeys.includes(intent.ownerId)) {
    throw new SubscriptionAddonCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
  }
  if (intent.amountHalala !== 0) {
    throw new SubscriptionAddonCheckoutError("هذا الطلب ليس مجانياً");
  }
  return finalizeAddonCheckout({
    ownerId: input.ownerId,
    checkoutId: input.checkoutId,
    paymentId: `free-addon:${input.checkoutId}`,
    paidAmountHalala: 0,
    paidAt: new Date(),
    allowPaidBeforeExpiry: false,
  });
}
