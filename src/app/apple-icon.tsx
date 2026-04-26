// Apple touch icon — Ivory · Noir, rasterized at request time.
// iOS still wants a raster icon; Satori (next/og) takes our React tree
// and emits PNG. We embed the same SVG composition as app/icon.svg so
// the home-screen icon matches the favicon and the in-app brand.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const IVORY = "#ebe0c8";
const IVORY_HI = "#f8efd6";
const INK = "#0a0806";
const STEM = "#3a2a1e";

// One damask medallion in 8 corner/cardinal positions around a centered
// disc — same shapes as patterns.tsx PatternRoseDamask, simplified
// (no grain/bleed filters) so it rasterizes cleanly at small sizes.
function Damask({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={INK} stroke={INK} strokeLinecap="round">
      <path d="M0 -22 Q 10 -12 0 0 Q -10 -12 0 -22 Z" opacity={0.95} />
      <path d="M0 0 Q 10 12 0 22 Q -10 12 0 0 Z" opacity={0.95} />
      <path d="M-22 0 Q -12 -10 0 0 Q -12 10 -22 0 Z" opacity={0.9} />
      <path d="M22 0 Q 12 -10 0 0 Q 12 10 22 0 Z" opacity={0.9} />
      <path d="M0 -21 Q 16 -28 20 -15 Q 17 -7 9 -10" strokeWidth={1.4} fill="none" opacity={0.85} />
      <path d="M0 -21 Q -16 -28 -20 -15 Q -17 -7 -9 -10" strokeWidth={1.4} fill="none" opacity={0.85} />
      <path d="M0 21 Q 16 28 20 15 Q 17 7 9 10" strokeWidth={1.4} fill="none" opacity={0.85} />
      <path d="M0 21 Q -16 28 -20 15 Q -17 7 -9 10" strokeWidth={1.4} fill="none" opacity={0.85} />
      <circle cx={0} cy={-30} r={1.6} opacity={0.75} />
      <circle cx={0} cy={30} r={1.6} opacity={0.75} />
      <circle cx={-30} cy={0} r={1.4} opacity={0.65} />
      <circle cx={30} cy={0} r={1.4} opacity={0.65} />
      <circle cx={0} cy={0} r={2} fill={IVORY_HI} opacity={0.55} />
    </g>
  );
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: IVORY,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          width="100%"
          height="100%"
        >
          {/* Ivory ground (also fills the rounded square area) */}
          <rect width={512} height={512} fill={IVORY} rx={92} ry={92} />

          {/* Diamond hairlines linking the corner + cardinal damasks */}
          <g stroke={STEM} strokeWidth={1.4} fill="none" opacity={0.45} strokeLinecap="round">
            <path d="M110 110 L 402 110 L 402 402 L 110 402 Z" />
            <path d="M256 60 L 60 256 L 256 452 L 452 256 Z" />
          </g>

          {/* 4 corners + 4 cardinals */}
          <Damask x={110} y={110} />
          <Damask x={402} y={110} />
          <Damask x={110} y={402} />
          <Damask x={402} y={402} />
          <Damask x={256} y={60} />
          <Damask x={256} y={452} />
          <Damask x={60} y={256} />
          <Damask x={452} y={256} />

          {/* Solid ivory disc covering the center */}
          <circle cx={256} cy={256} r={160} fill={IVORY} />
          <circle cx={256} cy={256} r={160} fill="none" stroke={INK} strokeWidth={3} opacity={0.92} />
          <circle cx={256} cy={256} r={146} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.55} />

          {/* Cardinal dots inside the disc edge */}
          <circle cx={256} cy={106} r={3.4} fill={INK} opacity={0.85} />
          <circle cx={256} cy={406} r={3.4} fill={INK} opacity={0.85} />
          <circle cx={106} cy={256} r={3.4} fill={INK} opacity={0.85} />
          <circle cx={406} cy={256} r={3.4} fill={INK} opacity={0.85} />

          {/* The C — geometrically centered */}
          <text
            x={256}
            y={256}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily='"Bodoni Moda","Bodoni 72",Didot,"Times New Roman",Georgia,serif'
            fontWeight={400}
            fontSize={256}
            fill={INK}
            style={{ letterSpacing: "-0.03em" }}
          >
            C
          </text>
        </svg>
      </div>
    ),
    { ...size }
  );
}
