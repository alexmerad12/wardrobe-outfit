// Linette — Launch Splash (Lottie wordmark).
//
// Pure black canvas. Top eyebrow in white. Centerpiece: the
// Fiverr-commissioned Lottie handwriting animation of "Linette"
// (After Effects trace + matte technique, 30fps, 133 frames ≈ 4.43s).
//
// Why Lottie: we burned a lot of cycles trying to fake handwriting
// with SVG path animation (outline-stroke masks, hand-authored
// centerline masks, blur tricks). Every variant had a computational
// signature that read as "computer drawing letters." A human
// motion-designer authored the timing in AE, and Lottie replays it
// here. That's worth the ~40KB JSON payload.
//
// Eyebrow: letter-spacing collapse on the caps line + delayed
// fade-up on the italic sub. Unchanged from prior versions.
//
// First-time visitors only — the inline script in layout.tsx adds
// .skip-splash to <html> when sessionStorage shows this session has
// already seen the splash.
"use client";

import * as React from "react";
import Lottie from "lottie-react";
import linetteAnimation from "@/assets/linette-lottie.json";

// Lottie metadata: 133 frames / 30 fps = 4.433s native. We play it
// back at 1.4× to keep the splash snappy without losing the hand-
// drawn cadence. 4433 / 1.4 ≈ 3167ms — that's how long the "entering"
// phase needs to last so the held phase starts as the ink finishes.
const LOTTIE_SPEED = 1.4;
const LOTTIE_DURATION_MS = Math.round(4433 / LOTTIE_SPEED);
const HOLD_MS = 280;
const EXIT_MS = 420;
const SESSION_KEY = "linette_splash_seen";

type Phase = "entering" | "held" | "exiting" | "done";

export function LaunchSplash() {
  const [phase, setPhase] = React.useState<Phase>("entering");
  // SSR guard: lottie-react touches `window` on mount. The parent is
  // already "use client" so this only matters for the initial render,
  // but we still skip rendering <Lottie> until we know we're in the
  // browser to avoid the hydration mismatch warning.
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setPhase("done");
    }
  }, []);

  React.useEffect(() => {
    if (phase === "entering") {
      const t = setTimeout(() => setPhase("held"), LOTTIE_DURATION_MS);
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
        <div className="ls-content">
          {/* Top eyebrow — letter-spacing collapse + delayed sub. */}
          <div className="ls-top-tag">
            <div className="ls-tag">Your AI Stylist</div>
            <div className="ls-small">for the closet you already own</div>
          </div>

          {/* Center wordmark — Lottie handwriting animation. */}
          <div className="ls-wordmark" aria-label="Linette">
            {mounted && (
              <Lottie
                animationData={linetteAnimation}
                loop={false}
                autoplay
                speed={LOTTIE_SPEED}
                rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
                style={{ width: "100%", height: "100%" }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const SPLASH_CSS = `
  /* Returning users skip the splash entirely — inline script in
     layout.tsx adds .skip-splash to <html> when sessionStorage shows
     this session has already seen it. CSS hides it instantly. */
  html.skip-splash .launch-splash { display: none !important; }

  .launch-splash {
    position: fixed; inset: 0; z-index: 9999;
    overflow: hidden;
    background: #000000;
    pointer-events: auto;
    transition: opacity 450ms cubic-bezier(0.6, 0.04, 0.98, 0.34);
    will-change: opacity;
  }
  .launch-splash.ls-exiting {
    opacity: 0;
    pointer-events: none;
  }

  .ls-content {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center;
    padding: 86px 40px 68px;
    color: #ffffff;
  }

  /* ─── Top eyebrow ──────────────────────────────────────────────── */

  .ls-top-tag {
    text-align: center;
  }
  .ls-tag {
    font-family: var(--font-sans, 'Inter'), system-ui, sans-serif;
    font-size: 11px;
    letter-spacing: 0.58em;
    text-transform: uppercase;
    opacity: 0;
    animation: ls-tag-settle 700ms cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards;
  }
  .ls-small {
    font-family: var(--font-heading, 'Bodoni Moda'), serif;
    font-style: italic;
    font-size: 14px;
    margin-top: 12px;
    opacity: 0;
    animation: ls-sub-fade 540ms cubic-bezier(0.16, 1, 0.3, 1) 380ms forwards;
  }

  @keyframes ls-tag-settle {
    0%   { opacity: 0; letter-spacing: 0.58em; }
    100% { opacity: 0.85; letter-spacing: 0.38em; }
  }
  @keyframes ls-sub-fade {
    0%   { opacity: 0; transform: translateY(6px); }
    100% { opacity: 0.78; transform: translateY(0); }
  }

  /* ─── Center wordmark — Lottie player ────────────────────────────
     Square box at viewport center. Lottie canvas is 1024×1024 with
     the wordmark roughly horizontal across the middle, so a square
     wrapper at 360px reads as a ~360px-wide signature with vertical
     headroom for the descenders. preserveAspectRatio is "meet" so
     the SVG never gets clipped. */

  .ls-wordmark {
    position: absolute;
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    width: 360px;
    height: 360px;
    pointer-events: none;
  }

  /* Reduced-motion fallback — fade the splash in/out only. The Lottie
     itself ignores prefers-reduced-motion, but the surrounding entry
     animations are suppressed so the eyebrow appears immediately. */
  @media (prefers-reduced-motion: reduce) {
    .ls-tag, .ls-small {
      animation: none !important;
      opacity: 1 !important;
      letter-spacing: 0.38em !important;
      transform: none !important;
    }
    .ls-small { opacity: 0.78 !important; }
    .ls-tag { opacity: 0.85 !important; }
    .launch-splash, .ls-content {
      transition: opacity 400ms ease !important;
    }
  }
`;
