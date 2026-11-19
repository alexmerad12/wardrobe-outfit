// Google sign-in inside the Android app (the owner's ask, 2026-11-16).
//
// Google refuses its sign-in page inside an app's WebView, so in the app the
// "Continue with Google" button opens it in a Chrome tab (@capacitor/browser)
// with the same Supabase Google sign-in the website uses. The way back:
//
// 1. Supabase returns to APP_RETURN_PATH on the site itself (an https address
//    its allow list already holds as https://linette.app/**).
// 2. That page runs in the Chrome tab, which has neither the app's session nor
//    its PKCE verifier, so it exchanges nothing: it answers with an intent link
//    pinned to the app's package (appReturnIntent), which Android delivers to
//    app.linette and to no other app.
// 3. The app's AuthReturnActivity hands app.linette://auth/callback?code=… to
//    the open app, whose shell (native-shell.tsx) sends the code to the site's
//    /auth/callback, in the WebView, where the verifier was kept.
//
// NEVER put an app.linette:// address in Supabase's allow list: any app can
// claim that scheme, start a sign-in with its own verifier and receive a code
// it can exchange, which is an account takeover (docs/android-shell-plan.md).
// The pinned intent keeps the code away from other apps, and a code another app
// sends to Linette is useless without Linette's own verifier.
// No change in Google Cloud: the redirect Google sees is Supabase's callback.

export const APP_RETURN_PATH = "/auth/app-return";
export const APP_AUTH_RETURN = "app.linette://auth/callback";
const APP_PACKAGE = "app.linette";

/** Where Supabase sends the person back after Google: the site's own page, with the page to open next. */
export function appAuthRedirect(origin: string, next: string): string {
  return `${origin}${APP_RETURN_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * The intent link APP_RETURN_PATH answers with: Android opens
 * app.linette://auth/callback?… in the app's own package, nowhere else. Only
 * the sign-in's own parameters go on. Without the app, Chrome opens `fallback`.
 */
export function appReturnIntent(search: URLSearchParams, fallback: string): string {
  const kept = new URLSearchParams();
  for (const name of ["code", "next", "error", "error_code", "error_description"]) {
    const value = search.get(name);
    if (value !== null) kept.set(name, value);
  }
  const query = kept.toString();
  return `intent://auth/callback${query ? `?${query}` : ""}#Intent;scheme=app.linette;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/**
 * The site's page that finishes the app's return link: /auth/callback with the
 * code (that route checks `next` with safeNextPath), or /login with an error
 * when Google or Supabase refused (the page shows its generic line, never this
 * text). Null for any other link, so nothing else the app is sent moves the
 * page.
 */
export function appAuthReturnPath(link: string | null | undefined): string | null {
  if (!link) return null;
  // Read by hand, not with new URL(): WebViews before Chromium 130 give a
  // non-special URL no host ("app.linette://auth/callback" had host "" and
  // pathname "//auth/callback"), so a host check never matched on the
  // Android 15 emulator's WebView 124 (Android run #17, 2026-11-19).
  const hashAt = link.indexOf("#");
  const beforeHash = hashAt >= 0 ? link.slice(0, hashAt) : link;
  const queryAt = beforeHash.indexOf("?");
  const address = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  if (address !== APP_AUTH_RETURN && address !== `${APP_AUTH_RETURN}/`) return null;
  const query = new URLSearchParams(queryAt >= 0 ? beforeHash.slice(queryAt + 1) : "");
  // Supabase puts an error in the query, or in the fragment for some errors.
  const fragment = new URLSearchParams(hashAt >= 0 ? link.slice(hashAt + 1) : "");
  const read = (name: string) => query.get(name) ?? fragment.get(name);
  const next = read("next") ?? "/";
  const code = read("code");
  if (code) return `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
  const error = read("error_description") ?? read("error") ?? "cancelled";
  return `/login?error=${encodeURIComponent(error)}`;
}
