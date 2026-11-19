"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/use-locale";
import { shellPlugins } from "@/lib/native-shell";
import { appAuthRedirect } from "@/lib/app-google-sign-in";
import { GoogleLogo } from "@/components/google-signin-button";

// Whether this app build can open Google's sign-in in a Chrome tab: true in
// an app build with the browser plugin, false in a browser and in version 15
// of the app (whose sign-in page keeps the line telling Google accounts to
// choose a password), null while the page hydrates (the server can't know).
// Reading whether the plugin exists calls nothing.
const noSubscription = () => () => {};
const canOpenGoogleInApp = () => {
  const plugins = shellPlugins();
  return Boolean(plugins?.Browser?.open && plugins?.App?.addListener);
};

export function useAppGoogleSignIn(): boolean | null {
  return useSyncExternalStore(noSubscription, canOpenGoogleInApp, () => null);
}

/**
 * "Continue with Google" in the Android app (src/lib/app-google-sign-in.ts).
 * The sign-in runs in a Chrome tab; /auth/app-return hands the code to the app
 * through an intent pinned to its package, and the site's shell
 * (native-shell.tsx) finishes it on /auth/callback.
 */
export function AppGoogleSignInButton({ next }: { next: string }) {
  const { t } = useLocale();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Closed without finishing (Back in the Chrome tab): the button comes back.
  useEffect(() => {
    const handle = shellPlugins()?.Browser?.addListener?.("browserFinished", () => setOpening(false));
    return () => {
      void Promise.resolve(handle)
        .then((listener) => listener?.remove?.())
        .catch(() => {});
    };
  }, []);

  async function handleClick() {
    const browser = shellPlugins()?.Browser;
    if (!browser?.open) return;
    setError(null);
    setOpening(true);
    // Builds Supabase's Google sign-in link and keeps the PKCE verifier in
    // this WebView's cookies, where /auth/callback reads it.
    const { data, error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: appAuthRedirect(window.location.origin, next),
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError || !data?.url) {
      setError("auth.oauthFailed");
      setOpening(false);
      return;
    }
    try {
      await browser.open({ url: data.url });
    } catch {
      setError("auth.oauthFailed");
      setOpening(false);
    }
  }

  return (
    <>
      <button type="button" onClick={handleClick} disabled={opening} className="auth-google">
        <GoogleLogo />
        {opening ? t("common.redirecting") : t("auth.continueWithGoogle")}
      </button>
      {error && (
        <p className="auth-error" role="alert">
          {t(error)}
        </p>
      )}
    </>
  );
}
