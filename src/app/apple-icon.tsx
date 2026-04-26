// Apple touch icon — Ivory · Noir, rendered with pure divs.
// Earlier versions tried to render an inline <svg> inside the React tree
// so Satori (next/og) could rasterize the full Rose & Damask treatment;
// Satori's SVG-inside-flex behavior was inconsistent and the canvas kept
// dropping the ivory ground (icon showed as just disc + C on a grey
// surface). At 180×180 the damask medallions would be ~7px each anyway,
// so we drop them here in favor of a Satori-bulletproof div layout that
// nails the brand identity people read at home-screen scale: ivory
// ground, hairline-bordered ivory disc, centered Bodoni C, four cardinal
// dots. The full damask still renders in icon.svg for browsers.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const IVORY = "#ebe0c8";
const INK = "#0a0806";
const INK_DIM = "rgba(10,8,6,0.55)";

// Cardinal-position dot inside the disc edge.
function Dot({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "absolute",
        width: 4,
        height: 4,
        borderRadius: "50%",
        backgroundColor: INK,
        opacity: 0.85,
        ...style,
      }}
    />
  );
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          // Pinning backgroundColor on the outer div is the one thing
          // Satori never seems to skip — guarantees ivory regardless of
          // what happens to children.
          backgroundColor: IVORY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* The ivory disc — sized so a clear ivory frame remains around
            it. Box-shadow draws the inner thin ring without needing a
            second nested element. */}
        <div
          style={{
            width: "62%",
            height: "62%",
            borderRadius: "50%",
            backgroundColor: IVORY,
            border: `2px solid ${INK}`,
            boxShadow: `inset 0 0 0 6px ${IVORY}, inset 0 0 0 7px ${INK_DIM}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: INK,
            fontFamily: '"Bodoni Moda","Bodoni 72",Didot,Georgia,serif',
            fontWeight: 400,
            fontSize: 100,
            lineHeight: 1,
            // Bodoni "C" needs slight optical lift; -2px feels right at
            // this raster size.
            paddingBottom: 4,
          }}
        >
          C
        </div>

        {/* Four cardinal dots on the disc edge. Positioned in absolute
            pixels relative to the 180×180 canvas — center at 90, disc
            radius is 62%/2 × 180 ≈ 56, so dot centers sit at offsets
            ±56 from center. */}
        <Dot style={{ top: 32, left: 88 }} />
        <Dot style={{ top: 144, left: 88 }} />
        <Dot style={{ top: 88, left: 32 }} />
        <Dot style={{ top: 88, left: 144 }} />
      </div>
    ),
    { ...size }
  );
}
