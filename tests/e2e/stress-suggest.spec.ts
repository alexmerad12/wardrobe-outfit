import { test } from "@playwright/test";

// Stress-test the AI stylist by hitting /api/suggest with combinations
// of (mood × occasion × style direction) and validating each response
// against the HARD RULES from src/app/api/suggest/route.ts. Catches
// regressions like "two pairs of shoes", "all-black returned a denim",
// "bold mood produced a beige neutral outfit", etc.
//
// Auth: signs in once via the UI to seed cookies, then calls the API
// directly via page.request — much faster than driving each suggestion
// through the UI.
//
// Cost: each suggest call burns ~$0.03-0.10 in Anthropic tokens. Sweep
// size is sampled rather than full Cartesian — see SCENARIOS below.

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

type Failure = {
  scenario: string;
  iteration: number;
  outfitIndex: number;
  outfitName: string;
  rule: string;
  detail: string;
  itemIds: string[];
};

const SINGLE_PIECE_CATEGORIES = new Set<string>([
  "shoes",
  "bag",
  "bottom",
  "dress",
  "one-piece",
]);

// Scenarios designed to exercise the rules most likely to break.
// Iterations per scenario: temperature=1 means non-deterministic, so
// a single bad result isn't necessarily a real bug — we flag at >= 50%
// failure rate.
const SCENARIOS: Array<{
  name: string;
  mood: Mood;
  occasion: Occasion;
  styleWishes: string[];
  iterations: number;
}> = [
  // Mood × occasion sanity sweep
  { name: "energized · casual", mood: "energized", occasion: "casual", styleWishes: [], iterations: 2 },
  { name: "confident · work", mood: "confident", occasion: "work", styleWishes: [], iterations: 2 },
  { name: "playful · brunch", mood: "playful", occasion: "brunch", styleWishes: [], iterations: 2 },
  { name: "cozy · at-home", mood: "cozy", occasion: "at-home", styleWishes: [], iterations: 2 },
  { name: "chill · hangout", mood: "chill", occasion: "hangout", styleWishes: [], iterations: 2 },
  { name: "bold · party", mood: "bold", occasion: "party", styleWishes: [], iterations: 2 },
  { name: "period · at-home", mood: "period", occasion: "at-home", styleWishes: [], iterations: 2 },
  { name: "sad · casual", mood: "sad", occasion: "casual", styleWishes: [], iterations: 2 },

  // Hard-enforced presets
  { name: "preset: all-black on date", mood: "confident", occasion: "date", styleWishes: ["All black"], iterations: 3 },
  { name: "preset: dress-day on brunch", mood: "playful", occasion: "brunch", styleWishes: ["Dress day"], iterations: 3 },
  { name: "preset: mix-patterns on casual", mood: "playful", occasion: "casual", styleWishes: ["Mix patterns"], iterations: 3 },

  // Edge cases
  { name: "formal occasion", mood: "confident", occasion: "formal", styleWishes: [], iterations: 2 },
  { name: "sport occasion", mood: "energized", occasion: "sport", styleWishes: [], iterations: 2 },
  { name: "outdoor occasion", mood: "chill", occasion: "outdoor", styleWishes: [], iterations: 2 },
  { name: "travel occasion", mood: "chill", occasion: "travel", styleWishes: [], iterations: 2 },
  { name: "dinner-out", mood: "confident", occasion: "dinner-out", styleWishes: [], iterations: 2 },
];

