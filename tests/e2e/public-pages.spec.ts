import { test, expect } from "@playwright/test";

// Signed-out visitors. The pages Google Play, Google's sign-in review and
// search engines read have to be public: until 2026-11-09 the root,
// robots.txt and sitemap.xml all answered with a redirect to /login.
// No test account needed: nothing here signs in.
test.describe("public pages (signed out)", () => {
  test("the root sends a signed-out visitor to the launch page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/launch$/);
    await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
    await expect(page.locator('a[href="/terms"]').first()).toBeVisible();
  });

  test("the account deletion page is public and names the app", async ({ page }) => {
    const res = await page.goto("/delete-account");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/delete-account$/);
    // A document opened directly: the launch splash must not play over it
    // (it covered the whole first screen until 2026-11-09).
    await expect(page.locator(".launch-splash")).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Linette", { useInnerText: true });
    await expect(page.locator("body")).toContainText("hello@linette.app", { useInnerText: true });
    // Its button leads to the in-app deletion screen (sign-in first).
    await expect(page.locator('a[href="/profile/settings/privacy"]').first()).toBeVisible();
  });

  test("privacy and terms state the 18+ rule and the Google sign-in data", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("body")).toContainText(/18/, { useInnerText: true });
    await page.goto("/privacy");
    await expect(page.locator("body")).toContainText(/Google/, { useInnerText: true });
    await expect(page.locator('a[href="/delete-account"]').first()).toBeVisible();
    // Every outside service the code talks to is named (the stores' data
    // forms are filled from this list). Add a service here when the app
    // starts calling one.
    for (const service of ["Supabase", "Vercel", "Stripe", "Sentry", "Resend", "Upstash", "Open-Meteo", "BigDataCloud"]) {
      await expect(page.locator("body"), service).toContainText(service, { useInnerText: true });
    }
  });

  test("robots.txt and sitemap.xml are served, not redirected", async ({ request }) => {
    const robots = await request.get("/robots.txt", { maxRedirects: 0 });
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap:");
    const sitemap = await request.get("/sitemap.xml", { maxRedirects: 0 });
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("/delete-account");
  });

  test("the API still refuses a signed-out caller", async ({ request }) => {
    const res = await request.get("/api/items", { maxRedirects: 0 });
    expect(res.status()).toBe(401);
  });

  test("a signed-out visit to an app page still goes to the login", async ({ page }) => {
    await page.goto("/wardrobe");
    await expect(page).toHaveURL(/\/login\?next=%2Fwardrobe$/);
  });
});
