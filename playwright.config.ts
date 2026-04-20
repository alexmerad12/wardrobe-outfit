import { defineConfig, devices } from "@playwright/test";

// Smoke tests for the bulk-upload / review flow, run against a local
// dev server. Serial because the test user is shared.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 5 * 60 * 1000, // 5 min per test — bulk processing is slow
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    timeout: 120 * 1000,
    reuseExistingServer: true,
  },
});
