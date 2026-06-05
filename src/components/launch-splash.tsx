// Linette — Launch Splash (Option A: ink-settle).
//
// Pure black canvas. Top eyebrow in white. Centerpiece: the
// Parisienne wordmark "Linette" in white, with each letter "arriving"
// rather than being "written." Each letter fades in left-to-right
// with a small stagger; each one starts slightly below its final
// position, slightly smaller, and very lightly blurred, then settles
// into place. Reads like ink droplets saturating into paper —
// editorial, intentional, no fake handwriting.
//
// Why this approach (after iterating on stroke-based "writing"
// reveals): we couldn't convincingly fake handwriting with SVG
// path animation. Every variant — outline-stroke masks, hand-
// authored centerline masks, blur tricks — had a computational
// signature that read as "computer drawing letters," not "human
// hand writing." Dropping the pretense and doing a confident
// ink-settle reveal is more honest and looks more like a luxury
// brand splash should look.
//
// Eyebrow: letter-spacing collapse on the caps line + delayed
// fade-up on the italic sub. Unchanged from prior versions.
//
// First-time visitors only — the inline script in layout.tsx adds
// .skip-splash to <html> when sessionStorage shows this session has
// already seen the splash.
"use client";

import * as React from "react";

const WORDMARK_START_MS = 350; // wait for eyebrow to settle
const LETTER_SETTLE_MS = 520; // per-letter fade + drift + scale
const LETTER_STAGGER_MS = 140; // gap between consecutive letters
const ENTRY_TOTAL_MS =
  WORDMARK_START_MS + LETTER_STAGGER_MS * 6 + LETTER_SETTLE_MS;

const HOLD_MS = 400;
const EXIT_MS = 400;
const SESSION_KEY = "linette_splash_seen";

type Phase = "entering" | "held" | "exiting" | "done";

