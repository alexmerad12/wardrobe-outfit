import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-based auth verifier. Supabase email templates (invite user,
 * password recovery, magic link, signup confirmation, email change)
 * point links here with ?token_hash=...&type=...&next=...
 *
 * We call verifyOtp to validate the token and establish the session
 * cookie, then redirect to `next` (e.g. /welcome for invites and
 * password resets, / for magic-link sign-in).
 *
 * This is parallel to /auth/callback, which handles the PKCE/OAuth
 * flow (?code=...) used by Google sign-in. Different Supabase auth
 * flows, different verifier endpoints — same end result of a logged-
 * in user landing somewhere meaningful.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/";

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("missing_token")}`, url)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url)
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
