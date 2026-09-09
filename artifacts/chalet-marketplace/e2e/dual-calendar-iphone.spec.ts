import { expect, test, type Page } from "@playwright/test";

function failOnBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  return () => expect(errors, errors.join("\n")).toEqual([]);
}

async function expectInsideViewport(page: Page) {
  const popover = page.getByTestId("dual-calendar-popover");
  await expect(popover).toBeVisible();

  const bounds = await popover.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
}

test("custom calendar stays usable inside an iPhone viewport", async ({ page }) => {
  const expectNoBrowserErrors = failOnBrowserErrors(page);

  await page.goto("/__test/dual-calendar");
  await expect(page.locator('input[type="date"]:visible')).toHaveCount(0);

  const trigger = page.getByRole("button", { name: "اختر تاريخ الاختبار" });
  await trigger.click();
  await expectInsideViewport(page);

  const popover = page.getByTestId("dual-calendar-popover");
  await expect(popover).toHaveAttribute("role", "dialog");
  const scrollMetrics = await popover.evaluate((element) => {
    const before = element.scrollTop;
    element.scrollTop = element.scrollHeight;
    return {
      before,
      after: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(scrollMetrics.scrollHeight).toBeGreaterThanOrEqual(scrollMetrics.clientHeight);
  if (scrollMetrics.scrollHeight > scrollMetrics.clientHeight) {
    expect(scrollMetrics.after).toBeGreaterThan(scrollMetrics.before);
  }
  await popover.evaluate((element) => {
    element.scrollTop = 0;
  });

  await page.getByRole("button", { name: "ميلادي", exact: true }).click();
  await expect(page.getByRole("button", { name: "ميلادي", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const monthHeading = popover.locator('button[title="اختر السنة والشهر مباشرة"]');
  const initialHeading = await monthHeading.innerText();
  await page.getByRole("button", { name: "الشهر السابق" }).click();
  await expect(monthHeading).not.toHaveText(initialHeading);
  await page.getByRole("button", { name: "الشهر التالي" }).click();

  const enabledDays = popover
    .getByTestId("dual-calendar-day-grid")
    .locator("button[data-calendar-day]:not(:disabled)");
  await expect(enabledDays.first()).toHaveCSS("pointer-events", "auto");
  await enabledDays.first().click();
  await expect(popover).toBeHidden();
  await expect(page.getByTestId("selected-date")).not.toHaveText("");

  await trigger.click();
  await expectInsideViewport(page);
  await expect(page.locator('input[type="date"]:visible')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();

  expectNoBrowserErrors();
});