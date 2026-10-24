// /paywall/success — Stripe Checkout returns here on completion.
//
// The subscription row may not exist yet when this page loads —
// the webhook is asynchronous. We poll briefly (a few seconds) for
// the row to land via Stripe's webhook handler, then redirect home.
// In the worst case (webhook delayed) the user hits "Continue" and
// the middleware will bounce them back to /paywall if subscription
// state hasn't synced — they can refresh and try again.
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PatternRoseDamask, type Palette } from "@/components/brand/patterns";
import { useLocale } from "@/lib/i18n/use-locale";

const BRAND_PALETTE: Palette = [
  "#ffffff",
  "#f4f4f4",
  "#000000", "#000000", "#000000", "#000000",
  "#1a1a1a",
  "#000000",
];

export default function PaywallSuccessPage() {
  const router = useRouter();
  const { t } = useLocale();

  React.useEffect(() => {
    // Give the webhook ~3s to land, then push home. The middleware
    // will re-route to /paywall if the subscription row never landed.
    const timer = setTimeout(() => {
      router.replace("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <style>{SUCCESS_CSS}</style>
      <div className="ps-shell">
        <div className="ps-wall" aria-hidden="true">
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="ps-vignette" aria-hidden="true" />
        <div className="ps-content">
          <main className="ps-card">
            <h1 className="ps-title">{t("paywall.successTitle")}</h1>
            <p className="ps-sub">{t("paywall.successSub")}</p>
            <button
              type="button"
              className="ps-cta"
              onClick={() => router.replace("/")}
            >
              {t("paywall.successContinue")}
            </button>
          </main>
        </div>
      </div>
    </>
  );
}

// Colours come from the --lobby-* tokens in globals.css, which carry the
// dark mode. Shadows and the corner vignette stay black in both modes.
const SUCCESS_CSS = `
  .ps-shell {
    position: fixed; inset: 0;
    background: rgb(var(--lobby-ground));
    color: rgb(var(--lobby-ink));
    font-family: var(--font-sans), system-ui, sans-serif;
    z-index: 50;
  }
  .ps-wall { position: absolute; inset: 0; opacity: 0.36; filter: saturate(0.85); }
  /* The damask is greyscale: dark mode draws its negative. */
  .dark .ps-wall { filter: invert(1); }
  .ps-vignette {
    position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(ellipse at 50% 30%, rgb(var(--lobby-glow) / 0.75) 0%, transparent 60%),
      radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.28) 100%);
  }
  .ps-content {
    position: relative;
    height: 100%;
    display: flex; align-items: center; justify-content: center;
    padding: 40px 20px;
    z-index: 2;
  }
  .ps-card {
    width: 100%; max-width: 380px;
    background: rgb(var(--lobby-card) / 0.94);
    border: 0.5px solid rgb(var(--lobby-ink) / 0.16);
    border-radius: 18px;
    padding: 30px 26px;
    backdrop-filter: blur(8px) saturate(105%);
    box-shadow:
      0 1px 0 var(--lobby-highlight) inset,
      0 12px 36px rgba(0,0,0,0.18);
    text-align: center;
  }
  .ps-title {
    font-family: 'Bodoni Moda', serif; font-weight: 400;
    font-size: 28px; letter-spacing: -0.01em;
    margin: 0 0 8px;
  }
  .ps-sub {
    font-family: 'Bodoni Moda', serif; font-style: italic;
    font-size: 14px;
    margin: 0 0 22px;
    color: rgb(var(--lobby-ink) / 0.65);
  }
  .ps-cta {
    width: 100%; height: 44px;
    background: rgb(var(--lobby-ink)); color: rgb(var(--lobby-on-ink));
    border: 0.5px solid rgb(var(--lobby-ink)); border-radius: 999px;
    font-weight: 500; font-size: 13px; letter-spacing: 0.06em;
    cursor: pointer;
  }
  .ps-cta:hover { background: rgb(var(--lobby-ink-hover)); }
`;
