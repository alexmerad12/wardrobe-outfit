// Closette monogram — the Bodoni "C" on wallpaper.
// Ported from the Claude Design bundle (app-logo-launch-page/monogram.jsx).
"use client";

import * as React from "react";

export type MonogramVariant =
  | "classic"
  | "bordered"
  | "bordered-solid"
  | "cartouche"
  | "stamp"
  | "heraldic"
  | "ribbon";

export const MONOGRAM_VARIANTS: MonogramVariant[] = [
  "classic",
  "bordered",
  "bordered-solid",
  "cartouche",
  "stamp",
  "heraldic",
  "ribbon",
];

const DEFAULT_FONT = '"Bodoni Moda", "Bodoni 72", "Didot", serif';

function BodoniC({
  size = 140,
  color = "#fff",
  stroke = 0,
  strokeColor,
  letter = "C",
  fontFamily = DEFAULT_FONT,
  fontStyle = "normal",
  fontWeight = 400,
}: {
  size?: number;
  color?: string;
  stroke?: number;
  strokeColor?: string;
  letter?: string;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: number;
}) {
  // y=100 = geometric center of the 200×200 viewBox so the C lands dead-
  // center in framed variants (was y=107 in the original bundle for an
  // optical-balance offset). Geometric centering reads cleaner inside the
  // bordered/bordered-solid disc.
  return (
    <text
      x={100}
      y={100}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={fontFamily}
      fontWeight={fontWeight}
      fontSize={size}
      fill={color}
      stroke={strokeColor}
      strokeWidth={stroke}
      paintOrder="stroke fill"
      style={{ letterSpacing: "-0.03em", fontStyle }}
    >
      {letter}
    </text>
  );
}

