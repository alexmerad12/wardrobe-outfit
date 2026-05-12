// One-off: extract the Parisienne "L" glyph as a centered SVG <path> so the
// app icon can render the brand mark without any font dependency.
//
// Output: prints two ready-to-paste path strings — one for the 400×400
// icon.svg viewBox (centered at 200,200, sized like the launch splash),
// and one for the 512-tile Satori apple-icon (centered at INNER_DISC/2).
//
// Source: Google Fonts Parisienne — Regular weight, OFL via google/fonts repo.
//
// Run: node scripts/extract-l-path.mjs

import opentype from "opentype.js";
import { readFileSync } from "node:fs";

// Parisienne-Regular.ttf — fetched once from
// https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf
// (OFL-licensed, Astigmatic 2012). Cached at /tmp because node fetch's
// TLS chain doesn't validate on this Windows box without --ssl-no-revoke.
const FONT_PATH = "./parisienne.ttf";

const buffer = readFileSync(FONT_PATH).buffer;
const font = opentype.parse(buffer);

function lPath({ fontSize, cx, cy }) {
  // opentype's getPath puts the baseline at y=0. We'll center the glyph's
  // bounding box on (cx, cy) by measuring the bbox, then translating.
  const probe = font.getPath("L", 0, 0, fontSize);
  const bbox = probe.getBoundingBox();
  const glyphW = bbox.x2 - bbox.x1;
  const glyphH = bbox.y2 - bbox.y1;
  const x = cx - bbox.x1 - glyphW / 2;
  const y = cy - bbox.y1 - glyphH / 2;
  const path = font.getPath("L", x, y, fontSize);
  return {
    d: path.toPathData(2),
    bbox,
    glyphW,
    glyphH,
  };
}

// ── icon.svg (400×400 viewBox, disc r=130, center 200,200) ──
// Launch splash uses fontSize 200 inside a r=130 disc — match it.
const icon = lPath({ fontSize: 200, cx: 200, cy: 200 });
console.log("\n// === icon.svg (400×400) ===");
console.log(`// glyph bbox: ${icon.glyphW.toFixed(1)} × ${icon.glyphH.toFixed(1)}`);
console.log(`<path fill="#000000" d="${icon.d}"/>`);

// ── apple-icon.tsx Satori inner-disc (INNER_DISC = 350) ──
// Same 200/260 ratio scaled up: fontSize 270 for a 350-diameter inner disc.
const appleInner = lPath({ fontSize: 270, cx: 175, cy: 175 });
console.log("\n// === apple-icon inner disc (350×350) ===");
console.log(`// glyph bbox: ${appleInner.glyphW.toFixed(1)} × ${appleInner.glyphH.toFixed(1)}`);
console.log(`<path fill="#000000" d="${appleInner.d}"/>`);
