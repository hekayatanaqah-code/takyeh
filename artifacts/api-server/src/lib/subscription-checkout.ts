import { randomUUID } from "node:crypto";
import { lockResource } from "@workspace/db/transaction-lock";
import { and, count, desc, eq, gt, inArray, isNull, notLike, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  ownerSubscriptionsTable,
  ownerFreeAccessGrantsTable,
  ownerAccountDiscountsTable,
  subscriptionCheckoutIntentsTable,
  subscriptionPaymentsTable,
  subscriptionPaymentReconciliationsTable,
  subscriptionPlansTable,
  subscriptionPromoCodesTable,
  subscriptionAddonPurchasesTable,
  ownerBillingProfilesTable,
  subscriptionRenewalAttemptsTable,
  subscriptionRenewalInvoicesTable,
  type OwnerSubscription,
  type SubscriptionTerms,
} from "@workspace/db/schema";
import {
  getOrStartOwnerSubscription,
  initialTrialSubscriptionState,
  preferredOwnerSubscription,
  subscriptionOwnerKeys,
  getOwnerFreeAccess,
  isOwnerFreeAccessGrantActive,
  latestOwnerFreeAccess,
} from "./subscription-access";
import { isArchivedSubscriptionPlan } from "./subscription-defaults";
import {
  decryptMoyasarToken,
  encryptMoyasarToken,
  isMoyasarTokenVaultAvailable,
} from "./subscription-token-vault";
import {
  checkoutSnapshotStillCurrent,
  makeRecurringAddonSnapshot,
  quoteUpcomingInvoice,
  type UpcomingInvoiceLine,
} from "./subscription-billing-math";
import { retrySubscriptionPaymentReconciliation } from "./subscription-payment-reconciliation";
import { debitOwnerWallet, ownerWallet } from "./owner-wallet";
import {
  accountDiscountView,
  discountInvoiceLines,
  latestStartedDiscount,
  type AccountDiscountSnapshot,
  type AccountDiscountView,
} from "./subscription-discounts";

const INTENT_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class SubscriptionCheckoutError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "SubscriptionCheckoutError";
  }
}

class StaleSubscriptionCheckoutError extends SubscriptionCheckoutError {
  constructor(
    message = "تغيّر الاشتراك أو الإضافات بعد إنشاء الفاتورة",
    readonly refundEligible = true,
  ) {
    super(message, 409);
    this.name = "StaleSubscriptionCheckoutError";
  }
}

function canSaveCardPayment() {
  return isMoyasarTokenVaultAvailable() &&
    !!process.env.MOYASAR_SECRET_KEY &&
    !!process.env.MOYASAR_PUBLISHABLE_KEY;
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
  lineItems: InvoiceLine[];
  nextChargeHalala: number;
  nextBillingAt: string | null;
  periodEnd: string | null;
}

type InvoiceLine = UpcomingInvoiceLine;

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
  if (configured.slug === "trial" || !configured.isActive ||
      isArchivedSubscriptionPlan({ slug: configured.slug, nameAr: configured.nameAr })) {
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

function invoiceLinesFromIntent(intent: {
  invoiceLines: InvoiceLine[] | null;
  planLabel: string;
  amountHalala: number;
}): InvoiceLine[] {
  return intent.invoiceLines?.length
    ? intent.invoiceLines
    : [{ kind: "base", label: intent.planLabel, amountHalala: intent.amountHalala }];
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
  lineItems: InvoiceLine[] = [{ kind: "base", label: plan.label, amountHalala }],
  paidAt = new Date(),
): SubscriptionInvoice {
  const nextChargeHalala = (subscription.renewalPriceHalala ?? amountHalala) +
    lineItems.filter((line) => line.kind === "addon").reduce((sum, line) => sum + line.amountHalala, 0);
  const periodEnd = subscription.expiresAt?.toISOString() ?? null;
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
    lineItems,
    nextChargeHalala,
    nextBillingAt: periodEnd,
    periodEnd,
  };
}

