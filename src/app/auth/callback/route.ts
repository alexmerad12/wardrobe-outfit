import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/safe-next";

// Invite-only beta gate (audit A6). The signup page hides the Google
// button on purpose, but Google-on-LOGIN happily auto-created accounts
// for anyone with the URL — the documented gate was a no-op. A brand-new
// OAuth account (created seconds ago, no prefs row) gets deleted and
// bounced back with an invite-only message. ENFORCED BY DEFAULT; at
// public launch set INVITE_ONLY=false in the Vercel env — no code
// change needed. Invited users are unaffected: their accounts are
// created by the admin invite email long before any OAuth sign-in.
const INVITE_ONLY = process.env.INVITE_ONLY !== "false";
const NEW_ACCOUNT_WINDOW_MS = 60_000;

/**
 * OAuth callback. Supabase redirects here with ?code=... after the user
 * finishes Google/Apple/etc. sign-in. We exchange the code for a session
 * (PKCE), which sets the auth cookies. Then we redirect to wherever the
 * user was trying to go before sign-in (or home).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = await createClient();
  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url
      )
    );
  }

  // Invite gate — must run before the onboarding redirect, otherwise a
  // stranger lands in onboarding with a fully created account.
  const oauthUser = sessionData?.user;
  if (INVITE_ONLY && oauthUser) {
    const createdAgoMs = Date.now() - new Date(oauthUser.created_at).getTime();
    if (createdAgoMs < NEW_ACCOUNT_WINDOW_MS) {
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", oauthUser.id)
        .maybeSingle();
      if (!prefs) {
        // Brand-new uninvited account: remove it entirely (otherwise a
        // second attempt outlives the freshness window and walks in).
        await supabase.auth.signOut();
        try {
          await createAdminClient().auth.admin.deleteUser(oauthUser.id);
        } catch (err) {
          console.error("[auth] invite-gate cleanup failed:", err);
        }
        return NextResponse.redirect(new URL("/login?error=invite_only", url));
      }
    }
  }

  // First-time sign-in: if the user has no preferences row yet, send them
  // through onboarding instead of home so we capture language/city/gender.
  const userId = sessionData?.user?.id;
  if (userId && next === "/") {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!prefs) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
