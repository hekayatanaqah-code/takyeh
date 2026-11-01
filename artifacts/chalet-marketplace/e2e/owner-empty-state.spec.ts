import { expect, type Page } from "@playwright/test";
import { test, inventorySources, type BusinessType } from "./fixtures/empty-owner";

async function expectNoManagement(page: Page) {
  await expect(page.getByTestId("owner-primary-navigation")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /تبويبات إدارة/ })).toHaveCount(0);
  for (const label of ["إدارة عقاراتي", "إدارة خدماتي", "الشؤون الإدارية والمالية"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
}

async function expectEmpty(page: Page) {
  await expect(page.getByTestId("owner-toolbar")).toBeVisible();
  await expect(page.getByTestId("owner-empty-state")).toContainText("لا توجد عقارات أو خدمات مضافة بعد");
  await expect(page.getByTestId("button-add-first-activity")).toBeVisible();
  await expect(page.getByTestId("owner-hub")).toHaveCount(0);
  await expectNoManagement(page);
}

for (const businessType of ["chalet", "service", "both"] satisfies BusinessType[]) {
  test.describe(`${businessType} owner without activities`, () => {
    for (const suffix of ["", "?mode=admin-finance"]) {
      test(`keeps account actions but no management on entry${suffix || " (default)"} and reload`, async ({ page, owner }) => {
        owner.businessType = businessType;
        await page.goto(`/dashboard${suffix}`);
        await expectEmpty(page);
        await expect(page.getByTestId("text-owner-name")).toContainText(owner.name);
        for (const source of inventorySources) {
          const applicable = source.includes("providers") ? businessType !== "chalet" : businessType !== "service";
          expect(owner.requested.has(source), `${businessType}: ${source}`).toBe(applicable);
        }
        await page.reload();
        await expectEmpty(page);
        for (const id of ["button-add-activity", "button-account-settings", "button-subscription", "button-manage-requests"]) {
          await expect(page.getByTestId(id)).toBeEnabled();
        }
        await page.getByTestId("button-account-settings").click();
        await expect(page.getByRole("dialog", { name: "إعدادات الحساب" })).toBeVisible();
        await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(owner.name);
        await page.keyboard.press("Escape");
        await page.getByTestId("button-manage-requests").click();
        await expect(page).toHaveURL(/view=requests/);
        await expect(page.getByTestId("button-manage-requests")).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("status")).toContainText("لا توجد طلبات للمتابعة حالياً");
        await expectEmpty(page);
        await page.getByTestId("button-subscription").click();
        await expect(page).toHaveURL(/\/subscription$/);
        await expect(page.getByRole("heading", { name: /الاشتراك|الباقات/ }).first()).toBeVisible();
        expect(owner.writes).toEqual([]);
      });
    }

    for (const kind of businessType === "both" ? ["chalet", "service"] as const : [businessType]) {
      test(`first activity CTA routes to ${kind} using account capabilities`, async ({ page, owner }) => {
        owner.businessType = businessType;
        await page.goto("/dashboard?mode=admin-finance");
        await expectEmpty(page);
        await page.getByTestId("button-add-first-activity").click();
        if (businessType === "both") {
          await expect(page.getByRole("dialog", { name: "ماذا تريد أن تضيف؟" })).toBeVisible();
          await page.getByTestId(`choice-add-${kind}`).click();
        } else {
          await expect(page.getByRole("dialog")).toHaveCount(0);
        }
        await expect(page).toHaveURL(new RegExp(kind === "chalet" ? "/add-chalet$" : "/add-service-provider$"));
        expect(owner.writes).toEqual([]);
      });
    }
  });
}

