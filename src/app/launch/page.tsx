// Closette — launch page.
// The first thing a visitor sees. The committed brand identity is
// Ivory · Noir on Rose & Damask: ivory ground, ink damask, centered
// black Bodoni C inside an opaque ivory disc. Editorial, quiet, exact.
"use client";

import * as React from "react";
import Link from "next/link";
import { PatternRoseDamask, type Palette } from "@/components/brand/patterns";
import { Monogram } from "@/components/brand/monogram";

// The committed brand palette — same shape the Rose & Damask renderer
// expects: [bg, petalHi, _, _, _, _, stem, damaskMotif].
const BRAND_PALETTE: Palette = [
  "#ebe0c8", // bg — ivory
  "#f8efd6", // petalHi
  "#0a0806", "#0a0806", "#0a0806", "#0a0806",
  "#3a2a1e", // stem — warm dark for the diamond hairlines
  "#0a0806", // damaskMotif — ink
];

const BRAND = {
  ink: "#0a0806",
  ivory: "#ebe0c8",
  ivoryHi: "#f8efd6",
  hairline: "rgba(10,8,6,0.18)",
  hairlineHi: "rgba(10,8,6,0.45)",
  bodoni: '"Bodoni Moda", "Bodoni 72", "Didot", serif',
} as const;

export default function LaunchPage() {
  return (
    <>
      <style>{LAUNCH_CSS}</style>
      <div className="launch">
        {/* Full-bleed wallpaper, soft-blurred so it reads as backdrop, not
            content. The vignette darkens corners just enough to let the
            centered logo group sit forward. */}
        <div className="launch-wall" aria-hidden="true">
          {/* viewBox 2400×2400 makes each damask tile ~75–90px on a 1920px-
              wide screen (vs the default ~430px which is calibrated for an
              icon tile). The result reads as a delicate textile backdrop
              rather than a poster. */}
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="launch-vignette" aria-hidden="true" />

        <div className="launch-content">
          <header className="launch-mast">
            <span className="eyebrow">Maison de garde-robe</span>
            <span className="rule" />
            <span className="eyebrow alt">MMXXVI · Paris</span>
          </header>

          <section className="launch-hero">
            <div className="launch-logo">
              <Monogram
                variant="bordered-solid"
                size={260}
                letter="C"
                color={BRAND.ink}
                innerFill={BRAND.ivory}
                fontFamily={BRAND.bodoni}
                frame="rgba(10,8,6,0.92)"
              />
            </div>

            <h1 className="launch-wordmark">CLOSETTE</h1>
            <span className="launch-rule" />
            <p className="launch-tagline">
              <em>une garde-robe bien tenue</em>
            </p>

            <p className="launch-blurb">
              A digital wardrobe — your clothes, beautifully kept. Outfit
              suggestions tuned to weather, mood, and the shape of your day.
            </p>

            <div className="launch-cta">
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
            </div>
          </section>

          <footer className="launch-foot">
            <span>depuis MMXXVI</span>
            <span className="dot">·</span>
            <span>une bonne tenue</span>
            <span className="dot">·</span>
            <Link href="/privacy" className="foot-link">Privacy</Link>
            <span className="dot">·</span>
            <Link href="/terms" className="foot-link">Terms</Link>
          </footer>
        </div>
      </div>
    </>
  );
}

