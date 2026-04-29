// Closette — Launch Splash.
//
// Editorial / atelier-grade splash animation. Designed so the OS-level
// PWA static splash (which shows the home-screen icon centered on
// white while the WebView boots) hands off INVISIBLY to our dynamic
// splash — the dynamic splash's first frame matches the OS render
// (icon at ~150px, centered, on white), then "zooms out" to fill the
// world.
//
// Entry sequence (~1300ms total):
//   - t=0    Frame 1 matches OS splash: monogram visible at scale
//            0.55 (matches OS-rendered icon size), white background,
//            no textile, no rules, no wordmark. User cannot tell the
//            OS splash has ended.
//   - t=0    Monogram zooms outward (scale 0.55 → 1) over 700ms.
//   - t=0    Pattern fades in + settles around the icon (scale 1.04
//            → 1, opacity 0 → 0.95) over 850ms.
//   - t=200  Inner hairline ring inside the disc ink-draws via
//            stroke-dasharray (700ms) — signature couture detail.
//   - t=400  Hairline rules sweep in flanking where CLOSETTE will
//            land (scaleX 0 → 1, 320ms staggered).
//   - t=600  CLOSETTE letter-spacing tightens 0.55em → 0.14em with
//            opacity fade-in (700ms). The Vogue / Dior masthead settle.
//   - t=800  Top tag + bottom sub fade up (440ms).
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

const ENTRY_MS = 1300; // sum of staggered entry animations
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
              <div className="ls-sub">Montréal · 2026</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Custom SVG monogram for the splash — separate from the shared
