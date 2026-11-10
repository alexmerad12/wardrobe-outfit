import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./auth";

// Settings → Appearance (2026-11-09). The app follows the phone unless the
// person picks Light or Dark; the choice lives in this browser
// (localStorage "theme:v1") and holds from the first frame of the next
// visit, because the pre-paint script in layout.tsx reads it.

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
// The colour the browser bar takes: the first theme-color tag that applies.
const barColor = (page: Page) =>
  page.evaluate(() => {
    const tags = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const media = (m: HTMLMetaElement) => m.getAttribute("media");
    return tags.find((m) => !media(m) || window.matchMedia(media(m)!).matches)?.content ?? null;
  });
const barTagCount = (page: Page) => page.evaluate(() => document.querySelectorAll('meta[name="theme-color"]').length);

async function choose(page: Page, option: RegExp) {
  const field = page.locator("div.space-y-2", { has: page.getByText(/^(Appearance|Apparence)$/) });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: option }).click();
}

test("a stored choice is applied before the app's code runs", async ({ browser }) => {
  for (const [phone, stored, dark] of [
    ["dark", "light", false],
    ["light", "dark", true],
  ] as const) {
    // The service worker hides requests from page routing: block it, then
    // block the app's code so only the pre-paint script can set the look.
    const context = await browser.newContext({ colorScheme: phone, serviceWorkers: "block" });
    await context.route(/\/_next\/static\/(?:.+\/)?chunks\/.+\.js/, (route) => route.abort());
    await context.addInitScript((value) => {
      try {
        localStorage.setItem("theme:v1", value);
      } catch {}
    }, stored);
    const page = await context.newPage();
    await page.goto("/launch");
    expect(await isDark(page), `${phone} phone, "${stored}" stored`).toBe(dark);
    expect(await barColor(page), "the browser bar takes the chosen mode's colour").toBe(dark ? "#0a0a0a" : "#ffffff");
    await context.close();
  }
});

test.describe("on a dark phone", () => {
  test.use({ colorScheme: "dark" });

  test("Light and Dark override the phone, Same as device follows it again", async ({ page }) => {
    await signIn(page);
    await page.goto("/profile/settings");
    await expect(page.getByText(/^(Appearance|Apparence)$/)).toBeVisible();
    expect(await isDark(page), "no choice yet: the phone's mode").toBe(true);

    await choose(page, /^(Light|Clair)$/);
    expect(await isDark(page), "Light picked on a dark phone").toBe(false);
    expect(await barColor(page)).toBe("#ffffff");

    await page.goto("/");
    expect(await isDark(page), "Light holds on the next screen").toBe(false);

    await page.goto("/profile/settings");
    await choose(page, /^(Dark|Sombre)$/);
    expect(await isDark(page)).toBe(true);
    await page.emulateMedia({ colorScheme: "light" });
    expect(await isDark(page), "Dark holds when the phone turns light").toBe(true);

    await choose(page, /^(Same as device|Comme l'appareil)$/);
    expect(await isDark(page), "back to the phone's mode, now light").toBe(false);
    expect(await barColor(page)).toBe("#ffffff");
    // Only Next's own two tags are left (a third one meant React had
    // re-added a tag we changed: the first version of this did that).
    expect(await barTagCount(page)).toBe(2);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => isDark(page), { message: "and it follows the phone again" }).toBe(true);
    expect(await barColor(page)).toBe("#0a0a0a");
  });
});
