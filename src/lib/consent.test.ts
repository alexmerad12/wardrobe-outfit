import { describe, expect, it } from "vitest";
import { hasConsented, isConsentExempt } from "./consent";

describe("consent", () => {
  it("needs both answers", () => {
    const at = "2026-11-09T12:00:00Z";
    expect(hasConsented({ age_confirmed_at: at, ai_consent_at: at })).toBe(true);
    expect(hasConsented({ age_confirmed_at: at, ai_consent_at: null })).toBe(false);
    expect(hasConsented({ age_confirmed_at: null, ai_consent_at: at })).toBe(false);
    expect(hasConsented({})).toBe(false);
    expect(hasConsented(null)).toBe(false);
    expect(hasConsented(undefined)).toBe(false);
  });

  it("leaves open the pages needed to read, sign out or delete the account", () => {
    for (const p of ["/consent", "/onboarding", "/welcome", "/auth/callback", "/profile/settings", "/profile/settings/privacy", "/privacy", "/terms", "/faq", "/delete-account"]) {
      expect(isConsentExempt(p), p).toBe(true);
    }
  });

  it("holds back the app and the paywall", () => {
    for (const p of ["/", "/wardrobe", "/suggest", "/try-on", "/packing", "/outfits", "/profile", "/paywall", "/consentement", "/privacy-policy"]) {
      expect(isConsentExempt(p), p).toBe(false);
    }
  });
});
