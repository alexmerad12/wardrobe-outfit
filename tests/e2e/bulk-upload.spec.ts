import { test, expect, type Browser, type ConsoleMessage, type Page, type Response } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { assertE2EAccount, signIn } from "./auth";

// BULK UPLOAD, end to end in a real browser, the way people add their
// closet: pick photos on /wardrobe/bulk (or the + button on /wardrobe) →
// each photo uploads to Supabase Storage, gets cut out on the server
// (/api/items/normalize), read by the AI (/api/items/analyze) and saved →
// the page forwards to the review wizard (/wardrobe/<id>?edit=1).
//
// Photos: copy 5-10 .jpg wardrobe photos into tests/fixtures/ (gitignored,
// never committed). Account: the dedicated test account (HARNESS_EMAIL,
// auth.ts). Every test wipes that wardrobe first.
//
// Cost per photo: one Gemini Flash-Lite call (analyze) and one cutout
// (~20 s; runs are serialized per server instance).

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

// Wipes the signed-in wardrobe (clearWardrobe): dedicated account only.
assertE2EAccount();

const PIXEL_7 = {
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2.625,
  userAgent:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

function allFixtures(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort()
    .map((f) => path.join(FIXTURES_DIR, f));
}

// The first 5 in alphabetical order.
function getFixtures(): string[] {
  return allFixtures().slice(0, 5);
}

// The 5 LARGEST: worst case for the upload step, like photos straight off
// a phone camera roll.
function getLargeFixtures(): string[] {
  return allFixtures()
    .map((file) => ({ file, size: fs.statSync(file).size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .map((x) => x.file);
}

test.beforeEach(() => {
  test.skip(allFixtures().length < 5, "copy at least 5 .jpg wardrobe photos into tests/fixtures/");
});

async function clearWardrobe(page: Page) {
  const res = await page.request.get("/api/items");
  if (!res.ok()) return;
  const items = (await res.json()) as Array<{ id: string }>;
  await Promise.all(items.map((i) => page.request.delete(`/api/items/${i.id}`)));
}

type Item = { id: string; name: string; category: string; image_url: string; created_at: string };

async function savedItems(page: Page): Promise<Item[]> {
  const res = await page.request.get("/api/items");
  expect(res.ok(), "/api/items should load").toBeTruthy();
  return (await res.json()) as Item[];
}

const REVIEW_WIZARD = /\/wardrobe\/[0-9a-f-]{36}\?edit=1/;

// Picks the files and waits until every photo settled. The page forwards
// to the review wizard once nothing is left in flight, even when some
// photos errored, so callers confirm success through the saved items.
async function uploadBatch(
  page: Page,
  files: string[],
  label: string,
  { fromWardrobeButton = false, budgetMs = 5 * 60_000 } = {}
): Promise<{ ready: number; errored: number; redirected: boolean }> {
  const logs: string[] = [];
  const failed: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === "error" || /\[(pending|upload|bg)/.test(text)) logs.push(`[${msg.type()}] ${text}`);
  };
  const onResponse = (resp: Response) => {
    if (resp.status() >= 400) failed.push(`${resp.status()} ${resp.url()}`);
  };
  page.on("console", onConsole);
  page.on("response", onResponse);
  try {
    if (!fromWardrobeButton) await page.goto("/wardrobe/bulk");
    const input = page.locator('input[type="file"][accept="image/*"][multiple]');
    await expect(input).toHaveCount(1, { timeout: 15_000 });
    await input.setInputFiles(files);
    // The + button hands the picked files to the bulk page.
    await page.waitForURL(/\/wardrobe\/bulk/, { timeout: 15_000 });

    const deadline = Date.now() + budgetMs;
    let ready = 0;
    let errored = 0;
    let redirected = false;
    while (Date.now() < deadline) {
      if (REVIEW_WIZARD.test(page.url())) {
        redirected = true;
        break;
      }
      ready = await page.locator('[data-stage="ready"]').count();
      errored = await page.locator('[data-stage="error"]').count();
      // All settled with no success at all: the page stays put.
      if (errored > 0 && ready + errored >= files.length) break;
      await page.waitForTimeout(1000);
    }
    console.log(`[${label}] ready=${ready} errored=${errored} redirected=${redirected} files=${files.length}`);
    if (!redirected || errored > 0) {
      for (const f of failed) console.log(`[${label}] failed request: ${f}`);
      for (const l of logs.slice(-30)) console.log(`[${label}] ${l}`);
    }
    return { ready, errored, redirected };
  } finally {
    page.off("console", onConsole);
    page.off("response", onResponse);
  }
}

async function mobilePage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext(PIXEL_7);
  return ctx.newPage();
}

test.describe.configure({ mode: "serial" });

test.describe("bulk upload + review flow", () => {
  test("signs in", async ({ page }) => {
    await signIn(page);
    await page.goto("/wardrobe");
    await expect(page).toHaveURL(/\/wardrobe/);
  });

  test("full happy path: upload → save → AI tagged → bg removed", async ({ page }) => {
    test.setTimeout(8 * 60_000);
    await signIn(page);
    await clearWardrobe(page);
    const fixtures = getFixtures();
    console.log("[happy] fixtures:", fixtures.map((f) => path.basename(f)));

    const run = await uploadBatch(page, fixtures, "happy");
    expect(run.redirected, "the review wizard never opened").toBe(true);

    const items = await savedItems(page);
    expect(items.length, `${fixtures.length - items.length} photos never got saved`).toBe(fixtures.length);
    const untitled = items.filter((i) => i.name === "Untitled item");
    expect(untitled.length, `${untitled.length} items saved as "Untitled item": AI didn't run`).toBe(0);

    // Background removal runs on the server BEFORE save, so saved items
    // point at the final photo: a cache-busted URL (?v=) to a 1280x1280
    // JPEG. The no-subject / failure fallback keeps the photo's own aspect
    // ratio, so "square" means the cutout ran.
    const jpegSize = (buf: Buffer): { w: number; h: number } | null => {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
      return null;
    };
    let cutouts = 0;
    for (const it of items) {
      const imgRes = await page.request.get(it.image_url);
      const size = imgRes.ok() ? jpegSize(Buffer.from(await imgRes.body())) : null;
      const ok = it.image_url.includes("?v=") && size?.w === 1280 && size?.h === 1280;
      if (ok) cutouts++;
      console.log(`[happy] ${it.name} (${it.category}): ${size ? `${size.w}x${size.h}` : "unreadable"} ${ok ? "cutout" : "NOT cut out"}`);
    }
    expect(cutouts, `only ${cutouts}/${items.length} items have their background removed`).toBe(items.length);
  });

  test("throttled mobile (Fast 3G): every photo still finishes", async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const page = await mobilePage(browser);
    // CDP throttling: 1.6 Mbit down, 750 kbit up, 150 ms RTT, the weak-
    // signal mobile network where uploads used to hang.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1600 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await signIn(page);
    await clearWardrobe(page);
    const fixtures = getFixtures();
    const run = await uploadBatch(page, fixtures, "throttled", { budgetMs: 8 * 60_000 });
    const items = await savedItems(page);
    await page.context().close();
    expect(run.redirected, "the review wizard never opened").toBe(true);
    expect(items.length, `${fixtures.length - items.length} photos never got saved on a slow network`).toBe(fixtures.length);
  });

  test("5 LARGEST photos, mobile viewport", async ({ browser }) => {
    test.setTimeout(8 * 60_000);
    const page = await mobilePage(browser);
    await signIn(page);
    await clearWardrobe(page);
    const fixtures = getLargeFixtures();
    const mb = fixtures.reduce((a, f) => a + fs.statSync(f).size, 0) / 1024 / 1024;
    console.log(`[large] ${fixtures.length} photos, ${mb.toFixed(1)} MB total`);
    const run = await uploadBatch(page, fixtures, "large");
    const items = await savedItems(page);
    await page.context().close();
    expect(run.redirected, "the review wizard never opened").toBe(true);
    expect(items.length, `${fixtures.length - items.length} large photos never got saved`).toBe(fixtures.length);
  });

  // The mode users reported: the first batch works, the second batch in the
  // same session loses photos. Same page session throughout: batch 1 from
  // the bulk page, exit the wizard with its X like a person would, batch 2
  // from the + button on /wardrobe.
  test("TWO consecutive batches, same session — batch 2 must not regress", async ({ browser }) => {
    test.setTimeout(12 * 60_000);
    const all = allFixtures();
    test.skip(all.length < 10, "needs 10 .jpg photos in tests/fixtures/ (two batches of 5)");
    const page = await mobilePage(browser);
    await signIn(page);
    await clearWardrobe(page);

    const run1 = await uploadBatch(page, all.slice(0, 5), "batch1");
    expect(run1.redirected, "batch 1: the review wizard never opened").toBe(true);
    await page.getByRole("button", { name: /^(Close|Fermer)$/ }).click();
    await page.waitForURL(/\/wardrobe$/, { timeout: 15_000 });

    const run2 = await uploadBatch(page, all.slice(5, 10), "batch2", { fromWardrobeButton: true });
    const items = await savedItems(page);
    await page.context().close();
    expect(run2.redirected, "batch 2: the review wizard never opened").toBe(true);
    expect(items.length, `${10 - items.length} of 10 photos missing after two batches`).toBe(10);
  });
});
