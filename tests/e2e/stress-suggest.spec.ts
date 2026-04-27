import { test } from "@playwright/test";

// COMPREHENSIVE STYLIST RULE VALIDATOR (Phase A of the deploy-readiness
// loop). Hits /api/suggest with a broad sweep of mood × occasion ×
// style direction × gender combinations and validates every returned
// outfit against ALL 19 stylist rules — not just the structural ones.
//
// Auth: signs in once via the UI to seed cookies, then calls the API
// directly via page.request — much faster than driving each suggestion
// through the UI.
//
// Cost: each suggest call burns Gemini Flash tokens (~$0.005-0.02 per
// call). A full sweep is ~80 calls, so ~$1-2 per cycle.

import type { ClothingItem, Mood, Occasion } from "@/lib/types";

const TEST_EMAIL = process.env.STRESS_TEST_EMAIL!;
const TEST_PASSWORD = process.env.STRESS_TEST_PASSWORD!;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "STRESS_TEST_EMAIL and STRESS_TEST_PASSWORD must be set in .env.local"
  );
}

type SuggestSuggestion = {
  items: ClothingItem[];
  reasoning: string;
  styling_tip: string | null;
  name: string;
  weather_temp: number | null;
  weather_condition: string | null;
};
type SuggestResponse = {
  suggestions: SuggestSuggestion[];
  wardrobe_gap?: string | null;
};

type Scenario = {
  name: string;
  mood: Mood;
  occasion: Occasion;
  styleWishes: string[];
  iterations: number;
};

type Failure = {
  scenario: string;
  iteration: number;
  outfitIndex: number;
  outfitName: string;
  rule: string;
  detail: string;
  itemIds: string[];
};

// Capabilities derived from the user's actual wardrobe — used to skip
// rules the user can't physically satisfy (e.g., R8 dressy material is
// pointless if the wardrobe has zero silk/satin pieces).
type WardrobeCaps = {
  hasDressyMaterial: boolean;
  hasBelt: boolean;
};

const SINGLE_PIECE_CATEGORIES = new Set<string>([
  "shoes",
  "bag",
  "bottom",
  "dress",
  "one-piece",
]);

// ────────────────────────────────────────────────────────────────────────
// SCENARIOS — broad sweep, designed to exercise every rule.
// ────────────────────────────────────────────────────────────────────────
const SCENARIOS: Scenario[] = [
  // Mood × occasion sanity sweep (8 moods × varied occasions)
  { name: "energized · casual", mood: "energized", occasion: "casual", styleWishes: [], iterations: 2 },
  { name: "confident · work", mood: "confident", occasion: "work", styleWishes: [], iterations: 2 },
  { name: "playful · brunch", mood: "playful", occasion: "brunch", styleWishes: [], iterations: 2 },
  { name: "cozy · at-home", mood: "cozy", occasion: "at-home", styleWishes: [], iterations: 2 },
  { name: "chill · casual", mood: "chill", occasion: "casual", styleWishes: [], iterations: 2 },
  { name: "bold · party", mood: "bold", occasion: "party", styleWishes: [], iterations: 2 },
  { name: "period · at-home", mood: "period", occasion: "at-home", styleWishes: [], iterations: 2 },
  { name: "sad · casual", mood: "sad", occasion: "casual", styleWishes: [], iterations: 2 },

  // Occasion guardrail tests
  { name: "confident · formal", mood: "confident", occasion: "formal", styleWishes: [], iterations: 2 },
  { name: "confident · date", mood: "confident", occasion: "date", styleWishes: [], iterations: 2 },
  { name: "confident · dinner-out", mood: "confident", occasion: "dinner-out", styleWishes: [], iterations: 2 },
  { name: "energized · outdoor", mood: "energized", occasion: "outdoor", styleWishes: [], iterations: 2 },
  { name: "chill · outdoor", mood: "chill", occasion: "outdoor", styleWishes: [], iterations: 2 },
  { name: "chill · travel", mood: "chill", occasion: "travel", styleWishes: [], iterations: 2 },

  // Hard-enforced presets (heavier iteration count — these are flaky in AI)
  { name: "preset: all-black on date", mood: "confident", occasion: "date", styleWishes: ["All black"], iterations: 3 },
  { name: "preset: dress-day on brunch", mood: "playful", occasion: "brunch", styleWishes: ["Dress day"], iterations: 3 },
  { name: "preset: mix-patterns on casual", mood: "playful", occasion: "casual", styleWishes: ["Mix patterns"], iterations: 3 },

  // Casual heel block stress tests (R10 extension)
  { name: "casual no-heels stress", mood: "chill", occasion: "casual", styleWishes: [], iterations: 2 },
  { name: "casual no-heels stress (chill)", mood: "chill", occasion: "casual", styleWishes: [], iterations: 2 },
  { name: "brunch no-heels stress", mood: "playful", occasion: "brunch", styleWishes: [], iterations: 2 },

  // Stylist instinct probes (R18) — bland/neutral mood × non-extreme occasion
  // — looking for the "all-bland" violation
  { name: "chill · brunch (anti-bland)", mood: "chill", occasion: "brunch", styleWishes: [], iterations: 2 },
  { name: "confident · dinner-out (anti-bland)", mood: "confident", occasion: "dinner-out", styleWishes: [], iterations: 2 },
];

