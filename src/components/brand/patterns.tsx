// Closette logo — textile wallpaper patterns.
// Ported from the Claude Design bundle (app-logo-launch-page/patterns.jsx).
// Each pattern is an SVG <pattern> tile with paper-grain + gouache-bleed
// filters so the output reads as printed fabric rather than flat vector.
"use client";

import * as React from "react";

export type Palette = string[];

// React.useId returns strings like ":r1:" which are valid in HTML IDs but
// awkward to eyeball in the DOM — strip the colons so the ids stay clean.
function useUid(prefix: string): string {
  return `${prefix}-${React.useId().replace(/:/g, "")}`;
}

// ── Shared texture defs ─────────────────────────────────────────────────────
function TextureDefs({ id }: { id: string }) {
  return (
    <>
      <filter id={`grain-${id}`}>
        <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves={2} seed={4} />
        <feColorMatrix
          values="0 0 0 0 0.2
                  0 0 0 0 0.15
                  0 0 0 0 0.1
                  0 0 0 0.18 0"
        />
        <feComposite operator="in" in2="SourceGraphic" />
      </filter>
      <filter id={`bleed-${id}`} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} />
        <feDisplacementMap in="SourceGraphic" scale={2.5} />
      </filter>
      <filter id={`soft-${id}`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation={0.6} />
      </filter>
    </>
  );
}

type SurfaceProps = {
  id: string;
  tileWidth: number;
  tileHeight: number;
  bg: string;
  grainOpacity?: number;
  rotate?: number;
  centerX?: number;
  centerY?: number;
  // viewBox dimensions — default 400×800 is calibrated for the icon-tile
  // context. For a full-bleed wallpaper, pass much larger values so the
  // pattern repeats more tightly (smaller tiles relative to viewport).
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  children?: React.ReactNode;
};

function PatternSurface({
  id,
  tileWidth,
  tileHeight,
  bg,
  children,
  grainOpacity = 0.22,
  rotate = 0,
  centerX,
  centerY,
  viewBoxWidth = 400,
  viewBoxHeight = 800,
}: SurfaceProps) {
  let patternTransform: string | undefined;
  if (rotate || centerX != null) {
    const cx = centerX != null ? centerX : 0;
    const cy = centerY != null ? centerY : 0;
    const rad = ((rotate || 0) * Math.PI) / 180;
    const rx = cx * Math.cos(rad) - cy * Math.sin(rad);
    const ry = cx * Math.sin(rad) + cy * Math.cos(rad);
    // Center the chosen tile-local point on the viewport center, regardless
    // of the chosen viewBox size.
    const tx = viewBoxWidth / 2 - rx;
    const ty = viewBoxHeight / 2 - ry;
    patternTransform = `translate(${tx} ${ty}) rotate(${rotate || 0})`;
  }
  return (
    <svg
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", position: "absolute", inset: 0 }}
    >
      <defs>
        <TextureDefs id={id} />
        <pattern
          id={`tile-${id}`}
          x="0"
          y="0"
          width={tileWidth}
          height={tileHeight}
          patternUnits="userSpaceOnUse"
          patternTransform={patternTransform}
        >
          <rect width={tileWidth} height={tileHeight} fill={bg} />
          {children}
        </pattern>
        <pattern
          id={`grain-pat-${id}`}
          x="0"
          y="0"
          width={200}
          height={200}
          patternUnits="userSpaceOnUse"
        >
          <rect width={200} height={200} fill="transparent" filter={`url(#grain-${id})`} />
        </pattern>
        <radialGradient id={`vig-${id}`} cx="50%" cy="50%" r="80%">
          <stop offset="60%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
        </radialGradient>
      </defs>
      <rect width={viewBoxWidth} height={viewBoxHeight} fill={`url(#tile-${id})`} />
      <rect
        width={viewBoxWidth}
        height={viewBoxHeight}
        fill={`url(#grain-pat-${id})`}
        opacity={grainOpacity}
        style={{ mixBlendMode: "multiply" }}
      />
      <rect width={viewBoxWidth} height={viewBoxHeight} fill={`url(#vig-${id})`} opacity={0.35} />
    </svg>
  );
}

