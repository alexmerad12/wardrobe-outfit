import { test, expect, type APIResponse, type Page } from "@playwright/test";

// RULE-COMPLIANCE HARNESS (audit Phase 6).
//
// Unlike stress-suggest.spec.ts (a measurement harness that always
// passes), this spec HARD-FAILS when the suggest engine ships an
// outfit that violates a hard rule. It seeds a deterministic fixture
// wardrobe full of "trap" items (athletic sneakers for a work request,
// heels for a Comfort Day, an untagged canvas tote for dinner) and
// asserts the bans hold on whatever ships — including through the
// regenerate pass and the fallback ladder.
//
// Requirements:
//  - A DEDICATED test user (it wipes + reseeds the wardrobe!). The
//    email must contain "e2e" or "harness" as a tripwire against
//    pointing this at a real account.
//  - That email in the server's CAP_BYPASS_EMAILS so runs don't burn
//    the daily caps.
//  - Cost: ~6-10 Gemini calls per run (≈ $0.20-0.40).
//
// Run: npx playwright test rule-compliance.spec.ts
//      (append --config playwright.audit.config.ts when :3000 is busy)

const EMAIL = process.env.HARNESS_EMAIL || process.env.STRESS_TEST_EMAIL!;
const PASSWORD =
  process.env.HARNESS_PASSWORD || process.env.STRESS_TEST_PASSWORD!;

if (!EMAIL || !PASSWORD) {
  throw new Error(
    "HARNESS_EMAIL/HARNESS_PASSWORD (or STRESS_TEST_*) must be set in .env.local"
  );
}
if (!/e2e|harness/i.test(EMAIL)) {
  throw new Error(
    `Refusing to run: ${EMAIL} doesn't look like a dedicated harness account (must contain "e2e" or "harness") — this spec WIPES the wardrobe.`
  );
}

const IMG = "https://example.com/e2e-fixture.png";

type Fixture = Record<string, unknown> & { name: string; category: string };

