// Linette — the one-time consent screen (2026-11-09, store requirements).
//
// Every account answers it once, after onboarding and before the paywall
// or the app: 18 or older (Gemini's API terms), and photos and wardrobe
// details may go to Google Gemini (Apple 5.1.2(i): name the third-party AI
// and ask first). The proxy sends accounts here until both are on file
// (src/lib/consent.ts), and the AI routes refuse without them.
//
// The text says what is sent and nothing it can't keep: it makes no claim
// about what Google does with it beyond the privacy policy.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { useLocale } from "@/lib/i18n/use-locale";
import { createClient } from "@/lib/supabase/client";
import { invalidatePreferences } from "@/lib/preferences-client";

// The shell styles labels as small field captions: these rows are
// sentences next to a checkbox, so they set their own look, in the lobby's
// own colours (both modes).
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "10px 0",
  margin: 0,
  fontSize: 14,
  lineHeight: 1.45,
  letterSpacing: "normal",
  textTransform: "none",
  fontWeight: 400,
  color: "rgb(var(--lobby-ink) / 0.9)",
  cursor: "pointer",
};
const boxStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  marginTop: 1,
  flex: "none",
  accentColor: "rgb(var(--lobby-ink))",
  cursor: "pointer",
};

export default function ConsentPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [adult, setAdult] = useState(false);
  const [ai, setAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adult || !ai || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adult: true, ai: true }),
      });
      if (res.status === 409) {
        router.replace("/onboarding");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      // The proxy decides where this account goes next (the paywall or
      // the app). Same exit as onboarding: go home and drop what the
      // router cached while the gate was closed.
      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    invalidatePreferences();
    // Full reload on purpose, as in Settings: drops every bit of
    // signed-in client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/launch";
  }

  return (
    <AuthShell>
      <h2>{t("consent.title")}</h2>
      <p className="auth-sub">{t("consent.intro")}</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="consent-adult" style={rowStyle}>
          <input
            id="consent-adult"
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            style={boxStyle}
          />
          <span>{t("consent.adult")}</span>
        </label>
        <label htmlFor="consent-ai" style={rowStyle}>
          <input
            id="consent-ai"
            type="checkbox"
            checked={ai}
            onChange={(e) => setAi(e.target.checked)}
            style={boxStyle}
          />
          <span>{t("consent.ai")}</span>
        </label>

        <div
          style={{
            margin: "8px 0 18px",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgb(var(--lobby-ink) / 0.14)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "rgb(var(--lobby-ink) / 0.75)",
          }}
        >
          <p style={{ margin: "0 0 6px", fontWeight: 600, color: "rgb(var(--lobby-ink) / 0.9)" }}>
            {t("consent.sentTitle")}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
            <li>{t("consent.sentPhotos")}</li>
            <li>{t("consent.sentDetails")}</li>
            <li>{t("consent.sentNever")}</li>
          </ul>
        </div>

        {failed && (
          <p className="auth-error" role="alert">
            {t("consent.error")}
          </p>
        )}

        <button type="submit" disabled={!adult || !ai || saving} className="auth-primary">
          {saving ? t("common.saving") : t("consent.continue")}
        </button>
      </form>

      <p className="auth-foot-note">
        <Link href="/privacy" className="auth-link">
          {t("consent.privacy")}
        </Link>
        {" · "}
        <Link href="/terms" className="auth-link">
          {t("consent.terms")}
        </Link>
      </p>
      <p className="auth-foot-note">
        <button
          type="button"
          onClick={handleSignOut}
          className="auth-link-subtle"
          style={{ background: "none", border: 0, font: "inherit", cursor: "pointer" }}
        >
          {t("consent.signOut")}
        </button>
        {" · "}
        <Link href="/profile/settings/privacy" className="auth-link-subtle">
          {t("consent.deleteAccount")}
        </Link>
      </p>
    </AuthShell>
  );
}