// ── 1. CABBAGE ROSE ─────────────────────────────────────────────────────────
function PatternRose({ palette }: { palette: Palette }) {
  const [bg, petalHi, petal, petalShade, leaf, leafDark, stem, accent] = palette;
  const id = useUid("rose");
  const rose = (cx: number, cy: number, s = 1, rot = 0, kind: "full" | "tiny" = "full") => (
    <g
      transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`}
      filter={`url(#bleed-${id})`}
    >
      <ellipse cx={-18} cy={-2} rx={22} ry={14} fill={petal} opacity={0.8} transform="rotate(-35)" />
      <ellipse cx={20} cy={-4} rx={21} ry={14} fill={petal} opacity={0.85} transform="rotate(28)" />
      <ellipse cx={0} cy={18} rx={24} ry={14} fill={petal} opacity={0.82} transform="rotate(6)" />
      <ellipse cx={-4} cy={-20} rx={18} ry={13} fill={petal} opacity={0.8} transform="rotate(-15)" />
      <ellipse cx={-12} cy={0} rx={14} ry={10} fill={petalShade} opacity={0.9} transform="rotate(-22)" />
      <ellipse cx={14} cy={-1} rx={13} ry={9} fill={petalShade} opacity={0.88} transform="rotate(28)" />
      <ellipse cx={0} cy={12} rx={15} ry={10} fill={petalShade} opacity={0.88} />
      <ellipse cx={-10} cy={-6} rx={6} ry={3} fill={petalHi} opacity={0.7} transform="rotate(-30)" />
      <ellipse cx={8} cy={-8} rx={5} ry={3} fill={petalHi} opacity={0.7} transform="rotate(20)" />
      <circle cx={-1} cy={1} r={6} fill={petalShade} opacity={0.95} />
      <path d="M -4 2 Q 0 -5 5 2 Q 3 5 -4 2" fill={petalHi} opacity={0.65} />
      {kind === "full" && <circle cx={0} cy={0} r={1.8} fill={accent} opacity={0.6} />}
    </g>
  );
  const bud = (cx: number, cy: number, s = 1, rot = 0) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`}>
      <path d="M0 -10 Q 6 -8 5 0 Q 0 4 -5 0 Q -6 -8 0 -10" fill={petal} opacity={0.9} />
      <path d="M-1 -8 Q 2 -6 2 -2" stroke={petalHi} strokeWidth={1} fill="none" opacity={0.6} />
      <path d="M-5 0 Q -10 4 -8 10" stroke={leafDark} strokeWidth={1.2} fill="none" />
      <path d="M5 0 Q 10 4 8 10" stroke={leafDark} strokeWidth={1.2} fill="none" />
    </g>
  );
  const leafShape = (x: number, y: number, rot: number, s = 1, col = leaf) => (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} filter={`url(#bleed-${id})`}>
      <path d="M0 0 Q 14 -16 30 -6 Q 22 12 0 4 Z" fill={col} opacity={0.92} />
      <path d="M0 0 Q 14 -16 30 -6" stroke={leafDark} strokeWidth={0.7} fill="none" opacity={0.5} />
      <path d="M4 -2 Q 12 -6 18 -4" stroke={leafDark} strokeWidth={0.5} fill="none" opacity={0.4} />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={180} tileHeight={200} bg={bg}>
      <g stroke={stem} fill="none" opacity={0.6}>
        <path d="M20 0 Q 50 60 30 120 Q 8 170 40 200" strokeWidth={0.9} />
        <path d="M110 0 Q 90 50 130 100 Q 160 150 120 200" strokeWidth={0.8} />
        <path d="M170 10 Q 150 70 170 130 Q 185 170 160 200" strokeWidth={0.7} opacity={0.5} />
      </g>
      {leafShape(36, 44, 30, 0.6)}
      {leafShape(120, 36, -35, 0.55, leafDark)}
      {leafShape(160, 80, 20, 0.5)}
      {leafShape(14, 100, 60, 0.5, leafDark)}
      {leafShape(86, 130, -40, 0.6)}
      {leafShape(140, 160, 50, 0.5, leafDark)}
      {leafShape(50, 172, -20, 0.55)}
      {bud(70, 22, 0.6, 20)}
      {bud(150, 56, 0.55, -30)}
      {bud(28, 160, 0.55, 10)}
      {bud(128, 180, 0.6, -15)}
      {rose(50, 70, 0.58, -14)}
      {rose(128, 76, 0.5, 22)}
      {rose(160, 144, 0.55, -18)}
      {rose(72, 164, 0.62, 30)}
      {rose(22, 44, 0.4, 40)}
      {rose(108, 140, 0.38, -40)}
    </PatternSurface>
  );
}

// ── 2. CHIYOGAMI LATTICE ────────────────────────────────────────────────────
function PatternChiyo({ palette }: { palette: Palette }) {
  const [bg, latticeFill, latticeLine, medallionA, medallionB, petalLite, accent] = palette;
  const id = useUid("chiyo");
  const chrys = (cx: number, cy: number, s: number, col: string, petalCol: string) => (
    <g transform={`translate(${cx} ${cy}) scale(${s})`} filter={`url(#bleed-${id})`}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((r, i) => (
        <ellipse key={i} cx={0} cy={-14} rx={5.5} ry={12} fill={petalCol} opacity={0.92} transform={`rotate(${r})`} />
      ))}
      {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((r, i) => (
        <ellipse key={i} cx={0} cy={-9} rx={3.5} ry={8} fill={col} opacity={0.88} transform={`rotate(${r})`} />
      ))}
      <circle cx={0} cy={0} r={5} fill={accent} />
      <circle cx={0} cy={0} r={2} fill={petalLite} opacity={0.8} />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={120} tileHeight={120} bg={bg}>
      <g>
        <path d="M0 60 L60 0 L120 60 L60 120 Z" fill={latticeFill} opacity={0.92} />
        <path d="M0 60 L60 0 L120 60 L60 120 Z" stroke={latticeLine} strokeWidth={0.8} fill="none" opacity={0.45} />
        <path
          d="M0 60 L60 0 L120 60 L60 120 Z"
          stroke={latticeLine}
          strokeWidth={0.4}
          fill="none"
          opacity={0.25}
          strokeDasharray="2 3"
          transform="scale(0.88) translate(8 8)"
        />
        <circle cx={0} cy={60} r={1.6} fill={latticeLine} />
        <circle cx={120} cy={60} r={1.6} fill={latticeLine} />
        <circle cx={60} cy={0} r={1.6} fill={latticeLine} />
        <circle cx={60} cy={120} r={1.6} fill={latticeLine} />
      </g>
      {chrys(60, 60, 0.78, medallionA, medallionB)}
      {chrys(0, 0, 0.6, medallionA, medallionB)}
      {chrys(120, 0, 0.6, medallionA, medallionB)}
      {chrys(0, 120, 0.6, medallionA, medallionB)}
      {chrys(120, 120, 0.6, medallionA, medallionB)}
    </PatternSurface>
  );
}

