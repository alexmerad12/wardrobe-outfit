import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { signIn, E2E_EMAIL } from "./auth";

// The one-time consent (2026-11-09): 18 or older, and photos and wardrobe
// details may go to Google Gemini. An account that hasn't answered is led
// to /consent from every app page, can still read the terms, open its
// settings (sign out, delete the account), and gets nothing from the AI.
//
// The test account normally HAS answered (every other suite needs the
// app). This test clears its two timestamps through the admin API, walks
// the gate, answers on the screen, and puts the answers back whatever
// happens. No AI call is made: the routes refuse before reaching Gemini.

test("an account that hasn't answered is led to the consent screen, and both answers let it in", async ({ page }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  expect(listError).toBeNull();
  const user = listed.users.find((u) => u.email === E2E_EMAIL);
  expect(user, `the test account ${E2E_EMAIL}`).toBeTruthy();
  const setConsent = (at: string | null) =>
    admin.from("user_preferences").update({ age_confirmed_at: at, ai_consent_at: at }).eq("user_id", user!.id);

  await signIn(page);
  try {
    expect((await setConsent(null)).error).toBeNull();

    // Every app page leads to the screen.
    await page.goto("/wardrobe");
    await expect(page).toHaveURL(/\/consent$/);
    await expect(page.locator("nav")).toHaveCount(0);

    // Reading the terms and opening the settings stay possible.
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await page.goto("/profile/settings/privacy");
    await expect(page).toHaveURL(/\/profile\/settings\/privacy$/);

    // The AI routes refuse before anything is sent to Gemini.
    for (const path of ["/api/suggest", "/api/suggest/refine", "/api/packing"]) {
      const refused = await page.request.post(path, { data: {} });
      expect(refused.status(), path).toBe(403);
      expect((await refused.json()).error, path).toBe("ai_consent_required");
    }

    // The gates leave the error-report tunnel alone: redirected to a
    // page, its POST answered 405 and browser errors on this screen (and
    // on the paywall and in onboarding) never reached Sentry.
    const tunnel = await page.request.post("/monitoring", { data: "{}", maxRedirects: 0 });
    expect(tunnel.status(), "POST /monitoring is not redirected").not.toBe(307);
    expect(tunnel.status()).not.toBe(405);

    // One answer is not enough.
    const half = await page.request.post("/api/consent", { data: { adult: true } });
    expect(half.status()).toBe(400);

    // On the screen the button waits for both boxes.
    await page.goto("/consent");
    const go = page.getByRole("button", { name: /^(Agree and continue|Accepter et continuer)$/ });
    await expect(go).toBeDisabled();
    await page.locator("#consent-adult").check();
    await expect(go).toBeDisabled();
    await page.locator("#consent-ai").check();
    await expect(go).toBeEnabled();
    await go.click();
    // The test account predates the paywall, so the app is next.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/);

    const { data: row } = await admin
      .from("user_preferences")
      .select("age_confirmed_at, ai_consent_at")
      .eq("user_id", user!.id)
      .single();
    expect(row?.age_confirmed_at, "18+ on file").toBeTruthy();
    expect(row?.ai_consent_at, "Gemini consent on file").toBeTruthy();

    // Answered: the screen has nothing left to ask, and the app opens.
    await page.goto("/consent");
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/);
    await page.goto("/wardrobe");
    await expect(page).toHaveURL(/\/wardrobe$/);
  } finally {
    // Whatever happened, the test account ends up answered.
    await setConsent(new Date().toISOString());
  }
});
