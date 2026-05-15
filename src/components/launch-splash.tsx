// Linette — Launch Splash.
//
// Editorial / atelier-grade splash animation. The target reference is
// not "tech app loading" but "couture house masthead": the brand mark
// is being SIGNED in front of the user, not "appearing." Multi-layer
// entry, brief held breath, then a parallax zoom-through exit that
// hands off to the page beneath.
//
// Entry sequence (~1100ms total):
//   - t=0    Pattern + white surface visible. Everything else hidden.
//   - t=80   Hairline rules sweep in horizontally above/below where
//            LINETTE will land (scaleX 0 → 1, 320ms).
//   - t=120  Disc border ink-draws via SVG stroke-dasharray (700ms).
//            This is the signature couturier-signature moment.
//   - t=320  L glyph fades in + settles from scale 0.94 (480ms).
//   - t=520  Linette wordmark (Parisienne script) opacity-fades + nudges
//            up 4px (700ms). Script glyphs can't have letter-spacing
//            animated without breaking the joins between letters.
//   - t=720  Top tag fades in (440ms).
//
// Hold (1000ms): static brand moment.
//
// Exit (850ms): textile scales 1 → 1.25, content scales 1 → 1.7 with
// fade. Differential rates create parallax depth — the user feels
// pulled forward through the brand mark into the app underneath.
//
// First-time visitors only. The inline script in layout.tsx adds
// .skip-splash to <html> when sessionStorage shows the splash has
// already played this session, so subsequent navigations never even
// flicker the splash. SSR renders the splash in its initial pose so
// the underlying login/home page doesn't flash through during
// hydration.
"use client";

import * as React from "react";
import { PatternRoseDamask, type Palette } from "@/components/brand/patterns";

const BRAND_PALETTE: Palette = [
  "#ffffff", // bg — pure white
  "#f4f4f4", // hi
  "#000000", "#000000", "#000000", "#000000",
  "#1a1a1a", // stem (lattice hairlines)
  "#000000", // damask motif
];

const ENTRY_MS = 1100; // sum of staggered entry animations
const HOLD_MS = 1000;
const EXIT_MS = 850;
const SESSION_KEY = "linette_splash_seen";

type Phase = "entering" | "held" | "exiting" | "done";

