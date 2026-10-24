import { test, expect, type Page } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// Language switch: English -> French -> English in Profile > Settings, the
// way a user does it. Everything already on screen must switch the moment
// the setting is saved: the page itself, the bottom nav and <html lang>,
// with no reload. Until 2026-10-17 each component kept the language it
// mounted with, so the page and the nav stayed in the old language until a
// reload (known-root-causes.md). No AI calls. Restores the account's
// original language at the end.

assertE2EAccount();

type Prefs = Record<string, unknown> & { language?: string };

async function putPrefs(page: Page, prefs: Prefs, language: string) {
  const loc = prefs.location as { city?: string; lat?: number; lng?: number } | null | undefined;
  const res = await page.request.put("/api/preferences", {
    data: {
      user_id: "default",
      location: loc?.city ? { city: loc.city, lat: loc.lat, lng: loc.lng } : null,
      use_device_location: prefs.use_device_location ?? true,
      temperature_sensitivity: prefs.temperature_sensitivity ?? "normal",
      temperature_unit: prefs.temperature_unit ?? "auto",
      language,
      gender: prefs.gender ?? "not-specified",
      preferred_styles: [],
      favorite_colors: [],
      avoided_colors: [],
    },
  });
  expect(res.ok(), `PUT /api/preferences ${res.status()}`).toBe(true);
}

const heading = (page: Page) => page.locator("h1").first();
const bottomNav = (page: Page) => page.locator("nav").last();
// The nav carries both languages and CSS shows one (BothLanguages), so the
// checks read the visible text, never textContent (which holds both).
const visible = { useInnerText: true } as const;

async function saveLanguage(page: Page, option: RegExp) {
  const field = page.locator("div.space-y-2", { has: page.getByText(/^(Language|Langue)$/) });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: option }).click();
  await page.getByRole("button", { name: /^(Save Settings|Enregistrer)$/ }).click();
}

// Signed out there is no saved language, so the browser's decides. The
// shared store first fell back to a hard-coded "en" and showed French
// browsers the login page in English (2026-10-23, known-root-causes.md).
// The launch page, the first screen of every new visitor, was hard-coded in
// English until 2026-10-23.
test("a signed-out visitor sees the browser's language", async ({ browser }) => {
  for (const [locale, heading, button, getStarted] of [
    ["fr-CA", "Bon retour !", "Se connecter", "Commencer"],
    ["en-US", "Welcome back", "Sign in", "Get started"],
  ] as const) {
    const context = await browser.newContext({ locale });
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("linette_splash_seen", "1");
      } catch {}
    });
    const page = await context.newPage();
    await page.goto("/launch");
    await expect(page.getByRole("link", { name: getStarted, exact: true }), `${locale}: launch page`).toBeVisible();
    await page.goto("/login");
    await expect(page.getByText(heading, { exact: true }), `${locale}: login heading`).toBeVisible();
    await expect(page.getByRole("button", { name: button, exact: true }), `${locale}: sign-in button`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(locale.slice(0, 2));
    await context.close();
  }
});

// Text on screen before the app's code runs (the bottom nav, the splash
// tagline) follows the phone's language from the first paint. With the code
// blocked, a French user's phone must already read French: it read "Home"
// and "Your AI Stylist" until the code loaded, up to 3 s on a slow phone
// (2026-10-23, known-root-causes.md).
test("before the app's code runs, a French phone already reads French", async ({ browser }) => {
  // The service worker hides requests from page routing: block it.
  const context = await browser.newContext({ locale: "fr-CA", serviceWorkers: "block" });
  // Block the app's code before the first page loads (a chunk cached by an
  // earlier page would hydrate anyway), and give the phone a French user's
  // locale cache (this test account itself is English).
  // Next 16 serves them from /_next/static/immutable/chunks/.
  await context.route(/\/_next\/static\/(?:.+\/)?chunks\/.+\.js/, (route) => route.abort());
  await context.addInitScript(() => {
    try {
      localStorage.setItem("locale:v1", "fr");
    } catch {}
  });
  const page = await context.newPage();
  await signIn(page);
  await page.goto("/profile");
  await expect(page.locator("nav a[href='/']")).toHaveText("Accueil", visible);
  await expect(page.locator(".ls-tag")).toHaveText(/ta styliste ia/i, visible);
  await context.close();
});

// Onboarding read the browser language straight into useState: English on
// the server, French on a French phone, React error #418 on every French
// first visit (2026-10-23, known-root-causes.md).
test("onboarding loads without a hydration error in a French browser", async ({ browser }) => {
  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await signIn(page);
  await page.goto("/onboarding");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(errors.filter((e) => /#418|hydrat/i.test(e)), "hydration errors").toEqual([]);
  await context.close();
});

test("switching the language updates every screen at once", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await signIn(page);
  const original = (await (await page.request.get("/api/preferences")).json()) as Prefs;
  await putPrefs(page, original, "en");
  try {
    await page.goto("/profile/settings");
    await expect(heading(page)).toHaveText("Settings");
    await expect(bottomNav(page)).toContainText("Home", visible);

    await saveLanguage(page, /^Français$/);
    await expect(heading(page), "the settings page stayed in English").toHaveText("Paramètres");
    await expect(bottomNav(page), "the bottom nav stayed in English").toContainText("Accueil", visible);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");

    // Client-side navigation: the nav (mounted once in the layout) and the
    // next page both read the new language.
    await bottomNav(page).getByRole("link").nth(1).click();
    await expect(heading(page)).toHaveText("Dressing");
    await expect(bottomNav(page)).toContainText("Accueil", visible);

    await page.goto("/profile/settings");
    await expect(heading(page)).toHaveText("Paramètres");
    await saveLanguage(page, /^English$/);
    await expect(heading(page), "the settings page stayed in French").toHaveText("Settings");
    await expect(bottomNav(page), "the bottom nav stayed in French").toContainText("Home", visible);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  } finally {
    await putPrefs(page, original, original.language ?? "auto");
  }
});
