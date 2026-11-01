import { randomUUID } from "node:crypto";
import { test as base, expect, type Route } from "@playwright/test";

export type BusinessType = "chalet" | "service" | "both";
export const inventorySources = [
  "/api/submissions",
  "/api/owner/chalets",
  "/api/providers/my/submissions",
  "/api/providers/my/approved",
] as const;

/**
 * Browser-only owner session. No seed rows, cookies or uploads ever reach the
 * real API. Each test gets a new context and identity; teardown clears every
 * mutable fixture and rejects unrecognised API calls instead of forwarding.
 */
export const test = base.extend<{ owner: EmptyOwner }>({
  owner: async ({ page, context, baseURL }, use, testInfo) => {
    const owner = new EmptyOwner();
    const origin = new URL(baseURL!).origin;
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin && !["data:", "blob:"].includes(url.protocol)) {
        // Fonts and other third-party resources are unnecessary. No payment,
        // WhatsApp, analytics or external service is allowed from this suite.
        return route.abort();
      }
      if (url.pathname.startsWith("/api/")) return owner.respond(route);
      if (url.pathname.startsWith("/e2e-image/")) {
        return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' });
      }
      return route.continue();
    });
    page.on("pageerror", error => owner.browserErrors.push(error.message));
    try {
      await use(owner);
      expect(owner.unexpectedRequests, "No unmodelled API calls or real side effects").toEqual([]);
      expect(owner.browserErrors, "No uncaught browser errors").toEqual([]);
    } finally {
      owner.release();
      await testInfo.attach("synthetic-session-summary", {
        body: JSON.stringify({ id: owner.id, savedRequests: owner.serviceSubmissions.length, writes: owner.writes }),
        contentType: "application/json",
      });
      owner.clear();
      await context.clearCookies();
      // Playwright closes this test's entire context, including storage,
      // intercepted uploads and its in-memory session, even on assertion failure.
    }
  },
});

export class EmptyOwner {
  readonly id = `empty-owner-${randomUUID()}`;
  readonly email = `${this.id}@example.test`;
  readonly name = "مالك اختبار الخلو";
  businessType: BusinessType = "both";
  loggedIn = true;
  role: "owner" | "staff" | "preview" = "owner";
  failSource: string | null = null;
  delaySource: string | null = null;
  readonly requested = new Set<string>();
  readonly unexpectedRequests: string[] = [];
  readonly browserErrors: string[] = [];
  readonly writes: string[] = [];
  serviceSubmissions: Record<string, unknown>[] = [];
  propertySubmissions: Record<string, unknown>[] = [];
  properties: Record<string, unknown>[] = [];
  providers: Record<string, unknown>[] = [];
  private releaseGate!: () => void;
  private gate = new Promise<void>(resolve => { this.releaseGate = resolve; });
  private uploadCount = 0;

  release() { this.delaySource = null; this.releaseGate(); }
  clear() {
    this.loggedIn = false;
    this.serviceSubmissions = [];
    this.propertySubmissions = [];
    this.properties = [];
    this.providers = [];
    this.requested.clear();
    this.writes.length = 0;
    this.browserErrors.length = 0;
    this.unexpectedRequests.length = 0;
    this.uploadCount = 0;
  }

  async respond(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    this.requested.add(path);
    if (path === this.delaySource) await this.gate;
    if (path === this.failSource) return route.fulfill({ status: 503, json: { error: "مصدر غير متاح للاختبار" } });
    if (path === "/api/providers/submit" && request.method() === "POST") {
      const payload = request.postDataJSON();
      this.serviceSubmissions.push({ ...payload, id: 8101, status: "pending", ownerId: this.id });
      this.writes.push(path);
      return route.fulfill({ status: 201, json: this.serviceSubmissions[0] });
    }
    if (path === "/api/storage/uploads/process" && request.method() === "POST") {
      this.writes.push(path);
      return route.fulfill({ json: { url: `/e2e-image/${this.id}-${++this.uploadCount}.svg` } });
    }
    const responses: Record<string, unknown> = {
      "/api/auth/user": { user: this.loggedIn ? {
        id: this.id, email: this.email, firstName: this.name, lastName: "", profileImageUrl: null,
      } : null },
      "/api/staff/me": { staff: this.role === "staff" ? {
        id: 9101, ownerId: this.id, name: "موظف اختباري", username: "synthetic-staff",
        permissions: { chaletManagement: true, bookingsControl: true }, isActive: true,
      } : null },
      "/api/owner/impersonation-mode": this.role === "preview"
        ? { active: true, ownerId: this.id, ownerName: this.name, adminLabel: "إدارة اختبارية" }
        : { active: false },
      "/api/owner/profile": { id: 7101, fullName: this.name, businessType: this.businessType, email: this.email, phone: "" },
      "/api/submissions": this.propertySubmissions,
      "/api/owner/chalets": this.properties,
      "/api/providers/my/submissions": this.serviceSubmissions,
      "/api/providers/my/approved": this.providers,
      "/api/owner/plan-limits": {
        plan: "professional", active: true, chaletLimit: 5, chaletCount: this.propertySubmissions.length,
        serviceLimit: 5, serviceCount: this.serviceSubmissions.length, scope: "full",
      },
      "/api/owner/subscription": null,
      "/api/owner/subscription/addons": [],
      "/api/owner/support-requests/unread-count": { count: 0 },
      "/api/owner/notifications": [],
      "/api/owner/notification-settings": {},
      "/api/owner/broadcast-preferences": { inApp: false, inbox: false, email: false, whatsapp: false },
      "/api/owner/quick-sales/settings": { enabled: false },
      "/api/page-content": {},
      "/api/settings": {},
      "/api/subscription-plans": [],
      "/api/service-categories": [{ id: 6101, key: "hospitality", labelAr: "ضيافة اختبارية", emoji: "" }],
      "/api/service-regions": [{ id: 6201, name: "منطقة اختبارية", isActive: true }],
      "/api/service-cities": [{ id: 6301, regionId: 6201, name: "مدينة اختبارية", isActive: true }],
      "/api/regions": [],
      "/api/amenities": [],
      "/api/categories": [],
      "/api/owner/section-guides": [],
      "/api/owner/availability": [],
      "/api/owner/bookings": [],
      "/api/owner/blocked-dates": [],
    };
    if (request.method() === "GET" && Object.hasOwn(responses, path)) {
      return route.fulfill({ json: responses[path] });
    }
    this.unexpectedRequests.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 501, json: { error: `Unmodelled test endpoint: ${path}` } });
  }
}
