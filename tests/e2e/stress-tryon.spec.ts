import { test, expect } from "@playwright/test";

// Stress-test the /api/try-on endpoint by fetching an item the user
// already owns, "trying it on" with its own photo, and asserting the
// duplicate detector finds it. Self-consistency check: if the system
// can't identify your own item as similar to itself, the matching
// logic is broken.

const TEST_EMAIL = process.env.STRESS_TEST_EMAIL!;
const TEST_PASSWORD = process.env.STRESS_TEST_PASSWORD!;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "STRESS_TEST_EMAIL and STRESS_TEST_PASSWORD must be set in .env.local"
  );
}

type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  image_url: string;
  is_stored: boolean;
};

type TryOnResponse = {
  item: {
    name: string;
    category: string;
    subcategory: string | null;
    colors: { hex: string; name: string }[];
  };
  similarItems: { id: string; name: string }[];
  outfits: { items: { id: string }[]; reason: string }[];
  phantomId: string;
  error?: string;
};

test("stress-tryon: self-similarity + outfit shape", async ({ page }) => {
  test.setTimeout(10 * 60 * 1000);

  // Sign in.
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, {
    timeout: 30_000,
  });

  // Pick a sample of items to test against. Bias toward categories
  // that have richer attributes (top, dress, bag) — those exercise
  // the most matcher branches.
  const itemsRes = await page.request.get("/api/items");
  expect(itemsRes.ok(), "GET /api/items failed").toBeTruthy();
  const allItems = (await itemsRes.json()) as WardrobeItem[];
  const active = allItems.filter((i) => !i.is_stored);

  // Pick 3 items: one top, one bottom, one bag (or whatever's available).
  // Skip categories likely to be ambiguous (accessory).
  const targetCategories = ["top", "bottom", "bag", "shoes", "dress"];
  const samples: WardrobeItem[] = [];
  for (const cat of targetCategories) {
    const candidate = active.find(
      (i) => i.category === cat && !samples.includes(i)
    );
    if (candidate) samples.push(candidate);
    if (samples.length >= 3) break;
  }

  if (samples.length === 0) {
    test.skip(true, "No active wardrobe items to test try-on with");
    return;
  }

  type Failure = { item: string; rule: string; detail: string };
  const failures: Failure[] = [];

  for (const target of samples) {
    // Download the item's own image.
    const imgRes = await page.request.get(target.image_url);
    if (!imgRes.ok()) {
      failures.push({
        item: target.name,
        rule: "fetch-image",
        detail: `Could not download image: HTTP ${imgRes.status()}`,
      });
      continue;
    }
    const buf = await imgRes.body();

    // POST it to /api/try-on as a multipart upload.
    const tryOnRes = await page.request.post("/api/try-on", {
      multipart: {
        image: {
          name: "tryon.jpg",
          mimeType: "image/jpeg",
          buffer: buf,
        },
      },
      timeout: 90_000,
    });

    if (!tryOnRes.ok()) {
      failures.push({
        item: target.name,
        rule: "API",
        detail: `HTTP ${tryOnRes.status()} — ${(await tryOnRes.text()).slice(0, 160)}`,
      });
      continue;
    }
    const json = (await tryOnRes.json()) as TryOnResponse;

    // 1. Identified item must have the same broad category as the source.
    if (json.item?.category !== target.category) {
      failures.push({
        item: target.name,
        rule: "identified-category",
        detail: `Expected category "${target.category}", got "${json.item?.category}"`,
      });
    }

    // 2. similarItems should include the original item (self-match).
    const foundSelf = (json.similarItems ?? []).some((s) => s.id === target.id);
    if (!foundSelf) {
      failures.push({
        item: target.name,
        rule: "duplicate-detection",
        detail: `Self-similarity miss — "${target.name}" not in similarItems (got ${
          (json.similarItems ?? []).map((s) => s.name).join(", ") || "none"
        })`,
      });
    }

    // 3. Outfit shape — every outfit MUST include the phantom item.
    if (Array.isArray(json.outfits) && json.outfits.length > 0) {
      json.outfits.forEach((o, idx) => {
        const ids = o.items?.map((i) => i.id) ?? [];
        if (!ids.includes(json.phantomId)) {
          failures.push({
            item: target.name,
            rule: "phantom-missing",
            detail: `Outfit ${idx} doesn't include phantom item ${json.phantomId}`,
          });
        }
        if (ids.length < 2) {
          failures.push({
            item: target.name,
            rule: "outfit-too-small",
            detail: `Outfit ${idx} has only ${ids.length} item(s)`,
          });
        }
      });
    }
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(70));
  lines.push("TRY-ON STRESS TEST");
  lines.push("=".repeat(70));
  lines.push(`Items tested: ${samples.length}`);
  lines.push(`Failures: ${failures.length}`);
  lines.push("");
  if (failures.length === 0) {
    lines.push("✓ All checks passed.");
  } else {
    const grouped = new Map<string, Failure[]>();
    for (const f of failures) {
      const list = grouped.get(f.rule) ?? [];
      list.push(f);
      grouped.set(f.rule, list);
    }
    for (const [rule, list] of [...grouped.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )) {
      lines.push(`  ${rule}: ${list.length}`);
      for (const f of list) {
        lines.push(`    · [${f.item}] ${f.detail}`);
      }
    }
  }
  console.log(lines.join("\n"));
});
