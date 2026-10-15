import { test, type Page } from "@playwright/test";
import { mintSessionCookies } from "./harness-session";

// Which account the e2e specs sign in as.
//  - HARNESS_EMAIL: a DEDICATED test account (email contains "e2e" or
//    "harness"). Signs in through the Supabase admin API, no password
//    stored anywhere (harness-session.ts).
//  - Legacy: STRESS_TEST_EMAIL + STRESS_TEST_PASSWORD through the login
//    form. Never point it at a real person's account: several specs write
//    to the wardrobe.
export const E2E_EMAIL = process.env.HARNESS_EMAIL || process.env.STRESS_TEST_EMAIL || "";
const E2E_PASSWORD = process.env.HARNESS_EMAIL
  ? process.env.HARNESS_PASSWORD
  : process.env.STRESS_TEST_PASSWORD;

export function assertE2EAccount(): void {
  if (!E2E_EMAIL) {
    throw new Error(
      "Set HARNESS_EMAIL (dedicated test account) or STRESS_TEST_EMAIL + STRESS_TEST_PASSWORD in .env.local"
    );
  }
  // Tripwire: specs seed, overwrite and wipe wardrobes.
  if (!/e2e|harness/i.test(E2E_EMAIL)) {
    throw new Error(
      `Refusing to run: ${E2E_EMAIL} doesn't look like a dedicated test account (must contain "e2e" or "harness"). Set HARNESS_EMAIL.`
    );
  }
  if (!process.env.HARNESS_EMAIL && !E2E_PASSWORD) {
    throw new Error("STRESS_TEST_PASSWORD missing for STRESS_TEST_EMAIL");
  }
}

// Signs the page's browser context in and lands on the app.
export async function signIn(page: Page): Promise<void> {
  if (E2E_PASSWORD) {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.locator('button[type="submit"]').click();
    // Supabase auth can be slow under repeated logins (rate-limit backoff).
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
    return;
  }
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
  await page.context().addCookies(await mintSessionCookies(E2E_EMAIL, baseURL));
  await page.goto("/");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}
