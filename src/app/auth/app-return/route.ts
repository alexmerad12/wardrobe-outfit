import { NextResponse } from "next/server";
import { appReturnIntent } from "@/lib/app-google-sign-in";

/**
 * Supabase sends the person here after Google when the sign-in started in the
 * Android app (src/lib/app-google-sign-in.ts). This runs in the app's Chrome
 * tab, which holds neither the app's session nor its PKCE verifier, so it
 * exchanges nothing: it redirects to an intent link pinned to the app's
 * package, which only app.linette receives. Without the app installed, Chrome
 * goes to the sign-in page instead.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const fallback = new URL("/login?error=app_return", url).toString();
  const response = NextResponse.redirect(appReturnIntent(url.searchParams, fallback), 302);
  // The code is single-use and bound to the app's verifier; still, keep it
  // out of caches and out of any Referer.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
