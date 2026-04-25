// Apple touch icon — Ivory · Noir, rendered as PNG at request time.
// iOS still wants a raster icon; Satori (next/og) takes our React tree and
// rasterizes it. Mirrors the SVG monogram so it reads as the same mark on
// the home screen.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const IVORY = "#ebe0c8";
const INK = "#0a0806";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: IVORY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Hairline disc so the C sits inside a defined frame even though
            the disc fill matches the ivory ground. */}
        <div
          style={{
            width: "84%",
            height: "84%",
            borderRadius: "50%",
            background: IVORY,
            border: `1.4px solid ${INK}`,
            boxShadow: `inset 0 0 0 6px ${IVORY}, inset 0 0 0 6.5px rgba(10,8,6,0.55)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: INK,
            fontFamily: '"Bodoni Moda","Bodoni 72",Didot,"Times New Roman",serif',
            fontWeight: 400,
            // Visually centered for the C — paired with display:flex centering.
            fontSize: 130,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          C
        </div>
      </div>
    ),
    { ...size }
  );
}
