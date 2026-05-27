// Extract the full Parisienne "Linette" wordmark as per-letter SVG
// paths so the launch splash can animate the stroke of each letter
// in writing order — a true handwriting effect, not a clip-path reveal
// of a static PNG (which reads as a sliding curtain, not a pen).
//
// Output: prints a ready-to-paste JSX/SVG block with seven <path>
// elements (L, i, n, e, t, t, e) positioned in writing order, each
// with its own glyph bounding box logged so we can verify spacing
// matches the reference Parisienne kerning.
//
// Run: node scripts/extract-linette-path.mjs

import opentype from "opentype.js";
import { readFileSync } from "node:fs";

const FONT_PATH = "./parisienne.ttf";
const buffer = readFileSync(FONT_PATH).buffer;
const font = opentype.parse(buffer);

const WORD = "Linette";
const FONT_SIZE = 240;

// Get the path for the WHOLE word — opentype.js handles kerning and
// glyph advance widths automatically. Baseline at y=0. We measure the
// combined bounding box and translate so the wordmark sits at a known
// origin (we'll center it in the splash via SVG viewBox math later).
const fullPath = font.getPath(WORD, 0, 0, FONT_SIZE);
const fullBbox = fullPath.getBoundingBox();
const wordW = fullBbox.x2 - fullBbox.x1;
const wordH = fullBbox.y2 - fullBbox.y1;

console.log(`// === Linette wordmark (fontSize ${FONT_SIZE}) ===`);
console.log(`// Combined bbox: ${wordW.toFixed(1)} × ${wordH.toFixed(1)}`);
console.log(`// Translate by (${-fullBbox.x1}, ${-fullBbox.y1}) to bring origin to (0, 0).`);
console.log("");

// Per-letter paths so each can have its own stroke-dasharray animation
// (drawing in writing order with a small stagger between letters).
// opentype tracks the glyph advance through getPath; we replay that
// per-character by accumulating x-offsets manually.
let cursor = 0;
const letters = [];
for (const ch of WORD) {
  const probe = font.getPath(ch, 0, 0, FONT_SIZE);
  const bbox = probe.getBoundingBox();
  // Render at the current cursor position. Translate so the whole
  // wordmark's leftmost point sits at x=0 in the output coordinate
  // space. Y stays at 0 baseline; we'll shift y in the SVG viewBox.
  const path = font.getPath(ch, cursor - fullBbox.x1, -fullBbox.y1, FONT_SIZE);
  letters.push({
    ch,
    d: path.toPathData(2),
    bbox,
    width: bbox.x2 - bbox.x1,
  });
  // Advance the cursor by the glyph's advance width — Parisienne is a
  // script font so glyphs overlap deliberately; opentype's advance
  // already accounts for the connecting strokes between letters.
  const glyph = font.charToGlyph(ch);
  cursor += (glyph.advanceWidth * FONT_SIZE) / font.unitsPerEm;
}

console.log(`// Per-letter paths (write order). Use these inside a viewBox`);
console.log(`// of 0 0 ${Math.ceil(wordW)} ${Math.ceil(wordH)}:`);
console.log("");
for (const { ch, d, width } of letters) {
  console.log(`{/* ${ch} (width ${width.toFixed(1)}) */}`);
  console.log(`<path d="${d}" />`);
  console.log("");
}