for (const source of ["/api/owner/profile", ...inventorySources]) {
  test(`does not claim emptiness while ${source} is loading`, async ({ page, owner }) => {
    owner.delaySource = source;
    await page.goto("/dashboard?mode=admin-finance");
    await expect.poll(() => owner.requested.has(source)).toBe(true);
    await expect(page.getByTestId("owner-dashboard-loading")).toBeVisible();
    await expect(page.getByTestId("owner-empty-state")).toHaveCount(0);
    await expectNoManagement(page);
    owner.release();
    await expectEmpty(page);
  });

  test(`does not claim emptiness when ${source} fails; retry recovers`, async ({ page, owner }) => {
    owner.failSource = source;
    await page.goto("/dashboard?mode=admin-finance");
    await expect(page.getByRole("alert").filter({ hasText: "تعذّر تحميل" }).first()).toBeVisible();
    await expect(page.getByTestId("owner-empty-state")).toHaveCount(0);
    await expect(page.getByTestId("button-add-first-activity")).toHaveCount(0);
    owner.failSource = null;
    await page.getByRole("button", { name: "إعادة المحاولة", exact: true }).click();
    await expectEmpty(page);
    await page.reload();
    await expectEmpty(page);
  });
}

test("synthetic owner session saves the first service request then enters its management", async ({ page, owner }, testInfo) => {
  owner.businessType = "service";
  await page.goto("/dashboard");
  await expectEmpty(page);
  await testInfo.attach("signed-in-empty-owner", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByTestId("button-add-first-activity").click();
  await page.locator("#businessName").fill("خدمة مصطنعة أولى");
  for (const [placeholder, option] of [
    ["اختر الفئة", "ضيافة اختبارية"],
    ["اختر المنطقة", "منطقة اختبارية"],
    ["اختر المدينة الرئيسية", "مدينة اختبارية"],
    ["اختر وحدة التسعير", "باليوم"],
  ]) {
    await page.getByRole("combobox").filter({ hasText: new RegExp(`^${placeholder}$`) }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await page.locator("#experience").fill("2");
  await page.locator("#whatsapp").fill("500000000");
  await page.locator("#dailyCapacity").fill("1");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type=file][multiple]').setInputFiles(
    [1, 2, 3].map(n => ({ name: `synthetic-${n}.png`, mimeType: "image/png", buffer: png })),
  );
  await page.getByRole("checkbox", { name: /أقر بأنني المالك/ }).check();
  await page.getByRole("button", { name: /إرسال الطلب/ }).click();
  await expect(page.getByRole("heading", { name: "تم إرسال طلبك!" })).toBeVisible();
  expect(owner.serviceSubmissions).toHaveLength(1);
  expect(owner.serviceSubmissions[0]).toMatchObject({ businessName: "خدمة مصطنعة أولى", status: "pending", ownerId: owner.id });
  expect(owner.serviceSubmissions[0].galleryPhotos).toHaveLength(3);
  await page.getByRole("button", { name: "الذهاب إلى لوحة التحكم" }).click();
  await expect(page.getByTestId("owner-toolbar")).toBeVisible();
  await expect(page.getByTestId("owner-empty-state")).toHaveCount(0);
  await expect(page.getByTestId("owner-nav-services")).toBeVisible();
  await expect(page.getByText("خدمة مصطنعة أولى").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("owner-empty-state")).toHaveCount(0);
  await expect(page.getByTestId("owner-nav-services")).toBeVisible();
  expect(owner.writes).toEqual([
    "/api/storage/uploads/process", "/api/storage/uploads/process", "/api/storage/uploads/process",
    "/api/providers/submit",
  ]);
});

for (const role of ["staff", "preview"] as const) {
  test(`${role} retains its existing dashboard instead of owner onboarding`, async ({ page, owner }) => {
    owner.role = role;
    owner.businessType = "chalet";
    await page.goto("/dashboard");
    await expect(page.getByTestId("owner-dashboard-loading")).toHaveCount(0);
    await expect(page.getByTestId("owner-empty-state")).toHaveCount(0);
    await expect(page.getByTestId("owner-toolbar")).toHaveCount(0);
    await expect(page.getByText(role === "staff" ? "موظف اختباري" : "إدارة اختبارية").first()).toBeVisible();
    if (role === "preview") await expect(page.getByRole("button", { name: "إدارة عقاراتي", exact: true })).toBeVisible();
    if (role === "staff") {
      await expect(page.getByRole("navigation", { name: "تبويبات إدارة العقارات", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "التقويم والحجوزات", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "الإيرادات", exact: true })).toHaveCount(0);
    }
  });
}
