import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "stay-completion",
      testMatch: /stay-completion\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        // Deliberately not Saudi: all boundaries must use +03, not browser time.
        timezoneId: "America/Los_Angeles",
        serviceWorkers: "block",
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    },
    {
      name: "owner-onboarding",
      testMatch: /owner-empty-state\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    },
    {
      name: "webkit-iphone",
      testIgnore: /(?:owner-empty-state|connection-recovery|route-loading|stay-completion)\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
      },
    },
    ...[
      { name: "connection-desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
      { name: "connection-mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    ].map(({ name, ...device }) => ({
      name,
      testMatch: /connection-recovery\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...device,
        browserName: "chromium" as const,
        serviceWorkers: "block" as const,
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    })),
    ...[
      { name: "route-loading-desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
      { name: "route-loading-mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    ].map(({ name, ...device }) => ({
      name,
      testMatch: /route-loading\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...device,
        browserName: "chromium" as const,
        serviceWorkers: "block" as const,
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    })),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "PORT=5173 BASE_PATH=/ pnpm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});