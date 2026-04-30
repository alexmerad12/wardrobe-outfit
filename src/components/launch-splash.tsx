// Closette — Launch Splash.
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
//            CLOSETTE will land (scaleX 0 → 1, 320ms).
//   - t=120  Disc border ink-draws via SVG stroke-dasharray (700ms).
//            This is the signature couturier-signature moment.
//   - t=320  C glyph fades in + settles from scale 0.94 (480ms).
//   - t=520  CLOSETTE letter-spacing tightens 0.55em → 0.14em with
//            opacity fade-in (700ms). The "fashion house masthead"
//            cadence (Vogue, Dior).
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
const SESSION_KEY = "closette_splash_seen";

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
                <h1 className="ls-name">CLOSETTE</h1>
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
      {/* The Bodoni C — fades + settles in from a slightly small scale
          so it lands on the disc with a "settling weight" feel. */}
      <text
        className="ls-c"
        x={135}
        y={135}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Bodoni Moda','Bodoni 72',Didot,'Times New Roman',Georgia,serif"
        fontWeight={400}
        fontSize={200}
        fill="#000000"
        style={{ letterSpacing: "-0.03em" }}
      >
        C
      </text>
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
    0%   { opacity: 0; letter-spacing: 0.55em; }
    100% { opacity: 1; letter-spacing: 0.14em; }
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
  /* The C glyph — fades + scales in after the disc starts filling.
     transform-box:fill-box + transform-origin:center makes the scale
     happen around the glyph's geometric center rather than the SVG
     viewport origin. */
  .ls-c {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: ls-c-in 480ms cubic-bezier(0.16, 1, 0.3, 1) 800ms forwards;
  }

  /* ─── Brand block (hairlines + wordmark + sub) ───────────────────── */

  .ls-brand {
    text-align: center;
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }

  /* Hairline rules + wordmark on one row — two 1px black lines flank
     CLOSETTE and animate in BEFORE the wordmark settles, like the
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
    font-family: var(--font-heading, 'Bodoni Moda'), serif; font-weight: 400;
    font-size: 42px; letter-spacing: 0.55em;
    color: #000000; line-height: 1;
    /* The signature move: letter-spacing tightens from 0.55em to 0.14em
       while the wordmark fades in. Reads as the masthead "settling"
       into place. */
    opacity: 0;
    animation: ls-name-in 700ms cubic-bezier(0.16, 1, 0.3, 1) 520ms forwards;
    /* Compensate the layout-shift that letter-spacing animation causes
       — keep the centerline stable by fixing the rendering. The font
       still reflows but the visual effect is what matters. */
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
