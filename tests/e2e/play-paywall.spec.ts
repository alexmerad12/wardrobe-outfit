import { test, expect, type Browser, type Page } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// The paywall inside the Android app sells through Google Play, never
// Stripe (src/lib/play-purchases.ts). A real purchase needs a phone, a
// Google account and Google Play: here a browser plays the app, with a
// stand-in for RevenueCat's plugin that records every call, and the
// server's "re-read the purchase" route answered by the test.
//
// It needs an account that is STOPPED by the paywall, so it is not part of
// the smoke suite (whose server lets the test account through):
//   - build with NEXT_PUBLIC_REVENUECAT_ANDROID_KEY=goog_e2e (any value)
//   - start the server WITHOUT the test account in CAP_BYPASS_EMAILS
//   - HARNESS_EMAIL=<the e2e account> npm run test:paywall
// When the account gets through the paywall, the tests skip and say so.

const APP_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A.250205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 LinetteAndroid/1";

type Call = { method: string; options?: Record<string, unknown> };
type Store = { calls: Call[] };
type StoreOptions = { purchase: "ok" | "closed" | "fails"; trial: boolean };

function installFakeStore(options: StoreOptions) {
  const store: Store = { calls: [] };
  let configuredFor: string | null = null;
  const plan = (id: string, price: number, priceString: string, perWeek: string, trial: boolean) => ({
    identifier: id,
    packageType: id === "$rc_annual" ? "ANNUAL" : "WEEKLY",
    presentedOfferingContext: { offeringIdentifier: "default" },
    product: {
      identifier: `linette_premium:${id === "$rc_annual" ? "annual" : "weekly"}`,
      price,
      priceString,
      pricePerWeekString: perWeek,
      currencyCode: "CAD",
      defaultOption: {
        freePhase: trial ? { billingPeriod: { unit: "DAY", value: 7, iso8601: "P7D" } } : null,
      },
    },
  });
  const w = window as unknown as { __store: Store; Capacitor: unknown };
  w.__store = store;
  w.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Purchases: {
        isConfigured: async () => ({ isConfigured: configuredFor !== null }),
        configure: async (o: { apiKey: string; appUserID: string }) => {
          store.calls.push({ method: "configure", options: o });
          configuredFor = o.appUserID;
        },
        getAppUserID: async () => ({ appUserID: configuredFor }),
        logIn: async (o: { appUserID: string }) => {
          store.calls.push({ method: "logIn", options: o });
          configuredFor = o.appUserID;
        },
        getOfferings: async () => ({
          current: {
            // Prices no page of the site contains, so a pass can only come
            // from the store's answer.
            weekly: plan("$rc_weekly", 7.49, "CA$7.49", "CA$7.49", options.trial),
            annual: plan("$rc_annual", 84.99, "CA$84.99", "CA$1.63", false),
          },
        }),
        purchasePackage: async (o: { aPackage: { identifier: string } }) => {
          store.calls.push({ method: "purchasePackage", options: { identifier: o.aPackage.identifier } });
          if (options.purchase === "closed") throw { code: "1", message: "Purchase was cancelled." };
          if (options.purchase === "fails") throw { code: "2", message: "There was a problem with the store." };
          return {};
        },
        restorePurchases: async () => {
          store.calls.push({ method: "restorePurchases" });
          return {};
        },
      },
    },
  };
}

const storeCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __store: Store }).__store.calls);

/** A signed-in page of "the app" standing on the paywall, or null when
 *  this server lets the account through (see the top of the file). */
async function paywallInApp(
  browser: Browser,
  options: Partial<StoreOptions> & { syncAnswers?: boolean[] } = {},
): Promise<{ page: Page; requests: string[] } | null> {
  const context = await browser.newContext({
    userAgent: APP_UA,
    viewport: { width: 412, height: 915 },
  });
  // tsx names nested functions through a helper the page doesn't have.
  await context.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
  await context.addInitScript(installFakeStore, {
    purchase: options.purchase ?? "ok",
    trial: options.trial ?? true,
  });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem("linette_splash_seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) requests.push(`${request.method()} ${url.pathname}`);
  });
  // The server's answer after a purchase or a restore, one per call.
  const answers = [...(options.syncAnswers ?? [true])];
  await page.route("**/api/play/sync", (route) =>
    route.fulfill({ json: { active: answers.length > 1 ? answers.shift() : answers[0] } }),
  );

  await signIn(page);
  await page.goto("/paywall");
  if (new URL(page.url()).pathname !== "/paywall") {
    await context.close();
    return null;
  }
  return { page, requests };
}

const SKIP_REASON =
  "this server lets the test account through the paywall: start it without CAP_BYPASS_EMAILS (see the top of the file)";

test.beforeAll(() => {
  assertE2EAccount();
});

