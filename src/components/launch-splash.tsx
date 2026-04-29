// Closette — Launch Splash.
// First-paint brand moment. Three-phase animation:
//   1. ENTRY (650ms): pattern + content scale up + fade in. Feels like
//      the world materializing — pattern starts slightly oversized
//      and settles, content starts slightly small and snaps to size.
//   2. HOLD (1200ms): static brand moment. C, wordmark, taglines.
//   3. EXIT (850ms): "passing through the portal" — content scales up
//      aggressively (1 → 1.7) and fades, while the textile zooms more
//      slowly (1 → 1.25) creating a parallax sense of depth. The
//      underlying app (login or home) is revealed beneath.
// Plays once per session, gated by sessionStorage.
//
// The OS-level static launch image was removed in layout.tsx so iOS
// PWA falls back to the manifest's #ffffff theme — clean white pre-paint
// that hands off to this splash invisibly, no cream flash.
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

const ENTRY_MS = 650;
const HOLD_MS = 1200;
const EXIT_MS = 850;
const SESSION_KEY = "closette_splash_seen";

type Phase = "checking" | "entering" | "held" | "exiting" | "done";

export function LaunchSplash() {
  // checking → entering → held → exiting → done.
  // "checking" exists so the server-rendered first paint matches the
  // client (both render nothing) and we only flip to "entering" after
  // we've checked sessionStorage. Without it returning users would
  // briefly see the splash flash before the effect's early-return
  // kicked in.
  const [phase, setPhase] = React.useState<Phase>("checking");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setPhase("done");
      return;
    }
    setPhase("entering");
  }, []);

  React.useEffect(() => {
    if (phase === "entering") {
      // Mount with the .ls-entering pose, then on the next frame flip
      // to .ls-held so the CSS transition fires from the small pose to
      // the rest position. Without the rAF the browser may compute the
      // final pose directly without ever painting the entry pose.
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const rafId = requestAnimationFrame(() => {
        timeoutId = setTimeout(() => setPhase("held"), 0);
      });
      return () => {
        cancelAnimationFrame(rafId);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
    if (phase === "held") {
      // Stay held long enough that the user gets a clear brand moment
      // after the entry transition completes. The entry transition
      // itself runs during the first ENTRY_MS of "held"; the remaining
      // HOLD_MS is the static post-transition pause.
      const t = setTimeout(() => setPhase("exiting"), ENTRY_MS + HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === "exiting") {
      const t = setTimeout(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          // sessionStorage can throw in private/incognito on some
          // browsers — splash will just play again next visit.
        }
        setPhase("done");
      }, EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === "checking" || phase === "done") return null;

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
          <div className="ls-top-tag">
            <div className="ls-tag">Your AI Stylist</div>
            <div className="ls-small">for the closet you already own</div>
          </div>
          <div className="ls-logo-block">
            <Monogram
              variant="bordered-solid"
              size={270}
              stroke={0.5}
              letter="C"
              color="#000000"
              innerFill="#ffffff"
              fontFamily='"Bodoni Moda", "Didot", serif'
              frame="rgba(0,0,0,0.92)"
            />
            <div className="ls-brand">
              <div className="ls-name">CLOSETTE</div>
              <div className="ls-sub">Montréal · 2026</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const SPLASH_CSS = `
  .launch-splash {
    position: fixed; inset: 0; z-index: 9999;
    overflow: hidden;
    background: #ffffff;
    pointer-events: auto;
    /* Splash itself fades on exit so the underlying page peeks through
       through the zoom — gives the "passing through" sensation. */
    transition: opacity 550ms cubic-bezier(0.6, 0.04, 0.98, 0.34) 200ms;
    will-change: opacity;
  }
  .launch-splash.ls-exiting {
    opacity: 0;
    pointer-events: none;
  }

  .ls-pat {
    position: absolute; inset: 0;
    /* Pattern zooms more slowly than the content — parallax depth. */
    transition: transform 850ms cubic-bezier(0.6, 0.04, 0.98, 0.34);
    will-change: transform;
    /* Entry pose: slightly oversized so it settles inward. */
    transform: scale(1.05);
  }
  .ls-held .ls-pat,
  .ls-exiting .ls-pat {
    /* Smoother entry: snap pattern to 1 during held; exit ramps to 1.25. */
  }
  .ls-entering .ls-pat {
    transform: scale(1.05);
    transition: transform ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ls-held .ls-pat {
    transform: scale(1);
    transition: transform ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ls-exiting .ls-pat {
    transform: scale(1.25);
    transition: transform ${EXIT_MS}ms cubic-bezier(0.6, 0.04, 0.98, 0.34);
  }

  .ls-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.18) 100%);
    pointer-events: none;
  }

  .ls-content {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center;
    padding: 86px 40px 68px;
    color: #000000;
    will-change: transform, opacity;
  }
  .ls-entering .ls-content {
    /* Pre-animation pose: small + invisible. */
    transform: scale(0.92);
    opacity: 0;
    transition:
      transform ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ls-held .ls-content {
    transform: scale(1);
    opacity: 1;
    transition:
      transform ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1),
      opacity ${ENTRY_MS}ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ls-exiting .ls-content {
    /* Zoom-through pose: aggressive scale up + fade. The user feels
       like they're being pulled forward through the brand mark into
       the app behind it. Faster scale than the pattern = parallax. */
    transform: scale(1.7);
    opacity: 0;
    transition:
      transform ${EXIT_MS}ms cubic-bezier(0.6, 0.04, 0.98, 0.34),
      opacity ${EXIT_MS}ms cubic-bezier(0.7, 0, 0.84, 0);
  }

  .ls-top-tag { text-align: center; }
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

  .ls-logo-block {
    position: absolute; left: 50%; top: 50%;
    /* -135px = half the 270px monogram so the C's vertical center lands
       on viewport center; CLOSETTE flows below as a subtitle. */
    transform: translate(-50%, -135px);
    display: flex; flex-direction: column; align-items: center;
    gap: 28px;
  }

  .ls-brand {
    text-align: center;
    position: relative;
  }
  /* Soft halo behind the wordmark — fades the textile pattern out so
     CLOSETTE pops cleanly. Stops are tuned so the gradient reaches
     transparent before the box edge, killing the visible-rectangle
     artifact that a hard cutoff would create. */
  .ls-brand::before {
    content: "";
    position: absolute;
    left: 50%; top: calc(50% - 25px);
    width: 280px; height: 74px;
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
  .ls-name {
    font-family: var(--font-heading, 'Bodoni Moda'), serif; font-weight: 400;
    font-size: 42px; letter-spacing: 0.14em;
    color: #000000;
  }
  .ls-sub {
    font-family: var(--font-heading, 'Bodoni Moda'), serif; font-style: italic;
    font-size: 15px; opacity: 0.85; letter-spacing: 0.03em;
    margin-top: 28px;
  }

  /* Respect motion-reduction preference — drop the zoom, just fade. */
  @media (prefers-reduced-motion: reduce) {
    .ls-entering .ls-content,
    .ls-held .ls-content,
    .ls-exiting .ls-content,
    .ls-entering .ls-pat,
    .ls-held .ls-pat,
    .ls-exiting .ls-pat {
      transform: none !important;
      transition: opacity 400ms ease !important;
    }
  }
`;