// One combined wardrobe serves every scenario. Each item is either a
// legitimate ingredient or a deliberate trap (noted inline).
const FIXTURES: Fixture[] = [
  { name: "White tee", category: "top", subcategory: "t-shirt", fit: "regular", warmth_rating: 1.5, material: ["cotton"], formality: "casual", colors: [{ hex: "#ffffff", name: "white", percentage: 100 }] },
  { name: "Grey tee", category: "top", subcategory: "t-shirt", fit: "regular", warmth_rating: 1.5, material: ["cotton"], formality: "casual", colors: [{ hex: "#9ca3af", name: "grey", percentage: 100 }] },
  { name: "Silk blouse", category: "top", subcategory: "blouse", fit: "regular", warmth_rating: 2, material: ["silk"], formality: "smart-casual", colors: [{ hex: "#f5f0e8", name: "cream", percentage: 100 }] },
  // TRAP: tank at work without a blazer is banned (no blazer seeded).
  { name: "Athletic tank", category: "top", subcategory: "tank-top", fit: "slim", warmth_rating: 1, material: ["polyester"], formality: "very-casual", colors: [{ hex: "#111827", name: "black", percentage: 100 }] },
  // TRAP: hoodie banned at dressy occasions.
  { name: "Grey hoodie", category: "top", subcategory: "hoodie", fit: "loose", warmth_rating: 3, material: ["fleece"], formality: "very-casual", colors: [{ hex: "#6b7280", name: "grey", percentage: 100 }] },
  // TRAP: untagged jeans banned at work (Track A).
  { name: "Blue jeans", category: "bottom", subcategory: "jeans", bottom_fit: "straight", waist_closure: "button-zip", warmth_rating: 2, material: ["denim"], formality: "casual", colors: [{ hex: "#1e3a8a", name: "blue", percentage: 100 }] },
  { name: "Tailored trousers", category: "bottom", subcategory: "trousers", bottom_fit: "straight", waist_closure: "button-zip", waist_style: "fitted", fit: "slim", warmth_rating: 2, material: ["polyester"], formality: "business-casual", colors: [{ hex: "#111827", name: "black", percentage: 100 }] },
  // REGRESSION (beta bug): elastic wide-leg trousers are COMFORT wear —
  // the old blunt predicate hard-dropped them on Comfort Day.
  { name: "Elastic wide-leg trousers", category: "bottom", subcategory: "trousers", bottom_fit: "wide-leg", waist_closure: "elastic", waist_style: "elastic", fit: "loose", warmth_rating: 2, material: ["knit"], formality: "casual", colors: [{ hex: "#374151", name: "charcoal", percentage: 100 }] },
  // TRAP: athletic sneakers banned at work.
  { name: "Running sneakers", category: "shoes", subcategory: "sneakers", heel_type: "flat", warmth_rating: 2, material: ["nylon"], formality: "very-casual", colors: [{ hex: "#ffffff", name: "white", percentage: 100 }] },
  // TRAP: mid-heels banned on Comfort Day (and casual occasions).
  { name: "Black pumps", category: "shoes", subcategory: "heels", heel_type: "mid-heel", toe_shape: "pointed", warmth_rating: 2, material: ["leather"], formality: "formal", colors: [{ hex: "#111827", name: "black", percentage: 100 }] },
  { name: "Ballet flats", category: "shoes", subcategory: "ballet-flats", heel_type: "flat", toe_shape: "round", warmth_rating: 1.5, material: ["leather"], formality: "smart-casual", colors: [{ hex: "#7c2d12", name: "brown", percentage: 100 }] },
  // TRAP: open-toe sandals banned at work (both tracks since B1).
  { name: "Strappy sandals", category: "shoes", subcategory: "sandals", toe_shape: "open-toe", heel_type: "flat", warmth_rating: 1, material: ["leather"], formality: "casual", colors: [{ hex: "#a16207", name: "tan", percentage: 100 }] },
  // Belt-friendly dress: a-line + free waist → R18a hard-requires a belt.
  { name: "Navy a-line dress", category: "dress", dress_silhouette: "a-line", fit: "regular", warmth_rating: 2, material: ["cotton"], formality: "smart-casual", colors: [{ hex: "#1e3a8a", name: "navy", percentage: 100 }] },
  { name: "Gold-buckle belt", category: "accessory", subcategory: "belt", metal_finish: "gold", warmth_rating: 1, material: ["leather"], formality: "casual", colors: [{ hex: "#7c2d12", name: "brown", percentage: 100 }] },
  { name: "Silk scarf", category: "accessory", subcategory: "scarf", scarf_function: "decorative", warmth_rating: 1, material: ["silk"], formality: "smart-casual", colors: [{ hex: "#b91c1c", name: "red", percentage: 100 }] },
  // TRAP: canvas tote banned at formal/date/party when a formal bag exists.
  { name: "Canvas tote", category: "bag", subcategory: "tote", bag_size: "tote", material: ["canvas"], warmth_rating: 1, formality: "very-casual", colors: [{ hex: "#d6d3d1", name: "beige", percentage: 100 }] },
  { name: "Leather handbag", category: "bag", subcategory: "handbag", bag_size: "medium", bag_metal_finish: "gold", material: ["leather"], warmth_rating: 1, formality: "smart-casual", colors: [{ hex: "#111827", name: "black", percentage: 100 }] },
];

type SuggestedItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  heel_type: string | null;
  toe_shape: string | null;
  waist_closure: string | null;
  waist_style: string | null;
  fit: string | null;
  dress_silhouette: string | null;
  occasions: string[] | null;
};
type SuggestResponse = {
  suggestions: { items: SuggestedItem[]; relaxed?: boolean; name: string }[];
  wardrobe_gap: string | null;
  ai_error?: boolean;
  _debug_rules?: {
    ship_path: string;
    relaxed: boolean | null;
    drops: string[];
    anchor_requested: boolean;
    anchor_shipped: boolean | null;
  };
};

