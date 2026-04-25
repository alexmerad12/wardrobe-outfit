// Brand monogram. Stub committed because the original Monogram
// renderer lives in src/app/logo-lab/ which is gitignored as
// local-only design experimentation. Keeps the same prop surface as
// the lab version (variant / size / letter / color / innerFill /
// fontFamily / frame) so callers don't change. Visuals are
// intentionally minimal — an ivory disc with a bordered ink letter —
// so the build works while the real Bodoni-tuned mark stays in the
// lab. Swap in the real component by copying its contents here.
"use client";

import * as React from "react";

type MonogramVariant = "bordered-solid" | "outline" | "solid";

export function Monogram({
  variant = "bordered-solid",
  size = 86,
  letter = "C",
  color = "#0a0806",
  innerFill = "#ebe0c8",
  fontFamily = '"Bodoni Moda", "Bodoni 72", "Didot", serif',
  frame = "rgba(10,8,6,0.92)",
}: {
  variant?: MonogramVariant;
  size?: number;
  letter?: string;
  color?: string;
  innerFill?: string;
  fontFamily?: string;
  frame?: string;
}) {
  const r = size / 2;
  const strokeW = Math.max(1, size * 0.018);
  const showFrame = variant !== "outline";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${letter} monogram`}
    >
      {showFrame && (
        <circle
          cx={r}
          cy={r}
          r={r - strokeW}
          fill={innerFill}
          stroke={frame}
          strokeWidth={strokeW}
        />
      )}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontFamily={fontFamily}
        fontSize={size * 0.62}
        fontWeight={400}
      >
        {letter}
      </text>
    </svg>
  );
}
