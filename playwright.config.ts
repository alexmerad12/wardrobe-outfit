import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Pick up STRESS_TEST_EMAIL / STRESS_TEST_PASSWORD and any other secrets
// from .env.local (gitignored). Without this, process.env in a spec file
// is empty during a Playwright run.
loadEnv({ path: path.resolve(__dirname, ".env.local") });

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
    // Bump Node heap from the default ~2GB to 4GB. Long stress runs
    // (~35 AI calls + many compiled routes + bg-removal WASM in
    // memory) trip the default limit and crash the dev server mid-
    // sweep with "JavaScript heap out of memory".
    command: "npm run dev",
    env: {
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
    url: "http://localhost:3000",
    timeout: 120 * 1000,
    reuseExistingServer: true,
  },
});
