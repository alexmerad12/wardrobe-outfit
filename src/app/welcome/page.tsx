// Closette — invite acceptance + password set page.
//
// When a beta-invited user clicks the link in their Supabase invite
// email, they pass through /auth/callback (PKCE), arrive here with an
// active session but no password yet, and we ask them to set one. The
// same flow handles password recovery: a "Reset password" email also
// drops the user here authenticated, and updateUser({ password })
// rewrites their password.
//
// If the user lands here without a session (link expired, manual
// navigation, etc), we show a "this invite is invalid" message with a
// path back to /login.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/i18n/use-locale";

export default function WelcomePage() {
  const router = useRouter();
  const { t } = useLocale();

  // null = still checking, true = user has a session (invite/recovery
  // verified), false = no session, show the expired-link UX.
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("auth.passwordRequirement"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    // Same first-time-user check the OAuth callback uses: if there's
    // no preferences row yet, send them through onboarding to capture
    // language / city / gender. Otherwise send them home.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      router.push(prefs ? "/" : "/onboarding");
      router.refresh();
      return;
    }
    router.push("/");
    router.refresh();
  }

  // Initial session check still in flight — render the shell empty so
  // the page doesn't flash the "invalid link" UX before we know.
  if (hasSession === null) {
    return <AuthShell><></></AuthShell>;
  }

  if (!hasSession) {
    return (
      <AuthShell>
        <h2>{t("auth.welcomeNoSession")}</h2>
        <p className="auth-sub">{t("auth.welcomeNoSessionSub")}</p>
        <p className="auth-foot-note">
          <Link href="/login" className="auth-link">{t("auth.signIn")}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2>{t("auth.welcomeChoosePassword")}</h2>
      <p className="auth-sub">{t("auth.welcomeChoosePasswordSub")}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="password" className="block mb-1.5">{t("auth.password")}</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] opacity-65">{t("auth.passwordHint")}</p>
        </div>

        <div>
          <label htmlFor="confirm" className="block mb-1.5">{t("auth.confirmPassword")}</label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? t("auth.settingPassword") : t("auth.setPassword")}
        </button>
      </form>
    </AuthShell>
  );
}
