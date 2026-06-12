"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GoogleSignInButton } from "@/components/google-signin-button";
import { AuthShell } from "@/components/auth-shell";
import { PasswordInput } from "@/components/password-input";
import { BrandedName } from "@/components/brand/branded-name";
import { useLocale } from "@/lib/i18n/use-locale";
import { safeNextPath } from "@/lib/safe-next";
import { authErrorKey } from "@/lib/auth-error";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const { t } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The error state holds a DICTIONARY KEY, never raw provider prose
  // (English-only and often technical — audit Group D). /auth/callback
  // and /auth/confirm redirect failures here as /login?error=..., which
  // this page never displayed before (audit P2).
  const [error, setError] = useState<string | null>(() =>
    searchParams.get("error") ? "auth.oauthFailed" : null
  );
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
      setError(authErrorKey(error.message));
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell eyebrow="Your AI stylist">
      <h2>{t("auth.welcomeBack")}</h2>
      <p className="auth-sub">
        <BrandedName template={t("auth.signInToLinette")} scriptClassName="text-lg" />
      </p>

      <GoogleSignInButton next={next} variant="brand" />

      <div className="auth-divider">{t("auth.or")}</div>

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
          <div className="flex items-baseline justify-between mb-1.5">
            <label htmlFor="password">{t("auth.password")}</label>
            <Link href="/forgot-password" className="auth-link-subtle text-[11px]">
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {t(error)}
          </p>
        )}

        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? t("auth.signingIn") : t("auth.signIn")}
        </button>
      </form>

      <p className="auth-foot-note">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="auth-link-subtle">{t("auth.signUp")}</Link>
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
