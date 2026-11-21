import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { E2E_EMAIL, assertE2EAccount, signIn } from "./auth";

// PHOTO FILES DON'T PILE UP (2026-11-21). Every photo picked in the app is
// uploaded to the clothing-images bucket at once and cut out in place, and a
// photo nobody kept used to stay there for good (817 such files, 644 MB, were
// found and deleted on 2026-11-19: known-root-causes.md). Each test picks
// synthetic photos whose names carry this run's tag and reads the bucket
// through the admin API:
//   - Add: a photo replaced by a second pick is removed, the saved one stays
//   - Add: leaving without saving removes the upload
//   - Edit: closing the editor drops the new photo; Change photo + Save
//     removes the old file
//   - Bulk: a photo whose save fails is removed
//   - DELETE /api/upload refuses other folders and files a piece still uses
// Every piece and file a test makes is removed at its end; the account's own
// wardrobe is never touched. No AI call (analyze is answered here), but the
// cutout runs for real: normalize writing over the upload is the race the
// cleanup has to wait out.

assertE2EAccount();

const BUCKET = "clothing-images";
const RUN = `cleanup${Date.now().toString(36)}`;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === E2E_EMAIL.toLowerCase());
  if (!user) throw new Error(`no account for ${E2E_EMAIL}`);
  userId = user.id;
});

// Whatever a failed test left behind: this run's files only.
test.afterAll(async () => {
  const leftovers = await runFiles();
  if (leftovers.length) await admin.storage.from(BUCKET).remove(leftovers.map((n) => `${userId}/${n}`));
});

// This run's files in the test account's folder.
async function runFiles(): Promise<string[]> {
  const { data, error } = await admin.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (error) throw error;
  return data.map((f) => f.name).filter((n) => n.includes(RUN));
}

const named = (files: string[], tag: string) => files.filter((n) => n.includes(`${RUN}-${tag}.`));

// The file name inside the account's folder that a photo URL points at.
const fileOf = (url: string) =>
  decodeURIComponent(url.split(`/object/public/${BUCKET}/`)[1]?.split("?")[0] ?? "").split("/")[1];

