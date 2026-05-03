"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
// import { GoogleSignInButton } from "@/components/google-signin-button";
//   Hidden during beta — Google OAuth provider isn't enabled in
//   Supabase yet, so clicking the button errored ("Unsupported
//   provider"). Restore (uncomment this + the JSX + the divider
//   below) once Google credentials are configured in Supabase.
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/i18n/use-locale";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const { t } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell eyebrow="Maison de garde-robe">
      <h2>{t("auth.welcomeBack")}</h2>
      <p className="auth-sub">{t("auth.signInToClosette")}</p>

      {/* <GoogleSignInButton next={next} variant="brand" />
      <div className="auth-divider">{t("auth.or")}</div> */}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className="block mb-1.5">{t("auth.email")}</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="block mb-1.5">{t("auth.password")}</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="auth-error" role="alert">{error}</p>
        )}

        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>

      <p className="auth-foot-note">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="auth-link">{t("auth.signUp")}</Link>
      </p>

      <p className="auth-terms">
        {t("auth.termsPrefix")}
        <Link href="/terms">{t("auth.termsLink")}</Link>
        {t("auth.termsAnd")}
        <Link href="/privacy">{t("auth.privacyLink")}</Link>
        {t("auth.termsSuffix")}
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