// Structural invariant every shipped outfit must satisfy, no matter
// which ladder rung produced it (the audit's "raw garbage" safety net
// is gone — this asserts it stays gone).
function expectCompleteBase(items: SuggestedItem[], label: string) {
  const has = (c: string) => items.some((i) => i.category === c);
  const overalls = items.some(
    (i) => i.category === "one-piece" && i.subcategory === "overalls"
  );
  const baseOK =
    has("dress") ||
    (has("one-piece") && (!overalls || has("top"))) ||
    (has("top") && has("bottom"));
  expect(baseOK, `${label}: incomplete base — got [${items.map((i) => i.name).join(", ")}]`).toBe(true);
}

async function suggest(
  page: Page,
  body: Record<string, unknown>
): Promise<{ res: APIResponse; data: SuggestResponse }> {
  const res = await page.request.post("/api/suggest?debug=rules", {
    data: { locale: "en", styleWishes: [], ...body },
    timeout: 120_000,
  });
  expect(res.ok(), `suggest HTTP ${res.status()}`).toBe(true);
  const data = (await res.json()) as SuggestResponse;
  // Debug telemetry must be present — proves the bypass user is wired
  // and gives every later assertion its ship-path context.
  expect(data._debug_rules, "debug=rules missing — is the harness email in CAP_BYPASS_EMAILS?").toBeTruthy();
  return { res, data };
}

test.describe.configure({ mode: "serial" });

let seededIds: string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage();
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, { timeout: 30_000 });

  // Deterministic prefs: Track A, English, no saved location (in local
  // dev there are no IP-geo headers either, so weather gates skip and
  // the run doesn't depend on the day's forecast).
  const prefs = await page.request.put("/api/preferences", {
    data: {
      language: "en",
      gender: "woman",
      temperature_sensitivity: "normal",
      location: null,
      use_device_location: false,
    },
  });
  expect(prefs.ok()).toBe(true);

  // Wipe + reseed the fixture wardrobe.
  const existing = await page.request.get("/api/items");
  expect(existing.ok()).toBe(true);
  const items = (await existing.json()) as { id: string }[];
  expect(items.length, "tripwire: refusing to wipe a wardrobe this large").toBeLessThan(60);
  for (const it of items) {
    await page.request.delete(`/api/items/${it.id}`);
  }

  seededIds = [];
  for (const f of FIXTURES) {
    const res = await page.request.post("/api/items", {
      data: { image_url: IMG, seasons: [], occasions: [], pattern: "solid", is_favorite: false, is_stored: false, ...f },
    });
    expect(res.status(), `seed failed for ${f.name}`).toBe(201);
    const saved = (await res.json()) as { id: string };
    seededIds.push(saved.id);
  }
  await page.close();
});

test.afterAll(async ({ browser }) => {
  if (seededIds.length === 0) return;
  const page = await browser.newPage();
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, { timeout: 30_000 });
  for (const id of seededIds) {
    await page.request.delete(`/api/items/${id}`);
  }
  await page.close();
});

async function signedInPage(browser: import("@playwright/test").Browser) {
  const page = await browser.newPage();
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, { timeout: 30_000 });
  return page;
}

test("work: athletic sneakers / untagged jeans / open-toe / blazerless tank never ship", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await signedInPage(browser);
  const { data } = await suggest(page, { mood: "confident", occasion: "work" });

  if (data.suggestions.length === 0) {
    // Honest empty is an acceptable outcome — silent rule-breaking isn't.
    expect(data.ai_error || data.wardrobe_gap, "empty response must carry ai_error or a wardrobe_gap").toBeTruthy();
  }
  for (const outfit of data.suggestions) {
    expectCompleteBase(outfit.items, "work");
    const names = outfit.items.map((i) => i.name).join(", ");
    expect(outfit.items.some((i) => i.subcategory === "sneakers"), `sneakers at work: [${names}]`).toBe(false);
    expect(outfit.items.some((i) => i.subcategory === "jeans"), `jeans at work: [${names}]`).toBe(false);
    expect(
      outfit.items.some((i) => i.category === "shoes" && (i.toe_shape === "open-toe" || i.toe_shape === "peep-toe" || i.subcategory === "sandals")),
      `open-toe at work: [${names}]`
    ).toBe(false);
    const hasTank = outfit.items.some((i) => i.subcategory === "tank-top");
    const hasBlazer = outfit.items.some((i) => i.subcategory === "blazer");
    expect(hasTank && !hasBlazer, `blazerless tank at work: [${names}]`).toBe(false);
  }
  await page.close();
});

