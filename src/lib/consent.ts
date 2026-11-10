// The one-time consent every account gives before any AI feature
// (2026-11-09, store requirements): being 18 or older (Gemini's API terms)
// and agreeing that clothing photos and wardrobe details go to Google
// Gemini (Apple's guideline 5.1.2(i): name the third-party AI and ask
// first). Both are timestamps on user_preferences, null until answered on
// /consent. Pure rules here, shared by the proxy (pages) and
// require-consent.ts (the AI routes). Only /api/consent writes them.
export type ConsentState = {
  age_confirmed_at: string | null;
  ai_consent_at: string | null;
};

export function hasConsented(prefs: Partial<ConsentState> | null | undefined): boolean {
  return Boolean(prefs?.age_confirmed_at && prefs?.ai_consent_at);
}

// What a signed-in person may open before answering: the screen itself,
// the steps that come before it, and the pages needed to read the terms,
// sign out or delete the account without agreeing to anything.
const CONSENT_EXEMPT_PREFIXES = [
  "/consent",
  "/onboarding",
  "/welcome",
  "/auth",
  "/profile/settings",
  "/privacy",
  "/terms",
  "/faq",
  "/delete-account",
];

export function isConsentExempt(pathname: string): boolean {
  return CONSENT_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
