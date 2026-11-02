import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";

const dist = join(process.cwd(), "dist/public");
const html = await readFile(join(dist, "index.html"), "utf8");
const writes: string[] = [];
const requests: string[] = [];
const browserErrors: string[] = [];
let authenticated = false;
let admin = false;
let delayedChunk: string | null = null;
let releaseChunk: (() => void) | undefined;
const failedAssets = new Map<string, string[]>();
const assetUrls: string[] = [];

const types: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2",
};

async function mockProduction(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== new URL(test.info().project.use.baseURL as string).origin) return route.abort();
  if (url.pathname.startsWith("/assets/")) {
    requests.push(`${request.method()} ${url.pathname}`);
    assetUrls.push(request.url());
  }
  if (url.pathname.startsWith("/api/")) {
    requests.push(`${request.method()} ${url.pathname}`);
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 403, json: { error: "Writes disabled in route regression tests" } });
    }
    if (url.pathname === "/api/login") return route.fulfill({ status: 204, body: "" });
    if (url.pathname === "/api/auth/user") {
      return route.fulfill({ json: { user: authenticated ? {
        id: "synthetic-owner", email: "owner@example.test", firstName: "مالك اختباري", lastName: "",
      } : null } });
    }
    if (url.pathname === "/api/admin-staff/me") {
      return route.fulfill({ json: { adminStaff: admin ? {
        id: 987, name: "مسؤول اختباري", permissions: { dashboard: true, chalets: true },
      } : null } });
    }
    if (url.pathname === "/api/staff/me") return route.fulfill({ json: { staff: null } });
    if (url.pathname === "/api/owner/impersonation-mode") return route.fulfill({ json: { active: false } });
    if (url.pathname === "/api/owner/profile") return route.fulfill({ json: {
      id: 987, fullName: "مالك اختباري", businessType: "both", email: "owner@example.test", phone: "",
    } });
    if (url.pathname === "/api/providers/search-options") return route.fulfill({ json: { categories: [], cities: [] } });
    if (url.pathname === "/api/owner/plan-limits") return route.fulfill({ json: {
      plan: "professional", active: true, chaletLimit: 5, chaletCount: 0, serviceLimit: 5, serviceCount: 0, scope: "full",
    } });
    if (url.pathname === "/api/owner/quick-sales/settings") return route.fulfill({ json: { enabled: false } });
    if (url.pathname === "/api/owner/support-requests/unread-count") return route.fulfill({ json: { count: 0 } });
    if (url.pathname === "/api/owner/broadcast-preferences") return route.fulfill({ json: {
      inApp: false, inbox: false, email: false, whatsapp: false,
    } });
    if (url.pathname === "/api/service-categories") return route.fulfill({ json: [] });
    if (url.pathname === "/api/service-regions") return route.fulfill({ json: [] });
    if (url.pathname === "/api/service-cities") return route.fulfill({ json: [] });
    if (/\/api\/(page-content|settings|owner\/notification-settings)$/.test(url.pathname))
      return route.fulfill({ json: {} });
    if (url.pathname === "/api/owner/notifications") return route.fulfill({ json: [] });
    if (url.pathname === "/api/photography/invites/test-token") return route.fulfill({ json: {
      name: "مصورة اختبارية", whatsapp: "966500000000", expiresAt: "2099-01-01T00:00:00.000Z",
    } });
    if (url.pathname === "/api/photography/contract") return route.fulfill({ json: {
      id: 1, html: "<p>عقد اختباري</p>", version: 1,
    } });
    if (/\/api\/(owner\/subscription|owner\/subscription\/addons)$/.test(url.pathname))
      return route.fulfill({ json: url.pathname.endsWith("addons") ? [] : null });
    return route.fulfill({ json: [] });
  }
  if (url.pathname.startsWith("/assets/")) {
    const name = url.pathname.split("/").pop()!;
    const failures = failedAssets.get(name);
    if (failures) {
      failures.push(request.url());
      if (failures.length === 1) return route.abort("failed");
    }
    if (delayedChunk === name) await new Promise<void>(resolve => { releaseChunk = resolve; });
  }
  const relative = url.pathname === "/" || !extname(url.pathname)
    ? "index.html" : url.pathname.replace(/^\/+/, "");
  try {
    const body = relative === "index.html" ? html : await readFile(join(dist, relative));
    return route.fulfill({ status: 200, body, contentType: types[extname(relative)] ?? "application/octet-stream" });
  } catch {
    return route.fulfill({ status: 404, body: "Not found" });
  }
}

