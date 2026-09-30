import { inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { ownerAccountDiscountsTable, type OwnerAccountDiscount } from "@workspace/db/schema";
import { subscriptionOwnerKeys } from "./subscription-access";

export type AccountDiscountView = {
  kind: "percent" | "fixed";
  value: number;
  startDate: string | null;
  endDate: string | null;
  reason: string;
  active: boolean;
};

export type AccountDiscountSnapshot = AccountDiscountView & { discountHalala: number };

export type DiscountLine = {
  kind: "base" | "addon";
  label: string;
  amountHalala: number;
};

export function saudiCalendarDate(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function discountStarted(discount: { startDate: string | null }, at = new Date()) {
  return !discount.startDate || discount.startDate <= saudiCalendarDate(at);
}

export function discountIsActive(
  discount: { startDate: string | null; endDate: string | null },
  at = new Date(),
) {
  const today = saudiCalendarDate(at);
  return (!discount.startDate || discount.startDate <= today) &&
    (!discount.endDate || discount.endDate >= today);
}

export function latestStartedDiscount<T extends {
  id: number;
  createdAt: Date;
  startDate: string | null;
}>(discounts: T[], at = new Date()): T | undefined {
  return discounts
    .filter((discount) => discountStarted(discount, at))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
}

export function latestDiscountForDisplay<T extends {
  id: number;
  createdAt: Date;
  startDate: string | null;
}>(discounts: T[], at = new Date()): T | undefined {
  const effective = latestStartedDiscount(discounts, at);
  if (effective) return effective;
  return discounts
    .filter((discount) => !!discount.startDate)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
}

export function accountDiscountView(
  discount: Pick<OwnerAccountDiscount, "kind" | "value" | "startDate" | "endDate" | "reason"> | undefined,
  at = new Date(),
): AccountDiscountView | null {
  if (!discount) return null;
  return {
    kind: discount.kind,
    value: Number(discount.value),
    startDate: discount.startDate,
    endDate: discount.endDate,
    reason: discount.reason,
    active: discountIsActive(discount, at),
  };
}

export async function getOwnerAccountDiscount(ownerId: string, at = new Date()) {
  const keys = await subscriptionOwnerKeys(ownerId);
  const discounts = await db.select().from(ownerAccountDiscountsTable)
    .where(inArray(ownerAccountDiscountsTable.ownerId, keys));
  return accountDiscountView(latestDiscountForDisplay(discounts, at), at);
}

export function makeAccountDiscountSnapshot(
  discount: AccountDiscountView,
  discountHalala: number,
): AccountDiscountSnapshot {
  return { ...discount, discountHalala };
}

export function accountDiscountHalala(
  kind: "percent" | "fixed",
  value: number,
  amountHalala: number,
) {
  if (amountHalala <= 0) return 0;
  const raw = kind === "percent"
    ? Math.round(amountHalala * value / 100)
    : Math.round(value);
  return Math.min(amountHalala, Math.max(0, raw));
}

/**
 * Applies one discount to the whole invoice and distributes the discount across
 * its original line amounts. Largest remainders keep accounting exact and
 * deterministic (base line wins ties).
 */
export function discountInvoiceLines<T extends DiscountLine>(
  lines: T[],
  discount: AccountDiscountView | null,
  at = new Date(),
): { lineItems: T[]; discountHalala: number; snapshot: AccountDiscountSnapshot | null } {
  const total = lines.reduce((sum, line) => sum + line.amountHalala, 0);
  if (!discount || !discountIsActive(discount, at) || total <= 0) {
    return { lineItems: lines, discountHalala: 0, snapshot: null };
  }
  let amount = accountDiscountHalala(discount.kind, discount.value, total);
  // Paid checkouts must not accidentally become a free-access redemption.
  amount = Math.min(amount, Math.max(0, total - 1));
  const exact = lines.map((line, index) => ({
    index,
    value: total ? amount * line.amountHalala / total : 0,
  }));
  const shares = exact.map(({ index, value }) => ({ index, amount: Math.floor(value), remainder: value % 1 }));
  let undistributed = amount - shares.reduce((sum, share) => sum + share.amount, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (undistributed <= 0) break;
    if (lines[share.index]!.amountHalala > share.amount) {
      share.amount += 1;
      undistributed -= 1;
    }
  }
  const lineItems = lines.map((line, index) => ({
    ...line,
    amountHalala: line.amountHalala - (shares.find((share) => share.index === index)?.amount ?? 0),
  })) as T[];
  return {
    lineItems,
    discountHalala: amount,
    snapshot: makeAccountDiscountSnapshot(discount, amount),
  };
}