function buildPlanCheckoutQuote(input: {
  plan: ResolvedPlan;
  listPriceHalala: number;
  discountHalala: number;
  periodStartAt: Date;
  recurringAddons: Array<typeof subscriptionAddonPurchasesTable.$inferSelect>;
  accountDiscount?: AccountDiscountView | null;
  accountDiscounts?: Array<typeof ownerAccountDiscountsTable.$inferSelect>;
  quotedAt?: Date;
}) {
  const quotedLines = quoteUpcomingInvoice({
    baseLabel: input.plan.label,
    baseAmountHalala: Math.max(0, input.listPriceHalala - input.discountHalala),
    planDays: input.plan.days,
    periodStartAt: input.periodStartAt,
    recurringAddons: input.recurringAddons,
  });
  const discounted = discountInvoiceLines(quotedLines, input.accountDiscount ?? null, input.quotedAt ?? new Date());
  const lineItems = discounted.lineItems;
  const amountHalala = lineItems.reduce((sum, line) => sum + line.amountHalala, 0);
  const baseLine = lineItems.find((line) => line.kind === "base");
  const nextBillingAt = baseLine?.periodEndAt ? new Date(baseLine.periodEndAt) : input.periodStartAt;
  const nextLineItems = quoteUpcomingInvoice({
    baseLabel: input.plan.label,
    baseAmountHalala: input.listPriceHalala,
    planDays: input.plan.days,
    periodStartAt: nextBillingAt,
    recurringAddons: input.recurringAddons,
  });
  const nextAccountDiscount = input.accountDiscounts
    ? accountDiscountView(latestStartedDiscount(input.accountDiscounts, nextBillingAt), nextBillingAt)
    : input.accountDiscount ?? null;
  const discountedNext = discountInvoiceLines(nextLineItems, nextAccountDiscount, nextBillingAt).lineItems;
  return {
    lineItems,
    amountHalala,
    nextChargeHalala: discountedNext.reduce((sum, line) => sum + line.amountHalala, 0),
    nextBillingAt,
    periodEnd: baseLine?.periodEndAt ?? null,
    baseMonthlyHalala: Math.round(input.listPriceHalala * 30 / input.plan.days),
    accountDiscountHalala: discounted.discountHalala,
    accountDiscountSnapshot: discounted.snapshot as AccountDiscountSnapshot | null,
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
      Math.max(0, intent.listPriceHalala -
        (invoiceLinesFromIntent(intent).find((line) => line.kind === "base")?.amountHalala ?? payment.amountHalala)),
      invoiceLinesFromIntent(intent),
      payment.createdAt,
    ),
  };
}

