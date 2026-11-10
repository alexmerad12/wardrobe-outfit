import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signIn, E2E_EMAIL } from "./auth";

// "Report this result" on AI output (2026-11-09, Play's AI content
// policy). API level, no AI call: a report is saved for the caller with
// what they saw, bad input is refused, and nobody can read reports back
// through the app. The reports this test creates are deleted at the end.
// It never sends "offensive", the one reason that emails the support inbox.

test("a report on an AI result is saved for its author and bad input is refused", async ({ page }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = listed.users.find((u) => u.email === E2E_EMAIL);
  expect(user, `the test account ${E2E_EMAIL}`).toBeTruthy();
  const marker = `e2e report ${Date.now()}`;

  await signIn(page);
  try {
    const saved = await page.request.post("/api/report", {
      data: {
        feature: "suggest",
        reason: "inaccurate",
        note: marker,
        locale: "en",
        content: { name: "Test look", item_ids: ["a", "b"], reasoning: "Two tops, no bottom." },
      },
    });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toEqual({ ok: true });

    const { data: rows } = await admin
      .from("ai_reports")
      .select("user_id, feature, reason, note, content, locale, status")
      .eq("note", marker);
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      user_id: user!.id,
      feature: "suggest",
      reason: "inaccurate",
      locale: "en",
      status: "new",
      content: { name: "Test look", item_ids: ["a", "b"] },
    });

    // Bad input never reaches the table.
    const cases: [Record<string, unknown>, number][] = [
      [{ feature: "wardrobe", reason: "other", content: {} }, 400],
      [{ feature: "suggest", reason: "boring", content: {} }, 400],
      [{ feature: "suggest", reason: "other" }, 400],
      [{ feature: "suggest", reason: "other", content: { blob: "x".repeat(25_000) } }, 413],
      [{ feature: "suggest", reason: "other", content: {}, note: "x".repeat(2_001) }, 413],
    ];
    for (const [data, status] of cases) {
      const res = await page.request.post("/api/report", { data });
      expect(res.status(), JSON.stringify(data).slice(0, 60)).toBe(status);
    }

    // The app's own data API gives no way to read reports back: the
    // signed-in user's Supabase key sees zero rows (insert-only table).
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey) {
      const outsider = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey, { auth: { persistSession: false } });
      const { data: seen } = await outsider.from("ai_reports").select("id").limit(1);
      expect(seen ?? []).toHaveLength(0);
    }
  } finally {
    await admin.from("ai_reports").delete().eq("user_id", user!.id).like("note", "e2e report %");
  }
});

test("a signed-out caller cannot file a report", async ({ request }) => {
  const res = await request.post("/api/report", {
    data: { feature: "suggest", reason: "other", content: {} },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
});