function lower(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

function isDarkColor(name: string): boolean {
  // A loose proxy — names that read as black-or-near-black to a human.
  const n = lower(name);
  return [
    "black",
    "jet",
    "onyx",
    "ink",
    "charcoal",
    "ebony",
    "obsidian",
    "midnight",
    "raven",
    "noir",
  ].some((tok) => n.includes(tok));
}

function validateOutfit(
  scenario: (typeof SCENARIOS)[number],
  iteration: number,
  outfitIndex: number,
  outfit: SuggestSuggestion
): Failure[] {
  const weatherTemp = outfit.weather_temp;
  const failures: Failure[] = [];
  const items = outfit.items;
  const ids = items.map((i) => i.id);
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

  // RULE 4: max one item per single-piece category
  const seenCat = new Map<string, number>();
  for (const i of items) {
    if (SINGLE_PIECE_CATEGORIES.has(i.category)) {
      seenCat.set(i.category, (seenCat.get(i.category) ?? 0) + 1);
    }
  }
  for (const [cat, count] of seenCat) {
    if (count > 1) {
      flag("R4-single-piece", `${count} items in category "${cat}" — should be 1`);
    }
  }

  // RULE 1: dress/jumpsuit standalone — but cardigans / vests / blazers
  // / open-drape pieces are legitimate layering pieces over a dress.
  // Match the post-parse strip: only flag if there's a NON-layering,
  // NON-cardigan top combined with a dress. EXCEPTION: a slip-silhouette
  // dress can be paired with a slim/regular fitted top (lingerie-dressing).
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
    flag(
      "R1-dress-standalone",
      `Dress/jumpsuit combined with non-layering top or bottom`
    );
  }

  // RULE 3: complete base
  const hasJumpsuit = items.some(
    (i) => i.category === "one-piece" && i.subcategory === "jumpsuit"
  );
  const hasCompleteBase =
    hasDress ||
    hasJumpsuit ||
    (hasOveralls && hasTop) ||
    (hasTop && hasBottom);
  if (!hasCompleteBase) {
    flag("R3-complete-base", "No complete base (dress / jumpsuit / overalls+top / top+bottom)");
  }

  // RULE 6: shoes required unless at-home
  const hasShoes = items.some((i) => i.category === "shoes");
  if (scenario.occasion !== "at-home" && !hasShoes) {
    flag("R6-shoes-required", `${scenario.occasion} outfit missing shoes`);
  }

  // RULE 7: at-home → no bag
  const hasBag = items.some((i) => i.category === "bag");
  if (scenario.occasion === "at-home" && hasBag) {
    flag("R7-at-home-no-bag", "At-home outfit has a bag");
  }

  // RULE 5: cold → outerwear
  if (weatherTemp !== null && weatherTemp < 12) {
    const hasOuterwear = items.some((i) => i.category === "outerwear");
    if (!hasOuterwear) {
      flag("R5-cold-outerwear", `${weatherTemp}°C but no outerwear category item`);
    }
  }

  // RULE 12-b: all-black preset
  if (scenario.styleWishes.some((w) => /all[ -]?black/i.test(w))) {
    for (const i of items) {
      // Skip evaluating bags below if the rule is about visible color —
      // most bag colors still apply. Keep simple: every item's primary
      // color name should be dark.
      const primary = i.colors?.[0]?.name ?? "";
      if (!isDarkColor(primary)) {
        flag(
          "R12-all-black",
          `Item "${i.name}" has primary color "${primary}" — not black/near-black`
        );
        break; // one flag per outfit is enough
      }
    }
  }

  // RULE 12-b: dress-day preset
  if (scenario.styleWishes.some((w) => /dress[ -]?day/i.test(w))) {
    if (!hasDress) {
      flag("R12-dress-day", "Dress-day preset but outfit has no dress");
    }
  }

  // RULE 12-b: mix-patterns preset — at least 2 non-solid items
  if (scenario.styleWishes.some((w) => /mix[ -]?patterns/i.test(w))) {
    const nonSolid = items.filter((i) => {
      const patterns = Array.isArray(i.pattern) ? i.pattern : [i.pattern];
      return patterns.some((p) => p && p !== "solid");
    });
    if (nonSolid.length < 2) {
      flag(
        "R12-mix-patterns",
        `Only ${nonSolid.length} non-solid item(s) — preset wants ≥2`
      );
    }
  }

  // RULE 13 mood expression — DROPPED from automated checks.
  // Mood is subjective and the previous heuristic checks (bright color
  // for "bold" / "energized") were too narrow: an all-black sleek LBD
  // is a totally valid bold look but had no "statement color" by my
  // narrow definition. The mood prompt rule stays as soft guidance to
  // Claude; we don't gate the test suite on it.
  return failures;
}