export async function createSubscriptionCheckout(input: {
  ownerId: string;
  plan: string;
  promoCode?: string;
  autoRenewConsent?: boolean;
  paymentMethod?: "card" | "wallet";
}): Promise<{
  checkoutId: string;
  amountHalala: number;
  label: string;
  days: number;
  discountHalala: number;
  publishableKey: string;
  lineItems: InvoiceLine[];
  lines: InvoiceLine[];
  recurring: true;
  recurringConfigured: boolean;
  canSavePaymentMethod: boolean;
  savedPaymentMethodAvailable: boolean;
  nextChargeHalala: number;
  nextBillingAt: string | null;
  periodEnd: string | null;
  baseMonthlyHalala: number;
  accountDiscountSnapshot: AccountDiscountSnapshot | null;
}> {
  if (!input.ownerId) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  if ((await getOwnerFreeAccess(input.ownerId))?.active) {
    throw new SubscriptionCheckoutError("لديك وصول مجاني كامل حالياً؛ لا يلزم شراء اشتراك", 409);
  }
  if (input.autoRenewConsent && !canSaveCardPayment()) {
    throw new SubscriptionCheckoutError("حفظ وسيلة الدفع مشفرًا غير مهيأ حالياً", 503);
  }
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
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  const quote = await db.transaction(async (tx) => {
    const [lockedSubscription] = await tx.select().from(ownerSubscriptionsTable)
      .where(eq(ownerSubscriptionsTable.ownerId, ownerSubscription.ownerId))
      .for("update").limit(1);
    if (!lockedSubscription) throw new SubscriptionCheckoutError("تعذّر العثور على الاشتراك", 409);
    const activeGrants = await tx.select({
      id: ownerFreeAccessGrantsTable.id,
      expiresAt: ownerFreeAccessGrantsTable.expiresAt,
      startDate: ownerFreeAccessGrantsTable.startDate,
      endDate: ownerFreeAccessGrantsTable.endDate,
      createdAt: ownerFreeAccessGrantsTable.createdAt,
    }).from(ownerFreeAccessGrantsTable)
      .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
    const latestGrant = latestOwnerFreeAccess(activeGrants);
    if (isOwnerFreeAccessGrantActive(latestGrant, now)) {
      throw new SubscriptionCheckoutError("لديك وصول مجاني كامل حالياً؛ لا يلزم شراء اشتراك", 409);
    }
    if (lockedSubscription.expiresAt) {
      const [existingRenewalInvoice] = await tx.select()
        .from(subscriptionRenewalInvoicesTable)
        .where(and(
          eq(subscriptionRenewalInvoicesTable.ownerId, lockedSubscription.ownerId),
          eq(subscriptionRenewalInvoicesTable.periodStartAt, lockedSubscription.expiresAt),
          inArray(subscriptionRenewalInvoicesTable.status, ["pending", "processing", "failed"]),
        )).limit(1);
      if (existingRenewalInvoice) {
        const [attempt] = await tx.select().from(subscriptionRenewalAttemptsTable)
          .where(eq(subscriptionRenewalAttemptsTable.invoiceId, existingRenewalInvoice.id))
          .orderBy(desc(subscriptionRenewalAttemptsTable.attemptNumber)).limit(1);
        if (attempt && attempt.status !== "failed") {
          throw new SubscriptionCheckoutError("يوجد تحصيل تجديد قيد المعالجة؛ أعد المحاولة بعد اكتماله", 409);
        }
      }
    }
    const recurringAddonRows = await tx.select().from(subscriptionAddonPurchasesTable)
      .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
    const periodStartAt = lockedSubscription.expiresAt && lockedSubscription.expiresAt > now
      ? lockedSubscription.expiresAt : now;
    const accountDiscountRows = await tx.select().from(ownerAccountDiscountsTable)
      .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
    const accountDiscount = accountDiscountView(latestStartedDiscount(accountDiscountRows, now), now);
    let discountHalala = 0;
    if (promoCode) {
      if (accountDiscount?.active) {
        throw new SubscriptionCheckoutError("لا يمكن استخدام رمز ترويجي مع خصم الحساب النشط");
      }
      const [promo] = await tx.select().from(subscriptionPromoCodesTable)
        .where(eq(subscriptionPromoCodesTable.code, promoCode))
        .for("update").limit(1);
      if (!promo || !promo.isActive || (promo.expiresAt && promo.expiresAt <= now)) {
        throw new SubscriptionCheckoutError("رمز الخصم غير صالح");
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
    }
    const checkoutQuote = buildPlanCheckoutQuote({
      plan,
      listPriceHalala,
      discountHalala,
      periodStartAt,
      recurringAddons: recurringAddonRows,
      accountDiscount,
      accountDiscounts: accountDiscountRows,
      quotedAt: now,
    });
    if (input.paymentMethod === "wallet") {
      if ((await ownerWallet(input.ownerId, tx)).balanceHalalas < checkoutQuote.amountHalala) {
        throw new SubscriptionCheckoutError("رصيد المحفظة لا يغطي كامل الفاتورة؛ لم يتم الخصم", 409);
      }
    } else assertPaymentConfigured(checkoutQuote.amountHalala);
    const recurringAddonSnapshot = makeRecurringAddonSnapshot(recurringAddonRows);
    const [intent] = await tx.insert(subscriptionCheckoutIntentsTable).values({
      id: checkoutId,
      ownerId: lockedSubscription.ownerId,
      plan: plan.slug,
      listPriceHalala,
      amountHalala: checkoutQuote.amountHalala,
      paymentMethod: input.paymentMethod ?? "card",
      durationDays: plan.days,
      planLabel: plan.label,
      termsSnapshot: plan.terms,
      discountCode: promoCode,
      invoiceLines: checkoutQuote.lineItems,
      accountDiscountSnapshot: checkoutQuote.accountDiscountSnapshot,
      quotedBaseExpiresAt: lockedSubscription.expiresAt,
      recurringAddonSnapshot,
      autoRenewConsent: input.paymentMethod !== "wallet" && input.autoRenewConsent === true,
      expiresAt,
    }).returning();
    return {
      intent,
      invoiceLines: checkoutQuote.lineItems,
      nextChargeHalala: checkoutQuote.nextChargeHalala,
      nextBillingAt: checkoutQuote.nextBillingAt,
      periodEnd: checkoutQuote.periodEnd,
      baseMonthlyHalala: checkoutQuote.baseMonthlyHalala,
      discountHalala: discountHalala + checkoutQuote.accountDiscountHalala,
      accountDiscountSnapshot: checkoutQuote.accountDiscountSnapshot,
    };
  });
  const { invoiceLines, discountHalala } = quote;

  const amountHalala = invoiceLines.reduce((sum, line) => sum + line.amountHalala, 0);
  const publishableKey = process.env.MOYASAR_PUBLISHABLE_KEY ?? "";
  const [billingProfile] = await db.select()
    .from(ownerBillingProfilesTable).where(eq(ownerBillingProfilesTable.ownerId, ownerSubscription.ownerId)).limit(1);
  return {
    checkoutId,
    amountHalala,
    label: plan.label,
    days: plan.days,
    discountHalala,
    publishableKey,
    lineItems: invoiceLines,
    lines: invoiceLines,
    recurring: true,
    recurringConfigured: canSaveCardPayment(),
    canSavePaymentMethod: canSaveCardPayment(),
    savedPaymentMethodAvailable: !!billingProfile?.encryptedPaymentToken &&
      !!decryptMoyasarToken(billingProfile.encryptedPaymentToken),
    nextChargeHalala: quote.nextChargeHalala,
    nextBillingAt: quote.nextBillingAt.toISOString(),
    periodEnd: quote.periodEnd,
    baseMonthlyHalala: quote.baseMonthlyHalala,
    accountDiscountSnapshot: quote.accountDiscountSnapshot,
  };
}

export async function previewSubscriptionCheckout(input: {
  ownerId: string;
  plan: string;
  promoCode?: string;
}): Promise<{
  plan: string;
  label: string;
  days: number;
  durationDays: number;
  amountHalala: number;
  discountHalala: number;
  lineItems: InvoiceLine[];
  lines: InvoiceLine[];
  recurring: false;
  recurringConfigured: boolean;
  canSavePaymentMethod: boolean;
  savedPaymentMethodAvailable: boolean;
  nextChargeHalala: number;
  nextBillingAt: string | null;
  periodEnd: string | null;
  periodEndAt: string | null;
  baseMonthlyHalala: number;
  publishableKey: string;
  recurringPreview: true;
  nextChargeRequiresExplicitConsent: true;
  accountDiscountSnapshot: AccountDiscountSnapshot | null;
}> {
  if (!input.ownerId) throw new SubscriptionCheckoutError("يجب تسجيل الدخول أولاً", 401);
  const plan = await resolveActivePlan(input.plan);
  const listPriceHalala = Math.round(plan.price * 100);
  if (!Number.isSafeInteger(listPriceHalala) || listPriceHalala < 0) {
    throw new SubscriptionCheckoutError("سعر الباقة غير صالح", 500);
  }
  const promoCode = normalizePromoCode(input.promoCode);
  const now = new Date();
  let discountHalala = 0;
  const ownerKeys = await subscriptionOwnerKeys(input.ownerId);
  const accountDiscountRows = await db.select().from(ownerAccountDiscountsTable)
    .where(inArray(ownerAccountDiscountsTable.ownerId, ownerKeys));
  const accountDiscount = accountDiscountView(latestStartedDiscount(accountDiscountRows, now), now);
  if (promoCode) {
    if (accountDiscount?.active) {
      throw new SubscriptionCheckoutError("لا يمكن استخدام رمز ترويجي مع خصم الحساب النشط");
    }
    const [promo] = await db.select().from(subscriptionPromoCodesTable)
      .where(eq(subscriptionPromoCodesTable.code, promoCode)).limit(1);
    if (!promo || !promo.isActive || (promo.expiresAt && promo.expiresAt <= now)) {
      throw new SubscriptionCheckoutError("رمز الخصم غير صالح");
    }
    const [pending] = await db.select({ value: count() }).from(subscriptionCheckoutIntentsTable)
      .where(and(
        eq(subscriptionCheckoutIntentsTable.discountCode, promoCode),
        isNull(subscriptionCheckoutIntentsTable.consumedAt),
        gt(subscriptionCheckoutIntentsTable.expiresAt, now),
      ));
    if (promo.usageLimit != null && promo.usedCount + Number(pending?.value ?? 0) >= promo.usageLimit) {
      throw new SubscriptionCheckoutError("اكتمل عدد مرات استخدام رمز الخصم");
    }
    discountHalala = promoDiscountHalala(promo, listPriceHalala);
  }

  const subscriptions = await db.select().from(ownerSubscriptionsTable)
    .where(inArray(ownerSubscriptionsTable.ownerId, ownerKeys));
  let subscription: Pick<OwnerSubscription,
    "ownerId" | "plan" | "status" | "expiresAt" | "billingCycleDays" | "renewalPriceHalala" | "termsSnapshot"
  > | undefined = preferredOwnerSubscription(subscriptions);
  if (!subscription) {
    const [trialPlan] = await db.select({
      trialDays: subscriptionPlansTable.trialDays,
      isActive: subscriptionPlansTable.isActive,
    }).from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, "trial")).limit(1);
    const trialDays = trialPlan?.trialDays ?? 30;
    const trialState = initialTrialSubscriptionState(trialPlan?.isActive ?? false, trialDays, now);
    subscription = {
      ownerId: ownerKeys.at(-1)!,
      plan: "trial",
      status: trialState.status,
      expiresAt: trialState.expiresAt,
      billingCycleDays: trialDays,
      renewalPriceHalala: 0,
      termsSnapshot: null,
    };
  }

  const periodStartAt = subscription.expiresAt && subscription.expiresAt > now
    ? subscription.expiresAt : now;
  const recurringAddonRows = await db.select().from(subscriptionAddonPurchasesTable)
    .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
  const quote = buildPlanCheckoutQuote({
    plan,
    listPriceHalala,
    discountHalala,
    periodStartAt,
    recurringAddons: recurringAddonRows,
    accountDiscount,
    accountDiscounts: accountDiscountRows,
    quotedAt: now,
  });
  const [billingProfile] = await db.select()
    .from(ownerBillingProfilesTable).where(eq(ownerBillingProfilesTable.ownerId, subscription.ownerId)).limit(1);
  const savedPaymentMethodAvailable = !!billingProfile?.encryptedPaymentToken &&
    !!decryptMoyasarToken(billingProfile.encryptedPaymentToken);
  const recurringConfigured = canSaveCardPayment();
  return {
    plan: plan.slug,
    label: plan.label,
    days: plan.days,
    durationDays: plan.days,
    amountHalala: quote.amountHalala,
    discountHalala: discountHalala + quote.accountDiscountHalala,
    lineItems: quote.lineItems,
    lines: quote.lineItems,
    recurring: false,
    recurringConfigured,
    canSavePaymentMethod: recurringConfigured,
    savedPaymentMethodAvailable,
    nextChargeHalala: quote.nextChargeHalala,
    nextBillingAt: quote.nextBillingAt.toISOString(),
    periodEnd: quote.periodEnd,
    periodEndAt: quote.periodEnd,
    baseMonthlyHalala: quote.baseMonthlyHalala,
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? "",
    recurringPreview: true,
    nextChargeRequiresExplicitConsent: true,
    accountDiscountSnapshot: quote.accountDiscountSnapshot,
  };
}

