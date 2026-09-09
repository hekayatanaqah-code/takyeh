import { expect, test, type Page, type Route } from "@playwright/test";

const owner = {
  id: "owner-calendar-e2e",
  email: "owner-calendar@example.test",
  firstName: "مالك",
  lastName: "اختباري",
  profileImageUrl: null,
};

const submission = {
  id: 41,
  nameAr: "شاليه اختبار التقويم",
  status: "approved",
  city: "بريدة",
  district: "اختبار",
  priceFullDay: 800,
  priceMorning: 400,
  priceEvening: 500,
};

const chalet = {
  id: 71,
  submissionId: submission.id,
  nameAr: submission.nameAr,
  isActive: true,
};

function failOnBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () => expect(errors, errors.join("\n")).toEqual([]);
}

async function expectPopoverInsideViewport(page: Page) {
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

async function mockOwnerApi(route: Route, loggedIn: { value: boolean }) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;

  if (path === "/api/owner-login" && request.method() === "POST") {
    loggedIn.value = true;
    return route.fulfill({ json: { redirect: "/dashboard" } });
  }
  if (path === "/api/auth/user") {
    return route.fulfill({ json: { user: loggedIn.value ? owner : null } });
  }
  if (path === "/api/page-content") return route.fulfill({ json: {} });
  if (path === "/api/staff/me") return route.fulfill({ json: { staff: null } });
  if (path === "/api/owner/impersonation-mode") {
    return route.fulfill({ json: { isImpersonating: false } });
  }
  if (path === "/api/owner/profile") {
    return route.fulfill({
      json: {
        id: 9,
        fullName: "مالك اختباري",
        businessName: submission.nameAr,
        businessType: "chalet",
        email: owner.email,
      },
    });
  }
  if (path === "/api/submissions") return route.fulfill({ json: [submission] });
  if (path === "/api/owner/chalets") return route.fulfill({ json: [chalet] });
  if (path === "/api/owner/plan-limits") {
    return route.fulfill({
      json: { plan: "professional", chaletLimit: 10, chaletCount: 1, serviceLimit: 5 },
    });
  }
  if (path === "/api/owner/subscription") return route.fulfill({ json: null });
  if (path === "/api/owner/support-requests/unread-count") {
    return route.fulfill({ json: { count: 0 } });
  }

  return route.fulfill({ json: [] });
}

test("owner dashboard calendar remains usable in an iPhone viewport", async ({ page }) => {
  const expectNoBrowserErrors = failOnBrowserErrors(page);
  const loggedIn = { value: false };
  await page.route("**/api/**", (route) => mockOwnerApi(route, loggedIn));

  await page.goto("/partner-login");
  await page.getByPlaceholder("أدخل بريدك الإلكتروني أو رقم الجوال").fill(owner.email);
  await page.getByPlaceholder("••••••••").fill("calendar-e2e-password");
  await page.getByRole("button", { name: "دخول", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(submission.nameAr).first()).toBeVisible();
  await page.getByRole("button", { name: "إغلاق أيام" }).click();
  await expect(page.getByRole("dialog")).toContainText(`إغلاق أيام — ${submission.nameAr}`);

  const trigger = page.getByRole("button", { name: "اختر تاريخ البداية" });
  await trigger.click();
  await expectPopoverInsideViewport(page);

  const popover = page.getByTestId("dual-calendar-popover");
  const scrollMetrics = await popover.evaluate((element) => {
    const root = document.querySelector("#root") as HTMLElement | null;
    const rootBefore = root?.scrollTop ?? 0;
    element.scrollTop = element.scrollHeight;
    return {
      popoverScrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      rootBefore,
      rootAfter: root?.scrollTop ?? 0,
    };
  });
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.popoverScrollTop).toBeGreaterThan(0);
  expect(scrollMetrics.rootAfter).toBe(scrollMetrics.rootBefore);
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
  await page.getByRole("button", { name: "هجري", exact: true }).click();
  await expect(page.getByRole("button", { name: "هجري", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const enabledDays = popover
    .getByTestId("dual-calendar-day-grid")
    .locator("button[data-calendar-day]:not(:disabled)");
  await enabledDays.first().click();
  await expect(popover).toBeHidden();
  await expect(trigger).not.toHaveText("اختر تاريخ البداية");

  await trigger.click();
  await expectPopoverInsideViewport(page);
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  expectNoBrowserErrors();
});