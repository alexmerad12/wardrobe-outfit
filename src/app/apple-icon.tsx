// Apple touch icon — Monochrome, rendered via Satori (next/og).
//
// IMPORTANT: previous version used JSX <svg> with nested <circle>,
// <line>, <g> elements to draw the disc, border, hairline rings,
// cardinal dots, and Rose & Damask textile field. Satori's SVG
// renderer doesn't traverse nested SVG element trees — only the
// outermost <svg> element gets considered, and its inner shapes were
// silently dropped from the PNG output. Result on iOS home screen:
// just a Bodoni C floating on white, no disc.
//
// Rewritten to use ONLY div + CSS, which Satori renders reliably.
// Drops the Rose & Damask textile (was barely visible at home-screen
// sizes anyway, and Satori can't tile a pattern). Keeps the
// recognizable bordered-solid disc + Bodoni C, which is the brand
// mark that has to read at any size.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const IVORY = "#ffffff";
const INK = "#000000";

// Fetch Bodoni Moda from Google Fonts at request time and pass it to
// Satori as a TTF buffer. Without this, Satori falls back to its
// default sans and the C renders as sans-serif. We parse the @font-face
// URL out of the stylesheet response, then fetch the binary.
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
  // Disc proportions chosen to match the logo-lab Monogram bordered-solid
  // variant: ~88% of icon width, with a 3px outer border that survives
  // home-screen downscaling (60-80px) and a faint inner hairline ring
  // 12px inside the outer border for the "twin ring" couture detail.
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
        {/* Outer disc — solid white inside, 3px black border */}
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: 130,
            backgroundColor: IVORY,
            border: `3px solid ${INK}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Inner hairline ring — 1px stroke, 12px inset, 55% opacity.
              Satori draws this as another bordered div. */}
          <div
            style={{
              position: "absolute",
              top: 9,
              left: 9,
              width: 106,
              height: 106,
              borderRadius: 106,
              border: `1px solid rgba(0,0,0,0.55)`,
            }}
          />
          {/* The Bodoni C — same proportional size as the in-app
              splash monogram (font-size 92 ≈ 51% of the 180px tile,
              matches the logo-lab 200/400 ratio). */}
          <div
            style={{
              fontFamily: '"Bodoni Moda","Bodoni 72",Didot,Georgia,serif',
              fontWeight: 400,
              fontSize: 92,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: INK,
              // Satori's vertical text alignment on tall serif glyphs
              // sometimes drifts a few px below center. Nudge up by ~3
              // so the C optically centers in the disc.
              marginTop: -3,
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
