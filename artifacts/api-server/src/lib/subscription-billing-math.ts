const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HALALA_AMOUNT = 2_147_483_647;

export function isSubscriptionRenewalDue(
  expiresAt: Date,
  now: Date,
  windowDays = 1,
): boolean {
  return Number.isFinite(expiresAt.getTime()) &&
    Number.isFinite(now.getTime()) &&
    Number.isSafeInteger(windowDays) &&
    windowDays >= 0 &&
    expiresAt.getTime() <= now.getTime() + windowDays * DAY_MS;
}

/** Reuse an idempotency key for every ambiguous/in-flight attempt; only a definitive
 * provider failure may start a new persisted attempt with its own UUID. */
export function selectRenewalAttemptGivenId(
  invoiceGivenId: string,
  latestAttempt: { status: string; givenId: string } | undefined,
  newAttemptGivenId: string,
): string {
  if (!latestAttempt) return invoiceGivenId;
  return latestAttempt.status === "failed" ? newAttemptGivenId : latestAttempt.givenId;
}

export type RecurringAddonSnapshotItem = {
  id: number;
  quantity: number;
  monthlyUnitPriceHalala: number;
  paidThroughAt: string | null;
  cancelAtPeriodEnd: boolean;
  revision: number;
};

export function makeRecurringAddonSnapshot(
  addons: Array<{
    id: number;
    quantity: number;
    monthlyUnitPriceHalala: number;
    paidThroughAt: Date | null;
    cancelAtPeriodEnd: boolean;
    recurring: boolean;
    revision: number;
  }>,
): RecurringAddonSnapshotItem[] {
  return addons.filter((addon) => addon.recurring).map((addon) => ({
    id: addon.id,
    quantity: addon.quantity,
    monthlyUnitPriceHalala: addon.monthlyUnitPriceHalala,
    paidThroughAt: addon.paidThroughAt?.toISOString() ?? null,
    cancelAtPeriodEnd: addon.cancelAtPeriodEnd,
    revision: addon.revision,
  })).sort((a, b) => a.id - b.id);
}

export function checkoutSnapshotStillCurrent(input: {
  quotedBaseExpiresAt: Date | null;
  currentBaseExpiresAt: Date | null;
  quotedAddons: RecurringAddonSnapshotItem[];
  currentAddons: RecurringAddonSnapshotItem[];
}): boolean {
  return input.quotedBaseExpiresAt?.getTime() === input.currentBaseExpiresAt?.getTime() &&
    JSON.stringify(input.quotedAddons) === JSON.stringify(input.currentAddons);
}

export function addonPurchaseBillingTerms(input: {
  explicitConsent: boolean;
  monthlyUnitPriceHalala: number;
  paidThroughAt: Date | null;
}): {
  recurring: boolean;
  monthlyUnitPriceHalala: number;
  paidThroughAt: Date | null;
} {
  if (!input.explicitConsent) {
    return { recurring: false, monthlyUnitPriceHalala: 0, paidThroughAt: null };
  }
  return {
    recurring: true,
    monthlyUnitPriceHalala: input.monthlyUnitPriceHalala,
    paidThroughAt: input.paidThroughAt,
  };
}

export function proratedAddonAmountHalala(
  monthlyUnitPriceHalala: number,
  quantity: number,
  remainingMilliseconds: number,
  cycleDays: number,
): number {
  if (!Number.isSafeInteger(monthlyUnitPriceHalala) || monthlyUnitPriceHalala < 0 ||
      !Number.isSafeInteger(quantity) || quantity < 1 ||
      !Number.isSafeInteger(cycleDays) || cycleDays < 1 ||
      !Number.isFinite(remainingMilliseconds) || remainingMilliseconds < 0) {
    throw new Error("Invalid add-on proration inputs");
  }
  // Bill whole remaining days (including the current partial day), matching the
  // day count displayed in the checkout rather than a hidden per-minute amount.
  const remainingDays = Math.min(Math.ceil(remainingMilliseconds / DAY_MS), cycleDays);
  const rounded = Math.round(monthlyUnitPriceHalala * quantity * remainingDays / cycleDays);
  const amount = monthlyUnitPriceHalala > 0 && remainingDays > 0 ? Math.max(1, rounded) : rounded;
  if (!Number.isSafeInteger(amount) || amount > MAX_HALALA_AMOUNT) {
    throw new Error("Add-on amount exceeds the supported limit");
  }
  return amount;
}