// ── 3. POPPY MEADOW ─────────────────────────────────────────────────────────
function PatternPoppy({ palette }: { palette: Palette }) {
  const [bg, petalHi, petal, petalShade, core, coreDark, leaf, stem] = palette;
  const id = useUid("poppy");
  const poppy = (cx: number, cy: number, s = 1, rot = 0) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} filter={`url(#bleed-${id})`}>
      {[0, 90, 180, 270].map((r, i) => (
        <g key={i} transform={`rotate(${r})`}>
          <path
            d="M0 0 Q 26 -10 34 -34 Q 18 -44 -6 -34 Q -22 -24 0 0 Z"
            fill={i % 2 ? petalShade : petal}
            opacity={0.94}
          />
          <path d="M2 -4 Q 18 -14 26 -30" stroke={petalHi} strokeWidth={1.4} fill="none" opacity={0.55} />
        </g>
      ))}
      <path d="M-4 -2 Q 14 -20 24 -26 Q 10 -30 -4 -22 Z" fill={petalHi} opacity={0.5} />
      <circle cx={0} cy={0} r={8} fill={coreDark} />
      <g stroke={core} strokeWidth={1} opacity={0.9}>
        {[0, 30, 60, 90, 120, 150].map((r) => (
          <line key={r} x1={0} y1={0} x2={0} y2={-12} transform={`rotate(${r})`} />
        ))}
      </g>
      <circle cx={0} cy={0} r={3} fill={core} />
      <circle cx={0} cy={0} r={1.2} fill={coreDark} />
    </g>
  );
  const leafShape = (cx: number, cy: number, rot: number, s = 1) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} filter={`url(#bleed-${id})`}>
      <path d="M0 0 Q 22 -8 36 6 Q 20 20 0 12 Z" fill={leaf} opacity={0.9} />
      <path d="M2 5 Q 16 3 32 9" stroke={stem} strokeWidth={0.6} fill="none" opacity={0.5} />
    </g>
  );
  const littleBud = (cx: number, cy: number, rot: number) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      <path d="M0 0 Q 5 -3 8 2 Q 5 5 0 3" fill={petalShade} opacity={0.9} />
      <path d="M0 3 L 2 12" stroke={stem} strokeWidth={0.8} />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={200} tileHeight={200} bg={bg}>
      <g opacity={0.22}>
        <path d="M0 100 Q 60 90 200 110" stroke={leaf} strokeWidth={24} fill="none" />
        <path d="M0 40 Q 100 48 200 34" stroke={leaf} strokeWidth={18} fill="none" opacity={0.6} />
      </g>
      {leafShape(26, 34, 30, 0.55)}
      {leafShape(160, 60, -40, 0.6)}
      {leafShape(68, 140, 60, 0.5)}
      {leafShape(174, 160, -20, 0.58)}
      {leafShape(40, 174, 20, 0.48)}
      {littleBud(114, 26, 20)}
      {littleBud(20, 106, -30)}
      {littleBud(174, 120, 70)}
      {poppy(56, 54, 0.55, 15)}
      {poppy(148, 46, 0.48, -25)}
      {poppy(48, 148, 0.52, 40)}
      {poppy(154, 154, 0.6, -15)}
      {poppy(100, 108, 0.42, 60)}
    </PatternSurface>
  );
}

