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
// Earlier versions used JSX <svg> with nested <circle>/<line>
// elements — Satori silently dropped all the inner shapes (only the
// outer C div rendered), producing a Bodoni C floating on white. Now
// rebuilt with pure div + CSS, which Satori handles reliably. Drops
// the Rose & Damask textile (was barely visible at home-screen sizes
// and Satori can't tile a CSS pattern), keeps the bordered-solid
// disc + Bodoni C — the recognizable mark.

import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

const IVORY = "#ffffff";
const INK = "#000000";

// Proportions match the logo-lab Monogram bordered-solid variant.
// All pixel values scale from the 512px tile so the icon reads the
// same at home-screen render sizes (~60-180px).
const DISC = 370; // 72% of 512
const BORDER = 9; // 1.8% of 512 — thick enough to survive downscale
const INNER_INSET = 25;
const INNER_RING = DISC - INNER_INSET * 2;
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
        {/* Outer disc — solid white inside, black border. */}
        <div
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC,
            backgroundColor: IVORY,
            border: `${BORDER}px solid ${INK}`,
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
              top: INNER_INSET,
              left: INNER_INSET,
              width: INNER_RING,
              height: INNER_RING,
              borderRadius: INNER_RING,
              border: `2px solid rgba(0,0,0,0.55)`,
            }}
          />
          {/* The Bodoni C, baked into the PNG via Satori + the font
              buffer above. Renders identically on iOS, Android,
              desktop browsers — no system-font fallback needed. */}
          <div
            style={{
              fontFamily: '"Bodoni Moda","Bodoni 72",Didot,Georgia,serif',
              fontWeight: 400,
              fontSize: FONT_SIZE,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: INK,
              marginTop: C_MARGIN_TOP,
            }}
          >
            C
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