test.beforeEach(async ({ page, context }) => {
  writes.length = 0;
  requests.length = 0;
  assetUrls.length = 0;
  failedAssets.clear();
  browserErrors.length = 0;
  authenticated = false;
  admin = false;
  delayedChunk = null;
  await context.route("**/*", mockProduction);
  page.on("pageerror", error => browserErrors.push(error.stack ?? error.message));
});

test.afterEach(async ({ page }) => {
  releaseChunk?.();
  releaseChunk = undefined;
  await test.info().attach("route-loading-network-and-console", {
    body: JSON.stringify({ requests, browserErrors, writes }, null, 2),
    contentType: "application/json",
  });
  expect(writes, "No API mutation may reach a backend").toEqual([]);
  // Failed dynamic-import requests are intentional in retry cases; caught
  // React.lazy download rejections are not uncaught browser exceptions.
  expect(browserErrors, "No uncaught app exceptions").toEqual([]);
  const dir = join(process.cwd(), "../../generated-artifacts/route-loading");
  await import("node:fs/promises").then(fs => fs.mkdir(dir, { recursive: true }));
  await page.screenshot({ path: join(dir, `${test.info().project.name}-${test.info().title.replaceAll(/[^a-z0-9]+/gi, "-")}.png`), fullPage: true });
});

test("production home has no Admin or Dashboard chunks; public client routes render on direct load", async ({ page }) => {
  const assets: string[] = [];
  page.on("request", request => { if (request.url().includes("/assets/")) assets.push(request.url()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /اكتشف أجمل الشاليهات/ })).toBeVisible();
  await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
  expect(assets.some(url => /\/(Admin|Dashboard)-[^/]+\.js/.test(url))).toBe(false);
  expect(assets.some(url => /\/assets\/recover-/.test(url))).toBe(false);
  for (const [path, expected] of [
    ["/chalets", /الشاليهات|الشاليه/],
    ["/services", /الخدمات|مقدمي الخدمات/],
    ["/login", /تسجيل الدخول/],
    ["/register", /إنشاء حساب|تسجيل/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: expected }).first()).toBeVisible();
    await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
  }
});

test("direct owner and admin routes load only with synthetic auth; private unauthenticated routes retain returnTo", async ({ page }) => {
  authenticated = true;
  await page.goto("/dashboard");
  await expect(page.getByTestId("owner-toolbar")).toBeVisible();
  await expect(page.getByTestId("owner-empty-state")).toContainText("لا توجد عقارات أو خدمات مضافة بعد");
  admin = true;
  await page.goto("/admin");
  await expect(page.getByText("مسؤول اختباري").first()).toBeVisible();

  authenticated = false;
  admin = false;
  const loginUrls: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/login")) loginUrls.push(request.url()); });
  for (const path of ["/subscription", "/my-chalet/123"]) {
    await page.goto(path);
    await expect.poll(() => loginUrls.length).toBeGreaterThan(path === "/subscription" ? 0 : 1);
  }
  expect(loginUrls.map(url => new URL(url).searchParams.get("returnTo"))).toEqual([
    // Preserve the pre-existing default for routes that don't pass returnTo.
    "/subscription", "/",
  ]);
});

test("photographer invitation named export loads and delayed route download shows branded loading", async ({ page }) => {
  await page.goto("/photographer/invite/test-token");
  await expect(page.getByText(/دعوة|مصوّر|المصور/).first()).toBeVisible();
  const chaletChunk = (await import("node:fs/promises")).readdir(dist + "/assets")
    .then(files => files.find(file => file.startsWith("Chalets-") && file.endsWith(".js")));
  delayedChunk = (await chaletChunk) ?? null;
  await page.goto("/chalets");
   await expect(page.getByTestId("route-loading")).toBeVisible();
   await expect(page.getByTestId("route-loading").getByRole("img", { name: "شعار منصة تكية" })).toBeVisible();
  releaseChunk?.();
  releaseChunk = undefined;
  delayedChunk = null;
  await expect(page.getByRole("heading", { name: /الشاليهات|الشاليه/ }).first()).toBeVisible();
});