// ── 4. NOUVEAU TRELLIS ──────────────────────────────────────────────────────
function PatternNouveau({ palette }: { palette: Palette }) {
  const [bg, archBg, archLine, frond, frondDark, bud, vein] = palette;
  const id = useUid("nouveau");
  const fan = (cx: number, cy: number, s = 1, rot = 0) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} filter={`url(#bleed-${id})`}>
      {[-60, -40, -20, 0, 20, 40, 60].map((r, i) => (
        <g key={i} transform={`rotate(${r})`}>
          <path d="M0 0 Q 4 -24 0 -38 Q -4 -24 0 0 Z" fill={i % 2 ? frondDark : frond} opacity={0.95} />
          <path d="M0 0 L 0 -34" stroke={vein} strokeWidth={0.3} opacity={0.6} />
        </g>
      ))}
      <circle cx={0} cy={-1} r={4} fill={bud} />
      <circle cx={0} cy={-1} r={1.5} fill={vein} />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={96} tileHeight={200} bg={bg}>
      <g fill="none">
        <path d="M0 200 Q 0 75 48 75 Q 96 75 96 200" stroke={archBg} strokeWidth={3.2} opacity={0.9} />
        <path d="M4 200 Q 4 80 48 80 Q 92 80 92 200" stroke={archLine} strokeWidth={0.7} opacity={0.55} />
      </g>
      {fan(48, 72, 0.62, 0)}
      {fan(0, 56, 0.42, -15)}
      {fan(96, 56, 0.42, 15)}
      <g>
        <circle cx={14} cy={120} r={2} fill={bud} />
        <circle cx={82} cy={120} r={2} fill={bud} />
        <circle cx={10} cy={150} r={1.6} fill={bud} opacity={0.8} />
        <circle cx={86} cy={150} r={1.6} fill={bud} opacity={0.8} />
        <circle cx={8} cy={178} r={1.2} fill={bud} opacity={0.7} />
        <circle cx={88} cy={178} r={1.2} fill={bud} opacity={0.7} />
      </g>
      <path d="M48 75 Q 42 120 48 140 Q 54 170 48 198" stroke={archLine} strokeWidth={0.6} fill="none" opacity={0.5} />
    </PatternSurface>
  );
}

// ── 5. DAMASK NOIR ──────────────────────────────────────────────────────────
function PatternDamask({ palette }: { palette: Palette }) {
  const [bg, motif, motifLight, accent] = palette;
  const id = useUid("damask");
  return (
    <PatternSurface id={id} tileWidth={80} tileHeight={140} bg={bg} grainOpacity={0.18} rotate={45}>
      <g filter={`url(#bleed-${id})`} transform="scale(0.66) translate(20 10)">
        <g transform="translate(60 100)">
          <path d="M0 -42 Q 18 -22 0 0 Q -18 -22 0 -42 Z" fill={motif} />
          <path d="M0 0 Q 18 22 0 42 Q -18 22 0 0 Z" fill={motif} />
          <path d="M-42 0 Q -22 -18 0 0 Q -22 18 -42 0 Z" fill={motif} opacity={0.95} />
          <path d="M42 0 Q 22 -18 0 0 Q 22 18 42 0 Z" fill={motif} opacity={0.95} />
          <circle cx={0} cy={0} r={5} fill={accent} />
          <circle cx={0} cy={0} r={2} fill={motifLight} />
          <path d="M0 -42 Q 30 -52 38 -30 Q 34 -14 16 -18" fill="none" stroke={motif} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M0 -42 Q -30 -52 -38 -30 Q -34 -14 -16 -18" fill="none" stroke={motif} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M0 42 Q 30 52 38 30" fill="none" stroke={motif} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M0 42 Q -30 52 -38 30" fill="none" stroke={motif} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={0} cy={-58} r={2.5} fill={motifLight} />
          <circle cx={0} cy={58} r={2.5} fill={motifLight} />
          <path d="M0 -62 L 0 -70" stroke={motif} strokeWidth={1.5} />
          <path d="M0 62 L 0 70" stroke={motif} strokeWidth={1.5} />
          <path d="M-58 0 Q -66 -4 -68 -10" stroke={motif} strokeWidth={1.5} fill="none" />
          <path d="M58 0 Q 66 -4 68 -10" stroke={motif} strokeWidth={1.5} fill="none" />
        </g>
      </g>
    </PatternSurface>
  );
}

