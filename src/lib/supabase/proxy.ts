import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login", "/signup", "/forgot-password", "/auth", "/privacy", "/terms", "/faq",
  "/logo-lab", "/launch", "/design",
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
];

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
    !pathname.startsWith("/api/")
  ) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prefs) {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      onboardingUrl.search = "";
      return NextResponse.redirect(onboardingUrl);
    }
  }

  return supabaseResponse;
}
