import { createClient, type Session } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Two runs signing the same account in at once (two sessions on this PC, or a
// local run and one against production) void each other's link: a new magic
// link for an account replaces the one before it, and the voided one answers
// 403 otp_expired, "Email link is invalid or has expired" (4 sign-ins at once:
// 13 of 20 failed, 2026-11-19, known-root-causes.md). Such a sign-in starts
// over with a fresh link after a short random wait, so the runs that collided
// don't collide again.
const SIGN_IN_ATTEMPTS = 5;

function linkWasVoided(error: { code?: string; message?: string }): boolean {
  return error.code === "otp_expired" || /invalid or has expired/i.test(error.message ?? "");
}

// Supabase Auth allows 30 link verifications per 5 minutes from one address
// (the project's rate_limit_verify), and every sign-in here spends one: the
// smoke suite signs in 13 times, so two suites from one PC at once can run
// out. Waiting it out would hang the run and retrying would spend more, so
// the sign-in stops with what happened.
function rateLimited(error: { code?: string; status?: number }): boolean {
  return error.code === "over_request_rate_limit" || error.status === 429;
}

function rateLimitError(cause: unknown): Error {
  return new Error(
    "Supabase Auth's rate limit for sign-in links is used up from this PC (30 per 5 minutes, rate_limit_verify). Wait 5 minutes, and don't run several e2e suites at once.",
    { cause }
  );
}

// Signs a DEDICATED test account in without a password: the Supabase admin
// API mints a magic link (nothing is emailed), verifyOtp turns it into a
// session, and @supabase/ssr writes the same auth cookies the login form
// would. Lets the harness run with no password stored anywhere. Needs
// SUPABASE_SECRET_KEY, which .env.local already carries for scripts.
export async function mintSessionCookies(
  email: string,
  baseURL: string
): Promise<{ name: string; value: string; url: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "Passwordless harness sign-in needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local"
    );
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, secretKey, options);
  const anon = createClient(url, publishableKey, options);
  let session: Session | null = null;
  let attempt = 0;
  while (session === null) {
    attempt++;
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw rateLimited(linkErr) ? rateLimitError(linkErr) : linkErr;
    const { data: otp, error: otpErr } = await anon.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });
    if (otpErr && rateLimited(otpErr)) throw rateLimitError(otpErr);
    if (otpErr && linkWasVoided(otpErr) && attempt < SIGN_IN_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400 * attempt));
      continue;
    }
    if (otpErr || !otp.session) throw otpErr ?? new Error("verifyOtp returned no session");
    session = otp.session;
  }

  const jar = new Map<string, string>();
  const ssr = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value }) =>
          value ? jar.set(name, value) : jar.delete(name)
        ),
    },
  });
  await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return [...jar].map(([name, value]) => ({ name, value, url: baseURL }));
}
