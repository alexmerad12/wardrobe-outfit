import { test, expect, type Page } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// Opening a piece from the wardrobe and coming back lands on the same spot of
// the grid, that piece's card at the same height on screen, whether the person
// uses the app's back arrow or the phone's / browser's Back. The owner's ask,
// 2026-11-16 ("it's item number 17 ... so I don't have to scroll all the way
// down"). How: src/lib/wardrobe-return.ts.

assertE2EAccount();

test.use({ viewport: { width: 390, height: 844 } });

const ITEM_URL = /\/wardrobe\/[0-9a-f-]{36}/;

function card(page: Page, id: string) {
  return page.locator(`[data-item-id="${id}"]`);
}

async function cardTop(page: Page, id: string): Promise<number> {
  return card(page, id).evaluate((el) => el.getBoundingClientRect().top);
}

test("wardrobe: coming back from a piece lands where the grid was", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
  await signIn(page);
  await page.goto("/wardrobe");
  const cards = page.locator("[data-item-id]");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  const count = await cards.count();
  test.skip(count < 10, `the test wardrobe has ${count} pieces, too few to scroll`);

  // The 17th piece when there is one, like the owner's example, put in the
  // middle of the screen as a person scrolling down would.
  const id = (await cards.nth(Math.min(count - 1, 16)).getAttribute("data-item-id"))!;
  await page.evaluate((itemId) => {
    const el = document.querySelector(`[data-item-id="${itemId}"]`)!;
    window.scrollBy(0, el.getBoundingClientRect().top - 320);
  }, id);
  await page.waitForTimeout(400);
  const top = await cardTop(page, id);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

  // 1. The app's back arrow.
  await card(page, id).click();
  await page.waitForURL(ITEM_URL);
  await page.getByRole("button", { name: /^(back|retour)$/i }).click();
  await page.waitForURL((url) => url.pathname === "/wardrobe");
  await expect(card(page, id)).toBeVisible();
  expect(Math.abs((await cardTop(page, id)) - top)).toBeLessThanOrEqual(4);

  // The arrow stepped back in history: Back from the grid now leaves the
  // wardrobe instead of reopening the piece (the old push did).
  await page.goBack();
  await page.waitForURL((url) => url.pathname !== "/wardrobe");
  expect(page.url()).not.toMatch(ITEM_URL);

  // 2. The phone's / browser's Back.
  await page.goto("/wardrobe");
  await expect(card(page, id)).toBeVisible({ timeout: 30_000 });
  await page.evaluate((itemId) => {
    const el = document.querySelector(`[data-item-id="${itemId}"]`)!;
    window.scrollBy(0, el.getBoundingClientRect().top - 320);
  }, id);
  await page.waitForTimeout(400);
  const top2 = await cardTop(page, id);
  await card(page, id).click();
  await page.waitForURL(ITEM_URL);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/wardrobe");
  await expect(card(page, id)).toBeVisible();
  expect(Math.abs((await cardTop(page, id)) - top2)).toBeLessThanOrEqual(4);

  // 3. A visit that didn't come from a piece still opens at the top.
  await page.goto("/");
  await page.goto("/wardrobe");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
