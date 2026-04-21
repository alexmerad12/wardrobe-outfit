import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const TEST_EMAIL = "test@gmail.com";
const TEST_PASSWORD = "Test123456";

// Pick the first 5 .jpg fixtures in alphabetical order.
function getFixtures(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .sort()
    .slice(0, 5)
    .map((f) => path.join(FIXTURES_DIR, f));
}

// Pick the 5 LARGEST fixtures — worst case for upload + bg removal.
// Simulates someone picking photos straight off their phone camera
// roll without any compression.
function getLargeFixtures(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .map((f) => ({
      file: f,
      size: fs.statSync(path.join(FIXTURES_DIR, f)).size,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((x) => path.join(FIXTURES_DIR, x.file));
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

// Deletes every item in the signed-in user's wardrobe. Tests share one
// real account, so without this the N-th test in a run is rendering a
// wardrobe page stuffed with N×5 thumbnails from earlier tests — which
// starves the single-threaded dev server, slows /api/upload, and
// eventually stalls the batch processor. Call this right after signIn.
async function clearWardrobe(page: import("@playwright/test").Page) {
  const res = await page.request.get("/api/items");
  if (!res.ok()) return;
  const items = (await res.json()) as Array<{ id: string }>;
  await Promise.all(
    items.map((i) => page.request.delete(`/api/items/${i.id}`))
  );
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

      // No artificial drops — just real mobile-equivalent throttling,
      // since that's what the user's phone is actually experiencing.
      // If the pipeline passes this, mobile production should pass too.

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
      await clearWardrobe(page);
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
      let redirected = false;
      while (Date.now() < settledBy) {
        if (!/\/wardrobe\/uploading/.test(page.url())) {
          redirected = true;
          break;
        }
        ready = await page.locator('[data-stage="ready"]').count();
        errored = await page.locator('[data-stage="error"]').count();
        if (ready + errored >= fixtures.length) break;
        await page.waitForTimeout(1500);
      }

      console.log(
        `[throttled-test] ready=${ready} errored=${errored} redirected=${redirected} total=${fixtures.length}`
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
      expect(
        ready === fixtures.length || redirected,
        `neither ready-count (${ready}) nor auto-redirect (${redirected}) confirmed all items settled`
      ).toBeTruthy();
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
    await clearWardrobe(page);

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
    // budget 4 min. Two exit conditions: every tile settled OR the
    // page auto-redirected to the wizard (which only happens when all
    // items were ready — errored batches stay on the uploading page).
    // Fast batches race the poll and the tile count vanishes after
    // redirect, so we need both checks.
    const settledBy = Date.now() + 4 * 60 * 1000;
    let ready = 0;
    let errored = 0;
    let redirected = false;
    while (Date.now() < settledBy) {
      if (!/\/wardrobe\/uploading/.test(page.url())) {
        redirected = true;
        break;
      }
      const readyTiles = await page.locator('[data-stage="ready"]').count();
      const errorTiles = await page.locator('[data-stage="error"]').count();
      ready = readyTiles;
      errored = errorTiles;
      const settled = ready + errored;
      if (settled >= fixtures.length) break;
      await page.waitForTimeout(500);
    }

    // Dump diagnostics before asserting — if this test fails we want
    // every last bit of evidence surfaced.
    console.log(
      `[test] ready=${ready} errored=${errored} redirected=${redirected} total=${fixtures.length}`
    );
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
    expect(
      ready === fixtures.length || redirected,
      `neither ready-count (${ready}) nor auto-redirect (${redirected}) confirmed all items settled`
    ).toBeTruthy();

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
    // Bg removal is async after save. imgly's WASM model can be slow
    // on first load per tab/worker; 3 minutes is a generous ceiling.
    const bgDeadline = Date.now() + 3 * 60 * 1000;
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
      `only ${cleaned.length}/${recent.length} items have bg removed — 100% required`
    ).toBe(recent.length);
  });

  test("stress: 5 LARGEST fixtures (3-5MB each), mobile viewport", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2.625,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    });
    const page = await ctx.newPage();

    const bgLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/\[bg /.test(text)) bgLogs.push(text);
    });

    await signIn(page);
    await clearWardrobe(page);
    await page.goto("/wardrobe");
    await page.waitForLoadState("networkidle");

    const fixtures = getLargeFixtures();
    const totalBytes = fixtures.reduce(
      (a, f) => a + fs.statSync(f).size,
      0
    );
    console.log(
      `[stress] ${fixtures.length} large fixtures, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`
    );

    const libraryInput = page.locator(
      'input[type="file"][accept="image/*"][multiple]'
    );
    await libraryInput.setInputFiles(fixtures);

    await page.waitForURL(/\/wardrobe\/uploading/, { timeout: 15_000 });
    const tReady0 = Date.now();

    // Two exit conditions: (a) every tile on the uploading page has
    // settled, OR (b) the uploading page has auto-redirected to the
    // review wizard, which only happens when every item finished ready
    // (we'd still be on /wardrobe/uploading if any were errored). When
    // uploads are fast, the redirect races our poll and we miss the
    // "ready" tile count entirely — hence the second condition.
    const settledBy = Date.now() + 3 * 60 * 1000;
    let ready = 0;
    let errored = 0;
    let redirected = false;
    while (Date.now() < settledBy) {
      if (!/\/wardrobe\/uploading/.test(page.url())) {
        redirected = true;
        break;
      }
      ready = await page.locator('[data-stage="ready"]').count();
      errored = await page.locator('[data-stage="error"]').count();
      if (ready + errored >= fixtures.length) break;
      await page.waitForTimeout(500);
    }
    const readyElapsed = Math.round((Date.now() - tReady0) / 1000);
    console.log(
      `[stress] ready=${ready} errored=${errored} redirected=${redirected} in ${readyElapsed}s`
    );

    // Cross-check via the API in case we only observed the redirect:
    // that confirms 5 new items actually got saved to the DB.
    const apiRes = await page.request.get("/api/items");
    const apiItems = apiRes.ok()
      ? ((await apiRes.json()) as Array<{ id: string; created_at: string }>)
      : [];
    console.log(`[stress] /api/items returned ${apiItems.length} items`);

    await ctx.close();
    expect(errored, `${errored} items errored with large files`).toBe(0);
    // Pass if tiles counted to 5 OR auto-redirect happened (which only
    // fires on all-ready). Belt-and-suspenders.
    expect(
      ready === fixtures.length || redirected,
      `neither ready-count (${ready}) nor auto-redirect (${redirected}) confirmed all items settled`
    ).toBeTruthy();
    expect(
      apiItems.length,
      `expected >= ${fixtures.length} items in DB, got ${apiItems.length}`
    ).toBeGreaterThanOrEqual(fixtures.length);
    console.log(`[stress] bg-removal logs: ${bgLogs.length} lines`);
    for (const line of bgLogs.slice(0, 20)) console.log("  " + line);
  });

  // Reproduces the exact mode the user reports: first batch works,
  // second batch in the same session has 1-3 items fail with "Upload:
  // Failed to fetch". The only way to catch regressions in the
  // upload-session path (CORS preflight cache, signed URL token
  // reuse, Supabase SDK state) is to actually do two batches in one
  // authenticated session and assert both succeed.
  test("TWO consecutive batches, same session — batch 2 must not regress", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2.625,
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    });
    const page = await ctx.newPage();

    const errorLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error" || /failed|Upload:|Sign /.test(text)) {
        errorLogs.push(`[${msg.type()}] ${text}`);
      }
    });

    await signIn(page);
    await clearWardrobe(page);

    // Split 10 fixtures into two batches of 5 — no overlap, simulating
    // two separate photo-picker sessions.
    const all = fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.toLowerCase().endsWith(".jpg"))
      .sort()
      .map((f) => path.join(FIXTURES_DIR, f));
    const batch1 = all.slice(0, 5);
    const batch2 = all.slice(5, 10);
    expect(batch2.length).toBe(5);

    async function runBatch(fixtures: string[], label: string) {
      await page.goto("/wardrobe");
      await page.waitForLoadState("networkidle");
      const input = page.locator(
        'input[type="file"][accept="image/*"][multiple]'
      );
      await input.setInputFiles(fixtures);
      await page.waitForURL(/\/wardrobe\/uploading/, { timeout: 15_000 });

      const settleBy = Date.now() + 3 * 60 * 1000;
      let ready = 0;
      let errored = 0;
      let redirected = false;
      while (Date.now() < settleBy) {
        if (!/\/wardrobe\/uploading/.test(page.url())) {
          redirected = true;
          break;
        }
        ready = await page.locator('[data-stage="ready"]').count();
        errored = await page.locator('[data-stage="error"]').count();
        if (ready + errored >= fixtures.length) break;
        await page.waitForTimeout(500);
      }
      console.log(
        `[${label}] ready=${ready} errored=${errored} redirected=${redirected}`
      );

      // Capture what actually errored so the test failure has signal.
      if (errored > 0) {
        const errorItems = await page
          .locator('[data-stage="error"]')
          .evaluateAll((els) => els.map((e) => e.getAttribute("data-item-id")));
        console.log(`[${label}] errored item ids:`, errorItems);
        console.log(`[${label}] recent console:`);
        for (const line of errorLogs.slice(-20)) console.log("  " + line);
      }

      expect(errored, `${label}: ${errored} items errored`).toBe(0);
      expect(
        ready === fixtures.length || redirected,
        `${label}: neither tile count nor redirect confirmed success`
      ).toBeTruthy();
    }

    await runBatch(batch1, "batch1");

    // User flow: after batch 1 finishes, the wizard opens. Exiting
    // the wizard (via the X) drops us back on /wardrobe — same place
    // from which they'd start batch 2 in real usage. Skipping the
    // wizard entirely and just navigating to /wardrobe isn't a fair
    // reproduction because it leaves the pending context in a
    // different state.
    if (/\/wardrobe\/[^/]+\?edit=1/.test(page.url())) {
      // Land on wardrobe to let any "ready" items auto-dismiss or
      // get cleared by the pending-uploads cleanup.
      await page.goto("/wardrobe");
      await page.waitForLoadState("networkidle");
    }

    await runBatch(batch2, "batch2");

    await ctx.close();
  });
});