function assertPaymentConfigured(amountHalala: number) {
  if (amountHalala > 0 && (!process.env.MOYASAR_SECRET_KEY || !process.env.MOYASAR_PUBLISHABLE_KEY)) {
    throw new SubscriptionCheckoutError("بوابة الدفع غير مُهيأة لإتمام الدفع", 503);
  }
}

async function recordAndRefundStaleCapturedCheckout(input: {
  checkoutId: string;
  ownerId: string;
  paymentId: string;
  amountHalala: number;
  reason?: string;
  tryRefund?: boolean;
}) {
  const [reconciliation] = await db.insert(subscriptionPaymentReconciliationsTable).values({
    paymentId: input.paymentId,
    ownerId: input.ownerId,
    intentId: input.checkoutId,
    amountHalala: input.amountHalala,
    reason: input.reason ?? "Paid checkout quote no longer matches the current subscription or recurring add-ons",
    status: "required",
    refundEligible: input.tryRefund !== false,
  }).onConflictDoNothing().returning();
  await db.update(subscriptionCheckoutIntentsTable)
    .set({ consumedAt: new Date() })
    .where(and(
      eq(subscriptionCheckoutIntentsTable.id, input.checkoutId),
      isNull(subscriptionCheckoutIntentsTable.consumedAt),
    ));
  if (!reconciliation) {
    const [existing] = await db.select({ id: subscriptionPaymentReconciliationsTable.id })
      .from(subscriptionPaymentReconciliationsTable)
      .where(eq(subscriptionPaymentReconciliationsTable.paymentId, input.paymentId)).limit(1);
    if (!existing) return "required";
    return retrySubscriptionPaymentReconciliation(existing.id);
  }
  return retrySubscriptionPaymentReconciliation(reconciliation.id);
}