// ── 6. MILLEFLEURS ──────────────────────────────────────────────────────────
function PatternMille({ palette }: { palette: Palette }) {
  const [bg, p1, p2, p3, p4, leaf, stem] = palette;
  const id = useUid("mille");
  // Branch-return the single element directly so there's no array literal
  // (the original bundle used an indexed array with static keys, which made
  // sibling blooms share keys when they picked the same variant).
  const bloom = (cx: number, cy: number, col: string, s = 1, rot = 0, kind = 0) => {
    switch (kind % 4) {
      case 0:
        return (
          <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`}>
            {[0, 72, 144, 216, 288].map((r, i) => (
              <ellipse key={i} cx={0} cy={-5} rx={2.6} ry={4.5} fill={col} transform={`rotate(${r})`} />
            ))}
            <circle cx={0} cy={0} r={1.8} fill={bg} />
          </g>
        );
      case 1:
        return (
          <g transform={`translate(${cx} ${cy}) scale(${s})`}>
            <circle cx={0} cy={0} r={5} fill={col} />
            <circle cx={-1} cy={-1} r={1.5} fill={bg} opacity={0.7} />
          </g>
        );
      case 2:
        return (
          <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`}>
            <path d="M-4 -6 Q 0 -10 4 -6 L 3 4 Q 0 7 -3 4 Z" fill={col} />
            <path d="M0 -10 L 0 -14" stroke={stem} strokeWidth={0.6} />
          </g>
        );
      default:
        return (
          <g transform={`translate(${cx} ${cy}) scale(${s})`}>
            <circle cx={-3} cy={-2} r={2.4} fill={col} />
            <circle cx={3} cy={-1} r={2.2} fill={col} />
            <circle cx={0} cy={3} r={2.3} fill={col} />
          </g>
        );
    }
  };
  const sprig = (cx: number, cy: number, rot: number) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      <path d="M0 0 L 0 18" stroke={stem} strokeWidth={0.6} />
      <ellipse cx={-3} cy={5} rx={2.5} ry={1.2} fill={leaf} transform="rotate(-30)" />
      <ellipse cx={3} cy={11} rx={2.5} ry={1.2} fill={leaf} transform="rotate(30)" />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={180} tileHeight={180} bg={bg}>
      {sprig(30, 20, 20)}
      {sprig(120, 40, -40)}
      {sprig(60, 110, 60)}
      {sprig(140, 130, -20)}
      {bloom(30, 30, p1, 0.7, 10, 0)}
      {bloom(80, 20, p2, 0.6, 0, 1)}
      {bloom(130, 30, p3, 0.65, -30, 0)}
      {bloom(160, 80, p1, 0.55, 0, 1)}
      {bloom(40, 80, p4, 0.65, 20, 2)}
      {bloom(90, 70, p3, 0.6, 0, 3)}
      {bloom(140, 100, p2, 0.7, -10, 0)}
      {bloom(20, 130, p2, 0.6, 40, 2)}
      {bloom(70, 140, p4, 0.65, 0, 1)}
      {bloom(110, 160, p1, 0.62, -20, 0)}
      {bloom(170, 150, p3, 0.65, 0, 3)}
      {bloom(50, 170, p1, 0.55, 20, 1)}
    </PatternSurface>
  );
}