// <Monogram> so we can do the OS-icon-zoom-out + inner-ring ink-draw
// trick without affecting the auth shell / nav consumers.
//
// Visibility on frame 1 matches what the OS-level static PWA splash
// shows (small home-screen icon centered on white): outer disc border
// + C glyph + cardinal dots are all opaque from the start. The whole
// SVG then scales 0.55 → 1.0 over the entry to "zoom out" of the OS
// render. The inner hairline ring is the only element with an entry
// animation (stroke-dasharray ink-draw) — a signature couture detail
// that appears INSIDE the already-visible disc.
function SplashMonogram() {
  const RADIUS = 130;
  const INNER_RADIUS = RADIUS - 12;
  const INNER_CIRC = 2 * Math.PI * INNER_RADIUS;

  return (
    <svg
      className="ls-mono"
      width={270}
      height={270}
      viewBox="0 0 270 270"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Inner solid disc — opaque white, hides any pattern behind. */}
      <circle cx={135} cy={135} r={RADIUS - 2} fill="#ffffff" />
      {/* Outer disc border — visible from frame 1 to match OS render. */}
      <circle
        cx={135}
        cy={135}
        r={RADIUS}
        fill="none"
        stroke="#000000"
        strokeWidth={2}
      />
      {/* Inner hairline ring — the SIGNATURE entry animation. Path-
          draws via stroke-dasharray, appearing INSIDE the already-
          visible border like a couturier adding a finishing detail. */}
      <circle
        className="ls-disc-inner"
        cx={135}
        cy={135}
        r={INNER_RADIUS}
        fill="none"
        stroke="#000000"
        strokeWidth={0.8}
        strokeOpacity={0.55}
        strokeDasharray={INNER_CIRC}
        strokeDashoffset={INNER_CIRC}
      />
      {/* Four cardinal dots inside the disc — visible from frame 1. */}
      <g>
        <circle cx={135} cy={11.5} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={135} cy={258.5} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={11.5} cy={135} r={2.1} fill="#000000" fillOpacity={0.85} />
        <circle cx={258.5} cy={135} r={2.1} fill="#000000" fillOpacity={0.85} />
      </g>
      {/* The Bodoni C — visible from frame 1 to match OS render. */}
      <text
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
  @keyframes ls-mono-zoom {
    /* Frame 1 matches OS-rendered icon size (~150px on a 270px SVG =
       ~0.55 scale). Entry zooms outward to natural size, hands off
       seamlessly from the OS static splash. */
    0%   { transform: scale(0.55); }
    100% { transform: scale(1); }
  }
  @keyframes ls-rule-in {
    0%   { transform: scaleX(0); opacity: 0; }
    100% { transform: scaleX(1); opacity: 1; }
  }
  @keyframes ls-disc-draw {
    0%   { stroke-dashoffset: var(--circ); }
    100% { stroke-dashoffset: 0; }
  }
  @keyframes ls-name-in {
    0%   { opacity: 0; letter-spacing: 0.55em; }
    100% { opacity: 1; letter-spacing: 0.14em; }
  }
  @keyframes ls-fade-up {
    0%   { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* ─── Top eyebrow + tagline ──────────────────────────────────────── */

  .ls-top-tag { text-align: center; opacity: 0;
    animation: ls-fade-up 440ms cubic-bezier(0.16,1,0.3,1) 800ms forwards; }
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

  /* The custom SVG monogram. Frame 1 = OS-icon size (scale 0.55),
     entry zooms outward to natural size for the seamless handoff.
     transform-origin:center keeps the C centered through the zoom. */
  .ls-mono {
    display: block;
    overflow: visible;
    transform: scale(0.55);
    transform-origin: center;
    animation: ls-mono-zoom 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  /* Inner hairline ring — the SIGNATURE entry animation. The disc and
     C are visible from frame 1 (matching the OS render), but this
     hairline draws inside the disc like a couture detail being added
     by hand. CSS variable --circ holds the precomputed circumference. */
  .ls-disc-inner {
    --circ: 741.42;
    animation: ls-disc-draw 700ms cubic-bezier(0.65, 0, 0.35, 1) 200ms forwards;
  }

  /* ─── Brand block (hairlines + wordmark + sub) ───────────────────── */

  .ls-brand {
    text-align: center;
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }

  /* Halo behind the wordmark so the textile pattern fades out and
     CLOSETTE pops. Stops are tuned to dissolve before the box edge,
     killing the visible-rectangle artifact. */
  .ls-brand::before {
    content: "";
    position: absolute;
    left: 50%; top: 50%;
    width: 320px; height: 96px;
    transform: translate(-50%, -50%);
    background: radial-gradient(
      ellipse at center,
      #ffffff 0%,
      #ffffff 30%,
      color-mix(in srgb, #ffffff 60%, transparent) 50%,
      color-mix(in srgb, #ffffff 20%, transparent) 60%,
      transparent 68%
    );
    z-index: -1;
    pointer-events: none;
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
    animation: ls-rule-in 320ms cubic-bezier(0.16, 1, 0.3, 1) 400ms forwards;
  }
  .ls-rule-right {
    animation-delay: 480ms; /* slight stagger so the eye reads ←·→ */
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
    animation: ls-name-in 700ms cubic-bezier(0.16, 1, 0.3, 1) 600ms forwards;
    /* Compensate the layout-shift that letter-spacing animation causes
       — keep the centerline stable by fixing the rendering. The font
       still reflows but the visual effect is what matters. */
    white-space: nowrap;
  }
  .ls-sub {
    font-family: var(--font-heading, 'Bodoni Moda'), serif; font-style: italic;
    font-size: 15px; opacity: 0; letter-spacing: 0.03em;
    margin-top: 16px;
    animation: ls-fade-up 440ms cubic-bezier(0.16,1,0.3,1) 900ms forwards;
  }

  /* Respect motion-reduction preference — drop all keyframes, just
     fade the splash in/out. */
  @media (prefers-reduced-motion: reduce) {
    .ls-pat, .ls-mono, .ls-disc-inner,
    .ls-rule, .ls-name, .ls-sub, .ls-top-tag {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
      stroke-dashoffset: 0 !important;
    }
    .ls-pat { opacity: 0.95 !important; }
    .ls-name { letter-spacing: 0.14em !important; }
    .launch-splash, .ls-content {
      transition: opacity 400ms ease !important;
    }
    .ls-exiting .ls-content { transform: none !important; }
    .ls-exiting .ls-pat { transform: none !important; }
  }
`;
