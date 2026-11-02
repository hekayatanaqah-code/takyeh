import { expect, type Page } from "@playwright/test";
import { test, openForm } from "./fixtures/connection-network";

const draft = "مسودة غير محفوظة على الشبكة";

async function expectDraft(page: Page) {
  await expect(page.getByLabel("الاسم", { exact: true })).toHaveValue("عميل صناعي");
  await expect(page.getByLabel("الملاحظات", { exact: true })).toHaveValue(draft);
}

async function expectOverlay(page: Page, kind: "connection" | "loading") {
  const overlay = page.getByTestId(`${kind}-overlay`);
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("role", "status");
  await expect(overlay).toHaveAttribute("aria-live", "polite");
  await expect(overlay).toContainText(kind === "connection"
    ? "جاري الاتصال... يرجى التأكد من شبكة الإنترنت" : "جارٍ التحميل...");
  const logo = overlay.getByRole("img", { name: "شعار منصة تكية" });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalWidth > 0)).toBe(true);
  const bounds = await overlay.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBe(0);
  expect(bounds!.y).toBe(0);
  expect(bounds!.width).toBe(viewport.width);
  expect(bounds!.height).toBe(viewport.height);
  const content = await overlay.locator(".takyah-status__content").boundingBox();
  expect(content!.x).toBeGreaterThanOrEqual(0);
  expect(content!.y).toBeGreaterThanOrEqual(0);
  expect(content!.x + content!.width).toBeLessThanOrEqual(viewport.width);
  expect(content!.y + content!.height).toBeLessThanOrEqual(viewport.height);
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect(page.locator("#root")).toHaveAttribute("aria-busy", "true");
  await expectDraft(page);
}

async function expectRecovered(page: Page) {
  await expect(page.getByTestId("connection-restored")).toHaveText("تم استعادة الاتصال");
  await expectReady(page);
}

async function expectReady(page: Page) {
  await expect(page.getByTestId("connection-overlay")).toHaveCount(0);
  await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#root")).not.toHaveAttribute("aria-busy", "true");
  await expectDraft(page);
  const notes = page.getByLabel("الملاحظات", { exact: true });
  await expect(notes).toBeFocused();
  await notes.press("End");
  await notes.pressSequentially(" — متابعة");
  await expect(notes).toHaveValue(`${draft} — متابعة`);
}

async function cancelRead(page: Page) {
  await page.evaluate(() => (window as unknown as {
    cancelConnectionRead: () => Promise<void>;
  }).cancelConnectionRead());
}

test("offline while editing preserves the mounted form and retries only the pending read", async ({ page, context, network }) => {
  await openForm(page);
  let navigations = 0;
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  await page.getByRole("button", { name: "قراءة قبل الانقطاع" }).click();
  await expect.poll(() => network.count("/read/offline")).toBe(1);
  await network.disconnect();
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  network.release("offline");
  await expectOverlay(page, "connection");
  await expect(page.getByTestId("read-result")).toBeEmpty();

  // A browser online event is insufficient: a failed reachability probe must
  // leave the overlay in place until the API is genuinely reachable.
  await context.setOffline(false);
  await expect.poll(() => network.count("/healthz")).toBeGreaterThan(0);
  await expectOverlay(page, "connection");
  network.reachable = true;
  await expectRecovered(page);
  await expect(page.getByTestId("read-result")).toHaveText("اكتملت القراءة الصناعية");
  expect(network.count("/read/offline")).toBe(2);
  expect(network.count("/save")).toBe(0);
  expect(network.count("/payment")).toBe(0);
  expect(navigations, "Recovery must never reload/navigate the mounted form").toBe(0);
});

test("slow successful read shows branding/loading without a false offline warning", async ({ page, network }) => {
  await openForm(page);
  await page.getByRole("button", { name: "قراءة بطيئة" }).click();
  await expect.poll(() => network.count("/read/slow")).toBe(1);
  await expectOverlay(page, "loading");
  await expect(page.getByTestId("connection-overlay")).toHaveCount(0);
  network.release("slow");
  await expect(page.getByTestId("read-result")).toHaveText("اكتملت القراءة الصناعية");
  await expectReady(page);
  expect(network.count("/read/slow")).toBe(1);
});

test("cancelling a slow read removes loading and restores focus without a connection warning", async ({ page, network }) => {
  await openForm(page);
  await page.getByRole("button", { name: "قراءة بطيئة" }).click();
  await expectOverlay(page, "loading");
  await cancelRead(page);
  network.release("slow");
  await expect(page.getByTestId("read-state")).toHaveText("idle");
  await expectReady(page);
  await expect(page.getByTestId("connection-restored")).toHaveCount(0);
  expect(network.count("/read/slow")).toBe(1);
});

test("a read cancelled while offline is not replayed on recovery", async ({ page, network }) => {
  await openForm(page);
  await page.getByRole("button", { name: "قراءة قبل الانقطاع" }).click();
  await expect.poll(() => network.count("/read/offline")).toBe(1);
  await network.disconnect();
  network.release("offline");
  await expectOverlay(page, "connection");
  await cancelRead(page);
  await expect(page.getByTestId("read-state")).toHaveText("idle");
  await network.recover();
  await expectRecovered(page);
  await expect(page.getByTestId("connection-restored")).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByTestId("read-result")).toBeEmpty();
  expect(network.count("/read/offline")).toBe(1);
});

for (const kind of ["save", "payment"] as const) {
  test(`an ambiguous ${kind} failure is never resubmitted after recovery`, async ({ page, network }) => {
    await openForm(page);
    network.failWrite = true;
    network.reachable = false;
    await page.getByRole("button", { name: kind === "save" ? "حفظ صناعي" : "دفع صناعي" }).click();
    await expect(page.getByTestId(`${kind}-state`)).toHaveText("error");
    await expectOverlay(page, "connection");
    expect(network.count(`/${kind}`)).toBe(1);
    const call = network.calls.find(call => call.path.endsWith(`/${kind}`))!;
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body!)).toEqual({ name: "عميل صناعي", notes: draft, amount: 100 });
    await network.disconnect();
    network.failWrite = false; // A duplicate would now be accepted, so count it.
    await network.recover();
    await expectRecovered(page);
    // Cover a complete automatic probe interval, not only the online event.
    await page.waitForTimeout(4500);
    await expect(page.getByTestId(`${kind}-state`)).toHaveText("error");
    expect(network.count(`/${kind}`), "Never retry an ambiguous write").toBe(1);
    expect(network.calls.filter(call => call.method !== "GET")).toHaveLength(1);
  });
}
