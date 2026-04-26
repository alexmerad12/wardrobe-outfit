// Apple touch icon — Ivory · Noir, rendered via Satori (next/og).
// Mirrors the 180px tile from the logo lab: ivory rounded ground, a hex-
// packed Rose & Damask field, solid ivory disc with twin hairline rings,
// four cardinal dots, and a centered Bodoni C.
//
// Satori doesn't support SVG <pattern> elements, so instead of declaring
// one tile and letting it repeat, every visible damask is placed
// individually at the same hex positions PatternRoseDamask would tile to
// in a 400×400 frame (centerX=45, centerY=39 → translate 155,161). Disc
// hides the central medallions; ~16 stay visible around the ring.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const IVORY = "#ebe0c8";
const IVORY_HI = "#f8efd6";
const INK = "#0a0806";
const STEM = "#3a2a1e";

// One damask medallion, rendered at scale 0.5 (matches patterns.tsx).
function Damask({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(0.5)`}>
      <path d="M0 -18 Q 8 -10 0 0 Q -8 -10 0 -18 Z" fill={INK} opacity={0.95} />
      <path d="M0 0 Q 8 10 0 18 Q -8 10 0 0 Z" fill={INK} opacity={0.95} />
      <path d="M-18 0 Q -10 -8 0 0 Q -10 8 -18 0 Z" fill={INK} opacity={0.9} />
      <path d="M18 0 Q 10 -8 0 0 Q 10 8 18 0 Z" fill={INK} opacity={0.9} />
      <path d="M0 -17 Q 13 -23 16 -12 Q 14 -6 7 -8" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 -17 Q -13 -23 -16 -12 Q -14 -6 -7 -8" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 17 Q 13 23 16 12 Q 14 6 7 8" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 17 Q -13 23 -16 12 Q -14 6 -7 8" fill="none" stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <circle cx={0} cy={-24} r={1.2} fill={INK} opacity={0.75} />
      <circle cx={0} cy={24} r={1.2} fill={INK} opacity={0.75} />
      <circle cx={-24} cy={0} r={1} fill={INK} opacity={0.65} />
      <circle cx={24} cy={0} r={1} fill={INK} opacity={0.65} />
      <circle cx={0} cy={0} r={1.8} fill={IVORY_HI} opacity={0.55} />
    </g>
  );
}

// Hex-lattice damask positions outside the central disc (r=130 from 200,200).
// These are the same positions PatternRoseDamask would tile to in a
// 400×400 viewport with centerX=45, centerY=39.
const DAMASK_POSITIONS: Array<[number, number]> = [
  // y=44 row (top)
  [20, 44], [110, 44], [200, 44], [290, 44], [380, 44],
  // y=122 row
  [65, 122], [335, 122],
  // y=200 row (only edges visible — center hidden by disc)
  [20, 200], [380, 200],
  // y=278 row
  [65, 278], [335, 278],
  // y=356 row (bottom)
  [20, 356], [110, 356], [200, 356], [290, 356], [380, 356],
];

// Diamond hairline edges. Each connects two adjacent hex-lattice damasks.
// Drawn faintly to suggest the lattice without competing with the medallions.
const LATTICE_EDGES: Array<[number, number, number, number]> = [
  // top row connections
  [20, 44, 65, 122], [65, 122, 110, 44], [110, 44, 155, 122], [155, 122, 200, 44],
  [200, 44, 245, 122], [245, 122, 290, 44], [290, 44, 335, 122], [335, 122, 380, 44],
  // middle row connections
  [65, 122, 110, 200], [110, 200, 155, 122], [155, 122, 200, 200], [200, 200, 245, 122],
  [245, 122, 290, 200], [290, 200, 335, 122],
  [65, 122, 20, 200], [335, 122, 380, 200],
  [65, 278, 110, 200], [110, 200, 155, 278], [155, 278, 200, 200], [200, 200, 245, 278],
  [245, 278, 290, 200], [290, 200, 335, 278],
  [65, 278, 20, 200], [335, 278, 380, 200],
  // bottom row connections
  [20, 356, 65, 278], [65, 278, 110, 356], [110, 356, 155, 278], [155, 278, 200, 356],
  [200, 356, 245, 278], [245, 278, 290, 356], [290, 356, 335, 278], [335, 278, 380, 356],
];

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          // Pin ivory at the outermost layer — Satori never drops div bg.
          backgroundColor: IVORY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 400 400"
          width="100%"
          height="100%"
        >
          {/* Diamond hairline lattice connecting the damasks */}
          <g stroke={STEM} strokeWidth={0.7} fill="none" opacity={0.45} strokeLinecap="round">
            {LATTICE_EDGES.map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </g>

          {/* 16 damask medallions in the visible ring */}
          {DAMASK_POSITIONS.map(([x, y], i) => (
            <Damask key={i} x={x} y={y} />
          ))}

          {/* Solid ivory disc covering the centre */}
          <circle cx={200} cy={200} r={130} fill={IVORY} />
          <circle cx={200} cy={200} r={130} fill="none" stroke={INK} strokeWidth={2} opacity={0.92} />
          <circle cx={200} cy={200} r={118} fill="none" stroke={INK} strokeWidth={0.8} opacity={0.55} />

          {/* Four cardinal dots inside the disc edge */}
          <circle cx={200} cy={76} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={200} cy={324} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={76} cy={200} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={324} cy={200} r={2.1} fill={INK} opacity={0.85} />

          {/* The C — Bodoni Moda, geometrically centered */}
          <text
            x={200}
            y={200}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily='"Bodoni Moda","Bodoni 72",Didot,Georgia,serif'
            fontWeight={400}
            fontSize={200}
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
