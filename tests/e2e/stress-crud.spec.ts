import { test, expect } from "@playwright/test";

// Read-only smoke test for the CRUD endpoints. Logs in once and hits
// every primary GET to confirm the basic data plumbing works:
// auth flow, RLS policies, response shapes, no 500s.
//
// We deliberately avoid POST/PATCH/DELETE here — running on a real
// wardrobe (the user's wife's account), we don't want to modify
// state. State-modifying flows are covered by the dedicated specs.

const TEST_EMAIL = process.env.STRESS_TEST_EMAIL!;
const TEST_PASSWORD = process.env.STRESS_TEST_PASSWORD!;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error(
    "STRESS_TEST_EMAIL and STRESS_TEST_PASSWORD must be set in .env.local"
  );
}

const ENDPOINTS: Array<{
  path: string;
  expect: (body: unknown) => string | null; // returns error message or null
}> = [
  {
    path: "/api/items",
    expect: (b) => (Array.isArray(b) ? null : `expected array, got ${typeof b}`),
  },
  {
    path: "/api/outfits",
    expect: (b) => (Array.isArray(b) ? null : `expected array, got ${typeof b}`),
  },
  {
    path: "/api/preferences",
    expect: (b) => {
      if (typeof b !== "object" || b === null) return `expected object, got ${typeof b}`;
      // No specific required keys — just confirm it parses as object.
      return null;
    },
  },
  {
    path: `/api/today?date=${new Date().toISOString().split("T")[0]}`,
    expect: (b) => {
      if (typeof b !== "object" || b === null) return `expected object`;
      const obj = b as { today?: unknown; recent?: unknown };
      if (!("today" in obj) || !("recent" in obj)) {
        return `missing today/recent keys`;
      }
      return null;
    },
  },
];

test("stress-crud: every read endpoint", async ({ page }) => {
  test.setTimeout(2 * 60 * 1000);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(wardrobe|home|onboarding|)$|\/wardrobe/, {
    timeout: 30_000,
  });

  type Result = { path: string; ok: boolean; detail: string };
  const results: Result[] = [];

  for (const e of ENDPOINTS) {
    try {
      const res = await page.request.get(e.path, { timeout: 30_000 });
      if (!res.ok()) {
        results.push({
          path: e.path,
          ok: false,
          detail: `HTTP ${res.status()} — ${(await res.text()).slice(0, 160)}`,
        });
        continue;
      }
      const body = await res.json();
      const err = e.expect(body);
      if (err) {
        results.push({ path: e.path, ok: false, detail: err });
      } else {
        // Basic counts where applicable.
        let extra = "";
        if (Array.isArray(body)) extra = ` (${body.length} items)`;
        results.push({ path: e.path, ok: true, detail: `200 OK${extra}` });
      }
    } catch (err) {
      results.push({
        path: e.path,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const lines: string[] = [];
  lines.push("");
  lines.push("=".repeat(70));
  lines.push("CRUD SMOKE");
  lines.push("=".repeat(70));
  for (const r of results) {
    lines.push(`  ${r.ok ? "✓" : "✗"} ${r.path} — ${r.detail}`);
  }
  console.log(lines.join("\n"));

  expect(failed.length, "Some endpoints failed").toBe(0);
});
