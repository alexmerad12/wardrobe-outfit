// Linette — forgot-password entry point.
//
// User lands here from a "Forgot password?" link on /login, types their
// email, and we call supabase.auth.resetPasswordForEmail. Supabase
// generates a recovery email (rendered with our branded Reset password
// template) that drops the recipient back at /auth/callback?next=/welcome.
// /welcome detects the active session and lets them set a new password.
"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/i18n/use-locale";

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/welcome`,
    });

    // Don't surface "user not found" errors — that would let an attacker
    // probe which emails have accounts. Show the same success state
    // regardless of whether the email matched a real user.
    if (resetErr && resetErr.status !== 404) {
      setError(resetErr.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <AuthShell eyebrow="Your AI stylist">
        <h2>{t("auth.resetLinkSent")}</h2>
        <p className="auth-sub">{t("auth.resetLinkSentSub", { email })}</p>
        <p className="auth-foot-note">
          <Link href="/login" className="auth-link">{t("auth.backToSignIn")}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Your AI stylist">
      <h2>{t("auth.forgotPasswordTitle")}</h2>
      <p className="auth-sub">{t("auth.forgotPasswordSub")}</p>

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

        {error && <p className="auth-error" role="alert">{error}</p>}

        <button type="submit" disabled={loading} className="auth-primary">
          {loading ? t("auth.sendingResetLink") : t("auth.sendResetLink")}
        </button>
      </form>

      <p className="auth-foot-note">
        <Link href="/login" className="auth-link">{t("auth.backToSignIn")}</Link>
      </p>
    </AuthShell>
  );
}
