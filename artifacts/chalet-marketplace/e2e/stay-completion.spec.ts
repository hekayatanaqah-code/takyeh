import { expect, type Page } from "@playwright/test";
import { test, openStay } from "./fixtures/stay-network";
import type { OwnerBooking } from "../src/components/owner/owner-booking-types";

const evening: OwnerBooking = {
  id: 860001, submissionId: 8601, clientName: "إقامة مسائية تجريبية",
  bookingDate: "2026-11-04", durationDays: 1, period: "evening",
  checkoutAt: "2026-11-05T05:00:00+03:00", source: "external",
  totalPrice: "800", depositPaid: "800", insuranceFee: "200",
  insuranceReceived: true, insuranceRefunded: false, balanceCollected: true,
  createdAt: "2026-11-01T12:00:00+03:00",
};
const multiDay: OwnerBooking = {
  ...evening, id: 860002, clientName: "إقامة متعددة الأيام تجريبية",
  durationDays: 3, period: "full_day", checkoutAt: "2026-11-06T18:00:00+03:00",
};
const archive = (page: Page) => page.getByTestId("booking-archive");
const active = (page: Page, id: number) => page.getByTestId(`show-booking-in-calendar-${id}`);
const review = (page: Page) => page.getByRole("button", { name: "إرسال رابط التقييم", exact: true });
const refund = (page: Page) => page.getByRole("button", { name: /إرجاع بالكامل/ });
const deduct = (page: Page) => page.getByRole("button", { name: /خصم من التأمين/ });

async function openCompleted(page: Page) {
  await archive(page).getByRole("button", { name: "الأرشيف", exact: true }).click();
  await archive(page).getByRole("button", { name: "المكتملة", exact: true }).click();
}

async function expectLocked(page: Page) {
  await expect(refund(page)).toBeDisabled();
  await expect(deduct(page)).toBeDisabled();
  await expect(page.getByRole("button", {
    name: "إرسال رابط التقييم", exact: true, includeHidden: true,
  })).toBeDisabled();
}

async function expectUnlocked(page: Page) {
  await expect(refund(page)).toBeEnabled();
  await expect(deduct(page)).toBeEnabled();
  await expect(page.getByRole("button", {
    name: "إرسال رابط التقييم", exact: true, includeHidden: true,
  })).toBeEnabled();
}

async function skipTo(page: Page, instant: string) {
  const delta = Date.parse(instant) - await page.evaluate(() => Date.now());
  // Large jumps fire missed timers once, not thousands of artificial polls.
  await page.clock.fastForward(delta);
}

test("overnight: archive at Saudi midnight, but settlement/review wait for captured departure", async ({ page, stays }) => {
  await openStay(page, stays, evening, "2026-11-04T23:59:30+03:00");
  await openCompleted(page);
  await expect(archive(page).getByText(evening.clientName, { exact: true })).toHaveCount(0);
  await expect(review(page)).toBeDisabled();

  // Calendar completion is NOT stay completion. Overnight occupancy survives
  // midnight financially even though the booking moves into completed archive.
  await page.clock.runFor(29_999);
  await expect(active(page, evening.id)).toBeVisible();
  await page.clock.runFor(1);
  await expect(active(page, evening.id)).toHaveCount(0);
  await expect(archive(page).getByText(evening.clientName, { exact: true })).toBeVisible();
  await expect(review(page)).toBeDisabled();
  await archive(page).getByRole("button", { name: "إدارة التأمين", exact: true }).click();
  await expectLocked(page);

  await skipTo(page, "2026-11-05T04:59:30+03:00");
  await page.clock.runFor(29_999);
  await expectLocked(page); // one millisecond before departure
  await page.clock.runFor(1);
  await expectUnlocked(page);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(review(page)).toBeEnabled();
  expect(stays.navigations, "No reload or navigation across either boundary").toBe(0);
});

test("multi-day: keep every occupied day active; unlock at departure, archive only at final midnight", async ({ page, stays }) => {
  await openStay(page, stays, multiDay, "2026-11-04T23:59:30+03:00");
  await openCompleted(page);
  await page.clock.runFor(30_000);
  await expect(active(page, multiDay.id)).toBeVisible();
  await skipTo(page, "2026-11-05T23:59:30+03:00");
  await page.clock.runFor(30_000);
  await expect(active(page, multiDay.id)).toBeVisible();
  await expect(archive(page).getByText(multiDay.clientName, { exact: true })).toHaveCount(0);
  await expect(review(page)).toBeDisabled();
  await page.getByRole("button", { name: /إدارة التأمين/ }).click();
  await expectLocked(page);

  await skipTo(page, "2026-11-06T17:59:30+03:00");
  await page.clock.runFor(29_999);
  await expectLocked(page);
  await page.clock.runFor(1);
  await expectUnlocked(page);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(review(page)).toBeEnabled();
  await expect(active(page, multiDay.id)).toBeVisible();

  await skipTo(page, "2026-11-06T23:59:30+03:00");
  await page.clock.runFor(29_999);
  await expect(active(page, multiDay.id)).toBeVisible();
  await page.clock.runFor(1);
  await expect(active(page, multiDay.id)).toHaveCount(0);
  await expect(archive(page).getByText(multiDay.clientName, { exact: true })).toBeVisible();
  await expect(review(page)).toBeEnabled();
  expect(stays.navigations).toBe(0);
});

for (const wakeEvent of ["focus", "visibilitychange"] as const) {
  test(`sleeping tab: ${wakeEvent} immediately catches up archive and an already-open insurance dialog`, async ({ page, stays }) => {
    await openStay(page, stays, evening, "2026-11-04T23:59:59+03:00");
    await openCompleted(page);
    await page.getByRole("button", { name: /إدارة التأمين/ }).click();
    await expectLocked(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    // Model a browser suspending all timers while hidden. Do not advance timers
    // or generate a refetch; the wake event itself must update the clock.
    await page.clock.setSystemTime(new Date("2026-11-05T05:00:00+03:00"));
    await expectLocked(page);
    await page.evaluate(event => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      if (event === "focus") window.dispatchEvent(new Event("focus"));
      else document.dispatchEvent(new Event("visibilitychange"));
    }, wakeEvent);
    await expectUnlocked(page);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await expect(active(page, evening.id)).toHaveCount(0);
    await expect(archive(page).getByText(evening.clientName, { exact: true })).toBeVisible();
    await expect(review(page)).toBeEnabled();
    expect(stays.navigations).toBe(0);
  });
}