// A plain synthetic garment photo: a coloured block on a light wall.
async function photo(tag: string, color: string) {
  const block = await sharp({ create: { width: 300, height: 420, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
  const buffer = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#f2efe9" } })
    .composite([{ input: block, top: 190, left: 150 }])
    .jpeg({ quality: 85 })
    .toBuffer();
  return { name: `${RUN}-${tag}.jpg`, mimeType: "image/jpeg", buffer };
}

// The AI read, answered here: no Gemini call, and a name this run can find.
async function answerAnalyze(page: Page, name: string) {
  await page.route("**/api/items/analyze", (route) =>
    route.fulfill({
      json: {
        name,
        category: "top",
        colors: [{ hex: "#3355aa", name: "Blue" }],
        pattern: ["solid"],
        material: ["cotton"],
        formality: ["casual"],
        seasons: ["spring"],
        occasions: [],
        warmth_rating: 2,
      },
    })
  );
}

// The cutout's answer for the next photo picked.
const cutOut = (page: Page) =>
  page.waitForResponse(
    (r) => r.url().includes("/api/items/normalize") && r.request().method() === "POST",
    { timeout: 180_000 }
  );

function pieceBody(name: string, imageUrl: string) {
  return {
    image_url: imageUrl,
    thumbnail_url: null,
    name,
    category: "top",
    colors: [{ hex: "#555555", name: "Gray", percentage: 100 }],
    dominant_color_hsl: null,
    is_neutral: true,
    pattern: ["solid"],
    material: ["cotton"],
    formality: ["casual"],
    seasons: [],
    occasions: [],
    warmth_rating: 3,
    is_favorite: false,
  };
}

// A piece made straight through the API, with a photo uploaded by the admin client.
async function seedPiece(page: Page, name: string, tag: string, urlSuffix = "") {
  const seed = await photo(tag, "#555555");
  const path = `${userId}/${Date.now()}-${seed.name}`;
  const up = await admin.storage.from(BUCKET).upload(path, seed.buffer, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + urlSuffix;
  const res = await page.request.post("/api/items", { data: pieceBody(name, url) });
  expect(res.status(), await res.text()).toBe(201);
  return { item: (await res.json()) as Item, path };
}

type Item = { id: string; name: string; image_url: string };

async function itemsNamed(page: Page, name: string): Promise<Item[]> {
  const res = await page.request.get("/api/items");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as Item[]).filter((i) => i.name === name);
}

test("Add: a photo replaced by a second pick is removed, the saved one stays", async ({ page }) => {
  test.setTimeout(6 * 60_000);
  await signIn(page);
  const name = `${RUN} add`;
  await answerAnalyze(page, name);
  await page.goto("/wardrobe/add");
  const input = page.locator('input[type="file"][capture]');

  let done = cutOut(page);
  await input.setInputFiles(await photo("a", "#3355aa"));
  await done;
  expect(named(await runFiles(), "a")).toHaveLength(1);

  done = cutOut(page);
  await input.setInputFiles(await photo("b", "#aa3355"));
  await done;
  // The first pick goes once its own upload and cutout have settled.
  await expect.poll(async () => named(await runFiles(), "a").length, { timeout: 30_000 }).toBe(0);

  await page.getByRole("button", { name: "Add to Wardrobe" }).click();
  await page.waitForURL(/\/wardrobe$/, { timeout: 60_000 });
  const [item] = await itemsNamed(page, name);
  expect(item, "the piece was saved").toBeTruthy();
  try {
    // Leaving the page after the save keeps the saved photo.
    await page.waitForTimeout(3_000);
    const files = await runFiles();
    expect(named(files, "a")).toEqual([]);
    expect(named(files, "b")).toHaveLength(1);
    expect(fileOf(item.image_url)).toBe(named(files, "b")[0]);
    expect((await page.request.get(item.image_url)).status()).toBe(200);
  } finally {
    await page.request.delete(`/api/items/${item.id}`);
  }
  expect(named(await runFiles(), "b"), "deleting the piece removes its photo").toEqual([]);
});

test("Add: leaving without saving removes the upload", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await signIn(page);
  const name = `${RUN} left`;
  await answerAnalyze(page, name);
  await page.goto("/wardrobe/add");

  const done = cutOut(page);
  await page.locator('input[type="file"][capture]').setInputFiles(await photo("c", "#33aa55"));
  await done;
  expect(named(await runFiles(), "c")).toHaveLength(1);

  await page.getByRole("button", { name: "Back" }).first().click();
  await page.waitForURL(/\/wardrobe$/);
  await expect.poll(async () => named(await runFiles(), "c").length, { timeout: 30_000 }).toBe(0);
  expect(await itemsNamed(page, name)).toEqual([]);
});

test("Edit: closing the editor drops the new photo; Change photo + Save removes the old file", async ({ page }) => {
  test.setTimeout(7 * 60_000);
  await signIn(page);
  const name = `${RUN} edit`;
  const { item } = await seedPiece(page, name, "d");
  try {
    await page.goto(`/wardrobe/${item.id}`);
    const input = page.locator('input[type="file"]');

    // The header's pencil and the text button below the photo both open it.
    const edit = page.getByRole("button", { name: "Edit details" }).first();

    // A new photo, then the editor closed without saving.
    await edit.click();
    let done = cutOut(page);
    await input.setInputFiles(await photo("e", "#aa8833"));
    await done;
    await page.getByRole("button", { name: "Close" }).first().click();
    // The page shows the piece's own photo again, not the dropped one (it
    // kept showing the dropped photo until 2026-11-21).
    const shown = page.locator(`img[alt="${name}"]`).first();
    await expect(shown).toHaveAttribute("src", new RegExp(`${RUN}-d\\.jpg`));
    await page.screenshot({ path: test.info().outputPath("editor-closed.png") });
    await expect.poll(async () => named(await runFiles(), "e").length, { timeout: 30_000 }).toBe(0);
    expect(named(await runFiles(), "d"), "the piece keeps its photo").toHaveLength(1);

    // A new photo, saved: the old file goes with the PATCH.
    await edit.click();
    done = cutOut(page);
    await input.setInputFiles(await photo("f", "#8833aa"));
    await done;
    const patched = page.waitForResponse(
      (r) => r.url().endsWith(`/api/items/${item.id}`) && r.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    expect((await patched).ok()).toBeTruthy();

    const files = await runFiles();
    expect(named(files, "d"), "the replaced photo is removed").toEqual([]);
    expect(named(files, "f")).toHaveLength(1);
    const [saved] = await itemsNamed(page, name);
    expect(fileOf(saved.image_url)).toBe(named(files, "f")[0]);
    expect((await page.request.get(saved.image_url)).status()).toBe(200);
  } finally {
    await page.request.delete(`/api/items/${item.id}`);
  }
  expect(named(await runFiles(), "f"), "deleting the piece removes its photo").toEqual([]);
});

test("Bulk: a photo whose save fails is removed", async ({ page }) => {
  test.setTimeout(5 * 60_000);
  await signIn(page);
  await answerAnalyze(page, `${RUN} bulk`);
  // The save is refused, like a bulk photo that ends in an error.
  await page.route("**/api/items", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 400, json: { error: "refused by the test" } })
      : route.continue()
  );
  await page.goto("/wardrobe/bulk");

  const done = cutOut(page);
  await page
    .locator('input[type="file"][accept="image/*"][multiple]')
    .setInputFiles([await photo("g", "#2299aa")]);
  await done;
  await expect(page.locator('[data-stage="error"]')).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(async () => named(await runFiles(), "g").length, { timeout: 30_000 }).toBe(0);
  await expect(page.locator('[data-stage="processing"], [data-stage="queued"]')).toHaveCount(0);
});

test("DELETE /api/upload refuses other folders and keeps files a piece still uses", async ({ page }) => {
  await signIn(page);
  const other = "00000000-0000-4000-8000-000000000000";
  const refuse = async (data: unknown) =>
    (await page.request.delete("/api/upload", { data, headers: { "Content-Type": "application/json" } })).status();
  expect(await refuse({ path: `${other}/1-${RUN}-x.jpg` })).toBe(400);
  expect(await refuse({ path: `${userId}/../${other}/1-x.jpg` })).toBe(400);
  expect(await refuse({ path: `${userId}/sub/1-x.jpg` })).toBe(400);
  expect(await refuse("not json")).toBe(400);

  // A file a piece points at stays, even when its URL carries the
  // cache-buster; an upload nothing points at goes.
  const { item, path: keptPath } = await seedPiece(page, `${RUN} kept`, "h", "?v=1");
  const loose = await photo("i", "#999999");
  const loosePath = `${userId}/${Date.now()}-${loose.name}`;
  const up = await admin.storage.from(BUCKET).upload(loosePath, loose.buffer, { contentType: "image/jpeg" });
  if (up.error) throw up.error;
  try {
    const keep = await page.request.delete("/api/upload", { data: { path: keptPath } });
    expect(await keep.json()).toEqual({ removed: 0 });
    const drop = await page.request.delete("/api/upload", { data: { path: loosePath } });
    expect(await drop.json()).toEqual({ removed: 1 });
    const files = await runFiles();
    expect(named(files, "h")).toHaveLength(1);
    expect(named(files, "i")).toEqual([]);
  } finally {
    await page.request.delete(`/api/items/${item.id}`);
  }
  expect(named(await runFiles(), "h"), "deleting the piece removes its photo").toEqual([]);
});
