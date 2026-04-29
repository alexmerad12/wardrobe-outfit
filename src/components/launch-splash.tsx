// Closette — Launch Splash.
// First-paint brand moment. Plays once per session: holds for 1.5s on
// the textile + monogram + wordmark, then slides the content layer up
// while the textile stays put. When the splash unmounts, whatever's
// underneath (auth shell on /login, home on /) is revealed. The auth
// shell shares the same Rose & Damask palette so the transition reads
// as continuous to the eye.
//
// Visual matches /logo-lab section ii (Launch screen). Tweak there
// first if you want to iterate the design — these styles are a
// production copy of those values.
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

const HOLD_MS = 1500; // how long the splash sits before sliding away
const SLIDE_MS = 700; // duration of the slide-up animation
const SESSION_KEY = "closette_splash_seen";

export function LaunchSplash() {
  // checking → held → sliding → done
  // "checking" exists so the server-rendered first paint matches the
  // client (both render nothing) and we only flip to "held" after we've
  // checked sessionStorage. Without it returning users would briefly
  // see the splash flash before the effect's early-return kicked in.
  const [phase, setPhase] = React.useState<"checking" | "held" | "sliding" | "done">("checking");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setPhase("done");
      return;
    }
    setPhase("held");
    const t = setTimeout(() => setPhase("sliding"), HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (phase !== "sliding") return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // sessionStorage can throw in private/incognito on some
        // browsers — splash will just play again next visit, no real
        // harm done.
      }
      setPhase("done");
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "checking" || phase === "done") return null;

  const sliding = phase === "sliding";

  return (
    <>
      <style>{SPLASH_CSS}</style>
      <div className="launch-splash" aria-hidden={sliding} role="presentation">
        <div className="ls-pat">
          <PatternRoseDamask
            palette={BRAND_PALETTE}
            viewBoxWidth={2400}
            viewBoxHeight={2400}
          />
        </div>
        <div className="ls-vignette" />

        <div className={`ls-content ${sliding ? "ls-slide" : ""}`}>
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
    /* Block pointer events so taps during the hold don't hit anything
       below — the user shouldn't be able to interact with the page
       behind the splash before it dismisses. */
    pointer-events: auto;
  }
  .ls-pat { position: absolute; inset: 0; }
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
    transition:
      transform 700ms cubic-bezier(0.7, 0, 0.3, 1),
      opacity 500ms ease-out 200ms;
    will-change: transform, opacity;
  }
  .ls-content.ls-slide {
    transform: translateY(-110%);
    opacity: 0;
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
`;