const LAUNCH_CSS = `
  .launch {
    /* Cover the whole viewport including the app's BottomNav so the launch
       page feels like a true landing surface, not an embedded panel. */
    position: fixed; inset: 0;
    background: #ebe0c8;
    color: #0a0806;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow-y: auto;
    z-index: 9999;
  }

  /* Full-bleed wallpaper. The pattern already ships its own grain and
     vignette; we just dial saturation back so it reads as backdrop. */
  .launch-wall {
    position: absolute; inset: 0;
    opacity: 0.66;
    filter: saturate(0.88);
  }
  .launch-vignette {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse at 50% 35%, rgba(235,224,200,0.55) 0%, transparent 55%),
      radial-gradient(ellipse at center, transparent 55%, rgba(58,42,30,0.32) 100%);
    pointer-events: none;
  }

  .launch-content {
    position: relative;
    min-height: 100%;
    display: flex; flex-direction: column;
    justify-content: space-between;
    align-items: stretch;
    gap: 24px;
    padding: clamp(20px, 4vw, 56px) clamp(20px, 5vw, 72px);
    z-index: 2;
  }
  .launch-hero {
    flex: 1 1 auto;
  }

  /* ── Masthead ── */
  .launch-mast {
    display: flex; align-items: center; justify-content: center;
    gap: 18px;
    padding-top: 8px;
  }
  .eyebrow {
    font-family: 'Inter', sans-serif;
    font-size: 10px;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: rgba(10,8,6,0.7);
  }
  .eyebrow.alt { color: rgba(10,8,6,0.55); font-variant-numeric: tabular-nums; }
  .rule {
    width: 36px; height: 0.5px; background: rgba(10,8,6,0.45);
  }

  /* ── Hero ── */
  .launch-hero {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center;
    gap: 18px;
    padding: clamp(24px, 4vh, 64px) 0;
  }
  .launch-logo {
    position: relative;
    margin-bottom: 14px;
  }
  /* Soft halo behind the logo so it lifts off the wallpaper. */
  .launch-logo::before {
    content: '';
    position: absolute;
    inset: -28px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(235,224,200,0.55) 0%, transparent 70%);
    z-index: -1;
  }
  .launch-wordmark {
    margin: 0;
    font-family: ${BRAND.bodoni};
    font-weight: 400;
    font-size: clamp(34px, 5.4vw, 64px);
    letter-spacing: 0.22em;
    color: ${BRAND.ink};
    line-height: 1;
  }
  .launch-rule {
    width: 22px; height: 0.5px;
    background: rgba(10,8,6,0.55);
    margin: 4px 0 2px;
  }
  .launch-tagline {
    margin: 0;
    font-family: ${BRAND.bodoni};
    font-style: italic;
    font-size: clamp(15px, 1.8vw, 19px);
    color: rgba(10,8,6,0.78);
    letter-spacing: 0.02em;
  }
  .launch-blurb {
    margin: 14px 0 0;
    max-width: 44ch;
    text-align: center;
    font-size: clamp(13px, 1.4vw, 15px);
    line-height: 1.6;
    color: rgba(10,8,6,0.66);
  }

  /* ── CTAs ── */
  .launch-cta {
    margin-top: 28px;
    display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
  }
  .btn {
    appearance: none;
    display: inline-flex; align-items: center; justify-content: center;
    height: 44px; padding: 0 26px;
    border-radius: 999px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px; font-weight: 500;
    letter-spacing: 0.04em;
    text-decoration: none;
    transition: transform .15s ease, background .15s ease, border-color .15s ease, color .15s ease;
    cursor: pointer;
  }
  .btn-primary {
    background: ${BRAND.ink};
    color: ${BRAND.ivoryHi};
    border: 0.5px solid ${BRAND.ink};
  }
  .btn-primary:hover {
    background: #1a1612;
    transform: translateY(-1px);
  }
  .btn-ghost {
    background: transparent;
    color: ${BRAND.ink};
    border: 0.5px solid rgba(10,8,6,0.55);
  }
  .btn-ghost:hover {
    border-color: ${BRAND.ink};
    background: rgba(10,8,6,0.04);
  }

  /* ── Footer ── */
  .launch-foot {
    display: flex; align-items: center; justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
    padding-bottom: 6px;
    font-family: 'Bodoni Moda', serif;
    font-style: italic;
    font-size: 12px;
    color: rgba(10,8,6,0.5);
  }
  .launch-foot .dot { opacity: 0.55; }
  .foot-link {
    color: inherit; text-decoration: none;
    border-bottom: 0.5px dotted rgba(10,8,6,0.35);
  }
  .foot-link:hover { color: ${BRAND.ink}; border-bottom-color: ${BRAND.ink}; }

  /* Smaller screens: tighten things up. */
  @media (max-width: 520px) {
    .launch-mast { gap: 10px; }
    .launch-mast .eyebrow.alt { display: none; }
    .launch-mast .rule { display: none; }
    .launch-hero { gap: 12px; }
  }
`;