test("in the app the paywall shows Google Play's prices and terms, never the website's", async ({ browser }) => {
  const app = await paywallInApp(browser);
  test.skip(!app, SKIP_REASON);
  const { page, requests } = app!;

  await expect(page.locator('[data-play-price="annual"]')).toHaveText("CA$84.99");
  await expect(page.locator('[data-play-price="weekly"]')).toHaveText("CA$7.49");
  const body = page.locator("body");
  // 84.99 against 52 x 7.49: worked out from the store's own prices.
  // (The badge is drawn in capitals, and innerText follows the drawing.)
  await expect(body).toContainText(/Save 78%|Économise 78 %/i, { useInnerText: true });
  await expect(body).toContainText(/CA\$1\.63/, { useInnerText: true });
  await expect(body).toContainText(/7-day free trial|7 jours d'essai gratuit/, { useInnerText: true });
  await expect(body).toContainText(/Google Play/, { useInnerText: true });
  // Nothing of the website's offer is visible: its prices, its checkout.
  await expect(body).not.toContainText(/79[.,]99|6[.,]99/, { useInnerText: true });
  await expect(page.getByRole("button", { name: /Restore purchase|Restaurer l'achat/ })).toBeVisible();
  await expect(page.locator('a[href="/terms"]')).toBeVisible();
  await expect(page.locator('a[href="/privacy"]')).toBeVisible();

  // The store was opened for this account: its Supabase id, nothing else.
  const configure = (await storeCalls(page)).find((c) => c.method === "configure");
  expect(String(configure?.options?.appUserID)).toMatch(/^[0-9a-f-]{36}$/);
  expect(String(configure?.options?.apiKey)).not.toBe("");
  expect(requests).not.toContain("POST /api/checkout");
  await page.context().close();
});

test("without a free trial offer from Google, none is promised", async ({ browser }) => {
  const app = await paywallInApp(browser, { trial: false });
  test.skip(!app, SKIP_REASON);
  const { page } = app!;
  await expect(page.locator('[data-play-price="weekly"]')).toHaveText("CA$7.49");
  await expect(page.locator("body")).not.toContainText(/free trial|essai gratuit|Free for|Gratuit pendant/, {
    useInnerText: true,
  });
  await page.context().close();
});

test("Continue buys the chosen plan through Google Play, then the server re-reads it", async ({ browser }) => {
  // RevenueCat can lag Google Play: the first re-read still says no.
  const app = await paywallInApp(browser, { syncAnswers: [false, true] });
  test.skip(!app, SKIP_REASON);
  const { page, requests } = app!;
  await expect(page.locator('[data-play-price="weekly"]')).toHaveText("CA$7.49");

  await page.getByRole("button", { name: /Weekly|Hebdo/ }).click();
  const leaves = page.waitForRequest((request) => new URL(request.url()).pathname === "/" && request.isNavigationRequest());
  await page.getByRole("button", { name: /^(Continue|Continuer)$/ }).click();
  // Access confirmed: the app goes home (this server sends the unpaid test
  // account straight back, which is not what is checked here).
  await leaves;

  const bought = (await storeCalls(page).catch(() => [])).filter((c) => c.method === "purchasePackage");
  // The page may already have left: the requests tell the same story.
  expect(requests.filter((r) => r === "POST /api/play/sync").length).toBe(2);
  expect(requests).not.toContain("POST /api/checkout");
  if (bought.length) expect(bought[0].options?.identifier).toBe("$rc_weekly");
  await page.context().close();
});

test("closing Google's sheet is not an error; a store failure says so; nothing is synced", async ({ browser }) => {
  for (const purchase of ["closed", "fails"] as const) {
    const app = await paywallInApp(browser, { purchase });
    test.skip(!app, SKIP_REASON);
    const { page, requests } = app!;
    await expect(page.locator('[data-play-price="annual"]')).toHaveText("CA$84.99");
    await page.getByRole("button", { name: /^(Continue|Continuer)$/ }).click();
    await expect
      .poll(async () => (await storeCalls(page)).filter((c) => c.method === "purchasePackage").length)
      .toBe(1);
    const message = page.getByText(/The purchase didn't go through|L'achat n'a pas abouti/);
    if (purchase === "closed") await expect(message).toBeHidden();
    else await expect(message).toBeVisible();
    // The button is usable again, and the annual plan (the default) was the one asked for.
    await expect(page.getByRole("button", { name: /^(Continue|Continuer)$/ })).toBeEnabled();
    expect((await storeCalls(page)).find((c) => c.method === "purchasePackage")?.options?.identifier).toBe("$rc_annual");
    expect(requests).not.toContain("POST /api/play/sync");
    await page.context().close();
  }
});

test("Restore asks Google Play, and says so when this Google account has nothing", async ({ browser }) => {
  const app = await paywallInApp(browser, { syncAnswers: [false] });
  test.skip(!app, SKIP_REASON);
  const { page, requests } = app!;
  await expect(page.locator('[data-play-price="annual"]')).toHaveText("CA$84.99");
  await page.getByRole("button", { name: /Restore purchase|Restaurer l'achat/ }).click();
  await expect(page.getByText(/No subscription found|Aucun abonnement trouvé/)).toBeVisible();
  expect((await storeCalls(page)).some((c) => c.method === "restorePurchases")).toBe(true);
  expect(requests).toContain("POST /api/play/sync");
  await page.context().close();
});

test("the server refuses to open Stripe's checkout for the app", async ({ browser }) => {
  const app = await paywallInApp(browser);
  test.skip(!app, SKIP_REASON);
  const { page } = app!;
  const status = await page.evaluate(async () => {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "annual" }),
    });
    return res.status;
  });
  expect(status).toBe(403);
  await page.context().close();
});

test("in a browser the paywall is the website's: its prices, no Restore, no Google Play", async ({ page }) => {
  await signIn(page);
  await page.goto("/paywall");
  test.skip(new URL(page.url()).pathname !== "/paywall", SKIP_REASON);
  const body = page.locator("body");
  await expect(body).toContainText(/79[.,]99/, { useInnerText: true });
  await expect(body).toContainText(/6[.,]99/, { useInnerText: true });
  await expect(body).not.toContainText(/Google Play/, { useInnerText: true });
  await expect(page.getByRole("button", { name: /Restore purchase|Restaurer l'achat/ })).toBeHidden();
});