test("a shared TileLayer failure recovers Chalets through its route graph and can retry a failed fallback", async ({ page }) => {
  const files = await (await import("node:fs/promises")).readdir(dist + "/assets");
  const sharedChunk = files.find(file => file.startsWith("TileLayer-") && file.endsWith(".js"))!;
  const fallback = await recoveryFilename("pages/Chalets");
  failAssetOnce(sharedChunk);
  failAssetOnce(fallback);
  let navigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await page.goto("/chalets");
  const error = page.getByTestId("route-download-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("تعذّر تحميل الصفحة");
  const retry = error.getByRole("button", { name: "إعادة المحاولة" });
  await expect(retry).toBeVisible();
  const retryBounds = await retry.boundingBox();
  const viewport = page.viewportSize()!;
  expect(retryBounds).not.toBeNull();
  expect(retryBounds!.x).toBeGreaterThanOrEqual(0);
  expect(retryBounds!.y).toBeGreaterThanOrEqual(0);
  expect(retryBounds!.x + retryBounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(retryBounds!.y + retryBounds!.height).toBeLessThanOrEqual(viewport.height);
  // The route bundle imports TileLayer as a shared dependency. Fail it once;
  // the route-specific recovery graph must not retry that poisoned URL.
  await retry.click();
  await expect.poll(() => failedAssets.get(fallback)?.length ?? 0).toBe(1);
  await expect(error).toBeVisible();
  expect(failedAssets.get(sharedChunk)).toHaveLength(1);
  expectRecoveryFetch(fallback, 1);
  await error.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect.poll(() => failedAssets.get(fallback)?.length ?? 0).toBe(2);
  expectRecoveryFetch(fallback, 2);
  await expect(page.getByRole("heading", { name: /الشاليهات|الشاليه/ }).first()).toBeVisible();
  expect(navigations).toBe(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/about");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/about$/);
  await page.evaluate(() => {
    history.pushState({}, "", "/chalets");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).toHaveURL(/\/chalets$/);
  await expect(page.getByRole("heading", { name: /الشاليهات|الشاليه/ }).first()).toBeVisible();
  expect(navigations).toBe(1);
});

test("failed PhotographerPortal chunk recovers the invitation named export", async ({ page }) => {
  const files = await (await import("node:fs/promises")).readdir(dist + "/assets");
  const original = files.find(file => file.startsWith("PhotographerPortal-") && file.endsWith(".js"))!;
  const fallback = await recoveryFilename("features/photography/PhotographerPortal");
  failAssetOnce(original);
  let navigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await page.goto("/photographer/invite/test-token");
  const error = page.getByTestId("route-download-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("تعذّر تحميل الصفحة");
  await error.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect.poll(() => assetUrls.some(url => new URL(url).pathname.endsWith(`/${fallback}`))).toBe(true);
  expect(failedAssets.get(original)).toHaveLength(1);
  expectRecoveryFetch(fallback, 1);
  await expect(page.getByTestId("text-invite-name")).toHaveValue("مصورة اختبارية");
  await expect(page.getByTestId("input-photographer-email")).toBeVisible();
  expect(navigations).toBe(1);
});

test("failed Dashboard root chunk recovers the authenticated owner route with app context intact", async ({ page }) => {
  authenticated = true;
  const files = await (await import("node:fs/promises")).readdir(dist + "/assets");
  const original = files.find(file => file.startsWith("Dashboard-") && file.endsWith(".js"))!;
  const fallback = await recoveryFilename("pages/Dashboard");
  failAssetOnce(original);
  let navigations = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await page.goto("/dashboard");
  const error = page.getByTestId("route-download-error");
  await expect(error).toBeVisible();
  await error.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect.poll(() => assetUrls.some(url => new URL(url).pathname.endsWith(`/${fallback}`))).toBe(true);
  await expect(page.getByTestId("owner-toolbar")).toBeVisible();
  await expect(page.getByTestId("owner-empty-state")).toContainText("لا توجد عقارات أو خدمات مضافة بعد");
  expect(failedAssets.get(original)).toHaveLength(1);
  expectRecoveryFetch(fallback, 1);
  expect(navigations).toBe(1);
});

function failAssetOnce(name: string) {
  failedAssets.set(name, []);
}

async function recoveryFilename(key: string) {
  const manifest = JSON.parse(await readFile(join(dist, "route-recovery.json"), "utf8"));
  return manifest.routes[key].file.split("/").pop() as string;
}

function expectRecoveryFetch(file: string, count: number) {
  const urls = assetUrls.filter(value => new URL(value).pathname.endsWith(`/${file}`));
  expect(urls).toHaveLength(count);
  const parsed = urls.map(value => new URL(value));
  for (const url of parsed) {
    expect(url.origin).toBe(new URL(test.info().project.use.baseURL as string).origin);
    expect(url.searchParams.get("route-retry")).toBeTruthy();
  }
  expect(new Set(parsed.map(url => url.searchParams.get("route-retry"))).size).toBe(count);
}