export type UpcomingInvoiceLine = {
  kind: "base" | "addon";
  label: string;
  amountHalala: number;
  addonPurchaseId?: number;
  quantity?: number;
  unitPriceHalala?: number;
  periodStartAt?: string;
  periodEndAt?: string;
};

export function quoteUpcomingInvoice(input: {
  baseLabel: string;
  baseAmountHalala: number;
  planDays: number;
  periodStartAt: Date;
  recurringAddons: Array<{
    id: number;
    addonType: "chalet" | "service";
    quantity: number;
    monthlyUnitPriceHalala: number;
    recurring: boolean;
    paidThroughAt: Date | null;
    cancelAtPeriodEnd?: boolean;
  }>;
}): UpcomingInvoiceLine[] {
  if (!Number.isSafeInteger(input.baseAmountHalala) || input.baseAmountHalala < 0 ||
      !Number.isSafeInteger(input.planDays) || input.planDays < 1 ||
      Number.isNaN(input.periodStartAt.getTime())) {
    throw new Error("Invalid upcoming invoice quote");
  }
  const periodEndAt = new Date(input.periodStartAt.getTime() + input.planDays * DAY_MS);
  const lines: UpcomingInvoiceLine[] = [{
    kind: "base",
    label: input.baseLabel,
    amountHalala: input.baseAmountHalala,
    periodStartAt: input.periodStartAt.toISOString(),
    periodEndAt: periodEndAt.toISOString(),
  }];
  for (const addon of input.recurringAddons) {
    // Legacy one-time purchases are deliberately never part of a future invoice.
    if (!addon.recurring || addon.cancelAtPeriodEnd || addon.monthlyUnitPriceHalala < 0 ||
        (addon.paidThroughAt && addon.paidThroughAt > input.periodStartAt)) continue;
    const amountHalala = Math.round(addon.monthlyUnitPriceHalala * addon.quantity * input.planDays / 30);
    if (!Number.isSafeInteger(amountHalala) || amountHalala > MAX_HALALA_AMOUNT) {
      throw new Error("Add-on invoice amount exceeds the supported limit");
    }
    lines.push({
      kind: "addon",
      label: addon.addonType === "chalet" ? "عقار إضافي" : "خدمة إضافية",
      amountHalala,
      addonPurchaseId: addon.id,
      quantity: addon.quantity,
      unitPriceHalala: addon.monthlyUnitPriceHalala,
      periodStartAt: input.periodStartAt.toISOString(),
      periodEndAt: periodEndAt.toISOString(),
    });
  }
  return lines;
}

export function quoteAddonCheckout(input: {
  addonType: "chalet" | "service";
  quantity: number;
  monthlyUnitPriceHalala: number;
  cycleDays: number;
  periodStartAt: Date;
  periodEndAt: Date;
  baseLabel: string;
  baseAmountHalala: number;
  recurringAddons: Array<{
    id: number;
    addonType: "chalet" | "service";
    quantity: number;
    monthlyUnitPriceHalala: number;
    recurring: boolean;
    paidThroughAt: Date | null;
    cancelAtPeriodEnd?: boolean;
  }>;
}): {
  amountHalala: number;
  remainingDays: number;
  nextChargeHalala: number;
  baseMonthlyHalala: number;
} {
  const remainingMilliseconds = input.periodEndAt.getTime() - input.periodStartAt.getTime();
  const amountHalala = proratedAddonAmountHalala(
    input.monthlyUnitPriceHalala,
    input.quantity,
    remainingMilliseconds,
    input.cycleDays,
  );
  const nextInvoice = quoteUpcomingInvoice({
    baseLabel: input.baseLabel,
    baseAmountHalala: input.baseAmountHalala,
    planDays: input.cycleDays,
    periodStartAt: input.periodEndAt,
    recurringAddons: [
      ...input.recurringAddons,
      {
        id: -1,
        addonType: input.addonType,
        quantity: input.quantity,
        monthlyUnitPriceHalala: input.monthlyUnitPriceHalala,
        recurring: true,
        paidThroughAt: input.periodEndAt,
        cancelAtPeriodEnd: false,
      },
    ],
  });
  return {
    amountHalala,
    remainingDays: Math.max(0, Math.ceil(remainingMilliseconds / DAY_MS)),
    nextChargeHalala: nextInvoice.reduce((sum, line) => sum + line.amountHalala, 0),
    baseMonthlyHalala: Math.round(input.baseAmountHalala * 30 / input.cycleDays),
  };
}