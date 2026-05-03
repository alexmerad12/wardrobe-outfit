"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
// import { GoogleSignInButton } from "@/components/google-signin-button";
//   Hidden during beta — see login/page.tsx for the same comment.
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/i18n/use-locale";

export default function SignUpPage() {
  const router = useRouter();
  const { t } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("auth.passwordRequirement"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If email confirmation is OFF, the user is already logged in.
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    // Otherwise, Supabase sent a confirmation email.
    setCheckEmail(true);
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <AuthShell eyebrow="Maison de garde-robe">
        <h2>{t("auth.checkInbox")}</h2>
        <p className="auth-sub">{t("auth.confirmationSent", { email })}</p>
        <p className="auth-foot-note">
          <Link href="/login" className="auth-link">{t("auth.backToSignIn")}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Maison de garde-robe">
      <h2>{t("auth.createYourClosette")}</h2>
      <p className="auth-sub">{t("auth.wardrobeTagline")}</p>

      {/* <GoogleSignInButton variant="brand" />
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
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] opacity-65">{t("auth.passwordHint")}</p>
        </div>

        {error && (
          <p className="auth-error" role="alert">{error}</p>
        )}

        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>
      </form>

      <p className="auth-foot-note">
        {t("auth.alreadyHaveAccount")}{" "}
        <Link href="/login" className="auth-link">{t("auth.signIn")}</Link>
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
