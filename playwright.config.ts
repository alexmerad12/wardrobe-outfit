import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Pick up STRESS_TEST_EMAIL / STRESS_TEST_PASSWORD and any other secrets
// from .env.local (gitignored). Without this, process.env in a spec file
// is empty during a Playwright run.
loadEnv({ path: path.resolve(__dirname, ".env.local") });

// Smoke tests for the bulk-upload / review flow, run against a local
// dev server. Serial because the test user is shared.
// Where the tests run. Port 3000 unless E2E_BASE_URL names another server
// that is ALREADY running (a production build on another port, so two
// sessions on this machine don't stop each other's server: the dev server
// below always starts on 3000).
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 5 * 60 * 1000, // 5 min per test — bulk processing is slow
  use: {
    baseURL: BASE_URL,
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
    url: BASE_URL,
    timeout: 120 * 1000,
    reuseExistingServer: true,
  },
});
