// One-off: convert "C" and "Closette" to SVG path data using Playfair
// Display, so the icon and splash SVGs don't depend on a font being
// installed at render time.
//
// Run: node scripts/glyphs-to-paths.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import opentype from "opentype.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadFont(weight) {
  const file = path.join(
    root,
    "node_modules/@fontsource/playfair-display/files",
    `playfair-display-latin-${weight}-normal.woff`
  );
  const buf = readFileSync(file);
  // opentype.parse expects an ArrayBuffer
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return opentype.parse(arrayBuffer);
}

function glyphPath(font, text, fontSize) {
  // Render the text at (0, 0) with the given font size.
  // opentype's getPath baseline is at y=0, so characters sit ABOVE y=0
  // (negative y values). We'll translate them into place when pasting.
  const path = font.getPath(text, 0, 0, fontSize);
  return path.toPathData(2); // 2 decimal places
}

function metrics(font, text, fontSize) {
  const p = font.getPath(text, 0, 0, fontSize);
  const bb = p.getBoundingBox();
  return {
    x1: bb.x1,
    y1: bb.y1,
    x2: bb.x2,
    y2: bb.y2,
    width: bb.x2 - bb.x1,
    height: bb.y2 - bb.y1,
  };
}

// --- Icon "C" at display size ~720 (weight 500) ---
const fontC = loadFont(500);
const iconSize = 720;
const iconPath = glyphPath(fontC, "C", iconSize);
const iconMetrics = metrics(fontC, "C", iconSize);

// --- Splash "Closette" at display size ~260 (weight 500 to match the icon C) ---
const fontWord = loadFont(500);
const splashSize = 260;
const splashPath = glyphPath(fontWord, "Closette", splashSize);
const splashMetrics = metrics(fontWord, "Closette", splashSize);

console.log("=== ICON 'C' (weight 500, size 720) ===");
console.log("Bounding box:", iconMetrics);
console.log("Path data:");
console.log(iconPath);
console.log("");
console.log("=== SPLASH 'Closette' (weight 400, size 260) ===");
console.log("Bounding box:", splashMetrics);
console.log("Path data:");
console.log(splashPath);
