import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

type Call = { path: string; method: string; body: string | null };

export class SyntheticNetwork {
  reachable = true;
  failWrite = false;
  readonly calls: Call[] = [];
  readonly unexpected: string[] = [];
  private gates = new Map<string, () => void>();
  private released = new Set<string>();
  private closing = false;

  constructor(private context: BrowserContext) {}

  async install() {
    await this.context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const baseURL = new URL(base.info().project.use.baseURL!);
      if (url.origin !== baseURL.origin) {
        // No payment provider, notification or analytics may escape this fixture.
        this.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      this.calls.push({ path: url.pathname, method: request.method(), body: request.postData() });
      if (url.pathname === "/api/healthz" && request.method() === "GET") {
        return route.fulfill({ status: this.reachable ? 200 : 503, json: { synthetic: true } });
      }
      const readKey = url.pathname.match(/^\/api\/__connection_e2e\/read\/(slow|offline)$/)?.[1];
      if (readKey && request.method() === "GET") {
        if (!this.released.has(readKey)) {
          await new Promise<void>(resolve => this.gates.set(readKey, resolve));
        }
        if (this.closing || !this.reachable) return route.abort("internetdisconnected");
        return route.fulfill({ json: { message: "اكتملت القراءة الصناعية" } });
      }
      if (/^\/api\/__connection_e2e\/(save|payment)$/.test(url.pathname) && request.method() === "POST") {
        // Model the ambiguous case: the server received the write, but its
        // response was lost. A retry would duplicate a save/charge.
        if (this.failWrite) return route.abort("connectionreset");
        return route.fulfill({ json: { synthetic: true } });
      }
      this.unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort("blockedbyclient");
    });
  }

  release(key: string) {
    this.released.add(key);
    this.gates.get(key)?.();
    this.gates.delete(key);
  }

  count(suffix: string) {
    return this.calls.filter(call => call.path.endsWith(suffix)).length;
  }

  async disconnect() {
    this.reachable = false;
    await this.context.setOffline(true);
  }

  async recover() {
    this.reachable = true;
    await this.context.setOffline(false);
  }

  async cleanup() {
    this.closing = true;
    for (const release of this.gates.values()) release();
    this.gates.clear();
    await this.context.setOffline(false);
    await this.context.clearCookies();
    this.released.clear();
  }
}

export const test = base.extend<{ network: SyntheticNetwork }>({
  network: async ({ context }, use) => {
    const network = new SyntheticNetwork(context);
    await network.install();
    try {
      await use(network);
      expect(network.unexpected, "No real API or third-party traffic").toEqual([]);
    } finally {
      await network.cleanup();
      // Closing the context cancels pending fetches/React Query timers and
      // discards the synthetic form, mutations and responses even on failure.
      await context.close();
      network.calls.length = 0;
    }
  },
});

export async function openForm(page: Page) {
  await page.goto("/e2e/fixtures/connection.html");
  await expect(page.getByTestId("loading-overlay")).toHaveCount(0);
  await page.getByLabel("الاسم", { exact: true }).fill("عميل صناعي");
  await page.getByLabel("الملاحظات", { exact: true }).fill("مسودة غير محفوظة على الشبكة");
}
