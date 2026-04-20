import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback. Supabase redirects here with ?code=... after the user
 * finishes Google/Apple/etc. sign-in. We exchange the code for a session
 * (PKCE), which sets the auth cookies. Then we redirect to wherever the
 * user was trying to go before sign-in (or home).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url
      )
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
