// Apple touch icon — Monochrome, rendered via Satori (next/og).
// Mirrors the 180px tile from the logo lab: white rounded ground, a
// hex-packed Rose & Damask field at 32% opacity, white disc with twin
// hairline rings, four cardinal dots, and a centered Bodoni C.
//
// Satori doesn't support SVG <pattern> elements, so instead of
// declaring one tile and letting it repeat, every visible damask is
// placed individually at the hex positions PatternRoseDamask would
// tile to in a 400×400 frame with current settings (tile 56×97,
// centerX=28, centerY=24 → translate 172,176). Disc hides the central
// medallions; many stay visible around the ring.
//
// Pattern + lattice are wrapped in opacity 0.32 so the disc and C
// dominate at the small home-screen sizes where the icon is actually
// rendered (60-120px). Without the fade the diamonds compete with
// the C and the border seems to disappear.

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Fetch Bodoni Moda from Google Fonts at request time and pass it to
// Satori as a TTF buffer. Without this, Satori falls back to its
// default sans and the C renders as a sans-serif glyph instead of the
// expected high-contrast Bodoni serif. The Google Fonts CSS endpoint
// returns a stylesheet whose @font-face declarations point to the
// actual font binary URL on fonts.gstatic.com — we parse one out and
// fetch the binary.
async function loadBodoniFont(): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      "https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400&display=swap",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    // Take the first src URL — covers latin glyphs which is all we
    // need for "C".
    const urlMatch = css.match(/src:\s*url\((https:\/\/[^)]+)\)/);
    if (!urlMatch) return null;
    const fontRes = await fetch(urlMatch[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

const IVORY = "#ffffff";
const IVORY_HI = "#f4f4f4";
const INK = "#000000";
const STEM = "#1a1a1a";

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

export default async function AppleIcon() {
  const bodoniData = await loadBodoniFont();
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
          position: "relative",
        }}
      >
        {/* SVG layer: damasks, lattice, disc, cardinal dots. No <text> —
            Satori refuses to render <text> in SVG ("convert to <path>"),
            which crashed the Vercel build at /apple-icon prerender. The C
            comes from the <div> below instead. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 400 400"
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
        >
          {/* Pattern (lattice + damasks) wrapped at 32% opacity so the
              disc and C dominate at small home-screen sizes — matches
              the logo-lab fade level. Without this the diamonds
              competed with the C and the border seemed to disappear. */}
          <g opacity={0.32}>
            <g stroke={STEM} strokeWidth={0.7} fill="none" opacity={0.45} strokeLinecap="round">
              {LATTICE_EDGES.map(([x1, y1, x2, y2], i) => (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </g>
            {DAMASK_POSITIONS.map(([x, y], i) => (
              <Damask key={i} x={x} y={y} />
            ))}
          </g>
          <circle cx={200} cy={200} r={130} fill={IVORY} />
          {/* Stroke bumped 2 → 3 + 0.8 → 1 so the borders survive
              downscaling to ~60-80px home-screen icons. */}
          <circle cx={200} cy={200} r={130} fill="none" stroke={INK} strokeWidth={3} opacity={0.92} />
          <circle cx={200} cy={200} r={118} fill="none" stroke={INK} strokeWidth={1} opacity={0.55} />
          <circle cx={200} cy={76} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={200} cy={324} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={76} cy={200} r={2.1} fill={INK} opacity={0.85} />
          <circle cx={324} cy={200} r={2.1} fill={INK} opacity={0.85} />
        </svg>

        {/* The C as a div — Satori renders text via its CSS engine, which
            handles font-family fallback, letter-spacing, etc. without the
            <text>-element limitation. font-size 90 ≈ 50% of a 180px icon =
            same proportion as fontSize:200 in the 400-viewBox SVG. */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            color: INK,
            fontFamily: '"Bodoni Moda","Bodoni 72",Didot,Georgia,serif',
            fontWeight: 400,
            fontSize: 92,
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          C
        </div>
      </div>
    ),
    {
      ...size,
      // Pass Bodoni Moda to Satori so the C renders as the proper
      // high-contrast serif. If the fetch failed, Satori falls back
      // to its default sans — visible regression, but better than
      // crashing the route.
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
