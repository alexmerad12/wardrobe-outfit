// /paywall — the first surface a newly-onboarded user hits.
//
// Brand framing matches /login and /signup: damask backdrop, ivory
// card, Bodoni headings, black ink CTA. Two plan cards stacked
// vertically (mobile-first). Annual is pre-selected with the
// "Save 84%" badge so the default click pushes users to the
// commit-anchor — per the deep-research recommendation that
// weekly+trial maximises Year-1 LTV but annual buys retention.
//
// Apple-compliance bar (Cal AI precedent, April 2026): the auto-
// renewal price must be at least as prominent as the trial price,
// and disclosure copy must include duration + what becomes
// inaccessible + downstream charge. We surface "$6.99/week" and the
// "auto-renews until cancelled" line side-by-side, no toggle hiding
// the renewal terms.
"use client";

import * as React from "react";
import Link from "next/link";
import { PatternRoseDamask, type Palette } from "@/components/brand/patterns";
import { useLocale } from "@/lib/i18n/use-locale";

const BRAND_PALETTE: Palette = [
  "#ffffff",
  "#f4f4f4",
  "#000000", "#000000", "#000000", "#000000",
  "#1a1a1a",
  "#000000",
];

type Plan = "weekly" | "annual";

export default function PaywallPage() {
  const { t } = useLocale();
  const [selected, setSelected] = React.useState<Plan>("annual");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Checkout failed");
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      console.error(err);
      setError(t("paywall.checkoutError"));
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{PAYWALL_CSS}</style>
      <div className="paywall-shell">
        <div className="paywall-wall" aria-hidden="true">
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="paywall-vignette" aria-hidden="true" />

        <div className="paywall-content">
          <main className="paywall-card">
            <h1 className="pw-title">{t("paywall.welcome")}</h1>
            <p className="pw-sub">{t("paywall.chooseHow")}</p>

            <div className="pw-plans">
              {/* Annual — pre-selected, savings anchor */}
              <button
                type="button"
                className={`pw-plan ${selected === "annual" ? "is-selected" : ""}`}
                onClick={() => setSelected("annual")}
                aria-pressed={selected === "annual"}
              >
                <div className="pw-plan-head">
                  <span className="pw-plan-label">{t("paywall.annualLabel")}</span>
                  <span className="pw-badge">{t("paywall.annualBadge")}</span>
                </div>
                <div className="pw-price">
                  <span className="pw-price-main">{t("paywall.annualPrice")}</span>
                  <span className="pw-price-per">{t("paywall.annualPer")}</span>
                </div>
                <div className="pw-equiv">{t("paywall.annualEquiv")}</div>
                <div className="pw-note">{t("paywall.annualNote")}</div>
              </button>

              {/* Weekly — 7-day trial */}
              <button
                type="button"
                className={`pw-plan ${selected === "weekly" ? "is-selected" : ""}`}
                onClick={() => setSelected("weekly")}
                aria-pressed={selected === "weekly"}
              >
                <div className="pw-plan-head">
                  <span className="pw-plan-label">{t("paywall.weeklyLabel")}</span>
                  <span className="pw-trial-pill">{t("paywall.weeklyTrial")}</span>
                </div>
                <div className="pw-price">
                  <span className="pw-price-main">{t("paywall.weeklyPrice")}</span>
                  <span className="pw-price-per">{t("paywall.weeklyPer")}</span>
                </div>
                <div className="pw-note">{t("paywall.weeklyNote")}</div>
              </button>
            </div>

            <ul className="pw-benefits">
              <li>{t("paywall.benefitOutfits")}</li>
              <li>{t("paywall.benefitTryon")}</li>
              <li>{t("paywall.benefitPacking")}</li>
              <li>{t("paywall.benefitWardrobe")}</li>
              <li>{t("paywall.benefitCancel")}</li>
            </ul>

            {error && <div className="pw-error">{error}</div>}

            <button
              type="button"
              className="pw-cta"
              onClick={onContinue}
              disabled={submitting}
            >
              {submitting ? t("paywall.openingCheckout") : t("paywall.continueCta")}
            </button>

            <p className="pw-disclosure">{t("paywall.disclosure")}</p>

            <div className="pw-foot">
              <Link href="/terms" className="pw-foot-link">
                {t("paywall.terms")}
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="pw-foot-link">
                {t("paywall.privacy")}
              </Link>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

const PAYWALL_CSS = `
  .paywall-shell {
    position: fixed; inset: 0;
    background: #ffffff;
    color: #000000;
    font-family: 'Inter', system-ui, sans-serif;
    overflow-y: auto;
    z-index: 50;
  }
  .paywall-wall {
    position: absolute; inset: 0;
    opacity: 0.36;
    filter: saturate(0.85);
  }
  .paywall-vignette {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse at 50% 28%, rgba(255,255,255,0.75) 0%, transparent 60%),
      radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.28) 100%);
    pointer-events: none;
  }

  .paywall-content {
    position: relative;
    min-height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: clamp(28px, 5vw, 56px) 18px;
    z-index: 2;
  }

  .paywall-card {
    width: 100%; max-width: 420px;
    background: rgba(255,255,255,0.94);
    border: 0.5px solid rgba(0,0,0,0.16);
    border-radius: 20px;
    padding: clamp(24px, 4vw, 34px) clamp(22px, 4vw, 30px);
    backdrop-filter: blur(8px) saturate(105%);
    -webkit-backdrop-filter: blur(8px) saturate(105%);
    box-shadow:
      0 1px 0 rgba(255,255,255,0.45) inset,
      0 12px 36px rgba(0,0,0,0.18);
    color: #000000;
  }

  .pw-title {
    font-family: 'Bodoni Moda', serif; font-weight: 400;
    font-size: clamp(26px, 4vw, 30px);
    letter-spacing: -0.01em; line-height: 1.05;
    margin: 0 0 4px;
    text-align: center;
    color: #000000;
  }
  .pw-sub {
    font-family: 'Bodoni Moda', serif; font-style: italic;
    font-size: 14px;
    margin: 0 0 22px;
    text-align: center;
    color: rgba(0,0,0,0.65);
  }

  /* Plan cards */
  .pw-plans {
    display: flex; flex-direction: column; gap: 12px;
    margin-bottom: 20px;
  }
  .pw-plan {
    appearance: none;
    text-align: left;
    width: 100%;
    background: rgba(255,255,255,0.85);
    border: 1px solid rgba(0,0,0,0.18);
    border-radius: 14px;
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color .14s ease, background .14s ease, transform .14s ease;
    font: inherit; color: inherit;
  }
  .pw-plan:hover {
    border-color: rgba(0,0,0,0.4);
    background: rgba(255,255,255,0.95);
  }
  .pw-plan.is-selected {
    border-color: #000000;
    border-width: 1.5px;
    padding: 13.5px 15.5px;
    background: #ffffff;
    box-shadow: 0 6px 20px rgba(0,0,0,0.08);
  }
  .pw-plan-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .pw-plan-label {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: rgba(0,0,0,0.7);
  }
  .pw-plan.is-selected .pw-plan-label { color: #000000; }
  .pw-badge {
    display: inline-block;
    background: #000000;
    color: #f4f4f4;
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .pw-trial-pill {
    font-size: 11px; font-weight: 500;
    letter-spacing: 0.04em;
    color: rgba(0,0,0,0.65);
    padding: 3px 8px;
    border: 0.5px solid rgba(0,0,0,0.22);
    border-radius: 999px;
  }
  .pw-price {
    display: flex; align-items: baseline; gap: 6px;
    margin: 2px 0 4px;
  }
  .pw-price-main {
    font-family: 'Bodoni Moda', serif;
    font-size: 28px; font-weight: 500;
    letter-spacing: -0.015em;
    color: #000000;
  }
  .pw-price-per {
    font-size: 13px;
    color: rgba(0,0,0,0.55);
  }
  .pw-equiv {
    font-size: 12px; font-style: italic;
    color: rgba(0,0,0,0.55);
    margin-bottom: 4px;
  }
  .pw-note {
    font-size: 11px; line-height: 1.4;
    color: rgba(0,0,0,0.55);
  }

  /* Benefits */
  .pw-benefits {
    list-style: none;
    padding: 0;
    margin: 0 0 22px;
    border-top: 0.5px solid rgba(0,0,0,0.12);
    padding-top: 16px;
  }
  .pw-benefits li {
    position: relative;
    padding-left: 22px;
    font-size: 13px;
    line-height: 1.6;
    color: rgba(0,0,0,0.78);
  }
  .pw-benefits li::before {
    content: '';
    position: absolute;
    left: 0; top: 0.6em;
    width: 12px; height: 1.5px;
    background: #000000;
  }

  /* CTA */
  .pw-cta {
    display: inline-flex; align-items: center; justify-content: center;
    width: 100%;
    height: 48px; padding: 0 18px;
    background: #000000;
    color: #f4f4f4;
    border: 0.5px solid #000000;
    border-radius: 999px;
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 500; font-size: 14px; letter-spacing: 0.06em;
    cursor: pointer;
    transition: background .12s ease, transform .12s ease;
  }
  .pw-cta:hover:not(:disabled) {
    background: #1a1a1a;
    transform: translateY(-1px);
  }
  .pw-cta:disabled { opacity: 0.55; cursor: not-allowed; }

  .pw-error {
    margin-bottom: 12px;
    color: #5a0a18;
    font-size: 13px;
    background: rgba(90,10,24,0.06);
    border: 0.5px solid rgba(90,10,24,0.2);
    border-radius: 8px;
    padding: 8px 10px;
  }

  .pw-disclosure {
    margin: 16px 0 0;
    font-size: 11px; line-height: 1.55;
    color: rgba(0,0,0,0.55);
    text-align: center;
  }

  .pw-foot {
    margin-top: 14px; padding-top: 14px;
    border-top: 0.5px solid rgba(0,0,0,0.12);
    display: flex; justify-content: center; gap: 10px;
    font-size: 11px;
    color: rgba(0,0,0,0.55);
  }
  .pw-foot-link {
    color: rgba(0,0,0,0.7);
    text-decoration: none;
    border-bottom: 0.5px dotted rgba(0,0,0,0.35);
  }
  .pw-foot-link:hover { color: #000000; }
`;
