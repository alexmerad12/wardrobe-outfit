import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw linkErr;
  const anon = createClient(url, publishableKey, options);
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (otpErr || !otp.session) throw otpErr ?? new Error("verifyOtp returned no session");

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
    access_token: otp.session.access_token,
    refresh_token: otp.session.refresh_token,
  });
  return [...jar].map(([name, value]) => ({ name, value, url: baseURL }));
}
