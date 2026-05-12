// PWA icon — Monochrome, rendered via Satori (next/og).
//
// File-name convention is "apple-icon" because Next.js auto-injects
// <link rel="apple-touch-icon" href="/apple-icon"> for iOS — but the
// PNG it generates is also referenced from manifest.json so Android
// Chrome / Samsung Internet pick it up. Without this, Android falls
// back to icon.svg, where the path-rendered L is font-independent
// (we ship the Parisienne L as a baked SVG <path>, not <text>).
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
// hairline ring, four cardinal dots at 12/3/6/9, and the Parisienne
// script L — matching the launch-page Monogram, minus the Rose &
// Damask textile.

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

// Parisienne L baked as an SVG path — extracted via
// scripts/extract-l-path.mjs at fontSize 270, centered on (175,175)
// which is the geometric center of the INNER_DISC (350×350). Embedding
// the glyph as a path means Satori doesn't need to fetch Parisienne at
// request time — saves the network round-trip and the cold-start risk
// of Google Fonts being unreachable from the Vercel edge.
const L_PATH_D =
  "M195.96 279.68L195.96 279.68Q187.39 279.68 178.63 278.16Q169.86 276.65 160.89 274.21Q151.93 271.77 142.96 268.87Q134.00 265.97 125.30 263.20L125.30 263.20Q114.88 269.53 103.54 273.15Q92.21 276.78 79.68 276.78L79.68 276.78Q69.00 276.78 63.33 272.95Q57.67 269.13 57.67 262.80L57.67 262.80Q57.67 254.50 66.89 250.01Q76.12 245.53 94.84 245.53L94.84 245.53Q103.02 245.53 111.32 246.72Q119.63 247.91 128.20 249.75L128.20 249.75Q136.50 242.50 144.02 233.40Q151.53 224.31 158.65 213.89L158.65 213.89Q153.25 214.55 147.71 214.88Q142.17 215.21 136.50 215.21L136.50 215.21Q115.81 215.21 99.59 210.27Q83.37 205.32 72.17 196.69Q60.96 188.05 55.10 176.38Q49.23 164.72 49.23 151.27L49.23 151.27Q49.23 135.45 55.29 123.19Q61.36 110.93 71.97 102.56Q82.58 94.18 96.95 89.77Q111.32 85.35 127.80 85.35L127.80 85.35Q138.22 85.35 146.79 86.93Q155.36 88.52 161.62 90.36Q167.88 92.21 171.44 93.92Q175 95.63 175.40 95.77L175.40 95.77L171.97 101.70Q171.84 101.70 168.67 100.18Q165.51 98.67 159.97 96.95Q154.43 95.24 146.79 93.79Q139.14 92.34 130.31 92.34L130.31 92.34Q114.75 92.34 102.42 96.89Q90.10 101.44 81.59 109.35Q73.09 117.26 68.54 127.87Q63.99 138.48 63.99 150.48L63.99 150.48Q63.99 163.93 70.19 174.54Q76.39 185.15 86.80 192.47Q97.22 199.79 110.99 203.61Q124.77 207.43 139.93 207.43L139.93 207.43Q146.13 207.43 152.13 207.04Q158.13 206.64 164.06 205.72L164.06 205.72Q173.42 191.08 182.19 175.40Q190.95 159.71 199.65 144.68Q208.35 129.65 217.19 116.14Q226.02 102.62 235.58 92.47Q245.14 82.32 255.68 76.32Q266.23 70.32 278.36 70.32L278.36 70.32Q283.11 70.32 287.19 71.84Q291.28 73.35 294.31 76.45Q297.34 79.55 299.06 84.30Q300.77 89.04 300.77 95.37L300.77 95.37Q300.77 105.65 296.82 117.06Q292.86 128.46 285.35 139.87Q277.83 151.27 267.02 162.28Q256.21 173.29 242.50 182.65Q228.79 192.01 212.44 199.32Q196.09 206.64 177.64 210.73L177.64 210.73Q168.94 222.72 159.71 233.34Q150.48 243.95 140.20 252.52L140.20 252.52Q150.21 255.16 159.84 258.12Q169.46 261.09 178.10 263.53Q186.73 265.97 194.12 267.61Q201.50 269.26 207.17 269.26L207.17 269.26Q215.61 269.26 223.45 266.36Q231.29 263.46 239.07 256.08L239.07 256.08L244.48 260.30Q244.35 260.43 243.03 261.95Q241.71 263.46 239.07 265.64Q236.44 267.81 232.48 270.25Q228.53 272.69 223.19 274.80Q217.85 276.91 211.06 278.29Q204.27 279.68 195.96 279.68ZM278.89 77.57L278.89 77.57Q271.50 77.57 264.25 82.85Q257.00 88.12 249.62 97.15Q242.24 106.18 234.66 118.38Q227.08 130.57 219.03 144.35Q210.99 158.13 202.29 172.76Q193.59 187.39 184.10 201.50L184.10 201.50Q199.92 197.15 214.22 190.16Q228.53 183.17 240.72 174.47Q252.92 165.77 262.74 155.82Q272.56 145.86 279.48 135.45Q286.40 125.03 290.09 114.82Q293.78 104.60 293.78 95.24L293.78 95.24Q293.78 90.36 292.60 87.00Q291.41 83.64 289.37 81.53Q287.32 79.42 284.62 78.50Q281.92 77.57 278.89 77.57ZM78.89 269.92L78.89 269.92Q88.65 269.92 97.35 267.22Q106.05 264.52 114.22 259.77L114.22 259.77Q105.52 257.27 97.41 255.68Q89.31 254.10 81.79 254.10L81.79 254.10Q72.83 254.10 68.67 256.74Q64.52 259.38 64.52 262.80L64.52 262.80Q64.52 263.86 65.11 265.11Q65.71 266.36 67.29 267.42Q68.87 268.47 71.64 269.20Q74.41 269.92 78.89 269.92Z";

export default async function AppleIcon() {
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
            {/* Parisienne L, baked as an SVG <path> so Satori
                doesn't depend on a webfont fetch at request time.
                The path is pre-centered on (175,175) of a 350×350
                coordinate space — matches INNER_DISC exactly. */}
            <svg
              width={INNER_DISC}
              height={INNER_DISC}
              viewBox={`0 0 ${INNER_DISC} ${INNER_DISC}`}
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <path fill={INK} d={L_PATH_D} />
            </svg>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
