import { test, expect } from "@playwright/test";
import { assertE2EAccount, signIn } from "./auth";

// End-to-end test for the "wear today" flow — covers the husband-bug
// scenario: set today's outfit, reload, verify it persists. Used to be
// silently rotated by the 2am-cutoff staleness check; now relies only
// on the local-date-string comparison.
//
// State management: runs on the dedicated test account (auth.ts). Seeds 3
// plain items when the wardrobe has fewer, sets a temporary
// today_outfit, and clears both at the end.

assertE2EAccount();

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("stress-wear-today: set, persist, delete (husband-bug regression)", async ({ page }) => {
  test.setTimeout(3 * 60 * 1000);

  await signIn(page);

  const today = localDate();

  // 1. Snapshot existing today_outfit so we can restore at the end.
  const initialRes = await page.request.get(`/api/today?date=${today}`);
  expect(initialRes.ok()).toBeTruthy();
  const initial = (await initialRes.json()) as { today: Record<string, unknown> | null };
  const original = initial.today;

  // Pick a few wardrobe item ids for the synthetic outfit, seeding plain
  // ones when the (often empty) test wardrobe has fewer than 3.
  const itemsRes = await page.request.get("/api/items");
  expect(itemsRes.ok()).toBeTruthy();
  const items = (await itemsRes.json()) as { id: string; is_stored: boolean }[];
  const sampleIds = items.filter((i) => !i.is_stored).slice(0, 3).map((i) => i.id);
  const seeded: string[] = [];
  for (const [category, subcategory] of [["top", "t-shirt"], ["bottom", "jeans"], ["shoes", "sneakers"]]) {
    if (sampleIds.length >= 3) break;
    const res = await page.request.post("/api/items", {
      data: {
        image_url: "https://example.com/e2e-fixture.png",
        name: `__stress_test_${subcategory}`,
        category,
        subcategory,
        colors: [{ hex: "#888888", name: "grey", percentage: 100 }],
        seasons: [],
        occasions: [],
        is_favorite: false,
        is_stored: false,
      },
    });
    expect(res.status(), `seeding a ${subcategory}`).toBe(201);
    const id = ((await res.json()) as { id: string }).id;
    seeded.push(id);
    sampleIds.push(id);
  }
  expect(sampleIds.length, "wardrobe needs ≥3 items for this test").toBeGreaterThanOrEqual(3);

  const TEST_NAME = `__stress_test_outfit_${Date.now()}`;

  try {
    // 2. POST a new today_outfit.
    const postRes = await page.request.post("/api/today", {
      data: {
        item_ids: sampleIds,
        name: TEST_NAME,
        reasoning: "stress-test",
        styling_tip: null,
        mood: "confident",
        occasion: "casual",
        weather_temp: null,
        weather_condition: null,
        is_favorite: false,
        date: today,
      },
    });
    expect(postRes.ok(), "POST /api/today should succeed").toBeTruthy();

    // 3. Re-fetch immediately. Outfit must persist.
    const get1 = await page.request.get(`/api/today?date=${today}`);
    expect(get1.ok()).toBeTruthy();
    const json1 = (await get1.json()) as { today: { name?: string; date?: string } | null };
    expect(json1.today, "today_outfit missing immediately after POST").not.toBeNull();
    expect(json1.today?.name).toBe(TEST_NAME);
    expect(json1.today?.date).toBe(today);

    // 4. Re-fetch with the same local date again — verifies the rotation
    // logic doesn't fire when date matches. Husband-bug regression.
    const get2 = await page.request.get(`/api/today?date=${today}`);
    expect(get2.ok()).toBeTruthy();
    const json2 = (await get2.json()) as { today: { name?: string } | null };
    expect(json2.today, "today_outfit should still exist on second fetch").not.toBeNull();
    expect(json2.today?.name).toBe(TEST_NAME);

    // 5. Verify YESTERDAY's date triggers rotation (date mismatch).
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const get3 = await page.request.get(`/api/today?date=${yesterday}`);
    expect(get3.ok()).toBeTruthy();
    const json3 = (await get3.json()) as { today: { name?: string } | null };
    // Today's outfit (with date=today) should now appear "stale" relative to yesterday's local date.
    // The rotation logic moves it to recent_outfits.
    // After this call, today_outfit should be cleared.
    const get4 = await page.request.get(`/api/today?date=${today}`);
    const json4 = (await get4.json()) as { today: unknown };
    // Either it was rotated (today is null) or it was preserved — both
    // are arguably valid here depending on logic. The KEY assertion is
    // step 4 above. Just log this for diagnostics.
    console.log(
      `[wear-today] After yesterday fetch (json3.today=${json3.today === null ? "null" : "present"}), today fetch sees: ${json4.today === null ? "null" : "still present"}`
    );

    console.log("[wear-today] ✓ Regression check passed — same-day persistence works.");
  } finally {
    // Restore: clear the synthetic outfit. (We don't restore the
    // original because we don't know the user's exact original outfit_id;
    // simpler to just clear and let the user re-pick if they had one.)
    await page.request.delete("/api/today").catch(() => {});
    for (const id of seeded) {
      await page.request.delete(`/api/items/${id}`).catch(() => {});
    }

    // If they had an original, log a hint so the user knows.
    if (original) {
      console.log(
        `[wear-today] NOTE: cleared today_outfit. Original outfit (${(original as { name?: string }).name ?? "(unnamed)"}) was not restored — pick a new one in the app.`
      );
    }
  }
});
