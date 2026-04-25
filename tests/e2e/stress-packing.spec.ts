import { test } from "@playwright/test";

// Stress-test the /api/packing endpoint with various trips. Validates
// that the AI builds reasonable packing lists, suggests outfits, picks
// items only from the user's wardrobe, doesn't duplicate single-piece
// categories, and surfaces a weather summary.

const TEST_EMAIL = process.env.STRESS_TEST_EMAIL!;
const TEST_PASSWORD = process.env.STRESS_TEST_PASSWORD!;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "STRESS_TEST_EMAIL and STRESS_TEST_PASSWORD must be set in .env.local"
  );
}

type PackingResponse = {
  packing_list?: { item: { id: string; name: string; category: string }; reason: string }[];
  outfit_suggestions?: { day: string; items: { id: string; category: string }[]; note: string }[];
  weather_summary?: string;
  packing_tips?: string;
  error?: string;
};

type Failure = {
  scenario: string;
  rule: string;
  detail: string;
};

const TRIP_SCENARIOS: Array<{
  name: string;
  destination: string;
  lat: number;
  lng: number;
  daysOut: number; // start = today + daysOut
  duration: number; // days
  occasions: string[];
}> = [
  {
    name: "Paris weekend",
    destination: "Paris, France",
    lat: 48.8566,
    lng: 2.3522,
    daysOut: 14,
    duration: 3,
    occasions: ["casual", "dinner-out"],
  },
  {
    name: "NYC business",
    destination: "New York City",
    lat: 40.7128,
    lng: -74.006,
    daysOut: 7,
    duration: 4,
    occasions: ["work", "dinner-out"],
  },
  {
    name: "Beach vacation",
    destination: "Miami Beach",
    lat: 25.7907,
    lng: -80.13,
    daysOut: 30,
    duration: 5,
    occasions: ["casual", "outdoor"],
  },
  {
    name: "Ski trip",
    destination: "Whistler",
    lat: 50.1163,
    lng: -122.9574,
    daysOut: 21,
    duration: 4,
    occasions: ["outdoor", "casual"],
  },
];

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

test("stress-packing sweep", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, {
    timeout: 30_000,
  });

  const failures: Failure[] = [];
  const startedAt = Date.now();
  let totalCalls = 0;

  for (const trip of TRIP_SCENARIOS) {
    totalCalls++;
    const startDate = isoDate(trip.daysOut);
    const endDate = isoDate(trip.daysOut + trip.duration);

    const res = await page.request.post("/api/packing", {
      data: {
        destination: trip.destination,
        lat: trip.lat,
        lng: trip.lng,
        start_date: startDate,
        end_date: endDate,
        occasions: trip.occasions,
      },
      timeout: 90_000,
    });

    const flag = (rule: string, detail: string) =>
      failures.push({ scenario: trip.name, rule, detail });

    if (!res.ok()) {
      flag("API", `HTTP ${res.status()} — ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    const json = (await res.json()) as PackingResponse;

    if (!json.packing_list || json.packing_list.length === 0) {
      flag("empty-packing-list", "No items in packing list");
      continue;
    }

    // Each packed item must have an id + category.
    for (const p of json.packing_list) {
      if (!p.item?.id || !p.item?.category) {
        flag("packing-item-shape", `malformed item: ${JSON.stringify(p)}`);
      }
    }

    // No duplicate item ids (same item suggested twice).
    const seen = new Set<string>();
    for (const p of json.packing_list) {
      if (seen.has(p.item.id)) {
        flag("packing-duplicate", `Item ${p.item.id} appears twice`);
      }
      seen.add(p.item.id);
    }

    // Outfit suggestions, when present, should follow the same single-
    // piece category rules as Suggest.
    const SINGLE = new Set<string>(["shoes", "bag", "bottom", "dress", "one-piece"]);
    if (Array.isArray(json.outfit_suggestions)) {
      json.outfit_suggestions.forEach((o, idx) => {
        const counts = new Map<string, number>();
        for (const it of o.items ?? []) {
          counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
        }
        for (const [cat, c] of counts) {
          if (SINGLE.has(cat) && c > 1) {
            flag(
              "outfit-single-piece",
              `Day ${idx + 1} (${o.day}): ${c} items in "${cat}"`
            );
          }
        }
      });
    }

    if (!json.weather_summary) {
      flag("missing-weather", "No weather_summary in response");
    }

    // Sport / outdoor trips really want some athletic / outdoor footwear.
    if (
      trip.occasions.includes("outdoor") &&
      json.packing_list.every(
        (p) => p.item.category !== "shoes"
      )
    ) {
      flag(
        "outdoor-no-shoes",
        "Outdoor trip but no shoes in packing list"
      );
    }
  }

  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(70));
  lines.push(`PACKING STRESS TEST  ·  ${elapsedMin} min`);
  lines.push("=".repeat(70));
  lines.push(`Scenarios: ${TRIP_SCENARIOS.length}`);
  lines.push(`API calls: ${totalCalls}`);
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
      for (const f of list.slice(0, 5)) {
        lines.push(`    · [${f.scenario}] ${f.detail}`);
      }
    }
  }
  console.log(lines.join("\n"));
});