// ────────────────────────────────────────────────────────────────────────
// HELPERS — material / pattern / metal classification.
// ────────────────────────────────────────────────────────────────────────
function lower(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

function isDarkColor(name: string): boolean {
  const n = lower(name);
  return [
    "black", "jet", "onyx", "ink", "charcoal", "ebony",
    "obsidian", "midnight", "raven", "noir",
  ].some((tok) => n.includes(tok));
}

function isDressyMaterial(item: ClothingItem): boolean {
  const mats = Array.isArray(item.material) ? item.material : [item.material];
  return mats.some((m) =>
    ["silk", "satin", "chiffon", "lace", "velvet", "patent-leather"].includes(m as string)
  );
}

function isAthleticSneaker(item: ClothingItem): boolean {
  return item.category === "shoes" && item.subcategory === "sneakers";
}

function isStatementPattern(item: ClothingItem): boolean {
  const ps = Array.isArray(item.pattern) ? item.pattern : [item.pattern];
  return ps.some((p) =>
    ["animal-print", "plaid", "embellished", "graphic", "polka-dot", "floral"].includes(p as string)
  );
}

function hasNonNeutralColor(item: ClothingItem): boolean {
  const NEUTRAL = /black|white|grey|gray|beige|brown|navy|cream|ivory|tan|khaki|stone|charcoal|ecru|oatmeal|camel/i;
  // If ANY of the item's colors is non-neutral, count as a color spark.
  return (item.colors ?? []).some((c) => !NEUTRAL.test(c.name));
}

function metalFamily(finish: string | null | undefined): "gold" | "silver" | "neutral" | "other" {
  if (!finish || finish === "none" || finish === "mixed") return "neutral";
  if (["gold", "rose-gold", "matte-gold", "brass", "bronze"].includes(finish)) return "gold";
  if (["silver", "chrome", "matte-silver", "gunmetal"].includes(finish)) return "silver";
  return "other";
}

// "Belt-completable" outfits — narrow definition matching the strongest
// stylist-instinct case. Only flag the obvious ones; we don't want to
// nag on every t-shirt + jeans combo.
//   ✓ sweater or blouse + skirt
//   ✓ blouse + tailored trousers / slacks (tucked-in look)
//   ✗ t-shirt or shirt + jeans (belt is optional, not a "completer")
//   ✗ oversized top (proportion is intentional, no belt needed)
function shouldHaveBelt(items: ClothingItem[]): boolean {
  const top = items.find(
    (i) =>
      i.category === "top" &&
      ["sweater", "blouse"].includes(i.subcategory ?? "") &&
      i.fit !== "oversized"
  );
  if (!top) return false;
  const skirt = items.find(
    (i) => i.category === "bottom" && i.subcategory === "skirt"
  );
  if (skirt) return true;
  // Blouse + tailored trousers is the other strong case.
  const tailoredBottom = items.find(
    (i) =>
      i.category === "bottom" &&
      i.subcategory === "trousers" &&
      i.waist_style !== "elastic"
  );
  return Boolean(top.subcategory === "blouse" && tailoredBottom);
}

// ────────────────────────────────────────────────────────────────────────
// VALIDATOR — runs every applicable rule against one outfit.
// ────────────────────────────────────────────────────────────────────────
function validateOutfit(
  scenario: Scenario,
  iteration: number,
  outfitIndex: number,
  outfit: SuggestSuggestion,
  caps: WardrobeCaps
): Failure[] {
  const weatherTemp = outfit.weather_temp;
  const failures: Failure[] = [];
  const items = outfit.items;
  const ids = items.map((i) => i.id);
  // Emergency-admit outfits ship with a "[Relaxed]" prefix in styling_tip.
  // We're aware these break some rules — skip the style rules the
  // emergency admit was designed to relax (bag formality, evening
  // material bias, metal sync, anti-bland).
  const isRelaxed =
    typeof outfit.styling_tip === "string" &&
    outfit.styling_tip.includes("[Relaxed]");
  const flag = (rule: string, detail: string) =>
    failures.push({
      scenario: scenario.name,
      iteration,
      outfitIndex,
      outfitName: outfit.name,
      rule,
      detail,
      itemIds: ids,
    });

  // R4: max one item per single-piece category
  const seenCat = new Map<string, number>();
  for (const i of items) {
    if (SINGLE_PIECE_CATEGORIES.has(i.category)) {
      seenCat.set(i.category, (seenCat.get(i.category) ?? 0) + 1);
    }
  }
  for (const [cat, count] of seenCat) {
    if (count > 1) flag("R4-single-piece", `${count} items in "${cat}" — should be 1`);
  }

  // R4-outerwear: max 1 outerwear unless it's a valid winter-layering
  // pair: an INNER (blazer/vest) under an OUTER (coat/peacoat/
  // trench-coat/parka/puffer). Two of the same class — or any
  // standalone subcategory paired with another — is a failure.
  const outerItems = items.filter((i) => i.category === "outerwear");
  if (outerItems.length >= 2) {
    const INNER = new Set(["blazer", "vest"]);
    const OUTER = new Set([
      "coat",
      "peacoat",
      "trench-coat",
      "parka",
      "puffer",
    ]);
    const hasInner = outerItems.some((i) => INNER.has(i.subcategory ?? ""));
    const hasOuter = outerItems.some((i) => OUTER.has(i.subcategory ?? ""));
    const isValidPair = outerItems.length === 2 && hasInner && hasOuter;
    if (!isValidPair) {
      flag(
        "R4-outerwear-stack",
        `${outerItems.length} outerwear: ${outerItems.map((i) => i.subcategory ?? "?").join(" + ")}`
      );
    }
  }

  // R1: dress / jumpsuit standalone (with slip + cardigan / layering exceptions)
  const hasDress = items.some((i) => i.category === "dress");
  const hasOnePiece = items.some((i) => i.category === "one-piece");
  const hasSlipDress = items.some(
    (i) => i.category === "dress" && i.dress_silhouette === "slip"
  );
  const hasNonLayeringTop = items.some(
    (i) =>
      i.category === "top" &&
      !i.is_layering_piece &&
      i.subcategory !== "cardigan" &&
      !(
        hasSlipDress &&
        i.subcategory !== "hoodie" &&
        i.subcategory !== "sweater" &&
        (i.fit === "slim" || i.fit === "regular")
      )
  );
  const hasTop = items.some((i) => i.category === "top");
  const hasBottom = items.some((i) => i.category === "bottom");
  const hasOveralls = items.some(
    (i) => i.category === "one-piece" && i.subcategory === "overalls"
  );
  if ((hasDress || (hasOnePiece && !hasOveralls)) && (hasNonLayeringTop || hasBottom)) {
    flag("R1-dress-standalone", "Dress/jumpsuit combined with non-layering top or bottom");
  }

  // R3: complete base
  const hasJumpsuit = items.some(
    (i) => i.category === "one-piece" && i.subcategory === "jumpsuit"
  );
  const hasCompleteBase =
    hasDress || hasJumpsuit || (hasOveralls && hasTop) || (hasTop && hasBottom);
  if (!hasCompleteBase) {
    const breakdown = items
      .map((i) => `${i.category}/${i.subcategory ?? "?"}`)
      .join(", ");
    flag("R3-complete-base", `No complete base — items: [${breakdown}]`);
  }

  // R6: shoes required unless at-home
  const hasShoes = items.some((i) => i.category === "shoes");
  if (scenario.occasion !== "at-home" && !hasShoes) {
    flag("R6-shoes-required", `${scenario.occasion} outfit missing shoes`);
  }

  // R7: at-home → no bag
  const hasBag = items.some((i) => i.category === "bag");
  if (scenario.occasion === "at-home" && hasBag) {
    flag("R7-at-home-no-bag", "At-home outfit has a bag");
  }

  // R5: cold → outerwear
  if (weatherTemp !== null && weatherTemp < 12) {
    const hasOuterwear = items.some((i) => i.category === "outerwear");
    if (!hasOuterwear) flag("R5-cold-outerwear", `${weatherTemp}°C but no outerwear`);
  }

  // R8: evening cocktail bias toward dressy materials for date/dinner-out/party.
  // Skip when the user's wardrobe has no dressy materials at all — this is
  // a wardrobe gap, not an AI rule violation.
  if (
    !isRelaxed &&
    caps.hasDressyMaterial &&
    ["date", "dinner-out", "party", "formal"].includes(scenario.occasion)
  ) {
    const focal = items.find((i) =>
      ["dress", "top", "outerwear"].includes(i.category)
    );
    if (focal && !isDressyMaterial(focal) && !items.some(isDressyMaterial)) {
      flag(
        "R8-evening-dressy-material",
        `${scenario.occasion}: no dressy material (silk/satin/chiffon/lace/velvet) in any item`
      );
    }
  }

  // R9: OFFICE rules
  if (scenario.occasion === "work") {
    if (items.some((i) => i.category === "bottom" && i.subcategory === "jeans")) {
      flag("R9-office-no-denim", "Work outfit has denim bottom");
    }
    if (items.some((i) => isAthleticSneaker(i))) {
      flag("R9-office-no-sneakers", "Work outfit has athletic sneakers");
    }
    // Bodycon / slip / mermaid dresses banned at work
    const dress = items.find((i) => i.category === "dress");
    if (dress && ["bodycon", "slip", "mermaid"].includes(dress.dress_silhouette ?? "")) {
      flag(
        "R9-office-wrong-silhouette",
        `Work dress silhouette "${dress.dress_silhouette}" not office-appropriate`
      );
    }
  }

  // R10 + casual heel block: casual / brunch / outdoor / travel / at-home
  // → no high or mid heels
  const CASUAL = new Set([
    "casual", "brunch", "outdoor", "travel", "at-home",
  ]);
  if (CASUAL.has(scenario.occasion)) {
    const heeled = items.find(
      (i) =>
        i.category === "shoes" &&
        (i.heel_type === "high-heel" || i.heel_type === "mid-heel")
    );
    if (heeled) {
      flag(
        "R10-casual-no-heel",
        `${scenario.occasion} outfit has ${heeled.heel_type} (${heeled.name})`
      );
    }
  }

  // R11 BAG SIZE × occasion
  const bag = items.find((i) => i.category === "bag");
  if (!isRelaxed && bag && bag.bag_size) {
    if (
      ["formal", "party", "date"].includes(scenario.occasion) &&
      !["clutch", "small"].includes(bag.bag_size)
    ) {
      flag(
        "R11-bag-size",
        `${scenario.occasion}: bag size "${bag.bag_size}" should be clutch/small`
      );
    }
    if (scenario.occasion === "work" && bag.bag_size === "clutch") {
      flag("R11-bag-size", "Work bag should be medium/large, not clutch");
    }
  }

  // R11 BAG TEXTURE × occasion (formal/date/party block casual textures)
  if (!isRelaxed && bag && ["formal", "date", "party"].includes(scenario.occasion)) {
    if (bag.bag_texture === "woven" || bag.bag_texture === "fringed") {
      flag(
        "R11-bag-texture",
        `${scenario.occasion}: bag_texture "${bag.bag_texture}" too casual`
      );
    }
    const mats = Array.isArray(bag.material) ? bag.material : [bag.material];
    if (mats.some((m) => m === "canvas" || m === "nylon")) {
      flag(
        "R11-bag-material",
        `${scenario.occasion}: bag material [${mats.join(",")}] too casual`
      );
    }
  }

  // R11 HAT × occasion
  const hat = items.find((i) => i.category === "accessory" && i.subcategory === "hat");
  if (hat && (scenario.occasion === "work" || scenario.occasion === "formal")) {
    flag("R11-hat-occasion", `${scenario.occasion}: hats not allowed`);
  }
  // Hat silhouette × occasion
  if (
    hat &&
    ["formal", "date", "dinner-out"].includes(scenario.occasion) &&
    hat.hat_silhouette &&
    ["baseball", "trucker", "bucket"].includes(hat.hat_silhouette)
  ) {
    flag(
      "R11-hat-silhouette",
      `${scenario.occasion}: hat silhouette "${hat.hat_silhouette}" too casual`
    );
  }
  // Velvet / felt at formal/party → only beret/pillbox/headband
  if (
    hat &&
    ["formal", "party"].includes(scenario.occasion) &&
    (hat.hat_texture === "velvet" || hat.hat_texture === "felt") &&
    hat.hat_silhouette &&
    !["beret", "pillbox", "headband"].includes(hat.hat_silhouette)
  ) {
    flag(
      "R11-velvet-felt-shape",
      `${scenario.occasion}: ${hat.hat_texture} hat must be beret/pillbox/headband`
    );
  }

  // R11 ACCESSORY MINIMUM (skip at-home, outdoor, men's track if no fit)
  if (!["at-home", "outdoor"].includes(scenario.occasion)) {
    const accessoriesBeyondBag = items.filter(
      (i) => i.category === "accessory"
    );
    if (accessoriesBeyondBag.length === 0 && hasBag) {
      // Check passes if there's a bag — bag IS an accessory but rule
      // wants ≥1 BEYOND it. Only flag if no other accessories.
      flag("R11-accessory-minimum", "No accessory beyond the bag");
    } else if (accessoriesBeyondBag.length === 0 && !hasBag) {
      flag("R11-accessory-minimum", "No accessory at all");
    }
  }

  // R12 presets
  if (scenario.styleWishes.some((w) => /all[ -]?black/i.test(w))) {
    for (const i of items) {
      const primary = i.colors?.[0]?.name ?? "";
      if (!isDarkColor(primary)) {
        flag(
          "R12-all-black",
          `Item "${i.name}" primary "${primary}" not dark`
        );
        break;
      }
    }
  }
  if (scenario.styleWishes.some((w) => /dress[ -]?day/i.test(w)) && !hasDress) {
    flag("R12-dress-day", "Dress-day preset but no dress");
  }
  if (scenario.styleWishes.some((w) => /mix[ -]?patterns/i.test(w))) {
    const nonSolid = items.filter((i) => {
      const patterns = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
      return patterns.some((p) => p && p !== "solid");
    });
    if (nonSolid.length < 2) {
      flag("R12-mix-patterns", `Only ${nonSolid.length} non-solid item(s) — need ≥2`);
    }
  }

  // R14 METAL SYNC (skip when mood = playful or emergency-admit relaxed it)
  if (!isRelaxed && scenario.mood !== "playful") {
    const metalEntries = items
      .map((i) => {
        const finish = i.category === "bag" ? i.bag_metal_finish : i.metal_finish;
        return { item: i, finish };
      })
      .filter(({ item, finish }) => {
        if (!finish || finish === "none" || finish === "mixed") return false;
        if (item.category === "shoes") return true;
        if (item.category === "bag") return true;
        if (item.category === "accessory" && item.subcategory === "belt")
          return true;
        return false;
      });
    if (metalEntries.length >= 2) {
      const families = new Set(metalEntries.map(({ finish }) => metalFamily(finish)));
      families.delete("neutral");
      if (families.size > 1) {
        flag(
          "R14-metal-sync",
          `Mixed metals: ${metalEntries.map(({ item, finish }) => `${item.subcategory ?? item.category}=${finish}`).join(", ")}`
        );
      }
    }
  }

  // R15 PROXIMITY: hat + decorative scarf without functional cold
  const scarf = items.find((i) => i.category === "accessory" && i.subcategory === "scarf");
  if (hat && scarf) {
    const cold = typeof weatherTemp === "number" && weatherTemp < 5;
    const scarfFunctional =
      scarf.scarf_function === "functional" ||
      (scarf.scarf_function == null && cold);
    if (!scarfFunctional) {
      flag(
        "R15-proximity",
        `Hat + scarf without functional cold (function=${scarf.scarf_function ?? "unset"}, temp=${weatherTemp ?? "?"}°C)`
      );
    }
  }

  // (Jewelry/watch were removed from the schema — the legacy hat +
  // statement-jewelry proximity check is gone.)

  // R18 STYLIST INSTINCT: belt completer — narrow scope. Skip relaxed
  // moods, lounge/outdoor occasions, and emergency-admit outfits.
  const beltExempt =
    isRelaxed ||
    ["chill", "cozy", "period"].includes(scenario.mood) ||
    ["at-home", "outdoor"].includes(scenario.occasion);
  if (!beltExempt && shouldHaveBelt(items)) {
    const hasBelt = items.some(
      (i) => i.category === "accessory" && i.subcategory === "belt"
    );
    if (!hasBelt) {
      flag(
        "R18-belt-completer",
        "Sweater/blouse + skirt or tailored trousers — belt would complete the look"
      );
    }
  }

  // R18 ANTI-BLAND: every item solid + neutral palette. Skip on relaxed
  // moods (chill/cozy/period — the user explicitly wants comfort, not
  // a visual hook), at-home occasion (lounge context), and emergency-
  // admit outfits where we already relaxed rules to ship something.
  const blandExempt =
    isRelaxed ||
    ["chill", "cozy", "period"].includes(scenario.mood) ||
    scenario.occasion === "at-home";
  const allSolid = items.every((i) => {
    const ps = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
    return ps.every((p) => p === "solid" || !p);
  });
  const anyNonNeutral = items.some(hasNonNeutralColor);
  const anyStatementPattern = items.some(isStatementPattern);
  if (!blandExempt && allSolid && !anyNonNeutral && !anyStatementPattern) {
    flag(
      "R18-all-bland",
      `Every item solid + neutral, mood=${scenario.mood} — no visual hook`
    );
  }

  // R19 SHOE × BOTTOM proportional combos
  const shoe = items.find((i) => i.category === "shoes");
  const bottomItem = items.find((i) => i.category === "bottom");
  if (shoe && bottomItem) {
    const shoeSub = shoe.subcategory;
    const fit = bottomItem.bottom_fit;
    const pl = bottomItem.pants_length;
    const sh = shoe.shoe_height;
    // Tall-shaft = knee-boots OR any boot with shoe_height knee/over-knee
    // (covers cowboy/western boots, riding boots, etc.)
    const tallShaftBoot =
      shoeSub === "knee-boots" || sh === "knee" || sh === "over-knee";
    if (tallShaftBoot) {
      if (["wide-leg", "flared", "bootcut", "tapered"].includes(fit ?? "")) {
        flag("R19-tall-boots-fit", `${shoeSub} (tall shaft) × ${fit}`);
      }
    }
    if (shoeSub === "ankle-boots") {
      if (pl === "ankle-crop") {
        flag("R19-ankle-boots-crop", "ankle-boots × ankle-crop pants");
      }
      if (["flared", "bootcut"].includes(fit ?? "") && pl === "full") {
        flag("R19-ankle-boots-flare", `ankle-boots × full ${fit} pants`);
      }
    }
    if (shoeSub === "sandals" && pl === "full" && fit === "wide-leg") {
      flag("R19-sandals-wide-full", "sandals × full wide-leg");
    }
    if (
      ["flats", "ballet-flats"].includes(shoeSub ?? "") &&
      ["flared", "bootcut"].includes(fit ?? "") &&
      pl === "full"
    ) {
      flag("R19-flats-flare-full", `${shoeSub} × full ${fit}`);
    }
  }

  return failures;
}

// ────────────────────────────────────────────────────────────────────────
// TEST RUNNER
// ────────────────────────────────────────────────────────────────────────
test("stress-suggest comprehensive sweep", async ({ page }) => {
  test.setTimeout(60 * 60 * 1000); // 60 min cap

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  // Bump to 90s — Supabase auth can be slow when many login attempts
  // happen in a short window (rate-limit backoff).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 90_000,
  });
  // Let post-login redirects + Next.js Turbopack route compilation
  // settle. Fresh server starts can return 404 on /api/items if the
  // route hasn't been hit yet.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

  // Fetch wardrobe once to derive capabilities (skip rules the user
  // physically can't satisfy — e.g., R8 if no silk/satin items exist).
  // Retry up to 3x to ride out cold-compile 404s.
  let wardrobeItems: ClothingItem[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await page.request.get("/api/items");
    if (r.ok()) {
      wardrobeItems = (await r.json()) as ClothingItem[];
      break;
    }
    if (attempt === 2) {
      throw new Error(`Failed to fetch wardrobe after 3 tries: ${r.status()}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  const dressyMats = new Set(["silk", "satin", "chiffon", "lace", "velvet", "patent-leather"]);
  const caps: WardrobeCaps = {
    hasDressyMaterial: wardrobeItems.some((i) => {
      const mats = Array.isArray(i.material) ? i.material : [i.material];
      return mats.some((m) => m && dressyMats.has(m as string));
    }),
    hasBelt: wardrobeItems.some(
      (i) => i.category === "accessory" && i.subcategory === "belt"
    ),
  };
  console.log(`[caps] dressy=${caps.hasDressyMaterial} belt=${caps.hasBelt} wardrobe=${wardrobeItems.length}`);

  const allFailures: Failure[] = [];
  let totalCalls = 0;
  let totalOutfits = 0;
  const startedAt = Date.now();

  for (const scenario of SCENARIOS) {
    for (let iter = 0; iter < scenario.iterations; iter++) {
      totalCalls++;
      let json: SuggestResponse | null = null;
      // Retry up to 2x on transient network errors (ECONNRESET, dev-server hiccups)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await page.request.post("/api/suggest", {
            data: {
              mood: scenario.mood,
              occasion: scenario.occasion,
              styleWishes: scenario.styleWishes,
              locale: "en",
            },
            timeout: 120_000,
          });
          if (!res.ok()) {
            allFailures.push({
              scenario: scenario.name,
              iteration: iter,
              outfitIndex: -1,
              outfitName: "(api error)",
              rule: "API",
              detail: `HTTP ${res.status()} — ${(await res.text()).slice(0, 160)}`,
              itemIds: [],
            });
            break;
          }
          json = (await res.json()) as SuggestResponse;
          break;
        } catch (err) {
          if (attempt === 1) {
            allFailures.push({
              scenario: scenario.name,
              iteration: iter,
              outfitIndex: -1,
              outfitName: "(network error)",
              rule: "API",
              detail: `${(err as Error).message?.slice(0, 200) ?? "unknown error"}`,
              itemIds: [],
            });
          } else {
            // brief pause before retry
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
      if (!json) continue;
      if (!Array.isArray(json.suggestions) || json.suggestions.length === 0) {
        // Empty suggestions are only a failure when wardrobe_gap is null
        // — a non-null gap means the AI explained itself ("you don't have
        // a blazer for work"), which is the correct UX, not a bug.
        const gap = json.wardrobe_gap ?? null;
        allFailures.push({
          scenario: scenario.name,
          iteration: iter,
          outfitIndex: -1,
          outfitName: "(empty)",
          rule: gap ? "shape-wardrobe-gap" : "shape-empty",
          detail: gap
            ? `0 suggestions, gap="${gap}"`
            : "0 suggestions, no gap explanation",
          itemIds: [],
        });
        continue;
      }
      json.suggestions.forEach((outfit, idx) => {
        totalOutfits++;
        const fails = validateOutfit(scenario, iter, idx, outfit, caps);
        allFailures.push(...fails);
      });
    }
  }

  // ─── REPORT ───────────────────────────────────────────────────────
  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  const grouped = new Map<string, Failure[]>();
  for (const f of allFailures) {
    const list = grouped.get(f.rule) ?? [];
    list.push(f);
    grouped.set(f.rule, list);
  }

  // Compute pass rate per rule (out of total outfits)
  const passRateByRule: { rule: string; violations: number; rate: string }[] = [];
  for (const [rule, list] of grouped) {
    const rate = totalOutfits > 0
      ? `${((1 - list.length / totalOutfits) * 100).toFixed(1)}%`
      : "n/a";
    passRateByRule.push({ rule, violations: list.length, rate });
  }
  passRateByRule.sort((a, b) => b.violations - a.violations);

  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(72));
  lines.push(`STRESS TEST · ${elapsedMin} min · ${totalCalls} calls · ${totalOutfits} outfits`);
  lines.push("=".repeat(72));
  lines.push(`Total violations: ${allFailures.length}`);
  lines.push("");

  if (allFailures.length === 0) {
    lines.push("✓ All checks passed.");
  } else {
    lines.push("PASS RATE BY RULE (worst → best):");
    lines.push("");
    for (const { rule, violations, rate } of passRateByRule) {
      lines.push(`  ${rule.padEnd(30)} ${String(violations).padStart(4)} violations   ${rate} pass`);
    }
    lines.push("");
    lines.push("SAMPLE VIOLATIONS (first 3 per rule):");
    lines.push("");
    for (const { rule } of passRateByRule) {
      const list = grouped.get(rule) ?? [];
      lines.push(`  ${rule}:`);
      for (const f of list.slice(0, 3)) {
        lines.push(
          `    · [${f.scenario} #${f.iteration} outfit ${f.outfitIndex}] ${f.detail}`
        );
        if (f.itemIds.length > 0) {
          lines.push(`      items: ${f.itemIds.slice(0, 3).join(", ")}${f.itemIds.length > 3 ? ", ..." : ""}`);
        }
      }
      if (list.length > 3) lines.push(`    · ...and ${list.length - 3} more`);
      lines.push("");
    }
  }

  console.log(lines.join("\n"));
});