test("comfort day: no heels, no tailoring — but elastic wide-legs are welcome", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await signedInPage(browser);
  const { data } = await suggest(page, { mood: "period", occasion: "casual" });

  // The beta bug: the blunt predicate called elastic wide-leg trousers
  // "tailored" and the request ended honest-empty. The narrowed
  // predicate must never drop them for that reason again.
  const comfortDropOnElastic = (data._debug_rules?.drops ?? []).some((d) =>
    d.includes("comfort-day mood + tailored piece") && d.includes("Elastic wide-leg")
  );
  expect(comfortDropOnElastic, "elastic wide-legs were dropped as 'tailored' — predicate regressed").toBe(false);

  for (const outfit of data.suggestions) {
    expectCompleteBase(outfit.items, "comfort-day");
    const names = outfit.items.map((i) => i.name).join(", ");
    expect(
      outfit.items.some((i) => i.category === "shoes" && (i.heel_type === "high-heel" || i.heel_type === "mid-heel")),
      `heels on Comfort Day: [${names}]`
    ).toBe(false);
    expect(
      outfit.items.some((i) => i.subcategory === "blazer" || i.dress_silhouette === "sheath"),
      `tailoring on Comfort Day: [${names}]`
    ).toBe(false);
  }
  await page.close();
});

test("anchor: a pinned item is always in the shipped outfit", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await signedInPage(browser);
  const itemsRes = await page.request.get("/api/items");
  const items = (await itemsRes.json()) as { id: string; name: string }[];
  const anchor = items.find((i) => i.name === "Navy a-line dress");
  expect(anchor, "fixture dress missing").toBeTruthy();

  const { data } = await suggest(page, {
    mood: "confident",
    occasion: "dinner-out",
    anchorItemId: anchor!.id,
  });

  expect(data._debug_rules?.anchor_requested).toBe(true);
  expect(data.suggestions.length, "anchored request returned nothing").toBeGreaterThan(0);
  for (const outfit of data.suggestions) {
    expectCompleteBase(outfit.items, "anchor");
    expect(
      outfit.items.some((i) => i.id === anchor!.id),
      `anchor missing from [${outfit.items.map((i) => i.name).join(", ")}]`
    ).toBe(true);
  }
  expect(data._debug_rules?.anchor_shipped).toBe(true);
  await page.close();
});

test("belt completer: a belt-friendly dress ships belted (or explicitly relaxed)", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await signedInPage(browser);
  const itemsRes = await page.request.get("/api/items");
  const items = (await itemsRes.json()) as { id: string; name: string }[];
  const anchor = items.find((i) => i.name === "Navy a-line dress");

  const { data } = await suggest(page, {
    mood: "confident",
    occasion: "date",
    anchorItemId: anchor!.id,
  });

  for (const outfit of data.suggestions) {
    const hasDress = outfit.items.some((i) => i.dress_silhouette === "a-line");
    if (!hasDress) continue;
    const hasBelt = outfit.items.some((i) => i.subcategory === "belt");
    // R18a is HARD for a-line dresses; the only legitimate beltless
    // ship is a degraded path, which must be flagged.
    expect(
      hasBelt || outfit.relaxed === true,
      `belt-friendly dress shipped beltless and unflagged: [${outfit.items.map((i) => i.name).join(", ")}]`
    ).toBe(true);
  }
  await page.close();
});
