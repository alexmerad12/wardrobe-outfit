// PWA icon — Monochrome, rendered via Satori (next/og).
//
// File-name convention is "apple-icon" because Next.js auto-injects
// <link rel="apple-touch-icon" href="/apple-icon"> for iOS — but the
// PNG it generates is also referenced from manifest.json so Android
// Chrome / Samsung Internet pick it up. Without this, Android falls
// back to icon.svg, where the <text>-rendered C lands on whatever
// system serif the device has (no Bodoni Moda on Android = generic
// serif fallback).
//
// 512×512 is the PWA-recommended size and the size Chrome prefers
// when picking an icon for "Add to Home screen". iOS happily
// downscales for the apple-touch-icon use case.
//
// The bold disc border is built from two stacked solid discs (black
// outer + ivory inner) rather than a CSS `border`. Satori renders
// large CSS borders unevenly when combined with border-radius — the
// stroke ends up heavier on one side. Two filled circles render
// perfectly round at any size. Inside the ivory disc sit the inner
// hairline ring, four cardinal dots at 12/3/6/9, and the Bodoni C —
// matching the launch-page Monogram, minus the Rose & Damask textile.

import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

const IVORY = "#ffffff";
const INK = "#000000";

// Outer black disc fills 72% of the 512 tile. The difference between
// OUTER_DISC and INNER_DISC is what the eye reads as the disc border.
const OUTER_DISC = 370;
const BORDER = 10;
const INNER_DISC = OUTER_DISC - BORDER * 2;

// Inner hairline ring sits inside the ivory disc. RING_INSET is
// the gap between the ivory disc edge and the hairline — the
// corridor where the cardinal dots live.
const RING_INSET = 20;
const RING_DIAMETER = INNER_DISC - RING_INSET * 2;
const RING_STROKE = 2;

// Cardinal dots sit at the midpoint of the corridor between the
// black border and the hairline ring, so they read as part of the
// twin-ring couture detail at home-screen size.
const DOT_SIZE = 8;
const DOT_RADIUS_FROM_CENTER = INNER_DISC / 2 - RING_INSET / 2;

const FONT_SIZE = 262;
const C_MARGIN_TOP = -8; // optical centering nudge for tall serifs

// Fetch Bodoni Moda from Google Fonts at request time and pass it
// to Satori as a TTF buffer. Without this, Satori falls back to
// its default sans and the C renders as sans-serif. We parse the
// @font-face URL out of the stylesheet response, then fetch the
// binary.
async function loadBodoniFont(): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const urlMatch = css.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (!urlMatch) return null;
    const fontRes = await fetch(urlMatch[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function AppleIcon() {
  const bodoniData = await loadBodoniFont();

  // Dot positions inside the ivory disc (INNER_DISC × INNER_DISC,
  // center at INNER_DISC/2). Each entry is the dot's top-left.
  const dotCenter = INNER_DISC / 2;
  const dotOffset = DOT_SIZE / 2;
  const dots = [
    { top: dotCenter - DOT_RADIUS_FROM_CENTER - dotOffset, left: dotCenter - dotOffset }, // 12
    { top: dotCenter + DOT_RADIUS_FROM_CENTER - dotOffset, left: dotCenter - dotOffset }, // 6
    { top: dotCenter - dotOffset, left: dotCenter - DOT_RADIUS_FROM_CENTER - dotOffset }, // 9
    { top: dotCenter - dotOffset, left: dotCenter + DOT_RADIUS_FROM_CENTER - dotOffset }, // 3
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: IVORY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Outer black disc — solid fill. The border isn't a CSS
            stroke; it's the visible ring of black left exposed
            after the ivory disc is centered on top. */}
        <div
          style={{
            width: OUTER_DISC,
            height: OUTER_DISC,
            borderRadius: "50%",
            backgroundColor: INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Ivory inner disc — the canvas for the C, the inner
              hairline ring, and the four cardinal dots. */}
          <div
            style={{
              width: INNER_DISC,
              height: INNER_DISC,
              borderRadius: "50%",
              backgroundColor: IVORY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {/* Inner hairline ring — twin-ring couture detail. */}
            <div
              style={{
                position: "absolute",
                top: RING_INSET,
                left: RING_INSET,
                width: RING_DIAMETER,
                height: RING_DIAMETER,
                borderRadius: "50%",
                border: `${RING_STROKE}px solid rgba(0,0,0,0.55)`,
              }}
            />
            {/* Four cardinal dots at 12 / 3 / 6 / 9 — placed in the
                corridor between the black border and the hairline
                ring so all four survive downscaling. */}
            {dots.map((pos, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: pos.top,
                  left: pos.left,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: "50%",
                  backgroundColor: INK,
                }}
              />
            ))}
            {/* Bodoni C, baked into the PNG via Satori + the font
                buffer above. Renders identically on iOS, Android,
                and desktop browsers. */}
            <div
              style={{
                fontFamily: '"Bodoni Moda","Bodoni 72",Didot,Georgia,serif',
                fontWeight: 400,
                fontSize: FONT_SIZE,
                lineHeight: 1,
                letterSpacing: "-0.03em",
                color: INK,
                marginTop: C_MARGIN_TOP,
                display: "flex",
              }}
            >
              C
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: bodoniData
        ? [
            {
              name: "Bodoni Moda",
              data: bodoniData,
              weight: 400,
              style: "normal",
            },
          ]
        : undefined,
    }
  );
}