test("stress-suggest sweep", async ({ page }) => {
  test.setTimeout(45 * 60 * 1000); // 45 min cap — most runs finish much sooner

  // Sign in once. Reuse cookies for all subsequent API calls.
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, {
    timeout: 30_000,
  });

  const allFailures: Failure[] = [];
  let totalCalls = 0;
  let totalOutfits = 0;
  const startedAt = Date.now();

  for (const scenario of SCENARIOS) {
    for (let iter = 0; iter < scenario.iterations; iter++) {
      totalCalls++;
      const res = await page.request.post("/api/suggest", {
        data: {
          mood: scenario.mood,
          occasion: scenario.occasion,
          styleWishes: scenario.styleWishes,
          locale: "en",
        },
        // Generous timeout — Sonnet calls run 5-10s, give headroom for
        // tail-latency outliers without flaking the suite.
        timeout: 120_000,
      });

      if (!res.ok()) {
        allFailures.push({
          scenario: scenario.name,
          iteration: iter,
          outfitIndex: -1,
          outfitName: "(api error)",
          rule: "API",
          detail: `HTTP ${res.status()} — ${await res.text()}`,
          itemIds: [],
        });
        continue;
      }

      const json = (await res.json()) as SuggestResponse;

      if (!Array.isArray(json.suggestions) || json.suggestions.length === 0) {
        allFailures.push({
          scenario: scenario.name,
          iteration: iter,
          outfitIndex: -1,
          outfitName: "(empty response)",
          rule: "shape",
          detail: `No suggestions returned (got ${JSON.stringify(json).slice(0, 120)})`,
          itemIds: [],
        });
        continue;
      }

      json.suggestions.forEach((outfit, idx) => {
        totalOutfits++;
        const fails = validateOutfit(scenario, iter, idx, outfit);
        allFailures.push(...fails);
      });
    }
  }

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  const grouped = new Map<string, Failure[]>();
  for (const f of allFailures) {
    const list = grouped.get(f.rule) ?? [];
    list.push(f);
    grouped.set(f.rule, list);
  }

  // Pretty report
  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(70));
  lines.push(`STRESS TEST REPORT  ·  ${elapsedMin} min`);
  lines.push("=".repeat(70));
  lines.push(`Scenarios: ${SCENARIOS.length}`);
  lines.push(`API calls: ${totalCalls}`);
  lines.push(`Outfits validated: ${totalOutfits}`);
  lines.push(`Failures: ${allFailures.length}`);
  lines.push("");

  if (allFailures.length === 0) {
    lines.push("✓ All checks passed.");
  } else {
    lines.push(`Failures grouped by rule:`);
    lines.push("");
    for (const [rule, list] of [...grouped.entries()].sort(
      (a, b) => b[1].length - a[1].length
    )) {
      lines.push(`  ${rule}: ${list.length}`);
      for (const f of list.slice(0, 5)) {
        lines.push(
          `    · [${f.scenario} #${f.iteration} outfit ${f.outfitIndex}] ${f.detail}`
        );
        if (f.itemIds.length > 0) {
          lines.push(`      items: ${f.itemIds.join(", ")}`);
        }
      }
      if (list.length > 5) {
        lines.push(`    · …and ${list.length - 5} more`);
      }
      lines.push("");
    }
  }

  console.log(lines.join("\n"));

  // Don't FAIL the test on rule violations — we want to surface ALL of them
  // and decide what to fix. (Set this to expect(allFailures).toHaveLength(0)
  // once the suite is mostly clean.)
});
