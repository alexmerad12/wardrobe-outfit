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

async function saveLanguage(page: Page, option: RegExp) {
  const field = page.locator("div.space-y-2", { has: page.getByText(/^(Language|Langue)$/) });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: option }).click();
  await page.getByRole("button", { name: /^(Save Settings|Enregistrer)$/ }).click();
}

// Signed out there is no saved language, so the browser's decides. The
// shared store first fell back to a hard-coded "en" and showed French
// browsers the login page in English (2026-10-23, known-root-causes.md).
test("a signed-out visitor sees the browser's language", async ({ browser }) => {
  for (const [locale, heading, button] of [
    ["fr-CA", "Bon retour !", "Se connecter"],
    ["en-US", "Welcome back", "Sign in"],
  ] as const) {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByText(heading, { exact: true }), `${locale}: login heading`).toBeVisible();
    await expect(page.getByRole("button", { name: button, exact: true }), `${locale}: sign-in button`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(locale.slice(0, 2));
    await context.close();
  }
});

test("switching the language updates every screen at once", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await signIn(page);
  const original = (await (await page.request.get("/api/preferences")).json()) as Prefs;
  await putPrefs(page, original, "en");
  try {
    await page.goto("/profile/settings");
    await expect(heading(page)).toHaveText("Settings");
    await expect(bottomNav(page)).toContainText("Home");

    await saveLanguage(page, /^Français$/);
    await expect(heading(page), "the settings page stayed in English").toHaveText("Paramètres");
    await expect(bottomNav(page), "the bottom nav stayed in English").toContainText("Accueil");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");

    // Client-side navigation: the nav (mounted once in the layout) and the
    // next page both read the new language.
    await bottomNav(page).getByRole("link").nth(1).click();
    await expect(heading(page)).toHaveText("Dressing");
    await expect(bottomNav(page)).toContainText("Accueil");

    await page.goto("/profile/settings");
    await expect(heading(page)).toHaveText("Paramètres");
    await saveLanguage(page, /^English$/);
    await expect(heading(page), "the settings page stayed in French").toHaveText("Settings");
    await expect(bottomNav(page), "the bottom nav stayed in French").toContainText("Home");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  } finally {
    await putPrefs(page, original, original.language ?? "auto");
  }
});
