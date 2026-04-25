// Brand backdrop. Stub committed because the original Rose & Damask
// renderer lives in src/app/logo-lab/ which is gitignored as
// local-only design experimentation. This minimal version keeps the
// auth + launch shells building; swap in the real wallpaper by
// committing the lab files (or copying their contents here) when you
// want the textured backdrop back.
"use client";

import * as React from "react";

export type Palette = readonly string[];

export function PatternRoseDamask({
  viewBoxWidth = 1200,
  viewBoxHeight = 1200,
}: {
  palette?: Palette;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
    />
  );
}