export function Monogram({
  variant = "classic",
  size = 200,
  stroke = 1,
  color = "#f7ecd4",
  frame = "rgba(20,12,8,0.65)",
  letter = "C",
  fontFamily = DEFAULT_FONT,
  fontStyle = "normal",
  fontWeight = 400,
  innerFill,
}: {
  variant?: MonogramVariant;
  size?: number;
  stroke?: number;
  color?: string;
  frame?: string;
  letter?: string;
  fontFamily?: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: number;
  // Override the inner disc / cartouche fill. For `bordered-solid` this
  // swaps the hard-coded dark burgundy for whatever blends with the
  // chosen variant's wallpaper.
  innerFill?: string;
}) {
  const glyphProps = { fontFamily, fontStyle, fontWeight } as const;
  // All hooks must run every render regardless of variant — pre-generate the
  // ids we need so each branch can reach for the one it wants.
  const uid = React.useId();
  const classicGradId = `halo-cl-${uid}`;
  const ribbonGradId = `halo-rb-${uid}`;
  const stampRingId = `ring-${uid}`;

  if (variant === "classic") {
    const gradId = classicGradId;
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: "block" }}>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.35)" />
            <stop offset="75%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={100} cy={100} r={95} fill={`url(#${gradId})`} />
        <BodoniC size={168} color={color} stroke={stroke} strokeColor={frame} letter={letter} {...glyphProps} />
      </svg>
    );
  }

  if (variant === "bordered" || variant === "bordered-solid") {
    const resolvedInnerFill =
      innerFill ?? (variant === "bordered-solid" ? "#1a0608" : "rgba(0,0,0,0.38)");
    return (
      <svg viewBox="0 0 200 200" width={size} height={size} style={{ display: "block" }}>
        <circle cx={100} cy={100} r={88} fill={resolvedInnerFill} />
        <circle cx={100} cy={100} r={88} fill="none" stroke={color} strokeWidth={1.4} opacity={0.92} />
        <circle cx={100} cy={100} r={80} fill="none" stroke={color} strokeWidth={0.5} opacity={0.55} />
        {[0, 90, 180, 270].map((a) => {
          const x = 100 + Math.cos(((a - 90) * Math.PI) / 180) * 84;
          const y = 100 + Math.sin(((a - 90) * Math.PI) / 180) * 84;
          return <circle key={a} cx={x} cy={y} r={1.4} fill={color} opacity={0.8} />;
        })}
        <BodoniC size={140} color={color} letter={letter} {...glyphProps} />
      </svg>
    );
  }

  if (variant === "cartouche") {
    return (
      <svg
        viewBox="0 0 200 260"
        width={size * 0.77}
        height={size}
        style={{ display: "block" }}
      >
        <ellipse cx={100} cy={130} rx={76} ry={110} fill={innerFill ?? "rgba(0,0,0,0.45)"} />
        <ellipse cx={100} cy={130} rx={76} ry={110} fill="none" stroke={color} strokeWidth={1.3} opacity={0.92} />
        <ellipse cx={100} cy={130} rx={68} ry={102} fill="none" stroke={color} strokeWidth={0.5} opacity={0.55} />
        <path d="M100 18 Q 82 10 72 2 Q 90 8 100 14 Q 110 8 128 2 Q 118 10 100 18 Z" fill={color} opacity={0.92} />
        <circle cx={100} cy={8} r={1.8} fill={color} />
        <path d="M100 242 Q 82 250 72 258 Q 90 252 100 246 Q 110 252 128 258 Q 118 250 100 242 Z" fill={color} opacity={0.92} />
        <circle cx={100} cy={252} r={1.8} fill={color} />
        <path d="M24 130 Q 14 126 10 132 Q 16 134 24 130" fill={color} opacity={0.7} />
        <path d="M176 130 Q 186 126 190 132 Q 184 134 176 130" fill={color} opacity={0.7} />
        <svg x={0} y={30} viewBox="0 0 200 200" width={200} height={200}>
          <BodoniC size={155} color={color} letter={letter} {...glyphProps} />
        </svg>
      </svg>
    );
  }

  if (variant === "stamp") {
    const ringId = stampRingId;
    return (
      <svg viewBox="0 0 220 220" width={size} height={size} style={{ display: "block" }}>
        <defs>
          <path id={ringId} d="M110 32 a 78 78 0 1 1 -0.01 0" />
        </defs>
        <circle cx={110} cy={110} r={96} fill={innerFill ?? "rgba(0,0,0,0.45)"} />
        <circle cx={110} cy={110} r={96} fill="none" stroke={color} strokeWidth={1.3} opacity={0.92} />
        <circle cx={110} cy={110} r={72} fill="none" stroke={color} strokeWidth={0.5} opacity={0.55} />
        <text
          fill={color}
          fontFamily='"Bodoni Moda", serif'
          fontSize={9.5}
          letterSpacing={4.8}
          style={{ textTransform: "uppercase" }}
        >
          <textPath href={`#${ringId}`} startOffset="0">
            Closette · Maison de Garde-Robe · Paris · MMXXVI ·
          </textPath>
        </text>
        <svg x={10} y={10} width={200} height={200} viewBox="0 0 200 200">
          <BodoniC size={130} color={color} letter={letter} {...glyphProps} />
        </svg>
        <circle cx={110} cy={40} r={1.5} fill={color} opacity={0.8} />
        <circle cx={110} cy={180} r={1.5} fill={color} opacity={0.8} />
      </svg>
    );
  }

  if (variant === "heraldic") {
    return (
      <svg viewBox="0 0 200 240" width={size * 0.83} height={size} style={{ display: "block" }}>
        <path
          d="M100 20 L 170 40 L 166 130 Q 160 190 100 224 Q 40 190 34 130 L 30 40 Z"
          fill={innerFill ?? "rgba(0,0,0,0.45)"}
          stroke={color}
          strokeWidth={1.3}
          opacity={0.95}
        />
        <path
          d="M100 28 L 162 44 L 158 130 Q 152 184 100 214 Q 48 184 42 130 L 38 44 Z"
          fill="none"
          stroke={color}
          strokeWidth={0.5}
          opacity={0.55}
        />
        <g transform="translate(100 14)">
          <path d="M0 6 L -14 -4 L 0 0 L 14 -4 Z" fill={color} opacity={0.92} />
          <circle cx={0} cy={-2} r={1.8} fill={color} />
          <circle cx={-14} cy={-4} r={1.2} fill={color} opacity={0.8} />
          <circle cx={14} cy={-4} r={1.2} fill={color} opacity={0.8} />
        </g>
        <svg x={0} y={20} width={200} height={200} viewBox="0 0 200 200">
          <BodoniC size={140} color={color} letter={letter} {...glyphProps} />
        </svg>
      </svg>
    );
  }

  if (variant === "ribbon") {
    const gradId = ribbonGradId;
    return (
      <svg viewBox="0 0 240 220" width={size * 1.05} height={size} style={{ display: "block" }}>
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.38)" />
            <stop offset="75%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={120} cy={100} r={95} fill={`url(#${gradId})`} />
        <g transform="translate(120 170)">
          <path
            d="M-96 -8 L -80 -14 L 80 -14 L 96 -8 L 80 -2 L -80 -2 Z"
            fill={innerFill ?? "rgba(0,0,0,0.55)"}
            stroke={color}
            strokeWidth={0.8}
            opacity={0.95}
          />
          <path
            d="M-96 -8 L -108 -18 L -102 -8 L -108 2 Z"
            fill={innerFill ?? "rgba(0,0,0,0.55)"}
            stroke={color}
            strokeWidth={0.8}
            opacity={0.95}
          />
          <path
            d="M96 -8 L 108 -18 L 102 -8 L 108 2 Z"
            fill={innerFill ?? "rgba(0,0,0,0.55)"}
            stroke={color}
            strokeWidth={0.8}
            opacity={0.95}
          />
          <text
            x={0}
            y={-4}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily='"Bodoni Moda", serif'
            fontSize={10}
            fill={color}
            letterSpacing={3.5}
            style={{ textTransform: "uppercase" }}
          >
            CLOSETTE
          </text>
        </g>
        <svg x={20} y={0} width={200} height={200} viewBox="0 0 200 200">
          <BodoniC size={165} color={color} letter={letter} {...glyphProps} />
        </svg>
      </svg>
    );
  }

  return null;
}