// ── 7. ROSE & DAMASK — triangular lattice, rose-removed per latest spec ─────
export function PatternRoseDamask({
  palette,
  viewBoxWidth,
  viewBoxHeight,
}: {
  palette: Palette;
  // Optional override for full-bleed contexts (launch wallpaper). Default
  // 400×800 keeps tiles legible at icon-tile scale.
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}) {
  const [bg, petalHi, , , , , stem, damaskMotif] = palette;
  const id = useUid("rosedamask");
  const damask = (cx: number, cy: number, s = 1) => (
    <g transform={`translate(${cx} ${cy}) scale(${s})`} filter={`url(#bleed-${id})`}>
      <path d="M0 -18 Q 8 -10 0 0 Q -8 -10 0 -18 Z" fill={damaskMotif} opacity={0.95} />
      <path d="M0 0 Q 8 10 0 18 Q -8 10 0 0 Z" fill={damaskMotif} opacity={0.95} />
      <path d="M-18 0 Q -10 -8 0 0 Q -10 8 -18 0 Z" fill={damaskMotif} opacity={0.9} />
      <path d="M18 0 Q 10 -8 0 0 Q 10 8 18 0 Z" fill={damaskMotif} opacity={0.9} />
      <path d="M0 -17 Q 13 -23 16 -12 Q 14 -6 7 -8" fill="none" stroke={damaskMotif} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 -17 Q -13 -23 -16 -12 Q -14 -6 -7 -8" fill="none" stroke={damaskMotif} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 17 Q 13 23 16 12 Q 14 6 7 8" fill="none" stroke={damaskMotif} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <path d="M0 17 Q -13 23 -16 12 Q -14 6 -7 8" fill="none" stroke={damaskMotif} strokeWidth={1.1} strokeLinecap="round" opacity={0.85} />
      <circle cx={0} cy={-24} r={1.2} fill={damaskMotif} opacity={0.75} />
      <circle cx={0} cy={24} r={1.2} fill={damaskMotif} opacity={0.75} />
      <circle cx={-24} cy={0} r={1} fill={damaskMotif} opacity={0.65} />
      <circle cx={24} cy={0} r={1} fill={damaskMotif} opacity={0.65} />
      <circle cx={0} cy={0} r={1.8} fill={petalHi} opacity={0.55} />
    </g>
  );
  return (
    <PatternSurface
      id={id}
      tileWidth={56}
      tileHeight={97}
      bg={bg}
      grainOpacity={0.22}
      centerX={28}
      centerY={24}
      viewBoxWidth={viewBoxWidth}
      viewBoxHeight={viewBoxHeight}
    >
      {/* Whole pattern wrapped in a fade so the C reads as primary —
          diamonds + medallions stay visible as a textile undertone
          rather than competing with the monogram. */}
      <g opacity={0.32}>
        {/* Diamond cell edges — the medallions sit at the four corners of each
            rhombus, and these six lines (per tile) outline the diamond grid
            when tiled. Coords scale with the tile (56×97 here = ~38% smaller
            diamonds than the original 90×156 layout). */}
        <g stroke={stem} strokeWidth={0.7} fill="none" opacity={0.55} strokeLinecap="round">
          {/* Edges from the top medallion (28,24) — 4 sides going outward */}
          <line x1={28} y1={24} x2={0} y2={73} />
          <line x1={28} y1={24} x2={56} y2={73} />
          <line x1={28} y1={24} x2={0} y2={-24} />
          <line x1={28} y1={24} x2={56} y2={-24} />
          {/* Edges from the middle-row medallions completing the diamond
              below — connect each to the bottom vertex (28,121) which wraps
              into the tile beneath. */}
          <line x1={0} y1={73} x2={28} y2={121} />
          <line x1={56} y1={73} x2={28} y2={121} />
        </g>
        {damask(28, 24, 0.35)}
        {damask(0, 73, 0.35)}
        {damask(56, 73, 0.35)}
      </g>
    </PatternSurface>
  );
}

