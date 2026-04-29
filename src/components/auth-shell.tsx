// Closette — auth shell.
// Shared Ivory · Noir framing for /login and /signup. Same brand identity
// as /launch (ivory ground, ink C in Bodoni, faint Rose & Damask backdrop)
// so the auth flow feels like one continuous maison.
"use client";

import * as React from "react";
import { PatternRoseDamask, type Palette } from "@/components/brand/patterns";
import { Monogram } from "@/components/brand/monogram";

const BRAND_PALETTE: Palette = [
  "#ffffff", // bg — pure white
  "#f4f4f4", // hi
  "#000000", "#000000", "#000000", "#000000",
  "#1a1a1a", // stem (lattice hairlines)
  "#000000", // damask motif
];

export function AuthShell({
  eyebrow,
  children,
}: {
  eyebrow?: string; // small uppercase line above the masthead, optional
  children: React.ReactNode;
}) {
  return (
    <>
      <style>{AUTH_CSS}</style>
      <div className="auth-shell">
        <div className="auth-wall" aria-hidden="true">
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="auth-vignette" aria-hidden="true" />

        <div className="auth-content">
          <header className="auth-mast">
            {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
            <div className="auth-logo">
              <Monogram
                variant="bordered-solid"
                size={86}
                letter="C"
                color="#000000"
                innerFill="#ffffff"
                fontFamily='"Bodoni Moda", "Bodoni 72", "Didot", serif'
                frame="rgba(0,0,0,0.92)"
              />
            </div>
            <h1 className="auth-wordmark">CLOSETTE</h1>
            <span className="auth-rule" />
            <p className="auth-tagline"><em>une garde-robe bien tenue</em></p>
          </header>

          <main className="auth-card">{children}</main>

          <footer className="auth-foot">
            <span>MMXXVI</span>
            <span className="dot">·</span>
            <span>une bonne tenue</span>
          </footer>
        </div>
      </div>
    </>
  );
}

const AUTH_CSS = `
  .auth-shell {
    position: fixed; inset: 0;
    background: #ffffff;
    color: #000000;
    font-family: 'Inter', system-ui, sans-serif;
    overflow-y: auto;
    z-index: 50;
  }
  .auth-wall {
    position: absolute; inset: 0;
    opacity: 0.42;
    filter: saturate(0.85);
  }
  .auth-vignette {
    position: absolute; inset: 0;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.7) 0%, transparent 60%),
      radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.28) 100%);
    pointer-events: none;
  }

  .auth-content {
    position: relative;
    min-height: 100%;
    display: flex; flex-direction: column;
    align-items: center;
    padding: clamp(28px, 5vw, 56px) 20px;
    gap: 24px;
    z-index: 2;
  }

  /* Masthead */
  .auth-mast {
    display: flex; flex-direction: column; align-items: center;
    gap: 10px;
    text-align: center;
  }
  .auth-eyebrow {
    font-size: 10px; letter-spacing: 0.34em; text-transform: uppercase;
    color: rgba(0,0,0,0.55);
  }
  .auth-logo { margin: 4px 0 10px; }
  .auth-wordmark {
    margin: 0;
    font-family: 'Bodoni Moda', 'Bodoni 72', 'Didot', serif;
    font-weight: 400;
    font-size: clamp(26px, 3.4vw, 32px);
    letter-spacing: 0.22em;
    color: #000000;
    line-height: 1;
  }
  .auth-rule {
    width: 22px; height: 0.5px;
    background: rgba(0,0,0,0.55);
    margin: 2px 0;
  }
  .auth-tagline {
    margin: 0;
    font-family: 'Bodoni Moda', serif;
    font-style: italic;
    font-size: 14px;
    color: rgba(0,0,0,0.78);
  }

  /* Card */
  .auth-card {
    width: 100%; max-width: 380px;
    background: rgba(255,255,255,0.92);
    border: 0.5px solid rgba(0,0,0,0.16);
    border-radius: 18px;
    padding: clamp(22px, 3vw, 32px);
    backdrop-filter: blur(8px) saturate(105%);
    -webkit-backdrop-filter: blur(8px) saturate(105%);
    box-shadow:
      0 1px 0 rgba(255,255,255,0.45) inset,
      0 12px 36px rgba(0,0,0,0.18);
    color: #000000;
  }

  /* Form controls inside the card — restyled to match the brand. The auth
     pages still use Tailwind for layout, but anything that hits these
     element selectors gets the ivory/ink treatment. */
  .auth-card h2 {
    font-family: 'Bodoni Moda', serif; font-weight: 400;
    font-size: 26px; letter-spacing: -0.01em;
    margin: 0 0 4px; line-height: 1.05;
    color: #000000;
    text-align: center;
  }
  .auth-card .auth-sub {
    font-family: 'Bodoni Moda', serif; font-style: italic;
    font-size: 14px; margin: 0 0 22px;
    color: rgba(0,0,0,0.65);
    text-align: center;
  }
  .auth-card label {
    color: rgba(0,0,0,0.75);
    font-size: 12px; font-weight: 500;
    letter-spacing: 0.04em;
  }
  .auth-card input[type="email"],
  .auth-card input[type="password"],
  .auth-card input[type="text"] {
    width: 100%;
    background: rgba(255,255,255,0.85);
    border: 0.5px solid rgba(0,0,0,0.22);
    border-radius: 10px;
    padding: 11px 12px;
    font: inherit;
    color: #000000;
    transition: border-color .12s ease, background .12s ease;
  }
  .auth-card input:focus {
    outline: none;
    border-color: rgba(0,0,0,0.6);
    background: rgba(255,255,255,1);
  }
  .auth-card .auth-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 18px 0;
    color: rgba(0,0,0,0.5);
    font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;
  }
  .auth-card .auth-divider::before,
  .auth-card .auth-divider::after {
    content: ''; flex: 1; height: 0.5px;
    background: rgba(0,0,0,0.22);
  }
  .auth-card .auth-primary {
    display: inline-flex; align-items: center; justify-content: center;
    width: 100%;
    height: 44px; padding: 0 18px;
    background: #000000;
    color: #f4f4f4;
    border: 0.5px solid #000000;
    border-radius: 999px;
    font-family: 'Inter', system-ui, sans-serif;
    font-weight: 500; font-size: 13px; letter-spacing: 0.04em;
    cursor: pointer;
    transition: background .12s ease, transform .12s ease;
  }
  .auth-card .auth-primary:hover:not(:disabled) {
    background: #1a1a1a;
    transform: translateY(-1px);
  }
  .auth-card .auth-primary:disabled { opacity: 0.55; cursor: not-allowed; }

  .auth-card .auth-google {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 10px;
    width: 100%; height: 44px; padding: 0 16px;
    background: rgba(255,255,255,0.92);
    border: 0.5px solid rgba(0,0,0,0.22);
    border-radius: 999px;
    color: #000000;
    font-weight: 500; font-size: 13px;
    cursor: pointer;
    transition: background .12s ease, border-color .12s ease;
  }
  .auth-card .auth-google:hover:not(:disabled) {
    background: #fafafa;
    border-color: rgba(0,0,0,0.4);
  }

  .auth-card .auth-error {
    color: #5a0a18;
    font-size: 13px;
    background: rgba(90,10,24,0.06);
    border: 0.5px solid rgba(90,10,24,0.2);
    border-radius: 8px;
    padding: 8px 10px;
  }

  .auth-card .auth-link {
    color: #000000;
    font-weight: 500;
    border-bottom: 0.5px dotted rgba(0,0,0,0.4);
    text-decoration: none;
  }
  .auth-card .auth-link:hover { border-bottom-color: #000000; }

  .auth-card .auth-foot-note {
    margin-top: 18px;
    font-size: 13px; text-align: center;
    color: rgba(0,0,0,0.65);
  }

  .auth-card .auth-terms {
    margin-top: 22px; padding-top: 18px;
    border-top: 0.5px solid rgba(0,0,0,0.16);
    font-size: 11px; line-height: 1.5; text-align: center;
    color: rgba(0,0,0,0.55);
  }
  .auth-card .auth-terms a {
    color: rgba(0,0,0,0.78);
    border-bottom: 0.5px dotted rgba(0,0,0,0.35);
    text-decoration: none;
  }

  /* Footer */
  .auth-foot {
    display: flex; gap: 10px; align-items: center;
    font-family: 'Bodoni Moda', serif; font-style: italic;
    font-size: 12px;
    color: rgba(0,0,0,0.5);
  }
  .auth-foot .dot { opacity: 0.6; }
`;