async function finalizeCheckout(input: {
  ownerId: string;
  checkoutId: string;
  paymentId: string;
  paidAmountHalala: number;
  paidAt: Date;
  paidAtKnown: boolean;
  allowExpiredIntent: boolean;
  paymentToken?: string;
  walletPayment?: boolean;
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
      const [intentPreviewInTransaction] = await tx.select()
        .from(subscriptionCheckoutIntentsTable)
        .where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId))
        .limit(1);
      if (!intentPreviewInTransaction || !ownerKeys.includes(intentPreviewInTransaction.ownerId)) {
        throw new SubscriptionCheckoutError("طلب الدفع غير موجود أو لا يخص هذا الحساب", 404);
      }
      await tx.select({ ownerId: ownerSubscriptionsTable.ownerId }).from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, intentPreviewInTransaction.ownerId))
        .for("update").limit(1);
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
            Math.max(0, intent.listPriceHalala -
              (invoiceLinesFromIntent(intent).find((line) => line.kind === "base")?.amountHalala ?? existingPayment.amountHalala)),
            invoiceLinesFromIntent(intent),
            existingPayment.createdAt,
          ),
        };
      }

      if (input.paidAmountHalala > 0 && intent.freeAccessBlockedAt &&
          (!input.paidAtKnown || input.paidAt > intent.freeAccessBlockedAt)) {
        throw new StaleSubscriptionCheckoutError(
          input.paidAtKnown
            ? "تم منح وصول مجاني بعد تحصيل هذا الاشتراك؛ يجب رد المبلغ أو مراجعته"
            : "تعذّر التحقق من وقت الدفع بعد منح وصول مجاني؛ يجب مراجعة المبلغ دون تفعيل الاشتراك",
          input.paidAtKnown,
        );
      }

      if (intent.amountHalala === 0) {
        if (intent.freeAccessBlockedAt) {
          throw new SubscriptionCheckoutError("تم منحك وصولاً مجانياً كاملاً؛ لا حاجة لاسترداد هذا الطلب", 409);
        }
        const grants = await tx.select({
          id: ownerFreeAccessGrantsTable.id,
          expiresAt: ownerFreeAccessGrantsTable.expiresAt,
          startDate: ownerFreeAccessGrantsTable.startDate,
          endDate: ownerFreeAccessGrantsTable.endDate,
          createdAt: ownerFreeAccessGrantsTable.createdAt,
        }).from(ownerFreeAccessGrantsTable)
          .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
        if (isOwnerFreeAccessGrantActive(latestOwnerFreeAccess(grants))) {
          throw new SubscriptionCheckoutError("لديك وصول مجاني كامل حالياً؛ لا حاجة لاسترداد طلب مجاني", 409);
        }
      }

      if (intent.amountHalala === 0) {
        // Lock every linked identity in a deterministic order so distinct free
        // checkout intents for the same account cannot both pass the lifetime check.
        for (const ownerKey of [...new Set(ownerKeys)].sort()) {
          await lockResource(tx, 731204, ownerKey);
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
      if (intent.amountHalala > 0 && (input.walletPayment === true) !== (intent.paymentMethod === "wallet")) {
        throw new SubscriptionCheckoutError("وسيلة الدفع لا تتطابق مع هذا الطلب؛ ابدأ طلباً جديداً", 409);
      }
      if (intent.expiresAt <= new Date() &&
          (!input.allowExpiredIntent || input.paidAt > intent.expiresAt)) {
        if (input.paidAmountHalala > 0 && input.allowExpiredIntent) {
          throw new StaleSubscriptionCheckoutError(undefined, input.paidAtKnown);
        }
        throw new SubscriptionCheckoutError("انتهت صلاحية طلب الدفع؛ ابدأ عملية دفع جديدة", 410);
      }

      const now = new Date();
      if (intent.amountHalala > 0) {
        const freeGrants = await tx.select({
          id: ownerFreeAccessGrantsTable.id,
          ownerId: ownerFreeAccessGrantsTable.ownerId,
          expiresAt: ownerFreeAccessGrantsTable.expiresAt,
          startDate: ownerFreeAccessGrantsTable.startDate,
          endDate: ownerFreeAccessGrantsTable.endDate,
          createdAt: ownerFreeAccessGrantsTable.createdAt,
        }).from(ownerFreeAccessGrantsTable)
          .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
        const evaluationTime = input.paidAtKnown ? input.paidAt : now;
        const grantAtPayment = input.paidAtKnown
          ? latestOwnerFreeAccess(freeGrants.filter((grant) => grant.createdAt <= input.paidAt), evaluationTime)
          : latestOwnerFreeAccess(freeGrants, evaluationTime);
        if (isOwnerFreeAccessGrantActive(grantAtPayment, evaluationTime)) {
          throw new StaleSubscriptionCheckoutError(
            input.paidAtKnown
              ? "تم تحصيل الدفع أثناء تفعيل وصول مجاني مجدول؛ يجب رد المبلغ أو مراجعته"
              : "تعذّر التحقق من وقت الدفع أثناء وصول مجاني؛ يجب مراجعة المبلغ دون تفعيل الاشتراك",
            input.paidAtKnown,
          );
        }
      }
      const [existingSubscription] = await tx.select().from(ownerSubscriptionsTable)
        .where(eq(ownerSubscriptionsTable.ownerId, intent.ownerId))
        .for("update")
        .limit(1);
      const currentAddonRows = await tx.select().from(subscriptionAddonPurchasesTable)
        .where(inArray(subscriptionAddonPurchasesTable.ownerId, ownerKeys));
      const currentAddonSnapshot = makeRecurringAddonSnapshot(currentAddonRows);
      if (!existingSubscription || !checkoutSnapshotStillCurrent({
        quotedBaseExpiresAt: intent.quotedBaseExpiresAt,
        currentBaseExpiresAt: existingSubscription.expiresAt,
        quotedAddons: intent.recurringAddonSnapshot ?? [],
        currentAddons: currentAddonSnapshot,
      })) {
        throw new StaleSubscriptionCheckoutError(undefined, input.paidAtKnown);
      }
      if (intent.discountCode) {
        // The subscription row is locked before the promo row, matching quote creation.
        const [promo] = await tx.select().from(subscriptionPromoCodesTable)
          .where(eq(subscriptionPromoCodesTable.code, intent.discountCode))
          .for("update").limit(1);
        if (!promo) throw new SubscriptionCheckoutError("تعذّر العثور على رمز الخصم المحجوز", 409);
        await tx.update(subscriptionPromoCodesTable)
          .set({ usedCount: sql`${subscriptionPromoCodesTable.usedCount} + 1` })
          .where(eq(subscriptionPromoCodesTable.id, promo.id));
      }
      const [existingBillingProfile] = await tx.select().from(ownerBillingProfilesTable)
        .where(eq(ownerBillingProfilesTable.ownerId, intent.ownerId))
        .for("update")
        .limit(1);
      const existingFreeGrants = await tx.select({
        id: ownerFreeAccessGrantsTable.id,
        expiresAt: ownerFreeAccessGrantsTable.expiresAt,
        startDate: ownerFreeAccessGrantsTable.startDate,
        endDate: ownerFreeAccessGrantsTable.endDate,
        createdAt: ownerFreeAccessGrantsTable.createdAt,
      }).from(ownerFreeAccessGrantsTable)
        .where(inArray(ownerFreeAccessGrantsTable.ownerId, ownerKeys));
      const latestFreeGrant = latestOwnerFreeAccess(existingFreeGrants);
      const freeAccessActive = isOwnerFreeAccessGrantActive(latestFreeGrant, now);
      const renewalBlockedByGrant = !!intent.freeAccessBlockedAt || freeAccessActive;
      const encryptedPaymentToken = intent.autoRenewConsent && input.paymentToken
        ? encryptMoyasarToken(input.paymentToken) : null;
      const selectedToken = encryptedPaymentToken ?? existingBillingProfile?.encryptedPaymentToken ?? null;
      const tokenIsUsable = !!selectedToken && !!decryptMoyasarToken(selectedToken);
      const consentEnablesRenewal = intent.autoRenewConsent &&
        intent.listPriceHalala > 0 && tokenIsUsable;
      const autoRenewEnabled = !renewalBlockedByGrant && intent.listPriceHalala > 0 && (
        consentEnablesRenewal ||
        existingBillingProfile?.autoRenewEnabled === true ||
        existingSubscription?.autoRenewEnabled === true
      );
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
            billingCycleDays: intent.durationDays,
            renewalPriceHalala: intent.listPriceHalala,
            autoRenewEnabled,
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
            billingCycleDays: intent.durationDays,
            renewalPriceHalala: intent.listPriceHalala,
            autoRenewEnabled,
            paymentStatus: "paid",
            termsSnapshot: intent.termsSnapshot,
          }).returning();

      if (input.walletPayment) await debitOwnerWallet(tx, intent.ownerId, intent.amountHalala, `subscription-payment:${intent.id}`, `اشتراك ${intent.planLabel}`);
      await tx.insert(subscriptionPaymentsTable).values({
        paymentId: input.paymentId,
        ownerId: intent.ownerId,
        intentId: intent.id,
        plan: intent.plan,
        amountHalala: intent.amountHalala,
      });
      if (encryptedPaymentToken) {
        await tx.insert(ownerBillingProfilesTable).values({
          ownerId: intent.ownerId,
          encryptedPaymentToken,
          tokenPaymentId: input.paymentId,
          autoRenewEnabled,
        }).onConflictDoUpdate({
          target: ownerBillingProfilesTable.ownerId,
          set: {
            encryptedPaymentToken,
            tokenPaymentId: input.paymentId,
            autoRenewEnabled,
            updatedAt: now,
          },
        });
      } else if (existingBillingProfile && existingBillingProfile.autoRenewEnabled !== autoRenewEnabled) {
        await tx.update(ownerBillingProfilesTable)
          .set({ autoRenewEnabled, updatedAt: now })
          .where(eq(ownerBillingProfilesTable.ownerId, intent.ownerId));
      }
      await tx.update(subscriptionCheckoutIntentsTable)
        .set({ consumedAt: now })
        .where(eq(subscriptionCheckoutIntentsTable.id, intent.id));

      if (!subscription) throw new SubscriptionCheckoutError("تعذّر تفعيل الاشتراك", 500);
      const invoiceLines = invoiceLinesFromIntent(intent);
      const baseAmountHalala = invoiceLines.find((line) => line.kind === "base")?.amountHalala ?? intent.amountHalala;
      const discountHalala = Math.max(0, intent.listPriceHalala - baseAmountHalala);
      for (const line of invoiceLines) {
        if (line.kind !== "addon" || line.addonPurchaseId == null || !line.periodEndAt) continue;
        await tx.update(subscriptionAddonPurchasesTable)
          .set({
            periodStartAt: line.periodStartAt ? new Date(line.periodStartAt) : baseDate,
            paidThroughAt: new Date(line.periodEndAt),
            revision: sql`${subscriptionAddonPurchasesTable.revision} + 1`,
          })
          .where(eq(subscriptionAddonPurchasesTable.id, line.addonPurchaseId));
      }
      return {
        subscription,
        invoice: buildInvoice(
          subscription, quote, input.paymentId, intent.amountHalala, discountHalala, invoiceLines, input.paidAt,
        ),
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
    if (error instanceof StaleSubscriptionCheckoutError) {
      if (input.walletPayment) throw new SubscriptionCheckoutError("تغيّرت الفاتورة؛ لم يُخصم رصيد المحفظة. ابدأ طلباً جديداً", 409);
      if (input.paidAmountHalala > 0) {
        const status = await recordAndRefundStaleCapturedCheckout({
          checkoutId: input.checkoutId,
          ownerId: previewIntent.ownerId,
          paymentId: input.paymentId,
          amountHalala: input.paidAmountHalala,
          reason: error.message,
          tryRefund: error.refundEligible,
        });
        if (status === "refunded") {
          throw new SubscriptionCheckoutError("تغيّرت الفاتورة بعد الدفع؛ تم رد المبلغ ولم يتم تفعيل اشتراك غير مطابق", 409);
        }
        throw new SubscriptionCheckoutError("تغيّرت الفاتورة بعد الدفع؛ سُجلت العملية للمراجعة ولم يتم تفعيل اشتراك غير مطابق", 409);
      }
      throw error;
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
    currency?: string;
    source?: { token?: string | null };
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
  const paymentBelongsToIntent =
    typeof payment.description === "string" && payment.description.includes(input.checkoutId);
  if (paymentBelongsToIntent &&
      (payment.amount !== intent.amountHalala || payment.currency !== "SAR")) {
    const actualAmountIsVerifiable = Number.isSafeInteger(payment.amount) && (payment.amount ?? 0) > 0;
    await recordAndRefundStaleCapturedCheckout({
      checkoutId: intent.id,
      ownerId: intent.ownerId,
      paymentId: input.paymentId,
      amountHalala: actualAmountIsVerifiable ? payment.amount! : intent.amountHalala,
      tryRefund: actualAmountIsVerifiable,
      reason: "Verified paid payment amount or currency did not match the checkout quote",
    });
    throw new SubscriptionCheckoutError("المبلغ أو العملة لا يطابقان الطلب؛ سُجلت العملية للمراجعة دون تفعيل الاشتراك", 409);
  }
  if (!paymentBelongsToIntent) {
    throw new SubscriptionCheckoutError("عملية الدفع غير مرتبطة بطلب الاشتراك هذا", 403);
  }
  const paidAt = payment.created_at ? new Date(payment.created_at) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    const actualAmountIsVerifiable = Number.isSafeInteger(payment.amount) && (payment.amount ?? 0) > 0;
    await recordAndRefundStaleCapturedCheckout({
      checkoutId: intent.id,
      ownerId: intent.ownerId,
      paymentId: input.paymentId,
      amountHalala: actualAmountIsVerifiable ? payment.amount! : intent.amountHalala,
      tryRefund: actualAmountIsVerifiable,
      reason: "Verified paid payment had an invalid creation timestamp",
    });
    throw new SubscriptionCheckoutError("تاريخ الدفع غير صالح؛ سُجلت العملية للمراجعة دون تفعيل الاشتراك", 409);
  }

  return finalizeCheckout({
    ownerId: input.ownerId,
    checkoutId: input.checkoutId,
    paymentId: input.paymentId,
    paidAmountHalala: payment.amount!,
    paidAt,
    paidAtKnown: !!payment.created_at,
    allowExpiredIntent: true,
    paymentToken: typeof payment.source?.token === "string" ? payment.source.token : undefined,
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
    paidAtKnown: true,
    allowExpiredIntent: false,
  });
}
export async function payWalletSubscriptionCheckout(input: { ownerId: string; checkoutId: string }): Promise<CompletedCheckout> {
  if (typeof input.checkoutId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.checkoutId)) throw new SubscriptionCheckoutError("طلب الدفع غير صالح");
  const [intent] = await db.select().from(subscriptionCheckoutIntentsTable).where(eq(subscriptionCheckoutIntentsTable.id, input.checkoutId));
  if (!intent || !(await subscriptionOwnerKeys(input.ownerId)).includes(intent.ownerId)) throw new SubscriptionCheckoutError("طلب الدفع لا يخص هذا الحساب", 404);
  if (intent.paymentMethod !== "wallet") throw new SubscriptionCheckoutError("هذا الطلب مخصص للبطاقة؛ ابدأ طلب محفظة جديداً", 409);
  if (intent.amountHalala <= 0) throw new SubscriptionCheckoutError("استخدم استرداد الاشتراك المجاني لهذا الطلب");
  try {
    return await finalizeCheckout({
      ...input, paymentId: `wallet:${intent.id}`, paidAmountHalala: intent.amountHalala,
      paidAt: new Date(), paidAtKnown: true, allowExpiredIntent: false, walletPayment: true,
    });
  } catch (error) {
    if ((error as Error).message === "wallet_insufficient") throw new SubscriptionCheckoutError("رصيد المحفظة لا يغطي كامل الفاتورة؛ لم يتم الخصم", 409);
    throw error;
  }
}