// ── 8. DAMASK FLEUR — burgundy + green alternating lobes ────────────────────
function PatternDamaskFleur({ palette }: { palette: Palette }) {
  const [bg, burgundy, burgLite, green, grnLite, stem, accent] = palette;
  const id = useUid("damaskfleur");
  const fleur = (cx: number, cy: number, s = 1, rot = 0) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`} filter={`url(#bleed-${id})`}>
      <path d="M0 -34 Q 16 -18 0 0 Q -16 -18 0 -34 Z" fill={burgundy} opacity={0.94} />
      <path d="M0 0 Q 16 18 0 34 Q -16 18 0 0 Z" fill={burgundy} opacity={0.94} />
      <path d="M-34 0 Q -18 -16 0 0 Q -18 16 -34 0 Z" fill={green} opacity={0.94} />
      <path d="M34 0 Q 18 -16 0 0 Q 18 16 34 0 Z" fill={green} opacity={0.94} />
      <path d="M0 -26 Q 8 -14 0 -2 Q -8 -14 0 -26 Z" fill={burgLite} opacity={0.55} />
      <path d="M0 26 Q 8 14 0 2 Q -8 14 0 26 Z" fill={burgLite} opacity={0.55} />
      <path d="M-26 0 Q -14 -8 0 0 Q -14 8 -26 0 Z" fill={grnLite} opacity={0.55} />
      <path d="M26 0 Q 14 -8 0 0 Q 14 8 26 0 Z" fill={grnLite} opacity={0.55} />
      <circle cx={0} cy={0} r={4.5} fill={accent} />
      <circle cx={0} cy={0} r={1.8} fill={burgLite} opacity={0.85} />
      <path d="M0 -32 Q 24 -42 30 -22 Q 26 -10 14 -14" fill="none" stroke={burgundy} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
      <path d="M0 -32 Q -24 -42 -30 -22 Q -26 -10 -14 -14" fill="none" stroke={burgundy} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
      <path d="M0 32 Q 24 42 30 22 Q 26 10 14 14" fill="none" stroke={green} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
      <path d="M0 32 Q -24 42 -30 22 Q -26 10 -14 14" fill="none" stroke={green} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
      <circle cx={0} cy={-44} r={2.2} fill={burgLite} opacity={0.8} />
      <circle cx={0} cy={44} r={2.2} fill={burgLite} opacity={0.8} />
      <circle cx={-44} cy={0} r={1.8} fill={grnLite} opacity={0.8} />
      <circle cx={44} cy={0} r={1.8} fill={grnLite} opacity={0.8} />
    </g>
  );
  const tiny = (cx: number, cy: number, s = 0.5, rot = 0, col = burgundy) => (
    <g transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`}>
      <path d="M0 -8 Q 5 -4 0 0 Q -5 -4 0 -8" fill={col} opacity={0.8} />
      <path d="M0 8 Q 5 4 0 0 Q -5 4 0 8" fill={col} opacity={0.8} />
    </g>
  );
  return (
    <PatternSurface id={id} tileWidth={160} tileHeight={160} bg={bg} grainOpacity={0.2} rotate={45}>
      <g stroke={stem} strokeWidth={0.5} fill="none" opacity={0.22}>
        <path d="M0 80 L80 0 L160 80 L80 160 Z" />
      </g>
      {fleur(80, 80, 1, 0)}
      {fleur(0, 0, 1, 0)}
      {fleur(160, 0, 1, 0)}
      {fleur(0, 160, 1, 0)}
      {fleur(160, 160, 1, 0)}
      {tiny(40, 40, 0.7, 0, burgundy)}
      {tiny(120, 40, 0.7, 0, green)}
      {tiny(40, 120, 0.7, 0, green)}
      {tiny(120, 120, 0.7, 0, burgundy)}
    </PatternSurface>
  );
}

// ── Catalog ─────────────────────────────────────────────────────────────────
export type PatternEntry = {
  label: string;
  palettes: Record<string, Palette>;
  render: React.ComponentType<{ palette: Palette }>;
};

export const PATTERNS: Record<string, PatternEntry> = {
  rose: {
    label: "Cabbage Rose",
    palettes: {
      bordeaux: ["#3d0d1a", "#f2a8b6", "#d85770", "#8a1b38", "#728a4c", "#3a5228", "#2a3a22", "#e8d09a"],
      ochre: ["#d4932e", "#f8d4a0", "#c93f4a", "#862030", "#5e6b22", "#3c4515", "#2a3010", "#f0d878"],
      ink: ["#0c1112", "#e29aa8", "#b0486a", "#6b1c36", "#5a7048", "#344226", "#1e2616", "#d8a868"],
    },
    render: PatternRose,
  },
  chiyo: {
    label: "Chiyogami Lattice",
    palettes: {
      plum: ["#3a1e45", "#c89ad4", "#6a3a7a", "#f2d88a", "#d4b04a", "#f8e8c0", "#2a0f30"],
      sageCoral: ["#4a5a32", "#a5b486", "#6e7d50", "#e8847a", "#c94a42", "#f8d8c0", "#1e2a14"],
      ink: ["#0f1618", "#1c2d2e", "#324344", "#e4c298", "#c4965a", "#f8e8c8", "#f0d8a8"],
    },
    render: PatternChiyo,
  },
  poppy: {
    label: "Poppy Meadow",
    palettes: {
      olive: ["#5a6a2e", "#ffb894", "#e86a32", "#c0381a", "#f8d438", "#4a1a10", "#3c4518", "#2c3310"],
      ink: ["#0e1412", "#f2b890", "#e65a28", "#ba381a", "#f4c438", "#2a0e08", "#4a5a32", "#1a2214"],
      cream: ["#ece0c4", "#f0a080", "#dc4422", "#982818", "#f8c028", "#2a120a", "#7a8850", "#3a4220"],
    },
    render: PatternPoppy,
  },
  nouveau: {
    label: "Nouveau Trellis",
    palettes: {
      sage: ["#334030", "#b8c4a8", "#5a6850", "#d8c4a8", "#9a8260", "#e8a090", "#2a3028"],
      mocha: ["#2a1e15", "#8a7058", "#5a4530", "#c8a878", "#9a7a58", "#d88878", "#1a1208"],
      bordeaux: ["#3a0f1a", "#a88088", "#6a3038", "#e8c8c8", "#b08878", "#d88898", "#2a0810"],
    },
    render: PatternNouveau,
  },
  damask: {
    label: "Damask Noir",
    palettes: {
      ink: ["#0b0d10", "#2a2620", "#3a342a", "#6a5a3a"],
      emerald: ["#0d2420", "#1a3a32", "#2a4a40", "#8a7a4a"],
      claret: ["#2a0a12", "#3a1822", "#4e2a36", "#8a5a4a"],
      midnight: ["#0a1020", "#1a2038", "#28304a", "#6a6a8a"],
      oxblood: ["#1a0608", "#32121a", "#42202a", "#8a4a4a"],
      forest: ["#0f1a12", "#1e2e22", "#2e3e32", "#6a8a4a"],
    },
    render: PatternDamask,
  },
  rosedamask: {
    label: "Rose & Damask",
    palettes: {
      // ivoryNoir = the committed brand palette. First so it's the
      // registry default for `Object.keys(palettes)[0]` lookups.
      ivoryNoir: ["#ebe0c8", "#f8efd6", "#0a0806", "#0a0806", "#0a0806", "#0a0806", "#3a2a1e", "#0a0806"],
      // monochrome = pure black-on-white A/B against ivoryNoir.
      // Same slot structure, just stripped of the cream warmth so we
      // can see whether the "painterly" tone survives without it.
      monochrome: ["#ffffff", "#f4f4f4", "#000000", "#000000", "#000000", "#000000", "#1a1a1a", "#000000"],
      ochre: ["#2a0e10", "#f0d498", "#c08230", "#8a5a1a", "#3a2010", "#2a1a0c", "#5a2818", "#d49a3a"],
      ochreNoir: ["#1a0608", "#e8c884", "#b07428", "#784e14", "#2a1608", "#1a0c04", "#4a1e10", "#c88828"],
      saffron: ["#d89540", "#fde4b4", "#d44a58", "#8a2030", "#6a7828", "#3a4418", "#24280e", "#2a1a10"],
      bordeaux: ["#3d0d1a", "#f2a8b6", "#d85770", "#8a1b38", "#728a4c", "#3a5228", "#2a3a22", "#e8d09a"],
      ink: ["#0c1112", "#e29aa8", "#b0486a", "#6b1c36", "#5a7048", "#344226", "#1e2616", "#d8a868"],
    },
    render: PatternRoseDamask,
  },
  damaskFleur: {
    label: "Damask Fleur",
    palettes: {
      ochre: ["#c08230", "#5a0a18", "#8a2838", "#1e3a1a", "#3a6228", "#3a2010", "#f4d8a0"],
      ochreDeep: ["#a06a24", "#4a0812", "#7a2030", "#16341a", "#2e5220", "#2a180c", "#f0c880"],
      bordeaux: ["#2a0810", "#6a1228", "#a03850", "#1e3a1a", "#3a6228", "#1a0610", "#d8b878"],
      cream: ["#e8dcc0", "#5a0a18", "#8a2838", "#1e3a1a", "#3a6228", "#2a1a10", "#c8a050"],
      forest: ["#14281a", "#5a0a18", "#8a3848", "#0a1a0e", "#2a4e22", "#0a1408", "#c8a050"],
    },
    render: PatternDamaskFleur,
  },
  mille: {
    label: "Millefleurs",
    palettes: {
      cream: ["#f0e6d0", "#c83848", "#3a5a2a", "#d89230", "#6a3a4a", "#4a5a3a", "#5a6a4a"],
      ink: ["#141a18", "#e88898", "#b8c498", "#f0c478", "#a878a8", "#8a9a7a", "#5a6a4a"],
      bordeaux: ["#3a0f1a", "#e8b8c0", "#c8a878", "#f4d8a8", "#a88090", "#8a7a5a", "#5a4a38"],
    },
    render: PatternMille,
  },
};

// ── Wallpaper helper ────────────────────────────────────────────────────────
export function Wallpaper({ pat, pal }: { pat: string; pal: string }) {
  const entry = PATTERNS[pat];
  if (!entry) return null;
  const palette = entry.palettes[pal] || Object.values(entry.palettes)[0];
  const Render = entry.render;
  return <Render palette={palette} />;
}

export function getPaletteKey(pat: string, pal: string): string {
  const entry = PATTERNS[pat];
  if (!entry) return Object.keys(PATTERNS)[0];
  return entry.palettes[pal] ? pal : Object.keys(entry.palettes)[0];
}