export function LaunchSplash() {
  const [phase, setPhase] = React.useState<Phase>("entering");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setPhase("done");
    }
  }, []);

  React.useEffect(() => {
    if (phase === "entering") {
      // Hold the splash on screen for the full entry animation, then
      // settle into the static "held" state. The CSS keyframes already
      // run on mount; we just need to flip to "held" so the entry
      // classes don't keep re-applying.
      const t = setTimeout(() => setPhase("held"), ENTRY_MS);
      return () => clearTimeout(t);
    }
    if (phase === "held") {
      const t = setTimeout(() => setPhase("exiting"), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === "exiting") {
      const t = setTimeout(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          // sessionStorage can throw in private/incognito.
        }
        setPhase("done");
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === "done") return null;

  return (
    <>
      <style>{SPLASH_CSS}</style>
      <div
        className={`launch-splash ls-${phase}`}
        aria-hidden={phase === "exiting"}
        role="presentation"
      >
        <div className="ls-pat">
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="ls-vignette" />

        <div className="ls-content">
          {/* Top eyebrow + tagline */}
          <div className="ls-top-tag">
            <div className="ls-tag">Your AI Stylist</div>
            <div className="ls-small">for the closet you already own</div>
          </div>

          {/* Logo block: monogram + hairline rules + wordmark */}
          <div className="ls-logo-block">
            <SplashMonogram />

            <div className="ls-brand">
              <div className="ls-rules">
                <span className="ls-rule ls-rule-left" />
                <h1 className="ls-name">Linette</h1>
                <span className="ls-rule ls-rule-right" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Custom SVG monogram for the splash — separate from the shared
// <Monogram> so we can ink-draw the disc border with stroke-dasharray
// without polluting the shared component used in auth shells / nav.
// Render order matters: outer disc border draws first (the
// "couturier's circle"), then inner cream disc fills, then the Bodoni
// C fades in on top.
function SplashMonogram() {
  // Circle radius 130, circumference = 2πr ≈ 816.81. Used for the
  // path-draw via stroke-dasharray.
  const RADIUS = 130;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <svg
      className="ls-mono"
      width={270}
      height={270}
      viewBox="0 0 270 270"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Inner solid disc (white) — fades in after the border draws,
          covers any lattice that would peek through the bordered
          variant in the shared component. */}
      <circle
        className="ls-disc"
        cx={135}
        cy={135}
        r={RADIUS - 2}
        fill="#ffffff"
      />
      {/* Outer disc border — path-draws via stroke-dasharray. */}
      <circle
        className="ls-disc-border"
        cx={135}
        cy={135}
        r={RADIUS}
        fill="none"
        stroke="#000000"
        strokeWidth={2}
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC}
        strokeLinecap="round"
      />
      {/* Inner hairline ring — the second ring inside the border, draws
          slightly later for a "twin ring" couture detail. */}
      <circle
        className="ls-disc-inner"
        cx={135}
        cy={135}
        r={RADIUS - 12}
        fill="none"
        stroke="#000000"
        strokeWidth={0.8}
        strokeOpacity={0.55}
        strokeDasharray={2 * Math.PI * (RADIUS - 12)}
        strokeDashoffset={2 * Math.PI * (RADIUS - 12)}
      />
      {/* Four cardinal dots inside the disc */}
      <g className="ls-dots">
        <circle cx={135} cy={11.5} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={135} cy={258.5} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={11.5} cy={135} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={258.5} cy={135} r={2.1} fill="#000000" fillOpacity={0.85} />
      </g>
      {/* The Parisienne L — baked path (not live <text>) so the splash,
          home-screen icon, and PWA splash all render the exact same
          glyph. Path data is the same extract used in icon.svg /
          public/icon.svg (scripts/extract-l-path.mjs, fontSize 200,
          original center (200,200) in a 400×400 viewBox). The wrapper
          translate (-65,-65) re-centers it on this splash's disc
          origin at (135,135). */}
      <g transform="translate(-65 -65)">
        {/* Inner group carries the .ls-c fade+scale animation. Splitting
            positioning (outer) from animation (inner) avoids the CSS
            transform overriding the SVG transform attribute mid-animation. */}
        <g className="ls-c">
          <path
            fill="#000000"
            d="M215.53 277.54L215.53 277.54Q209.18 277.54 202.69 276.42Q196.19 275.29 189.55 273.49Q182.91 271.68 176.27 269.53Q169.63 267.38 163.18 265.33L163.18 265.33Q155.47 270.02 147.07 272.71Q138.67 275.39 129.39 275.39L129.39 275.39Q121.48 275.39 117.29 272.56Q113.09 269.73 113.09 265.04L113.09 265.04Q113.09 258.89 119.92 255.57Q126.76 252.25 140.63 252.25L140.63 252.25Q146.68 252.25 152.83 253.13Q158.98 254.00 165.33 255.37L165.33 255.37Q171.48 250 177.05 243.26Q182.62 236.52 187.89 228.81L187.89 228.81Q183.89 229.30 179.79 229.54Q175.68 229.79 171.48 229.79L171.48 229.79Q156.15 229.79 144.14 226.12Q132.13 222.46 123.83 216.06Q115.53 209.67 111.18 201.03Q106.84 192.38 106.84 182.42L106.84 182.42Q106.84 170.70 111.33 161.62Q115.82 152.54 123.68 146.34Q131.54 140.14 142.19 136.87Q152.83 133.59 165.04 133.59L165.04 133.59Q172.75 133.59 179.10 134.77Q185.45 135.94 190.09 137.30Q194.73 138.67 197.36 139.94Q200 141.21 200.29 141.31L200.29 141.31L197.75 145.70Q197.66 145.70 195.31 144.58Q192.97 143.46 188.87 142.19Q184.77 140.92 179.10 139.84Q173.44 138.77 166.89 138.77L166.89 138.77Q155.37 138.77 146.24 142.14Q137.11 145.51 130.81 151.37Q124.51 157.23 121.14 165.09Q117.77 172.95 117.77 181.84L117.77 181.84Q117.77 191.80 122.36 199.66Q126.95 207.52 134.67 212.94Q142.38 218.36 152.59 221.19Q162.79 224.02 174.02 224.02L174.02 224.02Q178.61 224.02 183.06 223.73Q187.50 223.44 191.89 222.75L191.89 222.75Q198.83 211.91 205.32 200.29Q211.82 188.67 218.26 177.54Q224.71 166.41 231.25 156.40Q237.79 146.39 244.87 138.87Q251.95 131.35 259.77 126.90Q267.58 122.46 276.56 122.46L276.56 122.46Q280.08 122.46 283.11 123.58Q286.13 124.71 288.38 127.00Q290.63 129.30 291.89 132.81Q293.16 136.33 293.16 141.02L293.16 141.02Q293.16 148.63 290.23 157.08Q287.30 165.53 281.74 173.97Q276.17 182.42 268.16 190.58Q260.16 198.73 250 205.66Q239.84 212.60 227.73 218.02Q215.63 223.44 201.95 226.46L201.95 226.46Q195.51 235.35 188.67 243.21Q181.84 251.07 174.22 257.42L174.22 257.42Q181.64 259.38 188.77 261.57Q195.90 263.77 202.29 265.58Q208.69 267.38 214.16 268.60Q219.63 269.82 223.83 269.82L223.83 269.82Q230.08 269.82 235.89 267.68Q241.70 265.53 247.46 260.06L247.46 260.06L251.46 263.18Q251.37 263.28 250.39 264.40Q249.41 265.53 247.46 267.14Q245.51 268.75 242.58 270.56Q239.65 272.36 235.69 273.93Q231.74 275.49 226.71 276.51Q221.68 277.54 215.53 277.54ZM276.95 127.83L276.95 127.83Q271.48 127.83 266.11 131.74Q260.74 135.64 255.27 142.33Q249.80 149.02 244.19 158.06Q238.57 167.09 232.62 177.29Q226.66 187.50 220.21 198.34Q213.77 209.18 206.74 219.63L206.74 219.63Q218.46 216.41 229.05 211.23Q239.65 206.05 248.68 199.61Q257.71 193.16 264.99 185.79Q272.27 178.42 277.39 170.70Q282.52 162.99 285.25 155.42Q287.99 147.85 287.99 140.92L287.99 140.92Q287.99 137.30 287.11 134.81Q286.23 132.32 284.72 130.76Q283.20 129.20 281.20 128.52Q279.20 127.83 276.95 127.83ZM128.81 270.31L128.81 270.31Q136.04 270.31 142.48 268.31Q148.93 266.31 154.98 262.79L154.98 262.79Q148.54 260.94 142.53 259.77Q136.52 258.59 130.96 258.59L130.96 258.59Q124.32 258.59 121.24 260.55Q118.16 262.50 118.16 265.04L118.16 265.04Q118.16 265.82 118.60 266.75Q119.04 267.68 120.21 268.46Q121.39 269.24 123.44 269.78Q125.49 270.31 128.81 270.31Z"
          />
        </g>
      </g>
    </svg>
  );
}

const SPLASH_CSS = `
  /* Returning users skip the splash entirely — the inline script in
     layout.tsx adds .skip-splash to <html> when sessionStorage shows
     this session has already seen the splash. CSS hides it instantly. */
  html.skip-splash .launch-splash { display: none !important; }

  .launch-splash {
    position: fixed; inset: 0; z-index: 9999;
    overflow: hidden;
    background: #ffffff;
    pointer-events: auto;
    transition: opacity 550ms cubic-bezier(0.6, 0.04, 0.98, 0.34) 200ms;
    will-change: opacity;
  }
  .launch-splash.ls-exiting {
    opacity: 0;
    pointer-events: none;
  }

  /* Pattern parallax — slower zoom than content for depth-of-field. */
  .ls-pat {
    position: absolute; inset: 0;
    will-change: transform, opacity;
    opacity: 0;
    transform: scale(1.04);
    animation: ls-pat-in 900ms cubic-bezier(0.16, 1, 0.3, 1) 100ms forwards;
  }
  .ls-held .ls-pat {
    opacity: 0.95;
    transform: scale(1);
  }
  .ls-exiting .ls-pat {
    opacity: 0.95;
    transform: scale(1.25);
    transition:
      transform 850ms cubic-bezier(0.6, 0.04, 0.98, 0.34),
      opacity 600ms ease 250ms;
  }

  .ls-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.18) 100%);
    pointer-events: none;
  }

  /* Content layer — exits with aggressive zoom for the portal feel. */
  .ls-content {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center;
    padding: 86px 40px 68px;
    color: #000000;
    will-change: transform, opacity;
  }
  .ls-exiting .ls-content {
    transform: scale(1.7);
    opacity: 0;
    transition:
      transform 850ms cubic-bezier(0.6, 0.04, 0.98, 0.34),
      opacity 850ms cubic-bezier(0.7, 0, 0.84, 0);
  }

  /* ─── Entry keyframes ─────────────────────────────────────────────── */

  @keyframes ls-pat-in {
    0%   { opacity: 0; transform: scale(1.04); }
    100% { opacity: 0.95; transform: scale(1); }
  }
  @keyframes ls-rule-in {
    0%   { transform: scaleX(0); opacity: 0; }
    100% { transform: scaleX(1); opacity: 1; }
  }
  @keyframes ls-disc-draw {
    0%   { stroke-dashoffset: var(--circ); opacity: 1; }
    100% { stroke-dashoffset: 0;            opacity: 1; }
  }
  @keyframes ls-disc-fill {
    0%   { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes ls-c-in {
    0%   { opacity: 0; transform: scale(0.94); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes ls-name-in {
    0%   { opacity: 0; transform: translateY(4px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes ls-fade-in {
    0%   { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes ls-fade-up {
    0%   { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* ─── Top eyebrow + tagline ──────────────────────────────────────── */

  .ls-top-tag { text-align: center; opacity: 0;
    animation: ls-fade-up 440ms cubic-bezier(0.16,1,0.3,1) 720ms forwards; }
  .ls-tag {
    font-family: var(--font-sans, 'Inter'), system-ui, sans-serif;
    font-size: 11px; letter-spacing: 0.38em; text-transform: uppercase;
    opacity: 0.82;
  }
  .ls-small {
    font-family: var(--font-heading, 'Bodoni Moda'), serif; font-style: italic;
    font-size: 14px; opacity: 0.78;
    margin-top: 12px;
  }

  /* ─── Logo block ─────────────────────────────────────────────────── */

  .ls-logo-block {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -135px);
    display: flex; flex-direction: column; align-items: center;
    gap: 28px;
  }

  /* The custom SVG monogram. */
  .ls-mono {
    display: block;
    overflow: visible;
  }

  /* Inner cream disc — fades in just AFTER the border completes
     drawing, otherwise it would cover the stroke and you'd see no
     ink-draw effect. */
  .ls-disc {
    opacity: 0;
    animation: ls-disc-fill 280ms ease-out 720ms forwards;
  }

  /* Outer border — path-draws on entry. The CSS variable --circ holds
     the precomputed circumference (≈816.81 for r=130) so the
     stroke-dashoffset keyframes target the right value. */
  .ls-disc-border {
    --circ: 816.81;
    animation: ls-disc-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) 120ms forwards;
  }
  /* Inner hairline ring — draws a touch later than the border. */
  .ls-disc-inner {
    --circ: 741.42;
    animation: ls-disc-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) 240ms forwards;
  }
  .ls-dots {
    opacity: 0;
    animation: ls-fade-in 320ms ease-out 800ms forwards;
  }
  /* The L glyph — fades + scales in after the disc starts filling.
     transform-box:fill-box + transform-origin:center makes the scale
     happen around the glyph's geometric center rather than the SVG
     viewport origin. Duration is intentionally long (1100ms) with an
     ease-in-out bell curve so the letter EMERGES gradually rather
     than snapping in — gives the etched / ghosted feel of an inked
     stamp settling. */
  .ls-c {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: ls-c-in 1100ms cubic-bezier(0.4, 0, 0.4, 1) 720ms forwards;
  }

  /* ─── Brand block (hairlines + wordmark + sub) ───────────────────── */

  .ls-brand {
    text-align: center;
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }

  /* Hairline rules + wordmark on one row — two 1px black lines flank
     LINETTE and animate in BEFORE the wordmark settles, like the
     letter-spacing on a Vogue masthead. */
  .ls-rules {
    display: flex; align-items: center; gap: 18px;
  }
  .ls-rule {
    width: 36px; height: 0.5px;
    background: #000000; opacity: 0.55;
    transform-origin: center;
    transform: scaleX(0); opacity: 0;
    animation: ls-rule-in 320ms cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards;
  }
  .ls-rule-right {
    animation-delay: 160ms; /* slight stagger so the eye reads ←·→ */
  }

  .ls-name {
    margin: 0;
    /* Parisienne script — same hand as the L inside the disc above.
       No letter-spacing on a script (it breaks the joins between
       glyphs). Larger font-size than the old Bodoni treatment to
       compensate for Parisienne's smaller x-height. */
    font-family: 'Parisienne', 'Snell Roundhand', cursive;
    font-weight: 400;
    font-size: 68px;
    color: #000000; line-height: 1;
    opacity: 0;
    animation: ls-name-in 700ms cubic-bezier(0.16, 1, 0.3, 1) 520ms forwards;
    white-space: nowrap;
  }
  /* Respect motion-reduction preference — drop all keyframes, just
     fade the splash in/out. */
  @media (prefers-reduced-motion: reduce) {
    .ls-pat, .ls-disc, .ls-disc-border, .ls-disc-inner, .ls-dots,
    .ls-c, .ls-rule, .ls-name, .ls-top-tag {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
      stroke-dashoffset: 0 !important;
    }
    .ls-name { letter-spacing: 0.14em !important; }
    .launch-splash, .ls-content {
      transition: opacity 400ms ease !important;
    }
    .ls-exiting .ls-content { transform: none !important; }
    .ls-exiting .ls-pat { transform: none !important; }
  }
`;
