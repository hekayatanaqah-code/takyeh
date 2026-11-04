import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import type { OwnerBooking } from "../../src/components/owner/owner-booking-types";

export class StayNetwork {
  bookings: OwnerBooking[] = [];
  readonly unexpected: string[] = [];
  readonly writes: string[] = [];
  readonly browserErrors: string[] = [];
  navigations = 0;

  constructor(private context: BrowserContext) {}

  async install(origin: string, page: Page) {
    page.on("pageerror", error => this.browserErrors.push(error.message));
    await this.context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        // Block the production stylesheet's optional Google fonts as well.
        if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
          return route.abort("blockedbyclient");
        }
        // Nothing external, even WhatsApp
        // or a payment provider opened in a new tab, may escape this context.
        this.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      if (!url.pathname.startsWith("/api/")) return route.continue();
      if (request.method() !== "GET") {
        this.writes.push(`${request.method()} ${url.pathname}`);
        return route.abort("blockedbyclient");
      }
      if (url.pathname === "/api/owner/bookings") {
        // Always return unchanged raw records. The real component, not the mock
        // API, must remove expired stays from the active list.
        return route.fulfill({ json: this.bookings });
      }
      if (url.pathname === "/api/owner/bookings/archive") {
        // Explicit test oracle: last occupied date ends at Saudi midnight.
        // Do NOT import the production time helper (a shared bug would pass).
        const now = await page.evaluate(() => Date.now());
        const completed = this.bookings.filter(b =>
          now >= Date.parse(`${b.bookingDate}T00:00:00+03:00`) + b.durationDays * 86_400_000);
        const bookings = url.searchParams.get("tab") === "completed" ? completed : [];
        return route.fulfill({ json: {
          bookings, rescheduleLog: [], total: bookings.length,
          page: 1, pageSize: 20, years: [2026],
        } });
      }
      if (url.pathname === "/api/owner/message-settings") {
        return route.fulfill({ json: { waEnabled: false } });
      }
      if (url.pathname === "/api/owner/bookings/stats") {
        return route.fulfill({ json: {
          activeCurrentMonth: 1, revenueCurrentMonth: 0, totalActive: 1,
          totalCancelled: 0, totalRescheduled: 0,
        } });
      }
      if ([
        "/api/page-content", "/api/owner/section-guides",
        "/api/owner/booking-payments", "/api/owner/cash-deposit-logs",
        "/api/owner/availability",
        "/api/owner/seasons", "/api/owner/global-seasons",
        "/api/owner/submission-addons/8601",
      ].includes(url.pathname)) return route.fulfill({ json: [] });
      this.unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort("blockedbyclient");
    });
  }
}

export const test = base.extend<{ stays: StayNetwork }>({
  stays: async ({ context, page, baseURL }, use) => {
    const network = new StayNetwork(context);
    await network.install(new URL(baseURL!).origin, page);
    try {
      await use(network);
    } finally {
      try {
        expect(network.unexpected, "No unmodelled APIs or third-party traffic").toEqual([]);
        expect(network.writes, "No settlement, review invite, messages or money sent").toEqual([]);
        expect(network.browserErrors, "Real mounted components must not crash").toEqual([]);
      } finally {
        await context.clearCookies();
        await context.close(); // disposes clocks, query cache, DOM/storage even on failure
        network.bookings.length = 0;
      }
    }
  },
});

export async function openStay(page: Page, stays: StayNetwork, booking: OwnerBooking, now: string) {
  stays.bookings = [booking];
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.goto("/e2e/fixtures/stay-completion.html");
  await expect(page.getByTestId("property-booking-management")).toBeVisible();
  await expect(page.getByTestId(`show-booking-in-calendar-${booking.id}`)).toBeVisible();
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) stays.navigations++; });
}
