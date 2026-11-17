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

// What a tap on the middle of the card would hit, when it isn't the card.
// Playwright's click waits out anything covering the card by scrolling the
// page to new spots, so the tap would land somewhere else than where the card
// was measured (the launch splash did, 2026-11-16: known-root-causes.md).
async function coveringTheCard(page: Page, id: string): Promise<string | null> {
  return card(page, id).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (hit && el.contains(hit)) return null;
    return hit ? hit.outerHTML.slice(0, 160) : "nothing (off screen)";
  });
}

test("wardrobe: coming back from a piece lands where the grid was", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);
  // The launch splash plays once per session and only counts as seen when it
  // ends, ~3.9 s in: signing in on "/" and opening the wardrobe at once played
  // it again over the grid. The grid under it is what's tested.
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("linette_splash_seen", "1");
    } catch {}
  });
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
  expect(await coveringTheCard(page, id), "something covers the card when it is tapped").toBeNull();
  await card(page, id).click();
  await page.waitForURL(ITEM_URL);
  await page.getByRole("button", { name: /^(back|retour)$/i }).click();
  await page.waitForURL((url) => url.pathname === "/wardrobe");
  // The grid fetches its pieces again on the way back: give production's
  // slower answers the same 30 s as the first load (the default 5 s failed
  // one run of five against linette.app).
  await expect(card(page, id)).toBeVisible({ timeout: 30_000 });
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
  expect(await coveringTheCard(page, id), "something covers the card when it is tapped").toBeNull();
  await card(page, id).click();
  await page.waitForURL(ITEM_URL);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === "/wardrobe");
  await expect(card(page, id)).toBeVisible({ timeout: 30_000 });
  expect(Math.abs((await cardTop(page, id)) - top2)).toBeLessThanOrEqual(4);

  // 3. A visit that didn't come from a piece still opens at the top.
  await page.goto("/");
  await page.goto("/wardrobe");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
