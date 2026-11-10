import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCapBypassed } from "@/lib/admin-bypass";
import { hasActiveAccess, isGrandfathered } from "@/lib/subscription";
import { hasConsented, isConsentExempt } from "@/lib/consent";

const PUBLIC_PATHS = [
  "/login", "/signup", "/forgot-password", "/auth", "/privacy", "/terms", "/faq",
  "/launch", "/design",
  // How to delete an account and its data, readable without signing in:
  // Google Play asks for this link on the store listing.
  "/delete-account",
  // PWA / browser-icon endpoints. iOS fetches /apple-icon WITHOUT
  // any auth session when adding to home screen, so the auth-gate
  // redirect was sending iOS the login HTML and iOS was falling back
  // to a stale cached icon. Static /icon.svg + /manifest.json from
  // public/ bypass middleware automatically; only /apple-icon (which
  // is dynamically rendered by apple-icon.tsx) needed an explicit
  // entry here.
  "/apple-icon",
  // Sentry tunnel route — the browser SDK POSTs error events here so
  // ad-blockers don't strip *.ingest.sentry.io calls. Must be public
  // because errors fire from logged-out pages too (login, launch, the
  // empty-state home before signup) — auth-gating it would 307 events
  // to /login and Sentry would never see them.
  "/monitoring",
  // Stripe posts webhook events with no session. The handler verifies
  // the request via the Stripe signature header.
  "/api/stripe",
  // Vercel Cron calls these with no session; each handler checks the
  // CRON_SECRET bearer token itself.
  "/api/cron",
];

// Surfaces a logged-in-but-unsubscribed user is still allowed to see.
// Everything else bounces to /paywall once onboarding is complete.
//   /paywall                — the paywall itself (would otherwise loop)
//   /api/checkout           — opens Stripe Checkout from the paywall
//   /api/stripe             — already in PUBLIC_PATHS; listed here for
//                             clarity, the public-path check fires first
//   /api/account            — Apple requires "easy account deletion"
//                             even for users without an active sub
//   /profile/settings       — manage / cancel subscription
//   /privacy, /terms, /faq  — required legal links from paywall + IAP
const SUBSCRIPTION_EXEMPT_PREFIXES = [
  "/paywall",
  "/api/checkout",
  "/api/stripe",
  "/api/account",
  "/profile/settings",
  "/privacy",
  "/terms",
  "/faq",
  "/onboarding",
  "/welcome",
  // The consent screen comes before the paywall (see the consent gate).
  "/consent",
  "/delete-account",
];

// Endpoints the browser or the phone calls by itself, never pages: the
// Sentry tunnel and the home-screen icon. The gates for signed-in accounts
// (onboarding, consent, paywall) must leave them alone: a POST /monitoring
// redirected to a page answers 405, so browser errors on the paywall, in
// onboarding and on the consent screen never reached Sentry (found
// 2026-11-09 while testing the consent screen).
const MACHINE_ENDPOINTS = ["/monitoring", "/apple-icon"];

function isMachineEndpoint(pathname: string) {
  return MACHINE_ENDPOINTS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isSubscriptionExempt(pathname: string) {
  return SUBSCRIPTION_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    // The front door: a signed-out visit to linette.app opens the launch
    // page (what the app is, Get started, Sign in, the legal links), not a
    // bare sign-in form. Google's sign-in review and the stores open this
    // address without an account.
    if (pathname === "/") {
      const launchUrl = request.nextUrl.clone();
      launchUrl.pathname = "/launch";
      launchUrl.search = "";
      return NextResponse.redirect(launchUrl);
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  // Onboarding gate. If the user is signed in but doesn't have a
  // user_preferences row yet, they bailed mid-onboarding (or never
  // started it) — kick them back to /onboarding until they finish.
  // Skip the check on:
  //   - /onboarding itself (would infinite-loop)
  //   - /welcome (invite-acceptance flow; prefs row doesn't exist yet)
  //   - API routes (the onboarding form needs to PUT /api/preferences;
  //     other API calls from app pages will just return their normal
  //     error rather than getting redirected)
  if (
    user &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/welcome") &&
    !pathname.startsWith("/api/") &&
    !isMachineEndpoint(pathname)
  ) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id, age_confirmed_at, ai_consent_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prefs) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      onboardingUrl.search = "";
      return NextResponse.redirect(onboardingUrl);
    }
    // Consent gate (2026-11-09), after onboarding and before the paywall:
    // 18 or older, and photos and wardrobe details may go to Google Gemini
    // (src/lib/consent.ts). Until both are on file every app page leads to
    // /consent; reading the terms, signing out and deleting the account
    // stay open. The AI routes carry their own check (require-consent.ts).
    const consented = hasConsented(prefs);
    if (!consented && !isConsentExempt(pathname)) {
      const consentUrl = request.nextUrl.clone();
      consentUrl.pathname = "/consent";
      consentUrl.search = "";
      return NextResponse.redirect(consentUrl);
    }
    // Already answered: the screen has nothing left to ask.
    if (consented && pathname === "/consent") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }

  const needsSubscriptionCheck =
    user &&
    !pathname.startsWith("/api/") &&
    !isMachineEndpoint(pathname) &&
    !isSubscriptionExempt(pathname);
  // Already-paying users who land on the paywall (Back button after
  // checkout, an old tab) go home: a second checkout would bill twice.
  // /paywall/success stays reachable while the webhook catches up.
  const onPaywall = user && pathname === "/paywall";

  // Paywall gate. Onboarded user, no active Stripe subscription →
  // push to /paywall. Admin/bypass emails skip entirely so the
  // operator and team don't get gated. Exempt surfaces include the
  // paywall itself, checkout API, settings (cancel/manage), and
  // required legal pages — see SUBSCRIPTION_EXEMPT_PREFIXES.
  //
  // API routes are intentionally NOT gated here — they get their own
  // inline check (see /api/suggest, /api/try-on, etc.) so the gate
  // logic stays close to the cost it protects, and so the middleware
  // doesn't add a DB query to every CRUD call. Page-level gating is
  // enough to keep users out of paid surfaces.
  if (user && (needsSubscriptionCheck || onPaywall)) {
    // Bypass for admin/cap-bypass emails AND for beta users created
    // before the paywall went live — they signed up under the free
    // beta and keep unlimited access. See PAYWALL_LIVE_AT_MS in
    // src/lib/subscription.ts.
    const bypass =
      isCapBypassed(user.email, Boolean(user.email_confirmed_at)) ||
      isGrandfathered(user.created_at);
    let hasAccess = bypass;
    if (!bypass) {
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      hasAccess = hasActiveAccess(sub);
    }
    if (needsSubscriptionCheck && !hasAccess) {
      const paywallUrl = request.nextUrl.clone();
      paywallUrl.pathname = "/paywall";
      paywallUrl.search = "";
      return NextResponse.redirect(paywallUrl);
    }
    if (onPaywall && hasAccess) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
  }

  return supabaseResponse;
}