// Parisienne fill paths. Baked from scripts/extract-linette-path.mjs
// at fontSize 240. Combined viewBox: 0 0 665 187. Each letter is
// rendered as a plain filled glyph — no masks, no strokes, no
// filters — and the entry animation runs on the <path> element
// itself (opacity + transform).
const LETTERS: readonly string[] = [
  // L
  "M130.43 186.09L130.43 186.09Q122.81 186.09 115.02 184.75Q107.23 183.40 99.26 181.23Q91.29 179.06 83.32 176.48Q75.35 173.91 67.62 171.45L67.62 171.45Q58.36 177.07 48.28 180.29Q38.20 183.52 27.07 183.52L27.07 183.52Q17.58 183.52 12.54 180.12Q7.50 176.72 7.50 171.09L7.50 171.09Q7.50 163.71 15.70 159.73Q23.91 155.74 40.55 155.74L40.55 155.74Q47.81 155.74 55.20 156.80Q62.58 157.85 70.20 159.49L70.20 159.49Q77.58 153.05 84.26 144.96Q90.94 136.88 97.27 127.62L97.27 127.62Q92.46 128.20 87.54 128.50Q82.62 128.79 77.58 128.79L77.58 128.79Q59.18 128.79 44.77 124.39Q30.35 120 20.39 112.32Q10.43 104.65 5.21 94.28Q0 83.91 0 71.95L0 71.95Q0 57.89 5.39 46.99Q10.78 36.09 20.21 28.65Q29.65 21.21 42.42 17.29Q55.20 13.36 69.84 13.36L69.84 13.36Q79.10 13.36 86.72 14.77Q94.34 16.17 99.90 17.81Q105.47 19.45 108.63 20.98Q111.80 22.50 112.15 22.62L112.15 22.62L109.10 27.89Q108.98 27.89 106.17 26.54Q103.36 25.20 98.44 23.67Q93.52 22.15 86.72 20.86Q79.92 19.57 72.07 19.57L72.07 19.57Q58.24 19.57 47.29 23.61Q36.33 27.66 28.77 34.69Q21.21 41.72 17.17 51.15Q13.13 60.59 13.13 71.25L13.13 71.25Q13.13 83.20 18.63 92.64Q24.14 102.07 33.40 108.57Q42.66 115.08 54.90 118.48Q67.15 121.88 80.63 121.88L80.63 121.88Q86.13 121.88 91.46 121.52Q96.80 121.17 102.07 120.35L102.07 120.35Q110.39 107.34 118.18 93.40Q125.98 79.45 133.71 66.09Q141.45 52.73 149.30 40.72Q157.15 28.71 165.64 19.69Q174.14 10.66 183.52 5.33Q192.89 0 203.67 0L203.67 0Q207.89 0 211.52 1.35Q215.16 2.70 217.85 5.45Q220.55 8.20 222.07 12.42Q223.59 16.64 223.59 22.27L223.59 22.27Q223.59 31.41 220.08 41.54Q216.56 51.68 209.88 61.82Q203.20 71.95 193.59 81.74Q183.98 91.52 171.80 99.84Q159.61 108.16 145.08 114.67Q130.55 121.17 114.14 124.80L114.14 124.80Q106.41 135.47 98.20 144.90Q90 154.34 80.86 161.95L80.86 161.95Q89.77 164.30 98.32 166.93Q106.88 169.57 114.55 171.74Q122.23 173.91 128.79 175.37Q135.35 176.84 140.39 176.84L140.39 176.84Q147.89 176.84 154.86 174.26Q161.84 171.68 168.75 165.12L168.75 165.12L173.55 168.87Q173.44 168.98 172.27 170.33Q171.09 171.68 168.75 173.61Q166.41 175.55 162.89 177.71Q159.38 179.88 154.63 181.76Q149.88 183.63 143.85 184.86Q137.81 186.09 130.43 186.09ZM204.14 6.45L204.14 6.45Q197.58 6.45 191.13 11.13Q184.69 15.82 178.13 23.85Q171.56 31.88 164.82 42.71Q158.09 53.55 150.94 65.80Q143.79 78.05 136.05 91.05Q128.32 104.06 119.88 116.60L119.88 116.60Q133.95 112.73 146.66 106.52Q159.38 100.31 170.21 92.58Q181.05 84.84 189.79 76.00Q198.52 67.15 204.67 57.89Q210.82 48.63 214.10 39.55Q217.38 30.47 217.38 22.15L217.38 22.15Q217.38 17.81 216.33 14.82Q215.27 11.84 213.46 9.96Q211.64 8.09 209.24 7.27Q206.84 6.45 204.14 6.45ZM26.37 177.42L26.37 177.42Q35.04 177.42 42.77 175.02Q50.51 172.62 57.77 168.40L57.77 168.40Q50.04 166.17 42.83 164.77Q35.63 163.36 28.95 163.36L28.95 163.36Q20.98 163.36 17.29 165.70Q13.59 168.05 13.59 171.09L13.59 171.09Q13.59 172.03 14.12 173.14Q14.65 174.26 16.05 175.20Q17.46 176.13 19.92 176.78Q22.38 177.42 26.37 177.42Z",
  // i
  "M250.43 67.03L250.43 67.03Q250.43 69.38 249.26 71.89Q248.09 74.41 246.27 76.41Q244.45 78.40 242.23 79.69Q240 80.98 237.77 80.98L237.77 80.98Q235.78 80.98 234.73 79.51Q233.67 78.05 233.67 75.94L233.67 75.94Q233.67 74.06 234.38 71.48Q235.08 68.91 236.48 66.62Q237.89 64.34 239.88 62.70Q241.88 61.05 244.45 61.05L244.45 61.05Q246.91 61.05 248.67 62.93Q250.43 64.80 250.43 67.03ZM224.77 91.41L228.52 93.05Q226.99 96.09 224.24 101.07Q221.48 106.05 218.32 111.97Q215.16 117.89 211.88 124.39Q208.59 130.90 205.96 137.05Q203.32 143.20 201.68 148.59Q200.04 153.98 200.04 157.73L200.04 157.73Q200.04 161.13 201.45 162.36Q202.85 163.59 205.43 163.59L205.43 163.59Q210.23 163.59 214.80 160.43Q219.38 157.27 223.89 152.17Q228.40 147.07 232.73 140.51Q237.07 133.95 241.41 127.27L241.41 127.27L245.63 130.55Q242.23 136.64 237.95 143.55Q233.67 150.47 228.40 156.39Q223.13 162.30 216.80 166.17Q210.47 170.04 202.97 170.04L202.97 170.04Q195.94 170.04 192.19 165.82Q188.44 161.60 188.44 154.92L188.44 154.92Q188.44 147.07 192.07 138.52Q195.70 129.96 201.15 121.58Q206.60 113.20 212.99 105.47Q219.38 97.73 224.77 91.41L224.77 91.41Z",
  // n
  "M339.26 110.16L339.26 110.16Q339.26 115.20 337.50 120.41Q335.74 125.63 333.05 130.84Q330.35 136.05 327.30 141.09Q324.26 146.13 321.56 150.82Q318.87 155.51 317.11 159.79Q315.35 164.06 315.35 167.58L315.35 167.58Q315.35 170.27 316.52 171.21Q317.70 172.15 319.10 172.15L319.10 172.15Q323.55 172.15 329.06 167.75Q334.57 163.36 340.25 156.68Q345.94 150 351.56 142.15Q357.19 134.30 361.76 127.27L361.76 127.27L365.98 130.55Q365.04 131.95 362.58 136.11Q360.12 140.27 356.48 145.61Q352.85 150.94 348.34 156.74Q343.83 162.54 338.67 167.40Q333.52 172.27 328.07 175.43Q322.62 178.59 317.11 178.59L317.11 178.59Q313.95 178.59 311.37 177.54Q308.79 176.48 306.97 174.61Q305.16 172.73 304.10 170.21Q303.05 167.70 303.05 164.88L303.05 164.88Q303.05 160.31 305.10 154.98Q307.15 149.65 310.20 144.02Q313.24 138.40 316.88 132.71Q320.51 127.03 323.55 121.88Q326.60 116.72 328.65 112.32Q330.70 107.93 330.70 104.77L330.70 104.77Q330.70 101.13 328.77 98.67Q326.84 96.21 323.32 96.21L323.32 96.21Q319.57 96.21 314.65 99.32Q309.73 102.42 303.63 108.40Q297.54 114.38 290.33 123.11Q283.13 131.84 274.69 142.97L274.69 142.97Q269.88 149.41 265.31 155.39L265.31 155.39Q263.32 157.97 261.33 160.66Q259.34 163.36 257.34 166.00Q255.35 168.63 253.59 171.04Q251.84 173.44 250.43 175.20L250.43 175.20L240.12 170.98L253.83 152.11Q256.76 148.13 259.80 143.55Q262.85 138.98 265.84 134.12Q268.83 129.26 271.52 124.34Q274.22 119.41 276.56 114.73L276.56 114.73Q279.96 107.70 281.25 103.07Q282.54 98.44 282.54 95.63L282.54 95.63Q282.54 92.46 281.37 91.46Q280.20 90.47 278.09 90.47L278.09 90.47Q275.86 90.47 272.99 92.75Q270.12 95.04 267.07 98.61Q264.02 102.19 260.92 106.70Q257.81 111.21 255 115.66Q252.19 120.12 249.73 124.10Q247.27 128.09 245.63 130.55L245.63 130.55L241.41 127.27Q247.38 117.89 252.25 110.10Q257.11 102.30 261.62 96.68Q266.13 91.05 270.41 87.95Q274.69 84.84 279.49 84.84L279.49 84.84Q282.07 84.84 284.47 85.90Q286.88 86.95 288.69 89.00Q290.51 91.05 291.56 93.98Q292.62 96.91 292.62 100.78L292.62 100.78Q292.62 103.83 291.91 107.11L291.91 107.11Q297.07 102.07 301.52 98.79Q305.98 95.51 309.73 93.57Q313.48 91.64 316.64 90.82Q319.80 90 322.38 90L322.38 90Q324.61 90 327.54 90.82Q330.47 91.64 333.05 93.87Q335.63 96.09 337.44 100.02Q339.26 103.95 339.26 110.16Z",
  // e
  "M370.66 144.26L370.66 144.26Q370.43 145.66 370.31 147.07Q370.20 148.48 370.20 149.88L370.20 149.88Q370.20 154.10 371.43 157.91Q372.66 161.72 375.06 164.59Q377.46 167.46 381.04 169.10Q384.61 170.74 389.18 170.74L389.18 170.74Q404.53 170.74 418.83 160.31Q433.13 149.88 447.30 127.27L447.30 127.27L451.29 130.78Q443.55 143.67 435.59 152.52Q427.62 161.37 419.71 166.88Q411.80 172.38 404.18 174.84Q396.56 177.30 389.65 177.30L389.65 177.30Q384.61 177.30 378.98 175.90Q373.36 174.49 368.61 171.21Q363.87 167.93 360.76 162.42Q357.66 156.91 357.66 148.71L357.66 148.71Q357.66 139.92 360.64 131.78Q363.63 123.63 368.44 116.60Q373.24 109.57 379.45 103.77Q385.66 97.97 392.05 93.87Q398.44 89.77 404.53 87.48Q410.63 85.20 415.31 85.20L415.31 85.20Q418.36 85.20 421.52 86.13Q424.69 87.07 427.21 89.06Q429.73 91.05 431.31 94.34Q432.89 97.62 432.89 102.19L432.89 102.19Q432.89 108.40 430.02 113.85Q427.15 119.30 422.34 123.93Q417.54 128.55 411.21 132.25Q404.88 135.94 397.97 138.52Q391.05 141.09 384.02 142.62Q376.99 144.14 370.66 144.26ZM371.60 139.22L371.60 139.22Q379.45 138.40 386.37 135.94Q393.28 133.48 399.02 129.90Q404.77 126.33 409.28 122.11Q413.79 117.89 416.84 113.55Q419.88 109.22 421.52 105.23Q423.16 101.25 423.16 98.09L423.16 98.09Q423.16 94.92 421.46 93.05Q419.77 91.17 417.42 91.17L417.42 91.17Q412.27 91.17 405.82 94.86Q399.38 98.55 392.93 105.06Q386.48 111.56 380.80 120.35Q375.12 129.14 371.60 139.22Z",
  // t
  "M450.59 74.30L471.09 74.30Q472.27 72.30 475.25 67.38Q478.24 62.46 482.29 56.48Q486.33 50.51 491.07 44.47Q495.82 38.44 500.39 34.22L500.39 34.22L505.66 37.38Q500.63 45.70 495.35 55.02Q490.08 64.34 484.92 74.30L484.92 74.30L523.13 74.30L520.78 80.39L481.76 80.39Q476.48 90.94 471.86 101.37Q467.23 111.80 463.71 121.29Q460.20 130.78 458.20 139.04Q456.21 147.30 456.21 153.40L456.21 153.40Q456.21 161.02 459.73 164.36Q463.24 167.70 468.40 167.70L468.40 167.70Q472.97 167.70 477.77 164.94Q482.58 162.19 487.21 157.97Q491.84 153.75 496.00 148.71Q500.16 143.67 503.38 139.22Q506.60 134.77 508.71 131.43Q510.82 128.09 511.29 127.27L511.29 127.27L515.63 130.55Q511.52 137.34 506.37 144.96Q501.21 152.58 494.94 159.08Q488.67 165.59 481.29 169.86Q473.91 174.14 465.35 174.14L465.35 174.14Q460.08 174.14 456.15 172.27Q452.23 170.39 449.53 167.05Q446.84 163.71 445.49 159.14Q444.14 154.57 444.14 149.18L444.14 149.18Q444.14 145.66 445.25 139.22Q446.37 132.77 449.06 123.93Q451.76 115.08 456.27 104.06Q460.78 93.05 467.70 80.39L467.70 80.39L448.24 80.39L450.59 74.30Z",
  // t
  "M514.57 74.30L535.08 74.30Q536.25 72.30 539.24 67.38Q542.23 62.46 546.27 56.48Q550.31 50.51 555.06 44.47Q559.80 38.44 564.38 34.22L564.38 34.22L569.65 37.38Q564.61 45.70 559.34 55.02Q554.06 64.34 548.91 74.30L548.91 74.30L587.11 74.30L584.77 80.39L545.74 80.39Q540.47 90.94 535.84 101.37Q531.21 111.80 527.70 121.29Q524.18 130.78 522.19 139.04Q520.20 147.30 520.20 153.40L520.20 153.40Q520.20 161.02 523.71 164.36Q527.23 167.70 532.38 167.70L532.38 167.70Q536.95 167.70 541.76 164.94Q546.56 162.19 551.19 157.97Q555.82 153.75 559.98 148.71Q564.14 143.67 567.36 139.22Q570.59 134.77 572.70 131.43Q574.80 128.09 575.27 127.27L575.27 127.27L579.61 130.55Q575.51 137.34 570.35 144.96Q565.20 152.58 558.93 159.08Q552.66 165.59 545.27 169.86Q537.89 174.14 529.34 174.14L529.34 174.14Q524.06 174.14 520.14 172.27Q516.21 170.39 513.52 167.05Q510.82 163.71 509.47 159.14Q508.13 154.57 508.13 149.18L508.13 149.18Q508.13 145.66 509.24 139.22Q510.35 132.77 513.05 123.93Q515.74 115.08 520.25 104.06Q524.77 93.05 531.68 80.39L531.68 80.39L512.23 80.39L514.57 74.30Z",
  // e
  "M584.18 144.26L584.18 144.26Q583.95 145.66 583.83 147.07Q583.71 148.48 583.71 149.88L583.71 149.88Q583.71 154.10 584.94 157.91Q586.17 161.72 588.57 164.59Q590.98 167.46 594.55 169.10Q598.13 170.74 602.70 170.74L602.70 170.74Q618.05 170.74 632.34 160.31Q646.64 149.88 660.82 127.27L660.82 127.27L664.80 130.78Q657.07 143.67 649.10 152.52Q641.13 161.37 633.22 166.88Q625.31 172.38 617.70 174.84Q610.08 177.30 603.16 177.30L603.16 177.30Q598.13 177.30 592.50 175.90Q586.88 174.49 582.13 171.21Q577.38 167.93 574.28 162.42Q571.17 156.91 571.17 148.71L571.17 148.71Q571.17 139.92 574.16 131.78Q577.15 123.63 581.95 116.60Q586.76 109.57 592.97 103.77Q599.18 97.97 605.57 93.87Q611.95 89.77 618.05 87.48Q624.14 85.20 628.83 85.20L628.83 85.20Q631.88 85.20 635.04 86.13Q638.20 87.07 640.72 89.06Q643.24 91.05 644.82 94.34Q646.41 97.62 646.41 102.19L646.41 102.19Q646.41 108.40 643.54 113.85Q640.66 119.30 635.86 123.93Q631.05 128.55 624.73 132.25Q618.40 135.94 611.48 138.52Q604.57 141.09 597.54 142.62Q590.51 144.14 584.18 144.26ZM585.12 139.22L585.12 139.22Q592.97 138.40 599.88 135.94Q606.80 133.48 612.54 129.90Q618.28 126.33 622.79 122.11Q627.30 117.89 630.35 113.55Q633.40 109.22 635.04 105.23Q636.68 101.25 636.68 98.09L636.68 98.09Q636.68 94.92 634.98 93.05Q633.28 91.17 630.94 91.17L630.94 91.17Q625.78 91.17 619.34 94.86Q612.89 98.55 606.45 105.06Q600 111.56 594.32 120.35Q588.63 129.14 585.12 139.22Z",
];

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
      const t = setTimeout(() => setPhase("held"), ENTRY_TOTAL_MS);
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

          {/* Center wordmark — each filled Parisienne glyph fades in
              with a small drift, scale, and brief blur, staggered
              left-to-right. Reads like ink droplets settling onto
              paper. No masks, no stroke animation, no fake pen. */}
          <svg
            className="ls-wordmark"
            viewBox="0 0 665 187"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Linette"
          >
            {LETTERS.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="#ffffff"
                className="ls-letter"
                style={{ ["--i" as string]: i }}
              />
            ))}
          </svg>
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

  /* ─── Center wordmark — ink-settle entry ─────────────────────────
     Each letter starts:
       - opacity 0
       - shifted 3 (viewBox-units) below its final position
       - scaled 0.96 around its own bounding-box center
       - blurred 1.2px (gives the "ink saturating into paper" feel)
     and settles to opacity 1, no shift, scale 1, no blur over 520ms
     with a slow-out / sharp-settle ease curve. Letters stagger 130ms
     apart, so the entry reads left-to-right at reading pace.

     transform-box: fill-box + transform-origin: center makes the
     scale happen around each letter's own bounding box rather than
     the SVG viewport origin — otherwise small scale changes would
     translate the letter halfway across the canvas.
     ──────────────────────────────────────────────────────────────── */

  .ls-wordmark {
    position: absolute;
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: auto;
    overflow: visible;
  }

  .ls-letter {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    transform: translateY(3px) scale(0.96);
    filter: blur(1.2px);
    animation: ls-ink-settle 520ms cubic-bezier(0.16, 1, 0.3, 1)
      calc(350ms + var(--i) * 140ms) forwards;
  }

  @keyframes ls-ink-settle {
    0% {
      opacity: 0;
      transform: translateY(3px) scale(0.96);
      filter: blur(1.2px);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: blur(0);
    }
  }

  /* Reduced-motion fallback — drop the staggered ink-settle, just
     fade the splash in/out. */
  @media (prefers-reduced-motion: reduce) {
    .ls-tag, .ls-small, .ls-letter {
      animation: none !important;
      opacity: 1 !important;
      letter-spacing: 0.38em !important;
      transform: none !important;
      filter: none !important;
    }
    .ls-small { opacity: 0.78 !important; }
    .ls-tag { opacity: 0.85 !important; }
    .launch-splash, .ls-content {
      transition: opacity 400ms ease !important;
    }
  }
`;
