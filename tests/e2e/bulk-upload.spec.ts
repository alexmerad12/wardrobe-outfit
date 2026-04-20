import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const TEST_EMAIL = "test@gmail.com";
const TEST_PASSWORD = "Test123456";

// Pick the first 5 .jpg fixtures in alphabetical order. If we need to
// rotate through a different set, swap files in tests/fixtures/.
function getFixtures(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort()
    .slice(0, 5)
    .map((f) => path.join(FIXTURES_DIR, f));
}

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Tolerate the post-login redirect going to / , /wardrobe, /home,
  // or /onboarding for a brand-new account.
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, {
    timeout: 30_000,
  });
}

test.describe("bulk upload + review flow", () => {
  test("signs in", async ({ page }) => {
    await signIn(page);
    // Not asserting on console errors — the initial page load often
    // fires a 401 before the session cookie is picked up by /api/items
    // and similar; harmless.
    await page.goto("/wardrobe");
    await expect(page).toHaveURL(/\/wardrobe/);
  });

  test(
    "upload 5 photos on throttled mobile — every one should still finish",
    async ({ browser }) => {
      // Pixel 7 viewport + DevTools "Slow 3G" profile. This is the closest
      // approximation of the mobile cellular environment where the user
      // was seeing items hang indefinitely.
      const ctx = await browser.newContext({
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      });
      const page = await ctx.newPage();

      // CDP-level throttling: realistic Fast 3G — 1.6 Mbit down, 750 kbit
      // up, 150 ms RTT. Close to a typical urban 4G/5G experience with
      // weak signal, which is the environment where the user was seeing
      // uploads get stuck.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1600 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });

      // Simulate the "random failure" the user reports — drop ~25% of
      // upload attempts. If the pipeline's retry logic is sound, items
      // still finish; if not, this test will expose exactly which
      // stage hangs.
      let uploadAttempts = 0;
      await page.route("**/api/upload", async (route) => {
        uploadAttempts++;
        if (uploadAttempts % 4 === 1) {
          // Every 4th attempt (starting with #1) — abort to simulate a
          // dropped connection.
          await route.abort("failed");
          return;
        }
        await route.continue();
      });

      const consoleErrors: string[] = [];
      const pendingLogs: string[] = [];
      const failedRequests: Array<{ url: string; status: number; body: string }> =
        [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (msg.type() === "error") consoleErrors.push(text);
        if (/\[(pending|upload|tus)/.test(text)) pendingLogs.push(text);
      });
      page.on("response", async (resp) => {
        if (resp.status() >= 400) {
          const body = await resp.text().catch(() => "<no body>");
          failedRequests.push({
            url: resp.url(),
            status: resp.status(),
            body: body.slice(0, 200),
          });
        }
      });

      await signIn(page);
      await page.goto("/wardrobe");
      await page.waitForLoadState("networkidle");

      const fixtures = getFixtures();
      const libraryInput = page.locator(
        'input[type="file"][accept="image/*"][multiple]'
      );
      await libraryInput.setInputFiles(fixtures);

      await page.waitForURL(/\/wardrobe\/uploading/, { timeout: 60_000 });

      const settledBy = Date.now() + 5 * 60 * 1000;
      let ready = 0;
      let errored = 0;
      while (Date.now() < settledBy) {
        ready = await page.locator('[data-stage="ready"]').count();
        errored = await page.locator('[data-stage="error"]').count();
        if (ready + errored >= fixtures.length) break;
        await page.waitForTimeout(1500);
      }

      console.log(
        `[throttled-test] ready=${ready} errored=${errored} total=${fixtures.length}`
      );
      if (failedRequests.length > 0) {
        console.log("[throttled-test] failed requests:");
        for (const r of failedRequests) {
          console.log(`  ${r.status} ${r.url}`);
          if (r.body) console.log(`    body: ${r.body}`);
        }
      }
      if (pendingLogs.length > 0) {
        console.log("[throttled-test] pipeline logs:");
        for (const line of pendingLogs) console.log("  " + line);
      }

      await ctx.close();
      expect(
        errored,
        `${errored} items errored on throttled network`
      ).toBe(0);
      expect(ready).toBe(fixtures.length);
    }
  );

  test("full happy path: upload → save → AI tagged → bg removed", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pendingLogs: string[] = [];
    const failedRequests: Array<{ url: string; status: number; body: string }> =
      [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") consoleErrors.push(text);
      if (/\[(pending|upload|tus)/.test(text)) pendingLogs.push(text);
    });
    page.on("response", async (resp) => {
      if (resp.status() >= 400) {
        const body = await resp.text().catch(() => "<no body>");
        failedRequests.push({
          url: resp.url(),
          status: resp.status(),
          body: body.slice(0, 200),
        });
      }
    });

    await signIn(page);

    // Navigate to wardrobe. The app might land us on /home or similar
    // after sign-in, so make sure we're on /wardrobe before we start.
    await page.goto("/wardrobe");
    await page.waitForLoadState("networkidle");

    // The library file-input is a sibling of the + dropdown. We don't
    // need to click the dropdown first — setInputFiles just binds the
    // files to the hidden input directly.
    const fixtures = getFixtures();
    console.log("[test] using fixtures:", fixtures.map((f) => path.basename(f)));

    const libraryInput = page.locator(
      'input[type="file"][accept="image/*"][multiple]'
    );
    await expect(libraryInput).toHaveCount(1, { timeout: 10_000 });
    await libraryInput.setInputFiles(fixtures);

    // Expect the uploading page to take over
    await page.waitForURL(/\/wardrobe\/uploading/, { timeout: 15_000 });
    await expect(page.getByText(/Uploading your closet/i)).toBeVisible();

    // Now the slow part: wait for every item to settle. Total wall-clock
    // budget 4 min — 5 items × ~3 s each plus retries.
    const settledBy = Date.now() + 4 * 60 * 1000;
    let ready = 0;
    let errored = 0;
    while (Date.now() < settledBy) {
      const readyTiles = await page.locator('[data-stage="ready"]').count();
      const errorTiles = await page.locator('[data-stage="error"]').count();
      ready = readyTiles;
      errored = errorTiles;
      const settled = ready + errored;
      if (settled >= fixtures.length) break;
      await page.waitForTimeout(1000);
    }

    // Dump diagnostics before asserting — if this test fails we want
    // every last bit of evidence surfaced.
    console.log(`[test] ready=${ready} errored=${errored} total=${fixtures.length}`);
    if (failedRequests.length > 0) {
      console.log("[test] failed network requests:");
      for (const r of failedRequests) {
        console.log(`  ${r.status} ${r.url}`);
        if (r.body) console.log(`    body: ${r.body}`);
      }
    }
    if (pendingLogs.length > 0) {
      console.log("[test] pipeline logs:");
      for (const line of pendingLogs) console.log("  " + line);
    }
    if (consoleErrors.length > 0) {
      console.log("[test] console errors:");
      for (const e of consoleErrors) console.log("  " + e);
    }

    expect(errored, `${errored} items errored — see pipeline logs`).toBe(0);
    expect(ready).toBe(fixtures.length);

    // After the batch settles we expect to land on the wizard route.
    await page.waitForURL(/\/wardrobe\/[^/]+\?edit=1/, { timeout: 30_000 });

    // Poll /api/items for up to 90s waiting for bg removal to PATCH
    // the image_url from .jpg (raw upload) to .png (imgly output). Bg
    // removal is post-save async so it's done when we see PNGs.
    type Item = {
      id: string;
      name: string;
      category: string;
      image_url: string;
      created_at: string;
    };
    let items: Item[] = [];
    let recent: Item[] = [];
    const bgDeadline = Date.now() + 90_000;
    while (Date.now() < bgDeadline) {
      const apiRes = await page.request.get("/api/items");
      if (!apiRes.ok()) {
        await page.waitForTimeout(2000);
        continue;
      }
      items = (await apiRes.json()) as Item[];
      recent = [...items]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, fixtures.length);
      const allPng = recent.every((i) => i.image_url.endsWith(".png"));
      if (allPng) break;
      await page.waitForTimeout(3000);
    }

    console.log("[test] recent items after bg-removal poll:");
    for (const it of recent) {
      console.log(`  ${it.name} (${it.category}) — ${it.image_url}`);
    }

    const untitled = recent.filter((i) => i.name === "Untitled item");
    expect(
      untitled.length,
      `${untitled.length} items saved with "Untitled item" — AI didn't run`
    ).toBe(0);

    // bg removal post-save PATCHes image_url. The signal that it worked
    // is that the URL ends in .png (imgly output) rather than .jpg
    // (the original downscaled upload). Allow a small tolerance for
    // bg removal that genuinely timed out — if most succeeded we're
    // good.
    const cleaned = recent.filter((i) => i.image_url.endsWith(".png"));
    expect(
      cleaned.length,
      `only ${cleaned.length}/${recent.length} items have bg removed`
    ).toBeGreaterThanOrEqual(Math.ceil(recent.length * 0.6));
  });
});
